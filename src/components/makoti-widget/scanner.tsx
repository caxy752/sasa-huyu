import React, { useCallback, useRef, useState, useEffect } from 'react';
import { ALL_SYMBOLS, SYMBOL_LABELS, PIP_SIZES, openMakotiWS, MakotiWS } from './makoti-ws';

type BotId = 'pvty_kill' | 'rf_v4';

interface SymbolDigitResult {
    symbol: string;
    label: string;
    pcts: number[];
    totalTicks: number;
    qualifies: boolean;
    detail: string;
}

interface SymbolDirectionResult {
    symbol: string;
    label: string;
    choppinessScore: number;
    bodyRatio: number;
    directionChanges: number;
    trendStrength: number;
    recentBodyRatio: number;
    qualifies: boolean;
    detail: string;
}

type ScanResult = SymbolDigitResult | SymbolDirectionResult;

function isDigitResult(r: ScanResult): r is SymbolDigitResult {
    return (r as SymbolDigitResult).pcts !== undefined;
}

function calcDigitPcts(digits: number[]): number[] {
    const counts = Array(10).fill(0);
    digits.forEach(d => { if (d >= 0 && d <= 9) counts[d]++; });
    const total = digits.length || 1;
    return counts.map(c => (c / total) * 100);
}

/* ── Deep choppiness analysis (50 candles, extra weight on recent) ──────── */
function calcChoppiness(candles: any[]): SymbolDirectionResult {
    const totalCandles = candles.length;
    const lookback = Math.min(50, totalCandles);
    const recent = candles.slice(-lookback);

    const bodyRatios = recent.map(c => {
        const range = Number(c.high) - Number(c.low);
        if (range <= 0) return 1;
        return Math.abs(Number(c.close) - Number(c.open)) / range;
    });
    const avgBodyRatio = bodyRatios.reduce((a, b) => a + b, 0) / bodyRatios.length;

    let directionChanges = 0;
    for (let i = 1; i < recent.length; i++) {
        const prevDir = Number(recent[i - 1].close) - Number(recent[i - 1].open);
        const currDir = Number(recent[i].close) - Number(recent[i].open);
        if ((prevDir > 0 && currDir < 0) || (prevDir < 0 && currDir > 0)) directionChanges++;
    }
    const dirChangeRatio = directionChanges / (recent.length - 1);

    const closes = recent.map(c => Number(c.close));
    const indices = closes.map((_, i) => i);
    const n = indices.length;
    const sumI = indices.reduce((a, b) => a + b, 0);
    const sumC = closes.reduce((a, b) => a + b, 0);
    const sumIC = indices.reduce((a, b, i) => a + b * closes[i], 0);
    const sumI2 = indices.reduce((a, b) => a + b * b, 0);
    const sumC2 = closes.reduce((a, b) => a + b * b, 0);
    const denom = Math.sqrt((n * sumI2 - sumI * sumI) * (n * sumC2 - sumC * sumC));
    const correlation = denom === 0 ? 0 : (n * sumIC - sumI * sumC) / denom;
    const trendStrength = Math.abs(correlation);

    const last3 = candles.slice(-3);
    const last3BodyRatios = last3.map(c => {
        const range = Number(c.high) - Number(c.low);
        if (range <= 0) return 1;
        return Math.abs(Number(c.close) - Number(c.open)) / range;
    });
    const avgRecentBodyRatio = last3BodyRatios.reduce((a, b) => a + b, 0) / last3BodyRatios.length;

    const ranges = recent.map(c => Number(c.high) - Number(c.low));
    const half = Math.floor(ranges.length / 2);
    const firstHalfAvg = ranges.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const secondHalfAvg = ranges.slice(-half).reduce((a, b) => a + b, 0) / half;
    const rangeNarrowing = firstHalfAvg > 0 ? Math.min(1, secondHalfAvg / firstHalfAvg) : 1;

    const choppinessScore = Math.min(100,
        (1 - avgBodyRatio) * 30 +
        dirChangeRatio * 25 +
        (1 - trendStrength) * 20 +
        (1 - avgRecentBodyRatio) * 15 +
        (1 - rangeNarrowing) * 10
    );

    return {
        symbol: '', label: '',
        choppinessScore: Math.round(choppinessScore),
        bodyRatio: Math.round(avgBodyRatio * 100),
        directionChanges,
        trendStrength: Math.round(trendStrength * 100),
        recentBodyRatio: Math.round(avgRecentBodyRatio * 100),
        qualifies: true, // always qualifies — we always pick the best
        detail: `Choppy: ${Math.round(choppinessScore)}% | Body ${Math.round(avgBodyRatio * 100)}% | Δ ${directionChanges}/${lookback - 1} | Trend ${Math.round(trendStrength * 100)}%`,
    };
}

// ─── Global trade-result tracking via POC messages on the main OTP WS ─────
// Initialised to true so first switch works immediately (no trades yet = OK to switch).
(window as any).__makoti_lastTradeWon = true;

function startPocListener() {
    const ws = (window as any)._newSystemWS as WebSocket | undefined;
    if (!ws || (ws as any).__makoti_pocAttached) return;
    (ws as any).__makoti_pocAttached = true;
    ws.addEventListener('message', (evt: MessageEvent) => {
        try {
            const data = JSON.parse(evt.data);
            if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract?.is_sold) {
                (window as any).__makoti_lastTradeWon = Number(data.proposal_open_contract.profit) >= 0;
            }
        } catch (_) {}
    });
}

function stopPocListener() {
    const ws = (window as any)._newSystemWS as WebSocket | undefined;
    if (ws) (ws as any).__makoti_pocAttached = false;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Scanner Component
═══════════════════════════════════════════════════════════════════════════ */
export const Scanner: React.FC = () => {
    const [bot, setBot] = useState<BotId>('pvty_kill');
    const [scanning, setScanning] = useState(false);
    const [progress, setProgress] = useState('');
    const [results, setResults] = useState<ScanResult[]>([]);
    const [bestSymbols, setBestSymbols] = useState<string[]>([]);
    const [autoSwitch, setAutoSwitch] = useState(false);
    const [autoSwitcherActive, setAutoSwitcherActive] = useState(false);
    const [pendingSymbol, setPendingSymbol] = useState('');
    const [notification, setNotification] = useState<{ msg: string; type: 'info' | 'success' | 'warn' } | null>(null);
    const wsRef = useRef<MakotiWS | null>(null);
    const pendingRef = useRef<Set<string>>(new Set());
    const collectedRef = useRef<Map<string, any>>(new Map());
    const botRef = useRef<BotId>('pvty_kill');
    const autoSwitchRef = useRef(false);
    const autoIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentBestRef = useRef<string>('');
    const pendingSymbolRef = useRef<string>('');

    const showNotify = useCallback((msg: string, type: 'info' | 'success' | 'warn' = 'info') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 3500);
    }, []);

    const cleanup = useCallback(() => {
        if (autoIntervalRef.current) {
            clearTimeout(autoIntervalRef.current);
            autoIntervalRef.current = null;
        }
        try { wsRef.current?.close(); } catch (_) { }
        wsRef.current = null;
    }, []);

    /* ── Apply a pending or immediate switch ───────────────────────────── */
    const setPending = useCallback((sym: string) => {
        setPendingSymbol(sym);
        pendingSymbolRef.current = sym;
    }, []);

    const clearPending = useCallback(() => {
        setPendingSymbol('');
        pendingSymbolRef.current = '';
    }, []);

    const applySwitch = useCallback((sym: string) => {
        currentBestRef.current = sym;
        clearPending();
        // Update runtime override (affects next purchase)
        try {
            window.DBot = window.DBot || {};
            (window.DBot as any).__force_symbol = sym;
        } catch (_) { }
        // Update QuickStrategy form
        try {
            const rootStore = (window as any).__store_instance;
            if (rootStore?.quick_strategy) rootStore.quick_strategy.setValue('symbol', sym);
        } catch (_) { }
        // Update Blockly workspace block so the UI dropdown reflects the change
        try {
            const workspace = (window as any).Blockly?.derivWorkspace;
            if (workspace) {
                const blocks = workspace.getAllBlocks();
                const marketBlock = blocks.find((b: any) => b.type === 'trade_definition_market');
                if (marketBlock) {
                    marketBlock.setFieldValue(sym, 'SYMBOL_LIST');
                }
            }
        } catch (_) { }
        (window as any).__makoti_lastTradeWon = false; // reset until next win
        showNotify(`Volatility Updated: ${SYMBOL_LABELS[sym]}`, 'success');
    }, [showNotify, clearPending]);

    /* ── Perform a scan ────────────────────────────────────────────────── */
    const performScan = useCallback((isAuto = false) => {
        if (scanning && !isAuto) return;
        const currentBot = botRef.current;
        if (currentBot === 'pvty_kill' && isAuto) return;
        if (!isAuto) setScanning(true);
        setProgress(isAuto ? 'Auto-scanning…' : 'Connecting to Deriv API…');
        if (!isAuto) { setResults([]); setBestSymbols([]); }
        pendingRef.current = new Set(ALL_SYMBOLS);
        collectedRef.current = new Map();
        if (!isAuto) cleanup();

        const isTicks = currentBot === 'pvty_kill';

        const finalizePvty = () => {
            const scanResults: SymbolDigitResult[] = [];
            const best: string[] = [];
            collectedRef.current.forEach((digits: number[], sym) => {
                const pcts = calcDigitPcts(digits);
                const d7 = pcts[7], d8 = pcts[8], d9 = pcts[9];
                const qualifies = d7 > 10 && d8 > 10 && d9 > 10;
                if (qualifies) best.push(sym);
                scanResults.push({
                    symbol: sym, label: SYMBOL_LABELS[sym],
                    pcts, totalTicks: digits.length, qualifies,
                    detail: `7: ${d7.toFixed(1)}%  |  8: ${d8.toFixed(1)}%  |  9: ${d9.toFixed(1)}%`,
                });
            });
            scanResults.sort((a, b) =>
                (b.pcts[7] + b.pcts[8] + b.pcts[9]) - (a.pcts[7] + a.pcts[8] + a.pcts[9])
            );
            setResults(scanResults);
            setBestSymbols(best);
            setScanning(false);
            setProgress(best.length > 0
                ? `Found ${best.length} volatility match${best.length > 1 ? 'es' : ''}`
                : 'No volatility matched all three criteria. Try again.');
            cleanup();
        };

        const finalizeRfV4 = () => {
            const scanResults: SymbolDirectionResult[] = [];
            collectedRef.current.forEach((candles: any[], sym) => {
                if (!candles || candles.length < 5) return;
                const analysis = calcChoppiness(candles);
                analysis.symbol = sym;
                analysis.label = SYMBOL_LABELS[sym];
                scanResults.push(analysis);
            });

            scanResults.sort((a, b) => b.choppinessScore - a.choppinessScore);
            const best = scanResults.map(r => r.symbol);
            setResults(scanResults);
            setBestSymbols(best.slice(0, 3)); // top 3
            setScanning(false);

            const bestSym = best[0] || '';
            const bestLabel = bestSym ? SYMBOL_LABELS[bestSym] : '';
            const bestScore = scanResults[0]?.choppinessScore ?? 0;

            if (bestSym && bestSym !== currentBestRef.current && autoSwitchRef.current) {
                const lastWon = (window as any).__makoti_lastTradeWon;
                if (lastWon) {
                    applySwitch(bestSym);
                } else {
                    setPending(bestSym);
                    showNotify(`Waiting for win before switching to ${bestLabel}…`, 'warn');
                }
            }

            // Apply pending switch when a win arrives
            const ps = pendingSymbolRef.current;
            if (ps && (window as any).__makoti_lastTradeWon && autoSwitchRef.current) {
                if (best.indexOf(ps) >= 0) {
                    applySwitch(ps);
                } else {
                    clearPending();
                }
            }

            if (isAuto) {
                const ps2 = pendingSymbolRef.current;
                const status = ps2
                    ? `Pending: ${SYMBOL_LABELS[ps2]} (waiting for win)`
                    : `Best: ${bestLabel} (${bestScore}%)`;
                setProgress(`Auto: ${status}`);
                if (autoSwitchRef.current) {
                    autoIntervalRef.current = setTimeout(() => performScan(true), 30000);
                }
            } else {
                setProgress(`Top choppy: ${bestLabel} (${bestScore}%)`);
            }
            if (!isAuto) cleanup();
        };

        const handleMessage = (data: any) => {
            if (data.error) return;

            if (isTicks && data.msg_type === 'history' && data.history?.prices) {
                const sym: string = data.echo_req?.ticks_history;
                if (!sym || !pendingRef.current.has(sym)) return;
                pendingRef.current.delete(sym);
                const pip = PIP_SIZES[sym] || 2;
                const digits = (data.history.prices as (string | number)[])
                    .map(p => Number(Number(p).toFixed(pip).slice(-1)));
                collectedRef.current.set(sym, digits);
                setProgress(`Scanned ${ALL_SYMBOLS.length - pendingRef.current.size} / ${ALL_SYMBOLS.length} volatilities…`);
                if (pendingRef.current.size === 0) finalizePvty();
            }

            if (!isTicks && data.msg_type === 'candles' && data.candles) {
                const sym: string = data.echo_req?.ticks_history;
                if (!sym || !pendingRef.current.has(sym)) return;
                pendingRef.current.delete(sym);
                collectedRef.current.set(sym, data.candles);
                setProgress(`Scanned ${ALL_SYMBOLS.length - pendingRef.current.size} / ${ALL_SYMBOLS.length} volatilities…`);
                if (pendingRef.current.size === 0) finalizeRfV4();
            }
        };

        const mws = openMakotiWS(
            handleMessage,
            () => {
                setProgress(isTicks
                    ? 'Fetching 1 000 ticks from all 10 volatilities…'
                    : 'Fetching 50 candles from all 10 volatilities…');
                ALL_SYMBOLS.forEach(sym => {
                    if (isTicks) {
                        mws.send({ ticks_history: sym, count: 1000, end: 'latest', style: 'ticks' });
                    } else {
                        mws.send({ ticks_history: sym, count: 50, end: 'latest', style: 'candles', granularity: 60 });
                    }
                });
            },
            () => {
                if (pendingRef.current.size > 0 && !isAuto) {
                    setScanning(false);
                    setProgress('Connection closed early. Please retry.');
                }
            }
        );
        wsRef.current = mws;

        setTimeout(() => {
            if (pendingRef.current.size > 0) {
                if (!isAuto) setScanning(false);
                setProgress(isAuto ? 'Auto-scan timed out.' : 'Scan timed out. Please retry.');
                if (!isAuto) cleanup();
            }
        }, 30000);
    }, [bot, scanning, cleanup, showNotify, applySwitch, setPending, clearPending]);

    /* ── Manual analyze button ──────────────────────────────────────────── */
    const analyze = useCallback(() => {
        if (scanning) return;
        botRef.current = bot;
        if (autoIntervalRef.current) {
            clearTimeout(autoIntervalRef.current);
            autoIntervalRef.current = null;
        }
        if (autoSwitch && bot === 'rf_v4') {
            currentBestRef.current = '';
            clearPending();
            setAutoSwitcherActive(true);
            autoSwitchRef.current = true;
            startPocListener();
            // Start first scan — finalizeRfV4 will schedule subsequent scans via setTimeout
            performScan(false);
        } else {
            setAutoSwitcherActive(false);
            autoSwitchRef.current = false;
            stopPocListener();
            performScan(false);
        }
    }, [bot, scanning, autoSwitch, performScan, clearPending]);

    /* ── Toggle auto-switcher ───────────────────────────────────────────── */
    const toggleAutoSwitch = useCallback(() => {
        setAutoSwitch(prev => {
            const next = !prev;
            if (!next) {
                setAutoSwitcherActive(false);
                clearPending();
                autoSwitchRef.current = false;
                currentBestRef.current = '';
                stopPocListener();
                if (autoIntervalRef.current) {
                    clearTimeout(autoIntervalRef.current);
                    autoIntervalRef.current = null;
                }
            }
            return next;
        });
    }, []);

    useEffect(() => {
        return () => {
            autoSwitchRef.current = false;
            stopPocListener();
            if (autoIntervalRef.current) clearTimeout(autoIntervalRef.current);
            try { wsRef.current?.close(); } catch (_) { }
        };
    }, []);

    return (
        <div className='mw-scanner'>
            {notification && (
                <div className={`mw-scanner__notif mw-scanner__notif--${notification.type}`}>
                    {notification.msg}
                </div>
            )}

            <div className='mw-scanner__controls'>
                <div className='mw-field'>
                    <label className='mw-label'>Bot Selection</label>
                    <select className='mw-select' value={bot}
                        onChange={e => setBot(e.target.value as BotId)} disabled={scanning}>
                        <option value='pvty_kill'>Poverty Killer</option>
                        <option value='rf_v4'>Rise/Fall V4</option>
                    </select>
                </div>

                <div className='mw-scanner__desc'>
                    {bot === 'pvty_kill'
                        ? 'Scans 1 000 ticks per volatility. Finds markets where digits 7, 8 and 9 each exceed 10% — ideal for high-digit strategies.'
                        : 'Deep candle analysis (50 candles per volatility). Finds markets with choppy/undirectional action — no clear trend, small bodies, alternating direction.'}
                </div>

                {bot === 'rf_v4' && (
                    <label className='mw-switch-row'>
                        <span className='mw-switch-label'>Auto Switcher</span>
                        <div className='mw-toggle' onClick={toggleAutoSwitch}>
                            <div className={`mw-toggle__track${autoSwitch ? ' mw-toggle__track--on' : ''}`}>
                                <div className={`mw-toggle__thumb${autoSwitch ? ' mw-toggle__thumb--on' : ''}`} />
                            </div>
                        </div>
                        {autoSwitcherActive && <span className='mw-switch-active'>ACTIVE</span>}
                        {pendingSymbol && <span className='mw-switch-pending'>⏳ WIN REQUIRED</span>}
                    </label>
                )}

                <button className={`mw-btn mw-btn--scan${scanning ? ' mw-btn--busy' : ''}`}
                    onClick={analyze} disabled={scanning}>
                    {scanning ? <><span className='mw-spin' /> Analyzing…</> : 'Analyze'}
                </button>
                {progress && <div className='mw-scanner__progress'>{progress}</div>}
            </div>

            {results.length > 0 && (
                <div className='mw-scanner__results'>
                    <div className='mw-scanner__results-head'>
                        {bot === 'pvty_kill'
                            ? 'Digit 7 / 8 / 9 Distribution (1 000 ticks)'
                            : `Choppiness Analysis (50 candles) ${autoSwitcherActive ? '— Auto-switching ON' : ''}`}
                    </div>

                    {bestSymbols.length > 0 && (
                        <div className='mw-scanner__best'>
                            <span className='mw-scanner__best-lbl'>Best:</span>
                            {bestSymbols.map(s => (
                                <span key={s} className='mw-scanner__badge'>{SYMBOL_LABELS[s]}</span>
                            ))}
                        </div>
                    )}

                    <div className='mw-scanner__list'>
                        {results.map((r, idx) => (
                            <div key={r.symbol}
                                className={`mw-scanner__row${idx === 0 ? ' mw-scanner__row--match' : ''}`}>
                                <div className='mw-scanner__row-head'>
                                    <span className='mw-scanner__sym'>{r.label}</span>
                                    <span className='mw-scanner__row-detail'>{r.detail}</span>
                                    {idx === 0 && <span className='mw-scanner__tag'>BEST</span>}
                                </div>

                                {isDigitResult(r) && (
                                    <div className='mw-scanner__bars'>
                                        {r.pcts.map((p, i) => (
                                            <div key={i}
                                                className={`mw-scanner__bar-wrap${[7, 8, 9].includes(i) ? ' mw-scanner__bar-wrap--hi' : ''}`}
                                                title={`Digit ${i}: ${p.toFixed(2)}%`}>
                                                <div className='mw-scanner__bar-fill'
                                                    style={{ height: `${Math.min(100, p * 4)}%` }} />
                                                <span className='mw-scanner__bar-pct'>{p.toFixed(0)}%</span>
                                                <span className='mw-scanner__bar-lbl'>{i}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {!isDigitResult(r) && (() => {
                                    const dr = r as SymbolDirectionResult;
                                    return (
                                        <div className='mw-scanner__dir-bar'>
                                            <div className='mw-scanner__dir-fill'
                                                style={{
                                                    width: `${dr.choppinessScore}%`,
                                                    background: dr.choppinessScore >= 70
                                                        ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                                                        : dr.choppinessScore >= 55
                                                            ? 'linear-gradient(90deg, #eab308, #ca8a04)'
                                                            : 'linear-gradient(90deg, #ef4444, #dc2626)',
                                                }} />
                                        </div>
                                    );
                                })()}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
