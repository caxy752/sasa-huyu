
import React, { useEffect, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import './over-under.scss';

const OverUnder = observer(() => {
    const { over_under } = useStore();
    const {
        connection_status,
        tick_history,
        last_digit,
        is_auto_running,
        stake,
        martingale,
        is_volatility_changer,
        is_differs_mode,
        is_automate,
        use_second_trigger,
        is_manual_mode,
        manual_contract_type,
        manual_barrier,
        is_recovery_active,
        recovery_contract_type,
        recovery_barrier,
        use_recovery_delay,
        entry_digit,
        second_entry_digit,
        is_turbo,
        selected_symbol,
        debug_info,
        is_analyzing_volatility,
        current_analyzing_symbol,
        is_authorizing,
        setStake,
        setMartingale,
        setIsVolatilityChanger,
        setIsDiffersMode,
        setIsAutomate,
        setUseSecondTrigger,
        setIsManualMode,
        setManualContractType,
        setManualBarrier,
        setIsRecoveryActive,
        setRecoveryContractType,
        setRecoveryBarrier,
        setUseRecoveryDelay,
        setEntryDigit,
        setSecondEntryDigit,
        setIsTurbo,
        setSelectedSymbol,
        connectWebSocket,
        handleStartStop,
        clearDebug,
    } = over_under;

    useEffect(() => {
        if (over_under.connection_status === 'Offline') {
            connectWebSocket();
        }
        return () => over_under.dispose();
    }, [connectWebSocket, over_under]);

    const digitStats = useMemo(() => {
        const stats = Array(10).fill(0);
        tick_history.forEach(digit => {
            if (digit >= 0 && digit <= 9) stats[digit]++;
        });
        return stats;
    }, [tick_history]);

    const { maxIdx, minIdx } = useMemo(() => {
        if (tick_history.length === 0) return { maxIdx: -1, minIdx: -1 };
        let maxVal = -1, minVal = Infinity, maxIdx = -1, minIdx = -1;
        digitStats.forEach((val, idx) => {
            if (val > maxVal) { maxVal = val; maxIdx = idx; }
            if (val < minVal) { minVal = val; minIdx = idx; }
        });
        return { maxIdx, minIdx };
    }, [digitStats]);

    const totalTicksCount = tick_history.length || 1;
    
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

    const getStatusClassName = () => {
        if (is_authorizing) return 'authorizing';
        switch(connection_status) {
            case 'Account Connected': return 'connected';
            case 'Live Ticks': return 'authorizing';
            default: return 'disconnected';
        }
    };
    
    const connectionStatusText = is_authorizing ? 'Authorizing...' : connection_status;

    const startButtonText = useMemo(() => {
        if (is_authorizing) return 'AUTHORIZING...';
        if (is_auto_running) {
            if (is_analyzing_volatility) {
                const name = volatilityIndices.find(v => v.value === current_analyzing_symbol)?.text || current_analyzing_symbol;
                return `ANALYZING: ${name}`;
            } 
            return 'STOP';
        }
        return 'START';
    }, [is_auto_running, is_analyzing_volatility, current_analyzing_symbol, is_authorizing]);

    return (
        <div className="over-under-container" style={{ height: 'calc(100vh - 15rem)', overflowY: 'auto' }}>
            <div className="stats-grid">
                {digitStats.map((count, i) => {
                    const percentage = ((count / totalTicksCount) * 100).toFixed(1);
                    const isHot = i === maxIdx && count > 0;
                    const isCold = i === minIdx && count > 0;
                    let barColor = 'red';
                    if (isHot) barColor = '#00ff00';
                    if (isCold) barColor = '#000000';

                    return (
                        <div key={i} className={`digit-card ${last_digit === i ? 'active' : ''}`}>
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
                    <label>Status ({tick_history.length} ticks)</label>
                    <div className={`connection-status ${getStatusClassName()}`}>{connectionStatusText}</div>
                </div>
                <div className="input-row">
                    <div className="input-group">
                        <label>Index</label>
                        <select className="ui-select" value={selected_symbol} onChange={(e) => setSelectedSymbol(e.target.value)} disabled={is_auto_running || is_authorizing}>
                            {volatilityIndices.map(idx => <option key={idx.value} value={idx.value}>{idx.text}</option>)}
                        </select>
                    </div>
                    <div className="input-group">
                        <label>Trigger Digits</label>
                        <div className="entry-config-row">
                            <div className="entry-config">
                                <input className="ui-input digit-entry" type="number" min="0" max="9" value={entry_digit} onChange={(e) => setEntryDigit(Number(e.target.value))} disabled={is_auto_running || is_authorizing || is_differs_mode} title="First Trigger" />
                                <div className={`status-led ${over_under.last_digit === Number(entry_digit) ? 'glow' : ''}`}></div>
                            </div>
                            {use_second_trigger && (
                                <div className="entry-config">
                                    <input className="ui-input digit-entry" type="number" min="0" max="9" value={second_entry_digit} onChange={(e) => setSecondEntryDigit(Number(e.target.value))} disabled={is_auto_running || is_authorizing || is_differs_mode} title="Second Trigger" />
                                    <div className={`status-led ${over_under.last_last_digit === Number(entry_digit) && over_under.last_digit === Number(second_entry_digit) ? 'glow' : ''}`}></div>
                                </div>
                            )}
                            <button 
                                className={`ui-switch mini second-trigger-btn ${use_second_trigger ? 'active' : ''}`}
                                onClick={() => setUseSecondTrigger(!use_second_trigger)}
                                disabled={is_auto_running || is_authorizing || is_differs_mode}
                                title="Toggle Second Trigger"
                            >
                                2ND
                            </button>
                        </div>
                    </div>
                </div>
                <div className="input-row">
                    <div className="input-group">
                        <label>Stake</label>
                        <input className="ui-input" type="number" value={stake} onChange={(e) => setStake(Number(e.target.value))} disabled={is_auto_running || is_authorizing} />
                    </div>
                    <div className="input-group">
                        <label>Martingale</label>
                        <input className="ui-input" type="number" step="0.1" value={martingale} onChange={(e) => setMartingale(Number(e.target.value))} disabled={is_auto_running || is_authorizing} />
                    </div>
                </div>
                <div className="input-row switches-row">
                    <div className="input-group switch-group">
                        <label>Volatility Changer</label>
                        <button 
                            className={`ui-switch ${is_volatility_changer ? 'active' : ''}`} 
                            onClick={() => setIsVolatilityChanger(!is_volatility_changer)}
                            disabled={is_auto_running || is_authorizing}
                        >
                            {is_volatility_changer ? 'ON' : 'OFF'}
                        </button>
                    </div>
                    <div className="input-group switch-group">
                        <label>DIFFERS</label>
                        <button 
                            className={`ui-switch ${is_differs_mode ? 'active' : ''}`} 
                            onClick={() => setIsDiffersMode(!is_differs_mode)}
                            disabled={is_auto_running || is_authorizing}
                        >
                            {is_differs_mode ? 'ON' : 'OFF'}
                        </button>
                    </div>
                    {(is_volatility_changer || is_differs_mode) && (
                        <div className="input-group switch-group">
                            <label>Automate</label>
                            <button
                                className={`ui-switch ${is_automate ? 'active' : ''}`}
                                onClick={() => setIsAutomate(!is_automate)}
                                disabled={is_auto_running || is_authorizing}
                            >
                                {is_automate ? 'ON' : 'OFF'}
                            </button>
                        </div>
                    )}
                    <div className="input-group switch-group">
                        <label>Manual Mode</label>
                        <button 
                            className={`ui-switch ${is_manual_mode ? 'active' : ''}`} 
                            onClick={() => setIsManualMode(!is_manual_mode)}
                            disabled={is_auto_running || is_authorizing || is_differs_mode}
                        >
                            {is_manual_mode ? 'ON' : 'OFF'}
                        </button>
                    </div>
                </div>

                {is_manual_mode && !is_differs_mode && (
                    <div className="manual-config-box">
                        <div className="input-row">
                            <div className="input-group">
                                <label>Manual Type</label>
                                <select className="ui-select" value={manual_contract_type} onChange={(e) => setManualContractType(e.target.value)} disabled={is_auto_running || is_authorizing}>
                                    <option value="DIGITOVER">OVER</option>
                                    <option value="DIGITUNDER">UNDER</option>
                                </select>
                            </div>
                            <div className="input-group">
                                <label>Barrier</label>
                                <input className="ui-input" type="number" min="0" max="9" value={manual_barrier} onChange={(e) => setManualBarrier(e.target.value)} disabled={is_auto_running || is_authorizing} />
                            </div>
                        </div>
                    </div>
                )}

                <div className="recovery-config-box">
                    <div className="input-row">
                        <div className="input-group switch-group">
                            <label>Recovery Delay</label>
                            <button 
                                className={`ui-switch ${use_recovery_delay ? 'active' : ''}`} 
                                onClick={() => setUseRecoveryDelay(!use_recovery_delay)}
                                disabled={is_auto_running || is_authorizing}
                            >
                                {use_recovery_delay ? 'ON' : 'OFF'}
                            </button>
                        </div>
                        <div className="input-group">
                            <label>Recovery Type</label>
                            <select className="ui-select" value={recovery_contract_type} onChange={(e) => setRecoveryContractType(e.target.value)} disabled={is_auto_running || is_authorizing}>
                                <option value="DIGITOVER">OVER</option>
                                <option value="DIGITUNDER">UNDER</option>
                                <option value="DIGITDIFF">DIFFERS</option>
                            </select>
                        </div>
                        <div className="input-group">
                            <label>Recovery Barrier</label>
                            <input className="ui-input" type="number" min="0" max="9" value={recovery_barrier} onChange={(e) => setRecoveryBarrier(e.target.value)} disabled={is_auto_running || is_authorizing} />
                        </div>
                    </div>
                </div>

                <div className="input-row turbo-row">
                    <div className="input-group switch-group">
                        <label>Turbo Mode</label>
                        <button 
                            className={`ui-switch ${is_turbo ? 'active' : ''}`} 
                            onClick={() => setIsTurbo(!is_turbo)}
                            disabled={is_auto_running || is_authorizing}
                        >
                            {is_turbo ? 'ON' : 'OFF'}
                        </button>
                    </div>
                    <div className="button-group">
                        <button className={`btn-primary ${is_auto_running ? 'running' : ''}`} onClick={handleStartStop} disabled={is_authorizing}>
                            {startButtonText}
                        </button>
                    </div>
                </div>
            </div>

            <div className="debug-monitor">
                <div className="debug-header">
                    <span>Real-Time Monitor</span>
                    <button className="clear-btn" onClick={clearDebug}>Clear</button>
                </div>
                <div className="debug-content">
                    {debug_info.length === 0 ? (
                        <div className="empty-log">Waiting for activity...</div>
                    ) : (
                        debug_info.map((log, i) => <div key={i} className="log-entry">{log}</div>)
                    )}
                </div>
            </div>
        </div>
    );
});

export default OverUnder;
