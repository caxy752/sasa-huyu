import React, { useCallback, useRef, useState } from 'react';
import { ALL_SYMBOLS, SYMBOL_LABELS, PIP_SIZES, openMakotiWS, MakotiWS, analyzeSignal } from './makoti-ws';

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface SymbolState {
    ticks: number[];
    prices: number[];
    lastSignal: string;
    wins: number;
    losses: number;
    currentStake: number;
    ready: boolean;       // true once we have enough history
}

interface LogEntry {
    time: string;
    msg: string;
    type: 'win' | 'loss' | 'info' | 'trade';
}

/* ── Constants ─────────────────────────────────────────────────────────────── */
const MAX_TICKS              = 1000;  // mirror over-under-store MAX_TICKS
const MIN_TICKS_BEFORE_TRADE = 30;   // RSI(7) + BB(14) need ~15-20 prices; 30 is safe
const CONFIDENCE_THRESHOLD   = 72;   // new multi-indicator engine is more selective

/* ═══════════════════════════════════════════════════════════════════════════
   MarketKiller
   ONE trade active at a time globally. Each incoming tick from every
   volatility is evaluated; the first symbol that produces a signal with
   confidence ≥ threshold fires a trade. All other symbols wait until that
   contract settles before the next trade can be placed.
═══════════════════════════════════════════════════════════════════════════ */
export const MarketKiller: React.FC = () => {
    const [stake,       setStake]       = useState('0.35');
    const [martingale,  setMartingale]  = useState('2');
    const [takeProfit,  setTakeProfit]  = useState('10');
    const [stopLoss,    setStopLoss]    = useState('5');
    const [running,     setRunning]     = useState(false);
    const [pnl,         setPnl]         = useState(0);
    const [logs,        setLogs]        = useState<LogEntry[]>([]);
    const [activeContracts, setActiveContracts] = useState(0);
    const [symbolDisplay, setSymbolDisplay] = useState<
        Record<string, { lastSignal: string; wins: number; losses: number; stake: number }>
    >({});

    /* ── Refs (survive re-renders, no lag) ─────────────────────────────── */
    const wsRef            = useRef<MakotiWS | null>(null);
    const symbolDataRef    = useRef<Record<string, SymbolState>>({});
    const pnlRef           = useRef(0);
    const runningRef       = useRef(false);
    const stakeParsed      = useRef(0.35);
    const martingaleParsed = useRef(2);
    const tpRef            = useRef(10);
    const slRef            = useRef(5);

    // Global one-at-a-time lock — only ONE trade active across all symbols
    const globalLock       = useRef(false);
    const activeContractsRef = useRef(0);
    const contractMapRef   = useRef<Map<string, { symbol: string; stake: number }>>(new Map());

    /* ── Log helper ──────────────────────────────────────────────────────── */
    const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => [{ time, msg, type }, ...prev].slice(0, 120));
    }, []);

    /* ── Flush symbol display state ──────────────────────────────────────── */
    const flushDisplay = useCallback((sym: string) => {
        const sd = symbolDataRef.current[sym];
        if (!sd) return;
        setSymbolDisplay(prev => ({
            ...prev,
            [sym]: { lastSignal: sd.lastSignal, wins: sd.wins, losses: sd.losses, stake: sd.currentStake },
        }));
    }, []);

    /* ── Check TP / SL ───────────────────────────────────────────────────── */
    const checkLimits = useCallback(() => {
        if (pnlRef.current >= tpRef.current) {
            addLog(`✅ Take Profit +$${tpRef.current} reached! P&L: $${pnlRef.current.toFixed(2)}`, 'win');
            stopKiller();
            return true;
        }
        if (pnlRef.current <= -slRef.current) {
            addLog(`🛑 Stop Loss -$${slRef.current} hit! P&L: $${pnlRef.current.toFixed(2)}`, 'loss');
            stopKiller();
            return true;
        }
        return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addLog]);

    /* ── Stop ────────────────────────────────────────────────────────────── */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const stopKiller = useCallback(() => {
        runningRef.current = false;
        globalLock.current = false;
        setRunning(false);
        try { wsRef.current?.close(); } catch (_) {}
        wsRef.current = null;
        addLog('Market Killer stopped.', 'info');
    }, [addLog]);

    /* ── Execute ONE trade ───────────────────────────────────────────────── */
    const executeTrade = useCallback((sym: string) => {
        if (!runningRef.current || !wsRef.current?.isOpen()) return;
        const sd = symbolDataRef.current[sym];
        if (!sd || sd.ticks.length < MIN_TICKS_BEFORE_TRADE) return;

        const signal = analyzeSignal(sd.ticks, sd.prices);
        if (!signal || signal.confidence < CONFIDENCE_THRESHOLD) return;

        // Acquire global lock
        globalLock.current = true;
        activeContractsRef.current = 1;
        setActiveContracts(1);

        const { contract_type, barrier, reason, confidence } = signal;
        const tradeStake = Number(sd.currentStake.toFixed(2));

        const params: any = {
            amount: tradeStake, basis: 'stake', currency: 'USD',
            duration: 1, duration_unit: 't',
            symbol: sym, contract_type,
        };
        if (barrier) params.barrier = barrier;

        wsRef.current.send({ buy: 1, price: tradeStake, parameters: params });

        const label = contract_type === 'CALL' ? 'RISE'
            : contract_type === 'PUT' ? 'FALL'
            : `${contract_type}${barrier ? ' ' + barrier : ''}`;

        sd.lastSignal = label;
        addLog(`🎯 [${confidence.toFixed(0)}%] ${SYMBOL_LABELS[sym]}: ${label} @ $${tradeStake} — ${reason}`, 'trade');
        flushDisplay(sym);
    }, [addLog, flushDisplay]);

    /* ── Handle every incoming tick: scan all symbols, pick best signal ─── */
    const onTickReceived = useCallback((sym: string) => {
        if (!runningRef.current) return;
        if (globalLock.current)  return;   // one trade in flight — wait

        // Evaluate ALL symbols, pick the one with the highest confidence signal
        let bestSym  = '';
        let bestConf = CONFIDENCE_THRESHOLD - 1;

        ALL_SYMBOLS.forEach(s => {
            const sd = symbolDataRef.current[s];
            if (!sd || sd.ticks.length < MIN_TICKS_BEFORE_TRADE) return;
            const sig = analyzeSignal(sd.ticks, sd.prices);
            if (sig && sig.confidence > bestConf) {
                bestConf = sig.confidence;
                bestSym  = s;
            }
        });

        if (bestSym) executeTrade(bestSym);
    }, [executeTrade]);

    /* ── Start ───────────────────────────────────────────────────────────── */
    const startKiller = useCallback(() => {
        const stakeVal = Math.max(0.35, parseFloat(stake) || 0.35);
        const mgVal    = Math.max(1,    parseFloat(martingale) || 2);
        const tpVal    = Math.max(0.5,  parseFloat(takeProfit) || 10);
        const slVal    = Math.max(0.5,  parseFloat(stopLoss)   || 5);

        stakeParsed.current      = stakeVal;
        martingaleParsed.current = mgVal;
        tpRef.current            = tpVal;
        slRef.current            = slVal;
        pnlRef.current           = 0;
        globalLock.current       = false;
        activeContractsRef.current = 0;

        setPnl(0);
        setLogs([]);
        setActiveContracts(0);
        setSymbolDisplay({});
        contractMapRef.current = new Map();

        // Initialize per-symbol state
        symbolDataRef.current = {};
        ALL_SYMBOLS.forEach(sym => {
            symbolDataRef.current[sym] = {
                ticks: [], prices: [], lastSignal: '—',
                wins: 0, losses: 0, currentStake: stakeVal, ready: false,
            };
        });

        runningRef.current = true;
        setRunning(true);

        addLog(`⚔ Kill Market — stake $${stakeVal}  MG ×${mgVal}  TP $${tpVal}  SL $${slVal}`, 'info');
        addLog('Connecting to Deriv API…', 'info');

        if (wsRef.current) { try { wsRef.current.close(); } catch (_) {} wsRef.current = null; }

        /* ── Message handler ────────────────────────────────────────────── */
        const handleMsg = (data: any) => {
            if (!runningRef.current) return;

            // Handle errors
            if (data.error) {
                if (data.msg_type === 'buy') {
                    addLog(`Buy error: ${data.error.message}`, 'info');
                    globalLock.current = false;
                    activeContractsRef.current = 0;
                    setActiveContracts(0);
                }
                return;
            }

            switch (data.msg_type) {

                /* ── Initial tick history ─────────────────────────────── */
                case 'history': {
                    const sym: string = data.echo_req?.ticks_history;
                    if (!sym || !symbolDataRef.current[sym]) return;
                    const sd  = symbolDataRef.current[sym];
                    const pip = PIP_SIZES[sym] || 2;
                    const prices = (data.history.prices as (string | number)[]).map(p => Number(p));
                    const digits = prices.map(p => Number(p.toFixed(pip).slice(-1)));
                    sd.ticks  = digits.slice(-MAX_TICKS);
                    sd.prices = prices.slice(-MAX_TICKS);
                    sd.ready  = sd.ticks.length >= MIN_TICKS_BEFORE_TRADE;
                    addLog(`Loaded ${digits.length} ticks — ${SYMBOL_LABELS[sym]}`, 'info');
                    break;
                }

                /* ── Live tick ────────────────────────────────────────── */
                case 'tick': {
                    const tick     = data.tick;
                    const sym: string = tick.symbol;
                    if (!sym || !symbolDataRef.current[sym]) return;
                    const sd  = symbolDataRef.current[sym];
                    const pip = PIP_SIZES[sym] || tick.pip_size || 2;
                    const price = Number(tick.quote);
                    const digit = Number(price.toFixed(pip).slice(-1));

                    // Append to rolling window (mirror over-under-store slice pattern)
                    sd.ticks  = [...sd.ticks.slice(-(MAX_TICKS - 1)), digit];
                    sd.prices = [...sd.prices.slice(-(MAX_TICKS - 1)), price];
                    sd.ready  = sd.ticks.length >= MIN_TICKS_BEFORE_TRADE;

                    // On every tick, check if any symbol now has a great signal
                    onTickReceived(sym);
                    break;
                }

                /* ── Buy confirmation ─────────────────────────────────── */
                case 'buy': {
                    const sym: string = data.echo_req?.parameters?.symbol;
                    if (!sym) return;
                    if (data.error) {
                        globalLock.current = false;
                        activeContractsRef.current = 0;
                        setActiveContracts(0);
                        return;
                    }
                    const cid = String(data.buy.contract_id);
                    const sd  = symbolDataRef.current[sym];
                    contractMapRef.current.set(cid, { symbol: sym, stake: sd?.currentStake ?? stakeParsed.current });
                    addLog(`Contract ${cid} open on ${SYMBOL_LABELS[sym]}`, 'info');
                    break;
                }

                /* ── Contract settled ─────────────────────────────────── */
                case 'proposal_open_contract': {
                    const c = data.proposal_open_contract;
                    if (!c?.is_sold) return;
                    const cid   = String(c.contract_id);
                    const entry = contractMapRef.current.get(cid);
                    if (!entry) return;
                    contractMapRef.current.delete(cid);

                    const { symbol: sym, stake: tradeStake } = entry;
                    const sd = symbolDataRef.current[sym];
                    if (!sd) return;

                    const profit = Number(c.profit);
                    const won    = profit >= 0;
                    pnlRef.current += profit;
                    setPnl(pnlRef.current);

                    if (won) {
                        sd.wins++;
                        sd.currentStake = stakeParsed.current;     // reset to base stake on win
                        addLog(`✅ WON +$${profit.toFixed(2)} on ${SYMBOL_LABELS[sym]} | P&L $${pnlRef.current.toFixed(2)}`, 'win');
                    } else {
                        sd.losses++;
                        // Martingale: multiply stake, cap at 100
                        sd.currentStake = Math.min(
                            Number((tradeStake * martingaleParsed.current).toFixed(2)),
                            100
                        );
                        addLog(`❌ LOST -$${Math.abs(profit).toFixed(2)} on ${SYMBOL_LABELS[sym]} | Next stake $${sd.currentStake.toFixed(2)} | P&L $${pnlRef.current.toFixed(2)}`, 'loss');
                    }

                    flushDisplay(sym);

                    // Release global lock — next tick across any symbol can fire a trade
                    globalLock.current = false;
                    activeContractsRef.current = 0;
                    setActiveContracts(0);

                    checkLimits();
                    break;
                }
            }
        };

        /* ── Open WS ─────────────────────────────────────────────────────── */
        const mws = openMakotiWS(
            handleMsg,
            () => {
                addLog('Connected ✓  Subscribing to all 10 volatilities…', 'info');
                // Subscribe to live contract updates
                mws.send({ proposal_open_contract: 1, subscribe: 1 });
                // Load 1000-tick history + subscribe to live ticks for every symbol
                ALL_SYMBOLS.forEach(sym => {
                    mws.send({ ticks_history: sym, count: 1000, end: 'latest', style: 'ticks', subscribe: 1 });
                });
            },
            () => {
                if (runningRef.current) {
                    addLog('Connection lost. Stopping.', 'info');
                    stopKiller();
                }
            }
        );
        wsRef.current = mws;
    }, [stake, martingale, takeProfit, stopLoss, addLog, flushDisplay, checkLimits, stopKiller, onTickReceived]);

    /* ── Derived display values ──────────────────────────────────────────── */
    const totalWins   = Object.values(symbolDisplay).reduce((a, b) => a + b.wins,  0);
    const totalLosses = Object.values(symbolDisplay).reduce((a, b) => a + b.losses, 0);
    const totalTrades = totalWins + totalLosses;
    const winRate     = totalTrades > 0 ? (totalWins / totalTrades * 100).toFixed(1) : '—';

    return (
        <div className='mw-killer'>
            {/* ── Input fields ── */}
            <div className='mw-killer__fields'>
                <div className='mw-field'>
                    <label className='mw-label'>Stake ($)</label>
                    <input className='mw-input' type='number' min='0.35' step='0.01'
                        value={stake} onChange={e => setStake(e.target.value)} disabled={running} />
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Martingale ×</label>
                    <input className='mw-input' type='number' min='1' step='0.1'
                        value={martingale} onChange={e => setMartingale(e.target.value)} disabled={running} />
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Take Profit ($)</label>
                    <input className='mw-input' type='number' min='0.5' step='0.5'
                        value={takeProfit} onChange={e => setTakeProfit(e.target.value)} disabled={running} />
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Stop Loss ($)</label>
                    <input className='mw-input' type='number' min='0.5' step='0.5'
                        value={stopLoss} onChange={e => setStopLoss(e.target.value)} disabled={running} />
                </div>
            </div>

            {/* ── Kill Market button ── */}
            <button
                className={`mw-btn${running ? ' mw-btn--stop' : ' mw-btn--kill'}`}
                onClick={running ? stopKiller : startKiller}
            >
                {running
                    ? <><span className='mw-pulse' /> STOP KILLER</>
                    : '⚔ KILL MARKET'}
            </button>

            {/* ── One-at-a-time notice ── */}
            {running && (
                <div className='mw-killer__mode-note'>
                    One trade at a time — waits for contract to settle before next entry
                    {activeContracts > 0 && <span className='mw-killer__active-dot'> ● TRADE LIVE</span>}
                </div>
            )}

            {/* ── Stats ── */}
            {(running || totalTrades > 0) && (
                <div className='mw-killer__stats'>
                    <div className={`mw-killer__pnl${pnl >= 0 ? ' mw-killer__pnl--pos' : ' mw-killer__pnl--neg'}`}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                    </div>
                    <div className='mw-killer__meta'>
                        <span>Trades: {totalTrades}</span>
                        <span>W/L: {totalWins}/{totalLosses}</span>
                        <span>Win rate: {winRate}%</span>
                    </div>
                </div>
            )}

            {/* ── Per-symbol rows (only symbols that traded) ── */}
            {Object.keys(symbolDisplay).length > 0 && (
                <div className='mw-killer__symbols'>
                    {ALL_SYMBOLS.filter(s => symbolDisplay[s]).map(sym => {
                        const ss = symbolDisplay[sym];
                        const baseStake = parseFloat(stake) || 0.35;
                        const isMgActive = ss.stake > baseStake + 0.001;
                        return (
                            <div key={sym} className='mw-killer__sym-row'>
                                <span className='mw-killer__sym-name'>{SYMBOL_LABELS[sym]}</span>
                                <span className='mw-killer__sym-signal'>{ss.lastSignal}</span>
                                <span className='mw-killer__sym-wl'>
                                    <span className='mw-win'>{ss.wins}W</span>
                                    <span className='mw-loss'>{ss.losses}L</span>
                                </span>
                                {isMgActive && (
                                    <span className='mw-killer__sym-stake' title='Martingale stake'>
                                        ${ss.stake.toFixed(2)}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Log ── */}
            {logs.length > 0 && (
                <div className='mw-killer__log'>
                    {logs.map((l, i) => (
                        <div key={i} className={`mw-log-line mw-log-line--${l.type}`}>
                            <span className='mw-log-time'>{l.time}</span>
                            <span className='mw-log-msg'>{l.msg}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
