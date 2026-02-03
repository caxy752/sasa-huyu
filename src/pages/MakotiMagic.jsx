import React, { useState, useEffect, useCallback, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { api_base } from '@/external/bot-skeleton';

const MakotiMagic = observer(() => {
    const { client } = useStore();
    const [is_hunting, setIsHunting] = useState(false);
    const [last_captured, setLastCaptured] = useState(null);
    
    // User Configurations
    const [stake, setStake] = useState(1.00);
    const [symbol, setSymbol] = useState('R_100'); // Volatility selection
    
    const is_active = useRef(false);

    // THE EXECUTION STRIKE
    const fireStrike = useCallback((digit) => {
        api_base.api.send({
            buy: 1,
            price: stake,
            parameters: {
                amount: Number(stake),
                basis: 'stake',
                contract_type: 'DIGITMATCH',
                currency: client.currency || 'USD',
                duration: 1,
                duration_unit: 't',
                symbol: symbol,
                barrier: digit 
            }
        }).then(() => {
            console.log(`%c [STRIKE SUCCESS] Captured Digit ${digit}`, 'color: #00ff00; font-weight: bold;');
        }).catch(() => {
            console.warn("[GATE CLOSED]: Strike missed the window.");
        });

        // IMMEDIATELY DISARM AFTER ONE STRIKE
        setIsHunting(false);
        is_active.current = false;
    }, [stake, symbol, client.currency]);

    // THE LISTENER GATE
    useEffect(() => {
        let subscription;
        if (is_hunting && api_base.api) {
            is_active.current = true;
            subscription = api_base.api.onMessage().subscribe((msg) => {
                if (is_active.current && msg.data.msg_type === 'tick') {
                    const digit = msg.data.tick.quote.toString().slice(-1);
                    setLastCaptured(digit);
                    fireStrike(digit);
                }
            });
        }
        return () => subscription?.unsubscribe();
    }, [is_hunting, fireStrike]);

    return (
        <div style={{ padding: '30px', background: '#050505', color: '#0f0', height: '100vh', fontFamily: 'monospace' }}>
            <h2 style={{ textAlign: 'center', textTransform: 'uppercase', textShadow: '0 0 10px #0f0' }}> 
                MAKOTI MAGIC: SINGLE-SHOT HUNTER 
            </h2>

            {/* CONFIGURATION PANEL */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', margin: '40px 0', border: '1px solid #0f0', padding: '20px' }}>
                <div>
                    <label>STAKE (USD): </label>
                    <input 
                        type="number" 
                        value={stake} 
                        onChange={(e) => setStake(e.target.value)}
                        style={inputStyle}
                        disabled={is_hunting}
                    />
                </div>
                <div>
                    <label>VOLATILITY: </label>
                    <select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={inputStyle} disabled={is_hunting}>
                        <option value="R_10">Volatility 10</option>
                        <option value="R_25">Volatility 25</option>
                        <option value="R_50">Volatility 50</option>
                        <option value="R_75">Volatility 75</option>
                        <option value="R_100">Volatility 100</option>
                        <option value="1HZ10V">Volatility 10 (1s)</option>
                        <option value="1HZ100V">Volatility 100 (1s)</option>
                    </select>
                </div>
            </div>

            {/* STATUS & CAPTURE DISPLAY */}
            <div style={{ textAlign: 'center', margin: '60px 0' }}>
                <div style={{ fontSize: '12px' }}>LAST GATE CAPTURE</div>
                <div style={{ fontSize: '180px', fontWeight: 'bold', color: is_hunting ? '#555' : '#0f0' }}>
                    {last_captured ?? '-'}
                </div>
                <div style={{ color: is_hunting ? '#f00' : '#0f0', fontWeight: 'bold', fontSize: '20px' }}>
                    {is_hunting ? ">>> SYSTEM ARMED: AWAITING NEXT TICK <<<" : "SYSTEM READY - AWAITING TRIGGER"}
                </div>
            </div>

            {/* TRIGGER BUTTON */}
            <div style={{ textAlign: 'center' }}>
                <button 
                    onClick={() => setIsHunting(true)}
                    disabled={is_hunting}
                    style={{
                        padding: '30px 100px',
                        fontSize: '32px',
                        fontWeight: 'bold',
                        background: is_hunting ? '#222' : '#0f0',
                        color: is_hunting ? '#555' : '#000',
                        border: 'none',
                        cursor: is_hunting ? 'not-allowed' : 'pointer',
                        boxShadow: is_hunting ? 'none' : '0 0 30px #0f0',
                        borderRadius: '15px'
                    }}
                >
                    {is_hunting ? "HUNTING..." : "TRIGGER HUNT"}
                </button>
            </div>
        </div>
    );
});

const inputStyle = {
    background: '#000',
    color: '#0f0',
    border: '1px solid #0f0',
    padding: '10px',
    width: '100%',
    marginTop: '10px',
    fontSize: '18px'
};

export default MakotiMagic;
