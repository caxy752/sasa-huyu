import React, { useState, useCallback, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { api_base } from '@/external/bot-skeleton';

const MakotiMagic = observer(() => {
    const { client } = useStore();
    
    const [is_hunting, setIsHunting] = useState(false);
    const [stake, setStake] = useState(0.35);
    const [results, setResults] = useState([]);
    const [total_pl, setTotalPL] = useState(0);

    const hunt_active = useRef(false);

    // RESULT LISTENER - Captures what actually happened on the server
    useEffect(() => {
        const result_sub = api_base.api.onMessage().subscribe((msg) => {
            const data = msg.data;
            if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract.is_sold) {
                const contract = data.proposal_open_contract;
                const profit = contract.profit;

                const new_result = {
                    id: contract.contract_id,
                    stake: contract.buy_price,
                    prediction: contract.barrier, // This is what we predicted
                    entry: contract.entry_tick_display_value.slice(-1),
                    exit: contract.exit_tick_display_value.slice(-1),
                    status: contract.status.toUpperCase(),
                    profit: profit
                };

                setResults(prev => [new_result, ...prev].slice(0, 10));
                setTotalPL(prev => prev + profit);
            }
        });
        return () => result_sub.unsubscribe();
    }, []);

    // THE SPEED-STRIKE: This uses the intercepted digit AS the prediction
    const fireInstantStrike = useCallback((intercepted_digit) => {
        if (!hunt_active.current) return;

        api_base.api.send({
            buy: 1,
            price: Number(stake),
            parameters: {
                amount: Number(stake),
                basis: 'stake',
                contract_type: 'DIGITMATCH',
                currency: client.currency || 'USD',
                duration: 1,
                duration_unit: 't',
                symbol: '1HZ100V', 
                barrier: parseInt(intercepted_digit) // TARGETING THE SAME DIGIT
            }
        });

        hunt_active.current = false;
        setIsHunting(false);
    }, [stake, client.currency]);

    useEffect(() => {
        let tick_sub;
        if (is_hunting) {
            hunt_active.current = true;
            tick_sub = api_base.api.onMessage().subscribe((msg) => {
                if (hunt_active.current && msg.data.msg_type === 'tick') {
                    const quote = msg.data.tick.quote.toString();
                    const digit = quote.charAt(quote.length - 1);
                    
                    // The moment a '5' appears, we bet the NEXT one is also a '5'
                    fireInstantStrike(digit);
                }
            });
        }
        return () => { if (tick_sub) tick_sub.unsubscribe(); };
    }, [is_hunting, fireInstantStrike]);

    return (
        <div style={containerStyle}>
            <div style={headerStyle}>
                <h1 style={{ color: '#0f0' }}>MAKOTI PREDICTION SYNC</h1>
                <div style={statsStyle}>
                    PROFIT: <span style={{ color: total_pl >= 0 ? '#0f0' : '#f00' }}>{total_pl.toFixed(2)}</span>
                </div>
            </div>

            <div style={controlPanelStyle}>
                <div style={{ marginBottom: '15px' }}>
                    <label>STAKE: </label>
                    <input type="number" value={stake} onChange={(e) => setStake(e.target.value)} style={inputStyle} />
                </div>
                <button onClick={() => setIsHunting(true)} disabled={is_hunting} style={is_hunting ? huntBtnActiveStyle : huntBtnStyle}>
                    {is_hunting ? "INTERCEPTING..." : "TRIGGER PREDICTION MATCH"}
                </button>
            </div>

            <table style={tableStyle}>
                <thead>
                    <tr style={{ borderBottom: '2px solid #333' }}>
                        <th>PREDICTION</th>
                        <th>ENTRY DIGIT</th>
                        <th>EXIT DIGIT</th>
                        <th>RESULT</th>
                        <th>P/L</th>
                    </tr>
                </thead>
                <tbody>
                    {results.map((res, i) => (
                        <tr key={i}>
                            <td style={{ color: '#ff0' }}>{res.prediction}</td>
                            <td>{res.entry}</td>
                            <td style={{ fontWeight: 'bold' }}>{res.exit}</td>
                            <td style={{ color: res.status === 'WON' ? '#0f0' : '#f00' }}>{res.status}</td>
                            <td style={{ color: res.profit >= 0 ? '#0f0' : '#f00' }}>{res.profit.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
});

const containerStyle = { background: '#000', color: '#0f0', minHeight: '100vh', padding: '20px', fontFamily: 'monospace' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #0f0', marginBottom: '20px' };
const statsStyle = { fontSize: '22px' };
const controlPanelStyle = { background: '#080808', padding: '30px', borderRadius: '10px', textAlign: 'center', marginBottom: '20px', border: '1px solid #111' };
const inputStyle = { background: '#000', color: '#0f0', border: '1px solid #0f0', padding: '10px', width: '100px', textAlign: 'center' };
const huntBtnStyle = { background: '#0f0', color: '#000', padding: '15px 50px', fontSize: '20px', fontWeight: 'bold', border: 'none', cursor: 'pointer' };
const huntBtnActiveStyle = { ...huntBtnStyle, background: '#333', color: '#666' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', marginTop: '20px' };

export default MakotiMagic;
