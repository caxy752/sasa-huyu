import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Settings,
    Play,
    Square,
    Activity,
    TrendingUp,
    ShieldCheck,
    Zap,
    Info,
    ChevronDown,
    ChevronUp,
    Terminal,
    Trash2,
    CheckCircle2,
    AlertCircle,
} from 'lucide-react';
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
        is_2term_mode,
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
        setIs2termMode,
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

    const [showGuide, setShowGuide] = useState(false);
    const [expandedSection, setExpandedSection] = useState<string | null>('general');

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
        let maxVal = -1,
            minVal = Infinity,
            maxIdx = -1,
            minIdx = -1;
        digitStats.forEach((val, idx) => {
            if (val > maxVal) {
                maxVal = val;
                maxIdx = idx;
            }
            if (val < minVal) {
                minVal = val;
                minIdx = idx;
            }
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

    const getStatusInfo = () => {
        if (is_authorizing)
            return {
                text: 'Authorizing...',
                class: 'authorizing',
                icon: <Activity className='animate-pulse' size={16} />,
            };
        switch (connection_status) {
            case 'Account Connected':
                return { text: 'Connected', class: 'connected', icon: <CheckCircle2 size={16} /> };
            case 'Live Ticks':
                return {
                    text: 'Live Ticks',
                    class: 'authorizing',
                    icon: <Activity className='animate-pulse' size={16} />,
                };
            default:
                return { text: connection_status, class: 'disconnected', icon: <AlertCircle size={16} /> };
        }
    };

    const statusInfo = getStatusInfo();

    const startButtonText = useMemo(() => {
        if (is_authorizing) return 'AUTHORIZING...';
        if (is_auto_running) {
            if (is_analyzing_volatility) {
                const name =
                    volatilityIndices.find(v => v.value === current_analyzing_symbol)?.text || current_analyzing_symbol;
                return `ANALYZING: ${name}`;
            }
            return 'STOP';
        }
        return 'START';
    }, [is_auto_running, is_analyzing_volatility, current_analyzing_symbol, is_authorizing]);

    const containerVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.5, staggerChildren: 0.1 },
        },
    };

    const itemVariants = {
        hidden: { opacity: 0, x: -20 },
        visible: { opacity: 1, x: 0 },
    };

    const toggleSection = (section: string) => {
        setExpandedSection(expandedSection === section ? null : section);
    };

    return (
        <motion.div className='over-under-container' initial='hidden' animate='visible' variants={containerVariants}>
            <button className='floating-guide-btn' onClick={() => setShowGuide(true)}>
                <Info size={24} />
                <span>GUIDE</span>
            </button>

            <AnimatePresence>
                {showGuide && (
                    <motion.div
                        className='guide-modal-overlay'
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowGuide(false)}
                    >
                        <motion.div
                            className='guide-modal-content'
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <button className='guide-close-btn' onClick={() => setShowGuide(false)}>
                                ×
                            </button>
                            <h2>
                                <Info size={20} style={{ marginRight: '8px' }} /> Over/Under Tool Guide
                            </h2>

                            <div className='guide-scroll-area'>
                                <div className='guide-section'>
                                    <h3>General Controls</h3>
                                    <ul>
                                        <li>
                                            <strong>Index:</strong> Select the market volatility index to trade on.
                                        </li>
                                        <li>
                                            <strong>Trigger Digits:</strong> Set the digit(s) that must appear to
                                            trigger a trade. Use "2ND" to enable a two-digit sequence trigger.
                                        </li>
                                        <li>
                                            <strong>Stake:</strong> Your base trade amount.
                                        </li>
                                        <li>
                                            <strong>Martingale:</strong> Multiplier applied to the stake after a loss to
                                            recover funds.
                                        </li>
                                    </ul>
                                </div>

                                <div className='guide-section'>
                                    <h3>Strategy Switches</h3>
                                    <ul>
                                        <li>
                                            <strong>Volatility Changer:</strong> Automatically scans all indices and
                                            switches to the one with the best statistical score.
                                        </li>
                                        <li>
                                            <strong>DIFFERS:</strong> Enables the Differs strategy. It identifies rare
                                            digits and waits for a 5-tick gap after their appearance before trading
                                            "Digit Differs".
                                        </li>
                                        <li>
                                            <strong>2term:</strong> Available only in Differs mode. When ON, profits
                                            from a winning trade are added to the next trade's stake for compounded
                                            growth.
                                        </li>
                                        <li>
                                            <strong>Automate:</strong> Automatically restarts analysis or trading cycles
                                            after a round is completed.
                                        </li>
                                        <li>
                                            <strong>Turbo Mode:</strong> When enabled, the bot continues to wait for
                                            triggers and trade without stopping after each round.
                                        </li>
                                    </ul>
                                </div>

                                <div className='guide-section'>
                                    <h3>Recovery System</h3>
                                    <ul>
                                        <li>
                                            <strong>Recovery Active:</strong> Automatically triggers after a loss. The
                                            bot switches to the "Recovery Type" and "Recovery Barrier" you've
                                            configured.
                                        </li>
                                        <li>
                                            <strong>Trigger Wait:</strong> In recovery mode, the bot strictly waits for
                                            your "Trigger Digits" before executing recovery trades.
                                        </li>
                                        <li>
                                            <strong>Recovery Goal:</strong> It will continue trading with the Martingale
                                            stake until the total lost amount is fully recovered, then automatically
                                            returns to your original strategy.
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div className='stats-grid' variants={itemVariants}>
                {digitStats.map((count, i) => {
                    const percentage = ((count / totalTicksCount) * 100).toFixed(1);
                    const isHot = i === maxIdx && count > 0;
                    const isCold = i === minIdx && count > 0;
                    let barClass = '';
                    if (isHot) barClass = 'hot';
                    if (isCold) barClass = 'cold';

                    return (
                        <motion.div
                            key={i}
                            className={`digit-card ${last_digit === i ? 'active' : ''} ${barClass}`}
                            whileHover={{ y: -5 }}
                        >
                            <span className='digit-num'>{i}</span>
                            <span className='digit-percent'>{percentage}%</span>
                            <div className='digit-bar-wrapper'>
                                <div
                                    className={`digit-bar-fill ${barClass}`}
                                    style={{ height: `${percentage}%`, transition: 'height 0.2s ease-out' }}
                                />
                            </div>
                        </motion.div>
                    );
                })}
            </motion.div>

            <div className='main-layout'>
                <motion.div className='controls-panel' variants={itemVariants}>
                    <div className='panel-header'>
                        <div className='header-title'>
                            <Settings size={18} />
                            <span>Configuration</span>
                        </div>
                        <div className={`connection-badge ${statusInfo.class}`}>
                            {statusInfo.icon}
                            <span>{statusInfo.text}</span>
                        </div>
                    </div>

                    <div className='accordion-section'>
                        <div className='accordion-header' onClick={() => toggleSection('general')}>
                            <div className='header-left'>
                                <Activity size={16} />
                                <span>Market & Triggers</span>
                            </div>
                            {expandedSection === 'general' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                        <AnimatePresence>
                            {expandedSection === 'general' && (
                                <motion.div
                                    className='accordion-content'
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                >
                                    <div className='input-row'>
                                        <div className='input-group'>
                                            <label>Index</label>
                                            <select
                                                className='modern-select'
                                                value={selected_symbol}
                                                onChange={e => setSelectedSymbol(e.target.value)}
                                                disabled={is_auto_running || is_authorizing}
                                            >
                                                {volatilityIndices.map(idx => (
                                                    <option key={idx.value} value={idx.value}>
                                                        {idx.text}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className='input-group'>
                                            <label>Trigger Digits</label>
                                            <div className='trigger-container'>
                                                <div className='digit-input-wrapper'>
                                                    <input
                                                        className='digit-input'
                                                        type='number'
                                                        min='0'
                                                        max='9'
                                                        value={entry_digit}
                                                        onChange={e => setEntryDigit(Number(e.target.value))}
                                                        disabled={is_auto_running || is_authorizing || is_differs_mode}
                                                    />
                                                    <div
                                                        className={`led-indicator ${over_under.last_digit === Number(entry_digit) ? 'active' : ''}`}
                                                    />
                                                </div>
                                                {use_second_trigger && (
                                                    <div className='digit-input-wrapper'>
                                                        <input
                                                            className='digit-input'
                                                            type='number'
                                                            min='0'
                                                            max='9'
                                                            value={second_entry_digit}
                                                            onChange={e => setSecondEntryDigit(Number(e.target.value))}
                                                            disabled={
                                                                is_auto_running || is_authorizing || is_differs_mode
                                                            }
                                                        />
                                                        <div
                                                            className={`led-indicator ${over_under.last_last_digit === Number(entry_digit) && over_under.last_digit === Number(second_entry_digit) ? 'active' : ''}`}
                                                        />
                                                    </div>
                                                )}
                                                <button
                                                    className={`toggle-btn mini ${use_second_trigger ? 'active' : ''}`}
                                                    onClick={() => setUseSecondTrigger(!use_second_trigger)}
                                                    disabled={is_auto_running || is_authorizing || is_differs_mode}
                                                >
                                                    2ND
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className='input-row'>
                                        <div className='input-group'>
                                            <label>Stake ($)</label>
                                            <input
                                                className='modern-input'
                                                type='number'
                                                value={stake}
                                                onChange={e => setStake(Number(e.target.value))}
                                                disabled={is_auto_running || is_authorizing}
                                            />
                                        </div>
                                        <div className='input-group'>
                                            <label>Martingale</label>
                                            <input
                                                className='modern-input'
                                                type='number'
                                                value={martingale}
                                                onChange={e => setMartingale(Number(e.target.value))}
                                                disabled={is_auto_running || is_authorizing}
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className='accordion-section'>
                        <div className='accordion-header' onClick={() => toggleSection('strategies')}>
                            <div className='header-left'>
                                <TrendingUp size={16} />
                                <span>Strategy Options</span>
                            </div>
                            {expandedSection === 'strategies' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                        <AnimatePresence>
                            {expandedSection === 'strategies' && (
                                <motion.div
                                    className='accordion-content'
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                >
                                    <div className='switches-grid'>
                                        <div className='switch-item'>
                                            <label>Volatility Changer</label>
                                            <button
                                                className={`modern-switch ${is_volatility_changer ? 'active' : ''}`}
                                                onClick={() => setIsVolatilityChanger(!is_volatility_changer)}
                                                disabled={is_auto_running || is_authorizing}
                                            >
                                                <div className='switch-handle' />
                                            </button>
                                        </div>
                                        <div className='switch-item'>
                                            <label>DIFFERS Mode</label>
                                            <button
                                                className={`modern-switch ${is_differs_mode ? 'active' : ''}`}
                                                onClick={() => setIsDiffersMode(!is_differs_mode)}
                                                disabled={is_auto_running || is_authorizing}
                                            >
                                                <div className='switch-handle' />
                                            </button>
                                        </div>
                                        <div className='switch-item'>
                                            <label>2-Term Compound</label>
                                            <button
                                                className={`modern-switch ${is_2term_mode ? 'active' : ''}`}
                                                onClick={() => setIs2termMode(!is_2term_mode)}
                                                disabled={is_auto_running || is_authorizing}
                                            >
                                                <div className='switch-handle' />
                                            </button>
                                        </div>
                                        {(is_volatility_changer || is_differs_mode) && (
                                            <div className='switch-item'>
                                                <label>Auto Cycle</label>
                                                <button
                                                    className={`modern-switch ${is_automate ? 'active' : ''}`}
                                                    onClick={() => setIsAutomate(!is_automate)}
                                                    disabled={is_auto_running || is_authorizing}
                                                >
                                                    <div className='switch-handle' />
                                                </button>
                                            </div>
                                        )}
                                        <div className='switch-item'>
                                            <label>Manual Mode</label>
                                            <button
                                                className={`modern-switch ${is_manual_mode ? 'active' : ''}`}
                                                onClick={() => setIsManualMode(!is_manual_mode)}
                                                disabled={is_auto_running || is_authorizing || is_differs_mode}
                                            >
                                                <div className='switch-handle' />
                                            </button>
                                        </div>
                                        <div className='switch-item'>
                                            <label>Turbo Mode</label>
                                            <button
                                                className={`modern-switch ${is_turbo ? 'active' : ''}`}
                                                onClick={() => setIsTurbo(!is_turbo)}
                                                disabled={is_auto_running || is_authorizing}
                                            >
                                                <div className='switch-handle' />
                                            </button>
                                        </div>
                                    </div>

                                    {is_manual_mode && !is_differs_mode && (
                                        <motion.div
                                            className='sub-panel'
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                        >
                                            <div className='input-row'>
                                                <div className='input-group'>
                                                    <label>Manual Type</label>
                                                    <select
                                                        className='modern-select'
                                                        value={manual_contract_type}
                                                        onChange={e => setManualContractType(e.target.value)}
                                                        disabled={is_auto_running || is_authorizing}
                                                    >
                                                        <option value='DIGITOVER'>OVER</option>
                                                        <option value='DIGITUNDER'>UNDER</option>
                                                    </select>
                                                </div>
                                                <div className='input-group'>
                                                    <label>Barrier</label>
                                                    <input
                                                        className='modern-input'
                                                        type='number'
                                                        min='0'
                                                        max='9'
                                                        value={manual_barrier}
                                                        onChange={e => setManualBarrier(e.target.value)}
                                                        disabled={is_auto_running || is_authorizing}
                                                    />
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className='accordion-section'>
                        <div className='accordion-header' onClick={() => toggleSection('recovery')}>
                            <div className='header-left'>
                                <ShieldCheck size={16} />
                                <span>Recovery System</span>
                            </div>
                            {expandedSection === 'recovery' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                        <AnimatePresence>
                            {expandedSection === 'recovery' && (
                                <motion.div
                                    className='accordion-content'
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                >
                                    <div className='input-row'>
                                        <div className='switch-item'>
                                            <label>Recovery Delay</label>
                                            <button
                                                className={`modern-switch ${use_recovery_delay ? 'active' : ''}`}
                                                onClick={() => setUseRecoveryDelay(!use_recovery_delay)}
                                                disabled={is_auto_running || is_authorizing}
                                            >
                                                <div className='switch-handle' />
                                            </button>
                                        </div>
                                        <div className='input-group'>
                                            <label>Recovery Type</label>
                                            <select
                                                className='modern-select'
                                                value={recovery_contract_type}
                                                onChange={e => setRecoveryContractType(e.target.value)}
                                                disabled={is_auto_running || is_authorizing}
                                            >
                                                <option value='DIGITOVER'>OVER</option>
                                                <option value='DIGITUNDER'>UNDER</option>
                                                <option value='DIGITDIFF'>DIFFERS</option>
                                            </select>
                                        </div>
                                        <div className='input-group'>
                                            <label>Barrier</label>
                                            <input
                                                className='modern-input'
                                                type='number'
                                                min='0'
                                                max='9'
                                                value={recovery_barrier}
                                                onChange={e => setRecoveryBarrier(e.target.value)}
                                                disabled={is_auto_running || is_authorizing}
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className='action-bar'>
                        <motion.button
                            className={`main-action-btn ${is_auto_running ? 'stop' : 'start'}`}
                            onClick={handleStartStop}
                            disabled={is_authorizing}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            {is_auto_running ? <Square size={20} /> : <Play size={20} />}
                            <span>{startButtonText}</span>
                        </motion.button>
                    </div>
                </motion.div>

                <motion.div className='monitor-panel' variants={itemVariants}>
                    <div className='panel-header'>
                        <div className='header-title'>
                            <Terminal size={18} />
                            <span>Real-Time Monitor</span>
                        </div>
                        <button className='icon-btn' onClick={clearDebug} title='Clear logs'>
                            <Trash2 size={16} />
                        </button>
                    </div>
                    <div className='monitor-content'>
                        {debug_info.length === 0 ? (
                            <div className='empty-state'>
                                <Zap size={40} />
                                <p>Waiting for market activity...</p>
                            </div>
                        ) : (
                            <div className='log-list'>
                                    {debug_info.map((log, i) => (
                                        <div key={i} className='log-item'>
                                            <span className='log-time'>
                                                [{new Date().toLocaleTimeString([], { hour12: false })}]
                                            </span>
                                            <span className='log-text'>{log}</span>
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
});

export default OverUnder;
