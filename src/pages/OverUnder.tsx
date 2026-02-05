import React, { useState, useEffect, useMemo, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import './over-under.scss';

// Connection Statuses
const STATUS_OFFLINE = 'Offline';
const STATUS_CONNECTING = 'Connecting...';
const STATUS_LIVE = 'Live Ticks';
const STATUS_AUTHORIZED = 'Account Connected';

const MAX_TICKS = 1000;

const OverUnder = observer(() => {
    const { journal, client, summary_card, transactions } = useStore();
    const ws = useRef<WebSocket | null>(null);
    const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
    const isAuthorized = useRef(false);
    const [debugInfo, setDebugInfo] = useState<string[]>([]);

    // State
    const [connectionStatus, setConnectionStatus] = useState(STATUS_OFFLINE);
    const [tickHistory, setTickHistory] = useState<number[]>([]);
    const [lastDigit, setLastDigit] = useState<number | null>(null);
    const [isAutoRunning, setIsAutoRunning] = useState(false);
    
    // Settings
    const [stake, setStake] = useState(1);
    const [entryDigit, setEntryDigit] = useState(7);
    const [isTurbo, setIsTurbo] = useState(false);
    const [selectedSymbol, setSelectedSymbol] = useState('R_100');

    const volatilityIndices = [
        { text: 'Volatility 100 Index', value: 'R_100' },
        { text: 'Volatility 75 Index', value: 'R_75' },
        { text: 'Volatility 50 Index', value: 'R_50' },
        { text: 'Volatility 25 Index', value: 'R_25' },
        { text: 'Volatility 10 Index', value: 'R_10' },
        { text: 'Volatility 100 (1s) Index', value: '1HZ100V' },
        { text: 'Volatility 75 (1s) Index', value: '1HZ75V' },
        { text: 'Volatility 50 (1s) Index', value: '1HZ50V' },
        { text: 'Volatility 25 (1s) Index', value: '1HZ25V' },
        { text: 'Volatility 10 (1s) Index', value: '1HZ10V' },
    ];

    const addLog = (msg: string) => {
        console.log(`[OverUnder] ${msg}`);
        const timestamp = new Date().toLocaleTimeString();
        setDebugInfo(prev => [`[${timestamp}] ${msg}`, ...prev].slice(0, 30));
    };

    const subscribeToTicks = (symbol: string) => {
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
            addLog('WS not open for subscribe');
            return;
        }
        
        addLog(`Fetching history & subscribing: ${symbol}`);
        ws.current.send(JSON.stringify({ forget_all: 'ticks' }));
        
        ws.current.send(JSON.stringify({ 
            ticks_history: symbol, 
            count: MAX_TICKS,
            end: 'latest',
            style: 'ticks',
            subscribe: 1 
        }));
        
        setTickHistory([]);
        setLastDigit(null);
    };

    const connectWebSocket = () => {
        if (ws.current) {
            ws.current.onclose = null;
            ws.current.close();
        }

        if (reconnectTimeout.current) {
            clearTimeout(reconnectTimeout.current);
        }

        addLog('Connecting...');
        setConnectionStatus(STATUS_CONNECTING);
        isAuthorized.current = false;
        
        const app_id = localStorage.getItem('config.app_id') || '117164';
        const server_url = localStorage.getItem('config.server_url') || 'ws.derivws.com';
        
        try {
            ws.current = new WebSocket(`wss://${server_url}/websockets/v3?app_id=${app_id}`);

            ws.current.onopen = () => {
                addLog('WS Opened. Subscribing to ticks...');
                setConnectionStatus(STATUS_LIVE);
                subscribeToTicks(selectedSymbol);

                const token = localStorage.getItem('authToken') || 
                              localStorage.getItem('token') || 
                              JSON.parse(localStorage.getItem('accountsList') || '{}')[client.loginid];
                
                if (token) {
                    addLog('Authorizing with token...');
                    ws.current?.send(JSON.stringify({ authorize: token }));
                } else {
                    addLog('No auth token found. Trading will be disabled.');
                }
            };

            ws.current.onmessage = (msg) => {
                try {
                    const data = JSON.parse(msg.data);

                    if (data.error) {
                         if (data.error.code === 'SelfExclusion') {
                            setIsAutoRunning(false);
                         }
                         addLog(`Error Received: ${data.error.message} (Code: ${data.error.code})`);
                         return;
                    }
                    
                    if (data.msg_type === 'authorize') {
                        addLog('Authorization Successful!');
                        isAuthorized.current = true;
                        setConnectionStatus(STATUS_AUTHORIZED);
                    }

                    if (data.msg_type === 'buy') {
                        const buy_data = data.buy;
                        const contract_id = buy_data.contract_id;
                        addLog(`Purchase Successful: ${contract_id}`);
                        journal.pushMessage(`Purchase Successful: ${contract_id}`, 'success');
                        
                        transactions.pushTransaction(buy_data);

                        ws.current?.send(JSON.stringify({
                            proposal_open_contract: 1,
                            contract_id: contract_id,
                            subscribe: 1
                        }));
                    }

                    if (data.msg_type === 'proposal_open_contract') {
                        const contract = data.proposal_open_contract;
                        
                        transactions.pushTransaction(contract);

                        if (summary_card?.onBotContractEvent) {
                            summary_card.onBotContractEvent(contract);
                        }
                        
                        if (contract.is_sold) {
                            const profit = contract.profit;
                            const result = profit >= 0 ? 'WON' : 'LOST';
                            addLog(`Trade Result: ${result} ($${profit})`);
                            journal.pushMessage(`Trade Finished: ${result} ($${profit})`, profit >= 0 ? 'success' : 'error');
                        }
                    }

                    if (data.msg_type === 'history') {
                        const prices = data.history.prices;
                        const digits = prices.map((p: string | number) => parseInt(p.toString().slice(-1), 10));
                        setTickHistory(digits);
                        if (digits.length > 0) {
                            setLastDigit(digits[digits.length - 1]);
                        }
                        addLog(`Loaded ${digits.length} historical ticks.`);
                    }

                    if (data.msg_type === 'tick') {
                        const quote = data.tick.quote;
                        const digit = parseInt(quote.toString().slice(-1), 10);
                        
                        setLastDigit(digit);
                        setTickHistory(prev => [...prev.slice(-MAX_TICKS + 1), digit]);

                        if (isAutoRunning && digit === Number(entryDigit)) {
                            addLog(`Trigger Hit: Last digit is ${digit}`);
                            executeMultiTrade();
                        }
                    }
                } catch (error) {
                    addLog(`Error parsing message: ${error.message}`);
                }
            };

            ws.current.onclose = (e) => {
                addLog(`WS Closed: Code ${e.code}. Reconnecting in 5s...`);
                setConnectionStatus(STATUS_OFFLINE);
                reconnectTimeout.current = setTimeout(connectWebSocket, 5000);
            };
            ws.current.onerror = (e) => {
                 addLog(`WS Error: ${e.message}`);
            }
        } catch (e) {
            addLog(`WS Init Fail: ${e.message}`);
        }
    };

    useEffect(() => {
        connectWebSocket();
        return () => {
            if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
            if (ws.current) ws.current.close();
            addLog("Component unmounted. Connection closed.");
        };
    }, []);

    useEffect(() => {
        if (connectionStatus === STATUS_LIVE || connectionStatus === STATUS_AUTHORIZED) {
            subscribeToTicks(selectedSymbol);
        }
    }, [selectedSymbol]);

    const executeMultiTrade = () => {
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
            addLog('Cannot trade: WS not open.');
            return;
        }
        
        if (!isAuthorized.current) {
            addLog('Cannot trade: Not authorized. Please log in.');
            journal.pushMessage('⚠️ Login required to trade.', 'error');
            setIsAutoRunning(false);
            return;
        }

        if (Number(stake) <= 0) {
            addLog(`Cannot trade: Invalid stake of ${stake}.`);
            journal.pushMessage('⚠️ Stake must be a positive number.', 'error');
            setIsAutoRunning(false);
            return;
        }

        const currency = client.currency || 'USD';
        const tradeAmount = Number(stake);
        
        const baseParameters = {
            amount: tradeAmount,
            basis: 'stake',
            currency: currency,
            duration: 1,
            duration_unit: 't',
            symbol: selectedSymbol,
        };

        const trade1_params = {
            buy: 1,
            parameters: { ...baseParameters, contract_type: 'DIGITOVER', barrier: '5' }
        };

        const trade2_params = {
            buy: 1,
            parameters: { ...baseParameters, contract_type: 'DIGITUNDER', barrier: '4' }
        };

        addLog(`Executing trades: Over 5, Under 4. Stake: ${tradeAmount} ${currency}`);
        
        addLog(`Sending Trade 1: ${JSON.stringify(trade1_params)}`);
        ws.current.send(JSON.stringify(trade1_params));

        addLog(`Sending Trade 2: ${JSON.stringify(trade2_params)}`);
        ws.current.send(JSON.stringify(trade2_params));
        
        if (!isTurbo) {
            setIsAutoRunning(false);
            addLog('Auto-run stopped (Turbo OFF).');
        }
    };

    const digitStats = useMemo(() => {
        const stats = Array(10).fill(0);
        tickHistory.forEach(digit => {
            if (digit >= 0 && digit <= 9) {
                stats[digit]++;
            }
        });
        return stats;
    }, [tickHistory]);

    const { maxIdx, minIdx } = useMemo(() => {
        if (tickHistory.length === 0) return { maxIdx: -1, minIdx: -1 };
        let maxVal = -1, minVal = Infinity, maxIdx = -1, minIdx = -1;
        digitStats.forEach((val, idx) => {
            if (val > maxVal) { maxVal = val; maxIdx = idx; }
            if (val < minVal) { minVal = val; minIdx = idx; }
        });
        return { maxIdx, minIdx };
    }, [digitStats]);

    const totalTicksCount = tickHistory.length || 1;

    const getStatusClassName = () => {
        switch(connectionStatus) {
            case STATUS_AUTHORIZED: return 'connected';
            case STATUS_LIVE: return 'authorizing';
            default: return 'disconnected';
        }
    };
    
    const handleStartStop = () => {
        if (!isAutoRunning && !isAuthorized.current) {
            addLog("Please log in to start the tool.");
            journal.pushMessage('⚠️ Login required to trade.', 'error');
            return;
        }
        setIsAutoRunning(!isAutoRunning);
        if (isAutoRunning) {
           addLog("Tool stopped by user.");
        } else {
           addLog("Tool started. Waiting for trigger...");
        }
    }

    return (
        <div className="over-under-container">
            <div className="stats-grid">
                {digitStats.map((count, i) => {
                    const percentage = ((count / totalTicksCount) * 100).toFixed(1);
                    const isHot = i === maxIdx && count > 0;
                    const isCold = i === minIdx && count > 0;
                    let barColor = 'red';
                    if (isHot) barColor = '#00ff00';
                    if (isCold) barColor = '#000000';

                    return (
                        <div key={i} className={`digit-card ${lastDigit === i ? 'active' : ''}`}>
                            <span className="digit-num">{i}</span>
                            <span className="digit-percent">{percentage}%</span>
                            <div className="digit-bar-wrapper">
                                <div className="digit-bar-fill" style={{ height: `${percentage}%`, backgroundColor: barColor }}/>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="controls-panel">
                <div className="input-group">
                    <label>Status ({tickHistory.length} ticks)</label>
                    <div className={`connection-status ${getStatusClassName()}`}>{connectionStatus}</div>
                </div>
                <div className="input-group">
                    <label>Index</label>
                    <select className="ui-select" value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value)} disabled={isAutoRunning}>
                        {volatilityIndices.map(idx => <option key={idx.value} value={idx.value}>{idx.text}</option>)}
                    </select>
                </div>
                <div className="input-group">
                    <label>Stake</label>
                    <input className="ui-input" type="number" value={stake} onChange={(e) => setStake(Number(e.target.value))} disabled={isAutoRunning} />
                </div>
                <div className="input-group">
                    <label>Trigger Digit</label>
                    <div className="entry-config">
                        <input className="ui-input digit-entry" type="number" min="0" max="9" value={entryDigit} onChange={(e) => setEntryDigit(Number(e.target.value))} disabled={isAutoRunning} />
                        <div className={`status-led ${lastDigit === Number(entryDigit) ? 'glow' : ''}`}></div>
                    </div>
                </div>
                <div className="button-group">
                    <button className={`btn-secondary ${isTurbo ? 'active' : ''}`} onClick={() => setIsTurbo(!isTurbo)} disabled={isAutoRunning}>
                        {isTurbo ? 'TURBO ON' : 'TURBO OFF'}
                    </button>
                    <button className={`btn-primary ${isAutoRunning ? 'running' : ''}`} onClick={handleStartStop}>
                        {isAutoRunning ? 'STOP' : 'START'}
                    </button>
                </div>
            </div>
            
            <div className="debug-monitor">
                <div className="debug-header">
                    <span>REAL-TIME MONITOR</span>
                    <button onClick={() => setDebugInfo([])} className="clear-btn">Clear</button>
                </div>
                <div className="debug-content">
                    {debugInfo.map((log, i) => <div key={i} className="log-item">{log}</div>)}
                </div>
            </div>
        </div>
    );
});

export default OverUnder;
