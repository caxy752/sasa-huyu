import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getAppId, getSocketURL } from '@/components/shared';
import './signal-zone.scss';

type SignalStatus = 'rise' | 'fall' | 'over' | 'under' | 'even' | 'odd' | 'neutral';

interface SymbolSignal {
    symbol: string;
    label: string;
    rise: SignalStatus;
    fall: SignalStatus;
    over2: SignalStatus;
    under7: SignalStatus;
    even: SignalStatus;
    odd: SignalStatus;
    riseStrength: number;
    fallStrength: number;
    lastPrice: number;
    tickCount: number;
}

const SYMBOLS = [
    { symbol: 'R_10', label: 'Vol 10 Index' },
    { symbol: 'R_25', label: 'Vol 25 Index' },
    { symbol: 'R_50', label: 'Vol 50 Index' },
    { symbol: 'R_75', label: 'Vol 75 Index' },
    { symbol: 'R_100', label: 'Vol 100 Index' },
    { symbol: '1HZ10V', label: 'Vol 10 (1s)' },
    { symbol: '1HZ25V', label: 'Vol 25 (1s)' },
    { symbol: '1HZ50V', label: 'Vol 50 (1s)' },
    { symbol: '1HZ75V', label: 'Vol 75 (1s)' },
    { symbol: '1HZ100V', label: 'Vol 100 (1s)' },
];

const SignalZone: React.FC = () => {
    const [signals, setSignals] = useState<SymbolSignal[]>(
        SYMBOLS.map(s => ({
            ...s,
            rise: 'neutral',
            fall: 'neutral',
            over2: 'neutral',
            under7: 'neutral',
            even: 'neutral',
            odd: 'neutral',
            riseStrength: 50,
            fallStrength: 50,
            lastPrice: 0,
            tickCount: 0,
        }))
    );
    const [connected, setConnected] = useState(false);
    const [activeView, setActiveView] = useState<'rise-fall' | 'over-under' | 'even-odd'>('rise-fall');
    const ticksRef = useRef<Record<string, number[]>>({});
    const wsRef = useRef<WebSocket | null>(null);

    const computeSignals = useCallback(() => {
        setSignals(prev =>
            prev.map(sig => {
                const ticks = ticksRef.current[sig.symbol] || [];
                if (ticks.length < 30) return sig;

                const last255 = ticks.slice(-255);
                const last55 = ticks.slice(-55);

                let rise255 = 0, fall255 = 0;
                for (let i = 1; i < last255.length; i++) {
                    if (last255[i] > last255[i - 1]) rise255++;
                    else if (last255[i] < last255[i - 1]) fall255++;
                }
                const total255 = rise255 + fall255 || 1;
                const risePct255 = (rise255 / total255) * 100;
                const fallPct255 = (fall255 / total255) * 100;

                let rise55 = 0, fall55 = 0;
                for (let i = 1; i < last55.length; i++) {
                    if (last55[i] > last55[i - 1]) rise55++;
                    else if (last55[i] < last55[i - 1]) fall55++;
                }
                const total55 = rise55 + fall55 || 1;
                const risePct55 = (rise55 / total55) * 100;
                const fallPct55 = (fall55 / total55) * 100;

                const riseSignal: SignalStatus = risePct255 > 57 && risePct55 > 55 ? 'rise' : 'neutral';
                const fallSignal: SignalStatus = fallPct255 > 57 && fallPct55 > 55 ? 'fall' : 'neutral';

                const digitCounts = new Array(10).fill(0);
                last255.forEach(t => {
                    const d = parseInt(t.toFixed(2).slice(-1));
                    if (d >= 0 && d <= 9) digitCounts[d]++;
                });
                const total = last255.length;
                const pcts = digitCounts.map(c => (c / total) * 100);

                const over2: SignalStatus =
                    pcts[7] < 10 && pcts[8] < 10 && pcts[9] < 10 ? 'over' : 'neutral';
                const under7: SignalStatus =
                    pcts[0] < 10 && pcts[1] < 10 && pcts[2] < 10 ? 'under' : 'neutral';

                const evenCount = [0, 2, 4, 6, 8].reduce((a, d) => a + digitCounts[d], 0);
                const oddCount = [1, 3, 5, 7, 9].reduce((a, d) => a + digitCounts[d], 0);
                const evenPct = (evenCount / total) * 100;
                const oddPct = (oddCount / total) * 100;
                const evenSignal: SignalStatus = evenPct > 55 ? 'even' : 'neutral';
                const oddSignal: SignalStatus = oddPct > 55 ? 'odd' : 'neutral';

                return {
                    ...sig,
                    rise: riseSignal,
                    fall: fallSignal,
                    over2,
                    under7,
                    even: evenSignal,
                    odd: oddSignal,
                    riseStrength: Math.round(risePct255),
                    fallStrength: Math.round(fallPct255),
                    lastPrice: ticks[ticks.length - 1] || 0,
                    tickCount: ticks.length,
                };
            })
        );
    }, []);

    useEffect(() => {
        const ws = new WebSocket(`wss://${getSocketURL()}/websockets/v3?app_id=${getAppId()}`);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            SYMBOLS.forEach(({ symbol }) => {
                ticksRef.current[symbol] = [];
                ws.send(JSON.stringify({ ticks_history: symbol, count: 255, end: 'latest', style: 'ticks', subscribe: 1 }));
            });
        };

        ws.onmessage = evt => {
            const data = JSON.parse(evt.data);
            if (data.error) return;
            if (data.history?.prices) {
                const sym = data.echo_req.ticks_history;
                ticksRef.current[sym] = data.history.prices.map(Number);
            } else if (data.tick) {
                const sym = data.tick.symbol;
                if (!ticksRef.current[sym]) ticksRef.current[sym] = [];
                ticksRef.current[sym].push(parseFloat(data.tick.quote));
                if (ticksRef.current[sym].length > 500) ticksRef.current[sym].shift();
            }
        };

        ws.onclose = () => setConnected(false);
        ws.onerror = () => setConnected(false);

        const interval = setInterval(computeSignals, 1500);

        return () => {
            clearInterval(interval);
            ws.close();
        };
    }, [computeSignals]);

    const getSignalBadge = (status: SignalStatus, label: string) => {
        const active = status !== 'neutral';
        return (
            <span className={`sz-badge sz-badge--${status} ${active ? 'sz-badge--active' : ''}`}>
                {active ? label : '—'}
            </span>
        );
    };

    const activeSignals = signals.filter(s =>
        activeView === 'rise-fall'
            ? s.rise !== 'neutral' || s.fall !== 'neutral'
            : activeView === 'over-under'
            ? s.over2 !== 'neutral' || s.under7 !== 'neutral'
            : s.even !== 'neutral' || s.odd !== 'neutral'
    ).length;

    return (
        <div className='signal-zone'>
            <div className='signal-zone__header'>
                <div className='signal-zone__header-left'>
                    <div className='sz-pulse-dot' />
                    <div>
                        <h1 className='signal-zone__title'>Signal Zone</h1>
                        <p className='signal-zone__subtitle'>
                            {connected ? `Live · ${activeSignals} active signal${activeSignals !== 1 ? 's' : ''}` : 'Connecting…'}
                        </p>
                    </div>
                </div>
                <div className='signal-zone__views'>
                    {(['rise-fall', 'over-under', 'even-odd'] as const).map(v => (
                        <button
                            key={v}
                            className={`sz-view-btn ${activeView === v ? 'sz-view-btn--active' : ''}`}
                            onClick={() => setActiveView(v)}
                        >
                            {v === 'rise-fall' ? '📈 Rise / Fall' : v === 'over-under' ? '🎯 Over / Under' : '⚖️ Even / Odd'}
                        </button>
                    ))}
                </div>
            </div>

            <div className='signal-zone__grid'>
                {signals.map(sig => {
                    const hasSignal =
                        activeView === 'rise-fall'
                            ? sig.rise !== 'neutral' || sig.fall !== 'neutral'
                            : activeView === 'over-under'
                            ? sig.over2 !== 'neutral' || sig.under7 !== 'neutral'
                            : sig.even !== 'neutral' || sig.odd !== 'neutral';

                    return (
                        <div key={sig.symbol} className={`sz-card ${hasSignal ? 'sz-card--signal' : ''}`}>
                            <div className='sz-card__header'>
                                <span className='sz-card__symbol'>{sig.label}</span>
                                <span className='sz-card__ticks'>{sig.tickCount} ticks</span>
                            </div>

                            {activeView === 'rise-fall' && (
                                <div className='sz-card__signals'>
                                    {getSignalBadge(sig.rise, '📈 Rise')}
                                    {getSignalBadge(sig.fall, '📉 Fall')}
                                    <div className='sz-strength-bar'>
                                        <div className='sz-strength-bar__rise' style={{ width: `${sig.riseStrength}%` }} />
                                    </div>
                                    <div className='sz-card__pct'>
                                        <span style={{ color: '#22c55e' }}>Rise {sig.riseStrength}%</span>
                                        <span style={{ color: '#ef4444' }}>Fall {sig.fallStrength}%</span>
                                    </div>
                                </div>
                            )}
                            {activeView === 'over-under' && (
                                <div className='sz-card__signals'>
                                    {getSignalBadge(sig.over2, '🔼 Over 2')}
                                    {getSignalBadge(sig.under7, '🔽 Under 7')}
                                </div>
                            )}
                            {activeView === 'even-odd' && (
                                <div className='sz-card__signals'>
                                    {getSignalBadge(sig.even, '⚖️ Even')}
                                    {getSignalBadge(sig.odd, '🎲 Odd')}
                                </div>
                            )}

                            {sig.tickCount < 30 && (
                                <div className='sz-card__loading'>
                                    <span className='sz-spinner' /> Loading ticks…
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default SignalZone;
