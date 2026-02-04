import React, { useState, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';

const MakotiMagic = observer(() => {
    // State for user inputs
    const [token, setToken] = useState('');
    const [stake, setStake] = useState(0.35);
    const [currency, setCurrency] = useState('VRTC'); // Default to Demo
    const [is_hunting, setIsHunting] = useState(false);
    
    // State for display
    const [results, setResults] = useState([]);
    const [total_pl, setTotalPL] = useState(0);
    const [status, setStatus] = useState('OFFLINE');
    
    const workerRef = useRef(null);

    useEffect(() => {
        const workerBlob = new Blob([`
            let ws;
            let active = false;

            self.onmessage = function(e) {
                const { type, payload } = e.data;
                
                if (type === 'START') {
                    active = true;
                    ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
                    
                    ws.onopen = () => ws.send(JSON.stringify({ authorize: payload.token }));
                    
                    ws.onmessage = (msg) => {
                        const res = JSON.parse(msg.data);
                        
                        if (res.error) {
                            self.postMessage({ type: 'ERROR', data: res.error.message });
                            return;
                        }

                        if (res.msg_type === 'authorize') {
                            self.postMessage({ type: 'STATUS', data: 'CONNECTED' });
                            ws.send(JSON.stringify({ ticks: '1HZ100V' }));
                        }

                        if (active && res.msg_type === 'tick') {
                            const digit = res.tick.quote.toString().slice(-1);
                            
                            ws.send(JSON.stringify({
                                buy: 1, 
                                price: payload.stake,
                                parameters: {
                                    amount: payload.stake,
                                    basis: 'stake',
                                    contract_type: 'DIGITMATCH',
                                    currency: payload.currency,
                                    duration: 1,
                                    duration_unit: 't',
                                    symbol: '1HZ100V',
                                    barrier: parseInt(digit)
                                }
                            }));
                        }

                        if (res.msg_type === 'proposal_open_contract' && res.proposal_open_contract.is_sold) {
                            self.postMessage({ type: 'RESULT', data: res.proposal_open_contract });
                        }
                    };
                }

                if (type === 'STOP') {
                    active = false;
                    if(ws) ws.close();
                }
            };
        `], { type: 'application/javascript' });

        workerRef.current = new Worker(URL.createObjectURL(workerBlob));

        workerRef.current.onmessage = (e) => {
            const { type, data } = e.data;
            if (type === 'STATUS') setStatus(data);
            if (type === 'ERROR') {
                alert("STRIKE ERROR: " + data);
                setIsHunting(false);
                setStatus('ERROR');
            }
            if (type === 'RESULT') {
                setResults(prev => [{
                    id: data.contract_id,
                    target: data.barrier,
                    entry: data.entry_tick_display_value.slice(-1),
                    status: data.status.toUpperCase(),
                    profit: data.profit
                }, ...prev].slice(0, 5));
                setTotalPL(v => v + data.profit);
            }
        };

        return () => workerRef.current.terminate();
    }, []);

    const handleToggle = () => {
        if (!is_hunting) {
            if (!token) return alert("Please enter your API Token first!");
            setStatus('CONNECTING...');
            workerRef.current.postMessage({ 
                type: 'START', 
                payload: { token, stake: Number(stake), currency } 
            });
        } else {
            workerRef.current.postMessage({ type: 'STOP' });
            setStatus('OFFLINE');
        }
        setIsHunting(!is_hunting);
    };

    return (
        <div style={ui.container}>
            <div style={ui.card}>
                <div style={ui.statusBadge}>{status}</div>
                <h2 style={ui.title}>LONDON SURGICAL TERMINAL</h2>
                
                {/* CONFIGURATION FIELDS */}
                <div style={ui.grid}>
                    <div style={ui.field}>
                        <label style={ui.label}>API TOKEN</label>
                        <input 
                            type="password" 
                            placeholder="Paste Token Here"
                            value={token} 
                            onChange={(e) => setToken(e.target.value)} 
                            style={ui.inputFull} 
                        />
                    </div>
                    
                    <div style={ui.row}>
                        <div style={ui.field}>
                            <label style={ui.label}>STAKE</label>
                            <input 
                                type="number" 
                                value={stake} 
                                onChange={(e) => setStake(e.target.value)} 
                                style={ui.input} 
                            />
                        </div>
                        <div style={ui.field}>
                            <label style={ui.label}>CURRENCY</label>
                            <select 
                                value={currency} 
                                onChange={(e) => setCurrency(e.target.value)} 
                                style={ui.select}
                            >
                                <option value="VRTC">DEMO (VRTC)</option>
                                <option value="USD">REAL (USD)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <button onClick={handleToggle} style={{ ...ui.btn, background: is_hunting ? '#300' : '#040', color: is_hunting ? '#f44' : '#4f4' }}>
                    {is_hunting ? 'STOP SCANNER' : 'ACTIVATE LONDON ENGINE'}
                </button>

                <div style={ui.profitArea}>
                    <div style={ui.label}>NET PROFIT</div>
                    <div style={{ ...ui.money, color: total_pl >= 0 ? '#0f0' : '#f00' }}>
                        ${total_pl.toFixed(2)}
                    </div>
                </div>
            </div>

            <div style={ui.resultsContainer}>
                {results.map((res) => (
                    <div key={res.id} style={ui.resultRow}>
                        <span>TGT: {res.target}</span>
                        <span>ENT: <b style={{ color: res.target === res.entry ? '#0f0' : '#f00' }}>{res.entry}</b></span>
                        <span style={{ color: res.status === 'WON' ? '#0f0' : '#f44' }}>{res.status}</span>
                    </div>
                ))}
            </div>
        </div>
    );
});

const ui = {
    container: { background: '#000', color: '#fff', minHeight: '100vh', padding: '15px', fontFamily: 'monospace' },
    card: { background: '#080808', border: '1px solid #222', padding: '20px', borderRadius: '4px' },
    statusBadge: { fontSize: '10px', color: '#666', textAlign: 'right' },
    title: { color: '#0f0', textAlign: 'center', marginBottom: '20px', fontSize: '16px' },
    grid: { display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' },
    field: { display: 'flex', flexDirection: 'column', gap: '5px' },
    row: { display: 'flex', gap: '10px' },
    label: { fontSize: '10px', color: '#444' },
    inputFull: { background: '#111', border: '1px solid #333', color: '#fff', padding: '8px', borderRadius: '4px' },
    input: { background: '#111', border: '1px solid #333', color: '#fff', padding: '8px', width: '60px', borderRadius: '4px' },
    select: { background: '#111', border: '1px solid #333', color: '#fff', padding: '8px', flex: 1, borderRadius: '4px' },
    btn: { width: '100%', padding: '15px', border: '1px solid currentColor', cursor: 'pointer', fontWeight: 'bold' },
    profitArea: { marginTop: '20px', textAlign: 'center' },
    money: { fontSize: '24px' },
    resultsContainer: { marginTop: '20px' },
    resultRow: { display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #111', fontSize: '12px' }
};

export default MakotiMagic;
