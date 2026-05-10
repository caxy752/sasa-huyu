import React, { useCallback, useRef, useState } from 'react';
import { ALL_SYMBOLS, SYMBOL_LABELS, PIP_SIZES, openMakotiWS, MakotiWS } from './makoti-ws';

type BotId = 'pvty_kill' | 'rf_v4';

interface SymbolDigitResult {
    symbol: string;
    label: string;
    pcts: number[];
    qualifies: boolean;
    detail: string;
}

interface SymbolDirectionResult {
    symbol: string;
    label: string;
    sidewaysScore: number;
    upPct: number;
    downPct: number;
    qualifies: boolean;
    detail: string;
}

type ScanResult = SymbolDigitResult | SymbolDirectionResult;

function isDigitResult(r: ScanResult): r is SymbolDigitResult {
    return (r as any).pcts !== undefined;
}

export const Scanner: React.FC = () => {
    const [bot, setBot] = useState<BotId>('pvty_kill');
    const [scanning, setScanning] = useState(false);
    const [progress, setProgress] = useState('');
    const [results, setResults] = useState<ScanResult[]>([]);
    const [bestSymbols, setBestSymbols] = useState<string[]>([]);
    const wsRef = useRef<MakotiWS | null>(null);
    const pendingRef = useRef<Set<string>>(new Set());
    const collectedRef = useRef<Map<string, any>>(new Map());
    const botRef = useRef<BotId>('pvty_kill');

    const cleanup = useCallback(() => {
        if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    }, []);

    const analyze = useCallback(() => {
        if (scanning) return;
        botRef.current = bot;
        setScanning(true);
        setProgress('Connecting to Deriv API...');
        setResults([]);
        setBestSymbols([]);
        pendingRef.current = new Set(ALL_SYMBOLS);
        collectedRef.current = new Map();
        cleanup();

        const style = bot === 'rf_v4' ? 'candles' : 'ticks';

        const handleMessage = (data: any) => {
            if (data.error) return;

            if (botRef.current === 'pvty_kill' && data.msg_type === 'history' && data.history?.prices) {
                const sym: string = data.echo_req?.ticks_history;
                if (!sym || !pendingRef.current.has(sym)) return;
                pendingRef.current.delete(sym);
                const pip = PIP_SIZES[sym] || 2;
                const digits = (data.history.prices as (string | number)[])
                    .map(p => Number(Number(p).toFixed(pip).slice(-1)));
                collectedRef.current.set(sym, digits);
                setProgress(`Scanned ${ALL_SYMBOLS.length - pendingRef.current.size} / ${ALL_SYMBOLS.length}`);
                if (pendingRef.current.size === 0) finalizePvty();
            }

            if (botRef.current === 'rf_v4' && data.msg_type === 'candles' && data.candles) {
                const sym: string = data.echo_req?.ticks_history;
                if (!sym || !pendingRef.current.has(sym)) return;
                pendingRef.current.delete(sym);
                collectedRef.current.set(sym, data.candles);
                setProgress(`Scanned ${ALL_SYMBOLS.length - pendingRef.current.size} / ${ALL_SYMBOLS.length}`);
                if (pendingRef.current.size === 0) finalizeRfV4();
            }
        };

        const finalizePvty = () => {
            const scanResults: SymbolDigitResult[] = [];
            const best: string[] = [];
            collectedRef.current.forEach((digits: number[], sym) => {
                const total = digits.length || 1;
                const counts = Array(10).fill(0);
                digits.slice(-100).forEach((d: number) => { if (d >= 0 && d <= 9) counts[d]++; });
                const pcts = counts.map((c: number) => (c / Math.min(100, digits.length)) * 100);
                const d7 = pcts[7], d8 = pcts[8], d9 = pcts[9];
                const qualifies = d7 > 10 && d8 > 10 && d9 > 10;
                if (qualifies) best.push(sym);
                scanResults.push({
                    symbol: sym,
                    label: SYMBOL_LABELS[sym],
                    pcts,
                    qualifies,
                    detail: `7: ${d7.toFixed(1)}%  8: ${d8.toFixed(1)}%  9: ${d9.toFixed(1)}%`,
                });
            });
            scanResults.sort((a, b) => {
                const aScore = a.pcts[7] + a.pcts[8] + a.pcts[9];
                const bScore = b.pcts[7] + b.pcts[8] + b.pcts[9];
                return bScore - aScore;
            });
            setResults(scanResults);
            setBestSymbols(best);
            setScanning(false);
            setProgress(best.length > 0 ? `Found ${best.length} volatility match${best.length > 1 ? 'es' : ''}` : 'No volatility matched. Try again.');
            cleanup();
        };

        const finalizeRfV4 = () => {
            const scanResults: SymbolDirectionResult[] = [];
            const best: string[] = [];
            collectedRef.current.forEach((candles: any[], sym) => {
                if (!candles || candles.length < 5) return;
                const recent = candles.slice(-50);
                let up = 0, down = 0;
                let totalBody = 0, totalRange = 0;
                for (const c of recent) {
                    const o = Number(c.open), cl = Number(c.close), h = Number(c.high), lo = Number(c.low);
                    if (cl > o) up++; else if (cl < o) down++;
                    totalBody += Math.abs(cl - o);
                    totalRange += (h - lo) || 0.0001;
                }
                const total = recent.length;
                const upPct = (up / total) * 100;
                const downPct = (down / total) * 100;
                const bodyShadowRatio = totalBody / totalRange;
                const balanceBias = Math.abs(upPct - downPct);
                const sidewaysScore = 100 - balanceBias - bodyShadowRatio * 20;
                const qualifies = balanceBias < 15 && bodyShadowRatio < 0.55;
                if (qualifies) best.push(sym);
                scanResults.push({
                    symbol: sym,
                    label: SYMBOL_LABELS[sym],
                    sidewaysScore,
                    upPct,
                    downPct,
                    qualifies,
                    detail: `↑${upPct.toFixed(0)}% ↓${downPct.toFixed(0)}% | Body/Range: ${(bodyShadowRatio * 100).toFixed(0)}%`,
                });
            });
            scanResults.sort((a, b) => b.sidewaysScore - a.sidewaysScore);
            setResults(scanResults);
            setBestSymbols(best);
            setScanning(false);
            setProgress(best.length > 0 ? `Found ${best.length} sideways match${best.length > 1 ? 'es' : ''}` : 'No sideways volatility found. Try again.');
            cleanup();
        };

        const mws = openMakotiWS(
            handleMessage,
            () => {
                setProgress('Scanning all 10 volatilities...');
                ALL_SYMBOLS.forEach(sym => {
                    if (style === 'ticks') {
                        mws.send({ ticks_history: sym, count: 100, end: 'latest', style: 'ticks' });
                    } else {
                        mws.send({ ticks_history: sym, count: 50, end: 'latest', style: 'candles', granularity: 60 });
                    }
                });
            },
            () => {
                if (pendingRef.current.size > 0) {
                    setScanning(false);
                    setProgress('Connection closed early. Retry.');
                }
            }
        );
        wsRef.current = mws;

        setTimeout(() => {
            if (pendingRef.current.size > 0) {
                setScanning(false);
                setProgress('Scan timed out. Please retry.');
                cleanup();
            }
        }, 20000);
    }, [bot, scanning, cleanup]);

    return (
        <div className='mw-scanner'>
            <div className='mw-scanner__controls'>
                <div className='mw-field'>
                    <label className='mw-label'>Bot Selection</label>
                    <select
                        className='mw-select'
                        value={bot}
                        onChange={e => setBot(e.target.value as BotId)}
                        disabled={scanning}
                    >
                        <option value='pvty_kill'>pvty kill</option>
                        <option value='rf_v4'>rf v4</option>
                    </select>
                </div>
                <div className='mw-scanner__desc'>
                    {bot === 'pvty_kill'
                        ? 'Finds volatilities where digits 7, 8, and 9 each exceed 10% of the last 100 ticks.'
                        : 'Finds volatilities with no clear candle direction — choppy sideways markets ideal for oscillation strategies.'}
                </div>
                <button
                    className={`mw-btn mw-btn--scan${scanning ? ' mw-btn--busy' : ''}`}
                    onClick={analyze}
                    disabled={scanning}
                >
                    {scanning ? (
                        <><span className='mw-spin' /> Analyzing…</>
                    ) : 'Analyze'}
                </button>
                {progress && <div className='mw-scanner__progress'>{progress}</div>}
            </div>

            {results.length > 0 && (
                <div className='mw-scanner__results'>
                    <div className='mw-scanner__results-head'>
                        {bot === 'pvty_kill' ? 'Digit 7 / 8 / 9 Analysis' : 'Candle Direction Analysis'}
                    </div>
                    {bestSymbols.length > 0 && (
                        <div className='mw-scanner__best'>
                            <span className='mw-scanner__best-lbl'>Best volatilities:</span>
                            {bestSymbols.map(s => (
                                <span key={s} className='mw-scanner__badge'>{SYMBOL_LABELS[s]}</span>
                            ))}
                        </div>
                    )}
                    <div className='mw-scanner__list'>
                        {results.map(r => (
                            <div key={r.symbol} className={`mw-scanner__row${r.qualifies ? ' mw-scanner__row--match' : ''}`}>
                                <div className='mw-scanner__row-head'>
                                    <span className='mw-scanner__sym'>{r.label}</span>
                                    {r.qualifies && <span className='mw-scanner__tag'>MATCH</span>}
                                </div>
                                <div className='mw-scanner__row-detail'>{r.detail}</div>
                                {isDigitResult(r) && (
                                    <div className='mw-scanner__bars'>
                                        {r.pcts.map((p, i) => (
                                            <div key={i} className={`mw-scanner__bar-wrap${[7,8,9].includes(i) ? ' mw-scanner__bar-wrap--hi' : ''}`}>
                                                <div
                                                    className='mw-scanner__bar-fill'
                                                    style={{ height: `${Math.min(100, p * 3)}%` }}
                                                />
                                                <span className='mw-scanner__bar-lbl'>{i}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {!isDigitResult(r) && (
                                    <div className='mw-scanner__dir-bar'>
                                        <div
                                            className='mw-scanner__dir-up'
                                            style={{ width: `${(r as SymbolDirectionResult).upPct}%` }}
                                        />
                                        <div
                                            className='mw-scanner__dir-down'
                                            style={{ width: `${(r as SymbolDirectionResult).downPct}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
