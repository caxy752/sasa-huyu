import React, { useState, useEffect, useRef } from 'react';

const DigitStatsDisplay = ({ stats }) => {
    return (
        <div style={styles.statsContainer}>
            <h3 style={styles.statsTitle}>Last 100 Digits Analysis</h3>
            <div style={styles.statsGrid}>
                {Array.from({ length: 10 }, (_, i) => i).map(digit => {
                    const percentage = stats[digit] ? stats[digit].toFixed(1) : '0.0';
                    return (
                        <div key={digit} style={styles.statItem}>
                            <div style={styles.statDigit}>{digit}</div>
                            <div style={styles.statBar}>
                                <div style={{...styles.statBarFill, height: `${percentage}%`}}></div>
                            </div>
                            <div style={styles.statPercentage}>{percentage}%</div>
                        </div>
                    )
                })}
            </div>
        </div>
    );
};

const Makotimagic = () => {
    const [isRunning, setIsRunning] = useState(false);
    const [status, setStatus] = useState('SYSTEM READY');
    const [logs, setLogs] = useState([]);
    const [volatility, setVolatility] = useState('R_100');
    const [stake, setStake] = useState(10);
    const [lastDigit, setLastDigit] = useState(null);
    const [strikeDigit, setStrikeDigit] = useState(5);
    const [recentDigits, setRecentDigits] = useState([]);
    const [digitStats, setDigitStats] = useState({});

    const ws = useRef(null);
    const isRunningRef = useRef(isRunning);
    const strikeDigitRef = useRef(strikeDigit);

    useEffect(() => {
        isRunningRef.current = isRunning;
        strikeDigitRef.current = strikeDigit;
    }, [isRunning, strikeDigit]);

    const addLog = (msg) => {
        setLogs(prev => [`> ${msg}`, ...prev.slice(0, 15)]);
    };

    const executePreemptiveStrike = (digitToMatch) => {
        if (!isRunningRef.current) return;

        const payload = {
            buy: 1,
            price: parseFloat(stake),
            parameters: {
                amount: parseFloat(stake),
                basis: 'stake',
                contract_type: 'DIGITMATCH',
                currency: 'USD',
                duration: 1,
                duration_unit: 't',
                symbol: volatility,
                barrier: digitToMatch.toString()
            }
        };
        ws.current.send(JSON.stringify(payload));

        setIsRunning(false);
        ws.current.send(JSON.stringify({ forget_all: 'ticks' }));

        setStatus(`STRIKE ON ${digitToMatch}!`);
        addLog(`Pre-emptive strike sent for digit ${digitToMatch}.`);
    };

    useEffect(() => {
        const app_id = 101585;
        const token = localStorage.getItem('authToken') || localStorage.getItem('token');
        const server_url = localStorage.getItem('config.server_url') || 'ws.binaryws.com';

        ws.current = new WebSocket(`wss://${server_url}/websockets/v3?app_id=${app_id}`);

        ws.current.onopen = () => {
            addLog('Connection opened.');
            if (token) {
                ws.current.send(JSON.stringify({ authorize: token }));
            }
        };

        ws.current.onclose = () => {
            addLog('Connection closed.');
            if (isRunningRef.current) {
                setStatus('SYSTEM STOPPED');
                setIsRunning(false);
            }
        };

        ws.current.onmessage = (msg) => {
            const data = JSON.parse(msg.data);

            if (data.error) {
                addLog(`ERROR: ${data.error.message}`);
                setIsRunning(false);
                return;
            }

            switch (data.msg_type) {
                case 'authorize':
                    addLog('Authorized successfully.');
                    break;
                case 'buy':
                    addLog(`SUCCESS: Contract ${data.buy.contract_id} purchased.`);
                    setStatus('SYSTEM READY');
                    break;
                case 'proposal_open_contract':
                    if (data.proposal_open_contract.is_sold) {
                        if (data.proposal_open_contract.is_win) {
                            addLog(`$$$ WIN: Contract won. Profit: ${data.proposal_open_contract.profit} $$$`);
                        } else {
                            addLog(`LOSS: Contract lost. Loss: ${data.proposal_open_contract.loss}`);
                        }
                    }
                    break;
                case 'tick':
                    const digit = parseInt(data.tick.quote.toString().slice(-1));
                    setLastDigit(digit);

                    const newRecentDigits = [digit, ...recentDigits].slice(0, 100);
                    setRecentDigits(newRecentDigits);

                    const stats = newRecentDigits.reduce((acc, d) => {
                        acc[d] = (acc[d] || 0) + 1;
                        return acc;
                    }, {});
                    for (const key in stats) {
                        stats[key] = (stats[key] / newRecentDigits.length) * 100;
                    }
                    setDigitStats(stats);

                    if (isRunningRef.current && digit === strikeDigitRef.current) {
                        executePreemptiveStrike(strikeDigitRef.current);
                    }
                    break;
                default:
                    break;
            }
        };

        return () => ws.current?.close();
    }, [recentDigits]); // Dependency on recentDigits to keep it in scope

    const toggleHack = () => {
        if (!isRunning) {
            const token = localStorage.getItem('authToken') || localStorage.getItem('token');
            if (!token) {
                addLog('ERROR: Please login first');
                return;
            }

            ws.current.send(JSON.stringify({ ticks: volatility, subscribe: 1 }));
            ws.current.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));

            setIsRunning(true);
            setStatus(`ARMED: WAITING FOR ${strikeDigit}`);
            addLog(`Makotimagic Armed: Hunting for digit ${strikeDigit}...`);
        } else {
            ws.current.send(JSON.stringify({ forget_all: 'ticks' }));
            ws.current.send(JSON.stringify({ forget_all: 'proposal_open_contract' }));
            setIsRunning(false);
            setStatus('SYSTEM STOPPED');
            addLog('Makotimagic Deactivated.');
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h2 style={styles.title}>MAKOTIMAGIC v4.0</h2>
                <div style={{...styles.status, color: isRunning ? '#00ff00' : '#ff0000'}}>{status}</div>
            </div>

            <DigitStatsDisplay stats={digitStats} />

            <div style={styles.grid}>
                <div style={styles.card}>
                    <label style={styles.label}>Volatility</label>
                    <select style={styles.input} onChange={(e) => setVolatility(e.target.value)} value={volatility} disabled={isRunning}>
                        <option value="R_100">Volatility 100 (1s)</option>
                        <option value="R_50">Volatility 50 (1s)</option>
                        <option value="R_10">Volatility 10 (1s)</option>
                    </select>
                    
                    <label style={styles.label}>Strike Digit</label>
                    <input style={styles.input} type="number" min="0" max="9" value={strikeDigit} onChange={(e) => setStrikeDigit(parseInt(e.target.value))} disabled={isRunning} />

                    <label style={styles.label}>Stake (USD)</label>
                    <input style={styles.input} type="number" value={stake} onChange={(e) => setStake(e.target.value)} disabled={isRunning} />
                </div>

                <div style={styles.card}>
                    <label style={styles.label}>Last Seen Digit</label>
                    <div style={styles.bigDigit}>{lastDigit ?? '--'}</div>
                </div>
            </div>

            <button style={{...styles.button, backgroundColor: isRunning ? '#ff0000' : '#00ff00'}} onClick={toggleHack}>
                {isRunning ? 'DISARM' : 'ARM MAKOTIMAGIC'}
            </button>

            <div style={styles.console}>
                {logs.map((log, i) => <div key={i} style={styles.logLine}>{log}</div>)}
            </div>
        </div>
    );
};

const styles = {
    container: { background: '#0a0a0a', padding: '20px', borderRadius: '10px', color: '#fff', fontFamily: 'monospace', border: '1px solid #333' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #222', paddingBottom: '10px' },
    title: { margin: 0, color: '#00ff00', fontSize: '1.2rem' },
    status: { fontSize: '0.8rem', fontWeight: 'bold', textAlign: 'right' },
    grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' },
    card: { background: '#111', padding: '15px', borderRadius: '5px', border: '1px solid #222' },
    label: { display: 'block', fontSize: '0.7rem', color: '#666', marginBottom: '5px', textTransform: 'uppercase' },
    input: { width: '100%', boxSizing: 'border-box', background: '#000', border: '1px solid #333', color: '#00ff00', padding: '8px', marginBottom: '10px', outline: 'none' },
    bigDigit: { fontSize: '3rem', textAlign: 'center', fontWeight: 'bold', color: '#00ff00' },
    button: { width: '100%', padding: '15px', color: '#000', border: 'none', fontWeight: 'bold', cursor: 'pointer', borderRadius: '5px', fontSize: '1rem' },
    console: { marginTop: '20px', background: '#000', padding: '10px', height: '150px', fontSize: '0.7rem', overflowY: 'auto', border: '1px solid #111', borderRadius: '5px' },
    logLine: { color: '#00ff00', marginBottom: '3px' },
    statsContainer: { marginBottom: '20px', background: '#111', padding: '15px', borderRadius: '5px', border: '1px solid #222' },
    statsTitle: { margin: '0 0 15px 0', color: '#00ff00', fontSize: '1rem', textAlign: 'center' },
    statsGrid: { display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: '100px' },
    statItem: { flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' },
    statDigit: { fontSize: '0.8rem', color: '#999' },
    statBar: { width: '20px', height: '100%', background: '#222', display: 'flex', flexDirection: 'column-reverse', borderRadius: '3px', overflow: 'hidden', margin: '5px 0' },
    statBarFill: { background: '#00ff00', width: '100%' },
    statPercentage: { fontSize: '0.7rem', color: '#fff' }
};

export default Makotimagic;
