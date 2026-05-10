import React, { useCallback, useRef, useState } from 'react';
import { ALL_SYMBOLS, SYMBOL_LABELS, PIP_SIZES, openMakotiWS, MakotiWS, analyzeSignal } from './makoti-ws';

interface SymbolState {
    ticks: number[];
    prices: number[];
    locked: boolean;
    lastSignal: string;
    wins: number;
    losses: number;
    currentStake: number;
}

interface LogEntry {
    time: string;
    msg: string;
    type: 'win' | 'loss' | 'info' | 'trade';
}

const CONFIDENCE_THRESHOLD = 62;
const MAX_TICKS_PER_SYMBOL = 200;

export const MarketKiller: React.FC = () => {
    const [stake, setStake] = useState('0.35');
    const [martingale, setMartingale] = useState('2');
    const [takeProfit, setTakeProfit] = useState('10');
    const [stopLoss, setStopLoss] = useState('5');
    const [running, setRunning] = useState(false);
    const [pnl, setPnl] = useState(0);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [symbolStates, setSymbolStates] = useState<Record<string, { lastSignal: string; wins: number; losses: number }>>({});
    const [activeContracts, setActiveContracts] = useState(0);

    const wsRef = useRef<MakotiWS | null>(null);
    const symbolDataRef = useRef<Record<string, SymbolState>>({});
    const pnlRef = useRef(0);
    const runningRef = useRef(false);
    const stakeParsed = useRef(0.35);
    const martingaleParsed = useRef(2);
    const tpRef = useRef(10);
    const slRef = useRef(5);
    const activeContractsRef = useRef(0);
    const contractMapRef = useRef<Map<string, { symbol: string; stake: number }>>(new Map());

    const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => [{ time, msg, type }, ...prev].slice(0, 150));
    }, []);

    const checkLimits = useCallback(() => {
        const tp = tpRef.current, sl = slRef.current;
        if (pnlRef.current >= tp) {
            addLog(`Take Profit $${tp} reached! Total: $${pnlRef.current.toFixed(2)} ✅`, 'win');
            stopKiller();
            return true;
        }
        if (pnlRef.current <= -sl) {
            addLog(`Stop Loss -$${sl} hit! Total: $${pnlRef.current.toFixed(2)} ❌`, 'loss');
            stopKiller();
            return true;
        }
        return false;
    }, []);

    const stopKiller = useCallback(() => {
        runningRef.current = false;
        setRunning(false);
        if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
        addLog('Market Killer stopped.', 'info');
    }, [addLog]);

    const startKiller = useCallback(() => {
        const stakeVal = parseFloat(stake) || 0.35;
        const mgVal = parseFloat(martingale) || 2;
        const tpVal = parseFloat(takeProfit) || 10;
        const slVal = parseFloat(stopLoss) || 5;

        stakeParsed.current = stakeVal;
        martingaleParsed.current = mgVal;
        tpRef.current = tpVal;
        slRef.current = slVal;
        pnlRef.current = 0;
        setPnl(0);
        setLogs([]);
        activeContractsRef.current = 0;
        setActiveContracts(0);
        contractMapRef.current = new Map();

        symbolDataRef.current = {};
        ALL_SYMBOLS.forEach(sym => {
            symbolDataRef.current[sym] = {
                ticks: [], prices: [], locked: false,
                lastSignal: '—', wins: 0, losses: 0,
                currentStake: stakeVal,
            };
        });
        setSymbolStates({});

        runningRef.current = true;
        setRunning(true);
        addLog(`Kill Market activated — stake $${stakeVal}, MG ×${mgVal}, TP $${tpVal}, SL $${slVal}`, 'info');
        addLog('Connecting to Deriv API...', 'info');

        if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }

        const handleMsg = (data: any) => {
            if (!runningRef.current) return;
            if (data.error) {
                if (data.msg_type === 'buy') {
                    const sym = data.echo_req?.parameters?.symbol;
                    if (sym && symbolDataRef.current[sym]) {
                        symbolDataRef.current[sym].locked = false;
                        activeContractsRef.current = Math.max(0, activeContractsRef.current - 1);
                        setActiveContracts(activeContractsRef.current);
                    }
                    addLog(`Buy error: ${data.error.message}`, 'info');
                }
                return;
            }

            switch (data.msg_type) {
                case 'history': {
                    const sym: string = data.echo_req?.ticks_history;
                    if (!sym || !symbolDataRef.current[sym]) return;
                    const pip = PIP_SIZES[sym] || 2;
                    const prices = (data.history.prices as (string | number)[]).map(p => Number(p));
                    const digits = prices.map(p => Number(p.toFixed(pip).slice(-1)));
                    symbolDataRef.current[sym].ticks = digits.slice(-MAX_TICKS_PER_SYMBOL);
                    symbolDataRef.current[sym].prices = prices.slice(-MAX_TICKS_PER_SYMBOL);
                    addLog(`Loaded ${digits.length} ticks for ${SYMBOL_LABELS[sym]}`, 'info');
                    break;
                }

                case 'tick': {
                    const tick = data.tick;
                    const sym: string = tick.symbol;
                    if (!sym || !symbolDataRef.current[sym]) return;
                    const pip = PIP_SIZES[sym] || tick.pip_size || 2;
                    const price = Number(tick.quote);
                    const digit = Number(price.toFixed(pip).slice(-1));

                    const sd = symbolDataRef.current[sym];
                    sd.ticks = [...sd.ticks.slice(-(MAX_TICKS_PER_SYMBOL - 1)), digit];
                    sd.prices = [...sd.prices.slice(-(MAX_TICKS_PER_SYMBOL - 1)), price];

                    if (sd.locked) return;
                    if (sd.ticks.length < 40) return;

                    const signal = analyzeSignal(sd.ticks, sd.prices);
                    if (!signal || signal.confidence < CONFIDENCE_THRESHOLD) return;

                    sd.locked = true;
                    const tradeStake = sd.currentStake;
                    const { contract_type, barrier, reason } = signal;

                    const baseParams: any = {
                        amount: tradeStake,
                        basis: 'stake',
                        currency: 'USD',
                        duration: 1,
                        duration_unit: 't',
                        symbol: sym,
                        contract_type,
                    };
                    if (barrier) baseParams.barrier = barrier;

                    const buyMsg: any = { buy: 1, price: tradeStake, parameters: baseParams };

                    if (contract_type === 'DIGITOVER' || contract_type === 'DIGITUNDER') {
                        addLog(`${SYMBOL_LABELS[sym]}: ${contract_type} ${barrier} @ $${tradeStake.toFixed(2)} — ${reason}`, 'trade');
                    } else if (contract_type === 'CALL') {
                        addLog(`${SYMBOL_LABELS[sym]}: RISE @ $${tradeStake.toFixed(2)} — ${reason}`, 'trade');
                    } else if (contract_type === 'PUT') {
                        addLog(`${SYMBOL_LABELS[sym]}: FALL @ $${tradeStake.toFixed(2)} — ${reason}`, 'trade');
                    } else {
                        addLog(`${SYMBOL_LABELS[sym]}: DIGITDIFF ${barrier} @ $${tradeStake.toFixed(2)} — ${reason}`, 'trade');
                    }

                    wsRef.current?.send(buyMsg);
                    activeContractsRef.current++;
                    setActiveContracts(activeContractsRef.current);

                    sd.lastSignal = `${contract_type}${barrier ? ' ' + barrier : ''}`;
                    setSymbolStates(prev => ({
                        ...prev,
                        [sym]: { lastSignal: sd.lastSignal, wins: sd.wins, losses: sd.losses },
                    }));
                    break;
                }

                case 'buy': {
                    const sym: string = data.echo_req?.parameters?.symbol;
                    if (!sym || !symbolDataRef.current[sym]) return;
                    const sd = symbolDataRef.current[sym];
                    if (data.error) {
                        sd.locked = false;
                        activeContractsRef.current = Math.max(0, activeContractsRef.current - 1);
                        setActiveContracts(activeContractsRef.current);
                    } else {
                        const cid = String(data.buy.contract_id);
                        contractMapRef.current.set(cid, { symbol: sym, stake: sd.currentStake });
                        addLog(`Contract ${cid} bought on ${SYMBOL_LABELS[sym]}`, 'info');
                    }
                    break;
                }

                case 'proposal_open_contract': {
                    const c = data.proposal_open_contract;
                    if (!c?.is_sold) return;
                    const cid = String(c.contract_id);
                    const entry = contractMapRef.current.get(cid);
                    if (!entry) return;
                    contractMapRef.current.delete(cid);
                    const { symbol: sym, stake: tradeStake } = entry;
                    const sd = symbolDataRef.current[sym];
                    if (!sd) return;
                    const profit = Number(c.profit);
                    const won = profit >= 0;
                    pnlRef.current += profit;
                    setPnl(pnlRef.current);
                    activeContractsRef.current = Math.max(0, activeContractsRef.current - 1);
                    setActiveContracts(activeContractsRef.current);

                    if (won) {
                        sd.wins++;
                        sd.currentStake = stakeParsed.current;
                        addLog(`${SYMBOL_LABELS[sym]}: WON +$${profit.toFixed(2)} | P&L: $${pnlRef.current.toFixed(2)}`, 'win');
                    } else {
                        sd.losses++;
                        sd.currentStake = Math.min(Number((tradeStake * martingaleParsed.current).toFixed(2)), 100);
                        addLog(`${SYMBOL_LABELS[sym]}: LOST -$${Math.abs(profit).toFixed(2)} | Stake → $${sd.currentStake.toFixed(2)} | P&L: $${pnlRef.current.toFixed(2)}`, 'loss');
                    }

                    sd.locked = false;
                    setSymbolStates(prev => ({
                        ...prev,
                        [sym]: { lastSignal: sd.lastSignal, wins: sd.wins, losses: sd.losses },
                    }));
                    checkLimits();
                    break;
                }
            }
        };

        const mws = openMakotiWS(
            handleMsg,
            () => {
                addLog('Connected. Subscribing to all volatilities...', 'info');
                wsRef.current?.send({ proposal_open_contract: 1, subscribe: 1 });
                ALL_SYMBOLS.forEach(sym => {
                    mws.send({ ticks_history: sym, count: 150, end: 'latest', style: 'ticks', subscribe: 1 });
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
    }, [stake, martingale, takeProfit, stopLoss, addLog, checkLimits, stopKiller]);

    const totalTrades = Object.values(symbolStates).reduce((a, b) => a + b.wins + b.losses, 0);
    const totalWins = Object.values(symbolStates).reduce((a, b) => a + b.wins, 0);
    const winRate = totalTrades > 0 ? (totalWins / totalTrades * 100).toFixed(1) : '—';

    return (
        <div className='mw-killer'>
            <div className='mw-killer__fields'>
                <div className='mw-field'>
                    <label className='mw-label'>Stake ($)</label>
                    <input className='mw-input' type='number' min='0.35' step='0.01'
                        value={stake} onChange={e => setStake(e.target.value)} disabled={running} />
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Martingale</label>
                    <input className='mw-input' type='number' min='1' step='0.1'
                        value={martingale} onChange={e => setMartingale(e.target.value)} disabled={running} />
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Take Profit ($)</label>
                    <input className='mw-input' type='number' min='1' step='0.5'
                        value={takeProfit} onChange={e => setTakeProfit(e.target.value)} disabled={running} />
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Stop Loss ($)</label>
                    <input className='mw-input' type='number' min='1' step='0.5'
                        value={stopLoss} onChange={e => setStopLoss(e.target.value)} disabled={running} />
                </div>
            </div>

            <button
                className={`mw-btn mw-btn--kill${running ? ' mw-btn--stop' : ''}`}
                onClick={running ? stopKiller : startKiller}
            >
                {running ? (
                    <><span className='mw-pulse' />STOP KILLER</>
                ) : '⚔ KILL MARKET'}
            </button>

            {(running || totalTrades > 0) && (
                <div className='mw-killer__stats'>
                    <div className={`mw-killer__pnl${pnl >= 0 ? ' mw-killer__pnl--pos' : ' mw-killer__pnl--neg'}`}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                    </div>
                    <div className='mw-killer__meta'>
                        <span>Active: {activeContracts}</span>
                        <span>Trades: {totalTrades}</span>
                        <span>Win Rate: {winRate}%</span>
                    </div>
                </div>
            )}

            {Object.keys(symbolStates).length > 0 && (
                <div className='mw-killer__symbols'>
                    {ALL_SYMBOLS.filter(s => symbolStates[s]).map(sym => {
                        const ss = symbolStates[sym];
                        const sd = symbolDataRef.current[sym];
                        return (
                            <div key={sym} className='mw-killer__sym-row'>
                                <span className='mw-killer__sym-name'>{SYMBOL_LABELS[sym]}</span>
                                <span className='mw-killer__sym-signal'>{ss.lastSignal}</span>
                                <span className='mw-killer__sym-wl'>
                                    <span className='mw-win'>{ss.wins}W</span>
                                    <span className='mw-loss'>{ss.losses}L</span>
                                </span>
                                {sd && sd.currentStake !== parseFloat(stake) && (
                                    <span className='mw-killer__sym-stake'>${sd.currentStake.toFixed(2)}</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {logs.length > 0 && (
                <div className='mw-killer__log'>
                    {logs.slice(0, 40).map((l, i) => (
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
