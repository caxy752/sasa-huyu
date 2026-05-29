
import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Play, Square, Activity, TrendingUp, ShieldCheck, Zap,
    Info, ChevronDown, ChevronUp, Terminal, Trash2,
    BarChart2, Settings, Layers, Cpu, RefreshCw, Bot
} from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import './over-under.scss';

type Strategy = 'over_under' | 'differs' | 'differs_v2' | 'rise_fall' | 'rise_fall_v2' | 'manual';

const STRAT_META: Record<Strategy, { label: string; color: string; glow: string; desc: string }> = {
    over_under: { label: 'Over 5 / Under 4', color: '#3b82f6', glow: 'rgba(59,130,246,0.4)', desc: 'Fires Over 5 & Under 4 simultaneously on trigger digit' },
    differs:    { label: 'Differs', color: '#a855f7', glow: 'rgba(168,85,247,0.4)', desc: 'Detects pushback reversal pattern (3+ ticks + reversal)' },
    differs_v2: { label: 'Differs V2', color: '#ec4899', glow: 'rgba(236,72,153,0.4)', desc: 'Trades on doubles (e.g., 7,7) or triples (7,7,7)' },
    rise_fall:  { label: 'Rise / Fall', color: '#10b981', glow: 'rgba(16,185,129,0.4)', desc: 'MACD-based trend momentum — places Rise or Fall contract' },
    rise_fall_v2: { label: 'Rise / Fall V2', color: '#06b6d4', glow: 'rgba(6,182,212,0.4)', desc: 'MACD histogram momentum — fires trade on the exact 5th consecutive growth bar (with 1-bar crossover delay). Auto Switch Volatility re-scans all indices after each WIN.' },
    manual:     { label: 'Manual', color: '#f97316', glow: 'rgba(249,115,22,0.4)', desc: 'You choose contract type, barrier digit and trigger' },
};

const Toggle = ({ on, onToggle, disabled, color = '#3b82f6' }: {
    on: boolean; onToggle: () => void; disabled?: boolean; color?: string;
}) => (
    <button
        className={`ou-sw ${on ? 'ou-sw--on' : ''}`}
        style={on ? { '--tc': color } as React.CSSProperties : {}}
        onClick={onToggle}
        disabled={disabled}
        type='button'
    >
        <span className='ou-sw__knob' />
    </button>
);

// Compact "label + switch" tile — uniform size so all options sit on a tidy grid.
const SwitchTile = ({ label, on, onToggle, disabled, color = '#3b82f6' }: {
    label: string; on: boolean; onToggle: () => void; disabled?: boolean; color?: string;
}) => (
    <div
        className={`ou-tile${on ? ' ou-tile--on' : ''}`}
        style={on ? { '--tc': color } as React.CSSProperties : {}}
    >
        <span className='ou-tile__lbl'>{label}</span>
        <Toggle on={on} onToggle={onToggle} disabled={disabled} color={color} />
    </div>
);

// Trigger panel: a single, framed control group containing the trigger
// switch + digit input(s) + 2nd-trigger chip. Replaces the inline ad-hoc
// row that used to sit beside other fields.
const TriggerPanel = observer(({
    color, is_trigger_enabled, setIsTriggerEnabled,
    use_second_trigger, setUseSecondTrigger, over_under, disabled,
}: {
    color: string;
    is_trigger_enabled: boolean;
    setIsTriggerEnabled: (v: boolean) => void;
    use_second_trigger: boolean;
    setUseSecondTrigger: (v: boolean) => void;
    over_under: any;
    disabled: boolean;
}) => (
    <div
        className={`ou-trig-panel${is_trigger_enabled ? ' ou-trig-panel--on' : ''}`}
        style={{ '--tc': color } as React.CSSProperties}
    >
        <div className='ou-trig-panel__head'>
            <span className='ou-trig-panel__lbl'>Digit Trigger</span>
            <Toggle on={is_trigger_enabled} onToggle={() => setIsTriggerEnabled(!is_trigger_enabled)} disabled={disabled} color={color} />
        </div>
        {is_trigger_enabled && (
            <div className='ou-trig-panel__body'>
                <div className='ou-trig-panel__digits'>
                    <div className='ou-trig-panel__slot'>
                        <span className='ou-trig-panel__cap'>1ST</span>
                        <TriggerInput field='primary' over_under={over_under} disabled={disabled} />
                    </div>
                    {use_second_trigger && (
                        <div className='ou-trig-panel__slot'>
                            <span className='ou-trig-panel__cap'>2ND</span>
                            <TriggerInput field='secondary' over_under={over_under} disabled={disabled} />
                        </div>
                    )}
                </div>
                <button
                    className={`ou-chip${use_second_trigger ? ' on' : ''}`}
                    onClick={() => setUseSecondTrigger(!use_second_trigger)}
                    disabled={disabled}
                    style={use_second_trigger ? { backgroundColor: color, color: '#fff', borderColor: color } : {}}
                >
                    {use_second_trigger ? 'REMOVE 2ND' : 'ADD 2ND'}
                </button>
            </div>
        )}
    </div>
));

// Observe the store so typing into the trigger field updates immediately
const TriggerInput = observer(({ field = 'primary', over_under, disabled }: {
    field?: 'primary' | 'secondary';
    over_under: any;
    disabled: boolean;
}) => {
    const val = field === 'primary' ? over_under.entry_digit : over_under.second_entry_digit;
    const [draft, setDraft] = useState<string>(String(val ?? ''));

    // Keep the visible draft in sync with the store when the user is not typing
    // (e.g. store reset, programmatic change). When the input is focused we
    // leave the user's text alone so they can clear / overwrite freely.
    useEffect(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || active.tagName !== 'INPUT' || (active as HTMLInputElement).value !== draft) {
            setDraft(val == null ? '' : String(val));
        }
    }, [val]); // eslint-disable-line react-hooks/exhaustive-deps

    const isLit = field === 'primary'
        ? over_under.last_digit === over_under.entry_digit
        : over_under.last_last_digit === over_under.entry_digit && over_under.last_digit === over_under.second_entry_digit;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        setDraft(raw);
        const setter = field === 'primary' ? over_under.setEntryDigit : over_under.setSecondEntryDigit;
        if (raw === '') return; // allow the field to be temporarily empty while typing
        const num = Number(raw);
        if (!Number.isNaN(num) && num >= 0 && num <= 9) setter(num);
    };

    const handleBlur = () => {
        if (draft === '' || Number.isNaN(Number(draft))) {
            setDraft(String(val ?? 0));
        }
    };

    return (
        <div className='ou-dbox'>
            <input
                type='number' min='0' max='9' value={draft}
                onChange={handleChange}
                onBlur={handleBlur}
                disabled={disabled}
            />
            <span className={`ou-led ${isLit ? 'ou-led--on' : ''}`} />
        </div>
    );
});

const OverUnder = observer(() => {
    const { over_under } = useStore();
    const {
        connection_status, tick_history, last_digit,
        is_auto_running, stake, martingale, is_volatility_changer,
        is_differs_mode, is_differs_v2_mode, is_tatu_bora_mode, is_nne_kwisha_mode, is_all_vol_mode, is_2term_mode, is_rise_fall_mode, is_rise_fall_v2_mode, is_automate,
        use_second_trigger, is_manual_mode, manual_contract_type, manual_barrier, manual_duration, rise_fall_v2_duration, is_ai_scanning,
        recovery_contract_type, recovery_barrier, use_recovery_delay, is_recovery_enabled,
        recovery_entry_digit, recovery_second_entry_digit,
        is_turbo, selected_symbol, debug_info, is_analyzing_volatility, is_authorizing,
        differs_predicted_top4, is_digit_occurrence_filter_active, is_rebounce_active,
        is_trigger_enabled,
        setStake, setMartingale, setIsVolatilityChanger,
        setIsDiffersMode, setIsDiffersV2Mode, setIsTatuBoraMode, setIsNneKwishaMode, setIsAllVolMode, setIs2termMode, setIsRiseFallMode, setIsRiseFallV2Mode, setIsAutomate,
        setUseSecondTrigger, setIsManualMode, setManualContractType, setManualBarrier, setManualDuration, setRiseFallV2Duration,
        setRecoveryContractType, setRecoveryBarrier, setUseRecoveryDelay, setIsRecoveryEnabled,
        setRecoveryEntryDigit, setRecoverySecondEntryDigit,
        setIsTurbo, setSelectedSymbol, connectWebSocket, handleStartStop, clearDebug,
        setIsDigitOccurrenceFilterActive, setIsRebounceActive,
        setIsTriggerEnabled,
    } = over_under;

    const [showGuide, setShowGuide] = useState(false);
    const [showRecovery, setShowRecovery] = useState(false);

    const activeStrategy: Strategy = is_differs_mode ? 'differs'
        : is_differs_v2_mode ? 'differs_v2'
        : is_rise_fall_v2_mode ? 'rise_fall_v2'
        : is_rise_fall_mode ? 'rise_fall'
        : is_manual_mode ? 'manual'
        : 'over_under';

    const meta = STRAT_META[activeStrategy];
    const disabled = is_auto_running || is_authorizing;

    // Mobile view toggle — Config vs Monitor
    const [mobileView, setMobileView] = useState<'config' | 'monitor'>('config');

    const selectStrategy = (s: Strategy) => {
        if (disabled) return;
        over_under.resetStrategyToggles();
        setIsDiffersMode(s === 'differs');
        setIsDiffersV2Mode(s === 'differs_v2');
        setIsRiseFallV2Mode(s === 'rise_fall_v2');
        setIsRiseFallMode(s === 'rise_fall');
        setIsManualMode(s === 'manual');
    };

    useEffect(() => {
        // Always attempt to connect/reconnect when the component mounts.
        // The connectWebSocket() method itself has a guard that returns early
        // if already connected and authorized, so this is safe to call unconditionally.
        connectWebSocket();
        return () => over_under.dispose();
    }, [connectWebSocket, over_under]);

    const digitStats = useMemo(() => {
        const s = Array(10).fill(0);
        tick_history.forEach(d => { if (d >= 0 && d <= 9) s[d]++; });
        return s;
    }, [tick_history]);

    const { maxIdx, minIdx } = useMemo(() => {
        if (!tick_history.length) return { maxIdx: -1, minIdx: -1 };
        let mxV = -1, mnV = Infinity, mxI = -1, mnI = -1;
        digitStats.forEach((v, i) => {
            if (v > mxV) { mxV = v; mxI = i; }
            if (v < mnV) { mnV = v; mnI = i; }
        });
        return { maxIdx: mxI, minIdx: mnI };
    }, [digitStats, tick_history.length]);

    const totalTicks = tick_history.length || 1;

    const volatilityOptions = [
        { label: 'Volatility 10 Index', value: 'R_10' },
        { label: 'Volatility 25 Index', value: 'R_25' },
        { label: 'Volatility 50 Index', value: 'R_50' },
        { label: 'Volatility 75 Index', value: 'R_75' },
        { label: 'Volatility 100 Index', value: 'R_100' },
        { label: 'Volatility 10 (1s)', value: '1HZ10V' },
        { label: 'Volatility 25 (1s)', value: '1HZ25V' },
        { label: 'Volatility 50 (1s)', value: '1HZ50V' },
        { label: 'Volatility 75 (1s)', value: '1HZ75V' },
        { label: 'Volatility 100 (1s)', value: '1HZ100V' },
    ];

    const connState = is_authorizing ? 'pulse'
        : connection_status === 'Account Connected' ? 'ok'
        : connection_status === 'Live Ticks' ? 'live'
        : 'off';

    const connText = is_authorizing ? 'Authorizing'
        : connection_status === 'Account Connected' ? 'Connected'
        : connection_status === 'Live Ticks' ? 'Live'
        : connection_status || 'Offline';

    const ctaText = useMemo(() => {
        if (is_authorizing) return 'AUTHORIZING…';
        if (is_auto_running) return is_analyzing_volatility ? 'SCANNING…' : 'STOP BOT';
        return 'START BOT';
    }, [is_auto_running, is_analyzing_volatility, is_authorizing]);

    return (
        <div className='ou-root'>

            {/* ── GUIDE FAB ── */}
            <motion.button
                className='ou-fab'
                drag
                dragMomentum={false}
                dragElastic={0}
                onClick={() => setShowGuide(true)}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.95 }}
                style={{ cursor: 'grab' }}
            >
                <span className='ou-fab__pulse' />
                <Info size={17} /><span>Strategy Guide</span>
            </motion.button>

            {/* ── GUIDE MODAL ── */}
            <AnimatePresence>
                {showGuide && (
                    <motion.div className='ou-overlay'
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => setShowGuide(false)}>
                        <motion.div className='ou-modal'
                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            onClick={e => e.stopPropagation()}>
                            <div className='ou-modal__head'>
                                <span><Info size={15} /> Strategy Guide</span>
                                <button onClick={() => setShowGuide(false)}>×</button>
                            </div>
                            <div className='ou-modal__body'>
                                {([
                                    // ─── STRATEGIES ──────────────────────────────────────────
                                    { c: 'blue', t: 'Over 5 / Under 4 (Default Strategy)', items: [
                                        '<b>Goal:</b> Win on most digits by firing two opposite contracts at the same moment.',
                                        '<b>How it Works:</b> When the last digit of the market price matches your trigger digit, the bot fires a <b>DIGITOVER 5</b> AND a <b>DIGITUNDER 4</b> contract simultaneously. You win on every digit except exactly 4 and 5.',
                                        '<b>Options:</b> <b>Digit Trigger</b> (turn off to fire on every tick), <b>2nd Trigger</b> (fire only when the previous digit was X and current digit is Y), <b>All Volatilities</b> (run the strategy on every index in parallel), <b>Digit Filter</b> (skip a trigger when digit 4 or 5 has appeared too often recently), <b>Rebounce</b> (re-fire after a missed sequence).',
                                    ] },
                                    { c: 'purple', t: 'Differs', items: [
                                        '<b>Goal:</b> Catch a sharp price reversal and bet against the rejected digit.',
                                        '<b>How it Works:</b> Watches for a <b>surge</b> — at least 2 consecutive ticks moving the same direction — followed by a sharp reversal. The reversal digit becomes the barrier and a <b>DIGITDIFF</b> contract is placed (you win unless the next tick repeats that digit).',
                                        '<b>Smart Filters:</b> A prediction engine plus four safety checks (digit too frequent, digit recently spiking, digit appears in last 10 ticks too often, digit flagged by predictor) skip risky trades.',
                                        '<b>Options:</b> <b>Digit Trigger</b>, <b>2-Term Compound</b> (re-test on the next tick after a win for compound growth), <b>Auto Cycle</b> (keep cycling), <b>All Volatilities</b>.',
                                    ] },
                                    { c: 'pink', t: 'Differs V2', items: [
                                        '<b>Goal:</b> A faster, simpler Differs — fire on repeating digits.',
                                        '<b>How it Works (default):</b> When the same last digit appears 2 ticks in a row (a "double"), instantly place a <b>DIGITDIFF</b> on that digit.',
                                        '<b>Tatu Bora:</b> Wait for a TRIPLE (3 same digits in a row) before firing — rarer pattern, higher hit rate.',
                                        '<b>Nne Kwisha:</b> Wait for a QUAD (4 same digits in a row) — the strictest version, fewest trades.',
                                        '<b>Other Options:</b> <b>2-Term Compound</b>, <b>Auto Cycle</b>, <b>All Volatilities</b>, plus the same digit-frequency safeguards used in Differs.',
                                    ] },
                                    { c: 'green', t: 'Rise / Fall', items: [
                                        '<b>Goal:</b> Trade trend reversals using the MACD indicator.',
                                        '<b>Volatility Vote:</b> Pulls real recent prices from every volatility in parallel, computes each one\'s MACD histogram, and picks the index with the tallest bars over the last 15 candles (most active momentum).',
                                        '<b>RISE (CALL):</b> MACD line crosses ABOVE the signal line while BOTH lines are below the zero line — a turn from a downtrend.',
                                        '<b>FALL (PUT):</b> MACD line crosses BELOW the signal line while BOTH lines are above the zero line — a turn from an uptrend.',
                                        '<b>Anti-Wobble Filter:</b> The cross is only taken if the gap between the lines on the bar before the cross was at least 25% of the average gap over the last 5 bars — so two lines hugging each other won\'t produce a false signal.',
                                        '<b>Auto Cycle:</b> After at least 3 trades AND only when the last trade was a WIN, the volatility vote is re-run and the bot may switch indices. A losing streak holds the current index until a win returns.',
                                    ] },
                                    { c: 'orange', t: 'Manual', items: [
                                        '<b>Goal:</b> You decide everything — contract type, barrier, duration, trigger.',
                                        '<b>Setup:</b> Choose <b>Contract Type</b> (Over / Under / Differs), the <b>Barrier</b> digit (0–9), and <b>Duration</b> in ticks (1–10).',
                                        '<b>Trigger:</b> Optional — fires only when the last digit matches your trigger, or every tick if disabled.',
                                        '<b>SCAN AI Button:</b> Asks the AI to look at recent ticks and suggest the best contract type + barrier for the chosen volatility right now.',
                                        '<b>Manual + Recovery:</b> When recovery is on, every other strategy on every other volatility is paused until the recovery trade for the losing symbol completes — no parallel recovery trades.',
                                    ] },

                                    // ─── GLOBAL SETTINGS ─────────────────────────────────────
                                    { c: 'cyan', t: 'Market & Volatility', items: [
                                        '<b>Volatility Index:</b> The synthetic index you trade on (V10, V25, V50, V75, V100 — with optional 1-second variants).',
                                        '<b>Auto Switch Volatility:</b> Lets the bot re-run the volatility vote and rotate to whichever index currently scores best for the active strategy.',
                                        '<b>All Volatilities Mode:</b> Inside each strategy — runs the strategy on every index in parallel, opening trades wherever the conditions are met.',
                                    ] },
                                    { c: 'amber', t: 'Stake & Risk', items: [
                                        '<b>Stake ($):</b> The starting amount for each contract. Minimum $0.35.',
                                        '<b>Martingale ×:</b> Multiplier applied to the next stake after a loss. After a win, stake resets to your base. Set to 1 to disable martingale.',
                                        '<b>Turbo Mode:</b> Removes wait-for-prior-tick guards so the bot fires the moment conditions are met. Use only on indices you trust — it can stack trades faster.',
                                    ] },
                                    { c: 'red', t: 'Recovery System', items: [
                                        '<b>Enable Recovery:</b> When ON, the bot fires a one-shot recovery contract designed to win back a recent loss.',
                                        '<b>Recovery Contract & Barrier:</b> The contract type and digit used for the recovery trade.',
                                        '<b>Wait For Trigger:</b> If ON, the recovery only fires when your <b>1st Trigger Digit</b> (and optional 2nd) appears. If OFF, recovery fires on the very next tick of the losing volatility — fastest possible reaction.',
                                        '<b>Manual + Recovery:</b> Recovery is locked to the exact volatility that lost. The bot won\'t open recovery trades on other volatilities at the same time.',
                                    ] },

                                    // ─── UI / DISPLAY ────────────────────────────────────────
                                    { c: 'blue', t: 'Digit Heatmap', items: [
                                        '<b>HOT (green badge):</b> The digit that has appeared the most often in your recent tick window.',
                                        '<b>LOW (red badge):</b> The digit that has appeared the least often.',
                                        '<b>P1–P4 (orange badge):</b> Only in Differs / Differs V2 — the four digits most likely to repeat next, ranked by the prediction engine.',
                                        '<b>Highlighted cell:</b> The most recent last-digit. The taller the bar, the more frequent the digit overall.',
                                    ] },
                                    { c: 'green', t: 'Live Monitor (Log Panel)', items: [
                                        '<b>Green bar:</b> A trade WON.',
                                        '<b>Red bar:</b> A trade LOST.',
                                        '<b>Purple bar:</b> A pattern was detected (e.g. Differs surge, MACD cross).',
                                        '<b>Trash icon:</b> Clears the log history.',
                                    ] },
                                    { c: 'orange', t: 'Run / Results Panel', items: [
                                        'The Run/Results sliding panel shows each contract\'s P&L, journal events, and live transactions.',
                                        '<b>Re-open Handle:</b> A coral-red tab on the right edge of the screen. Click it any time to slide the panel back in after closing it.',
                                    ] },
                                    { c: 'purple', t: 'START / STOP Button', items: [
                                        '<b>START BOT:</b> Begins live trading using the current strategy and settings.',
                                        '<b>SCANNING…:</b> Bot is fetching ticks and running the volatility vote before placing the first trade.',
                                        '<b>STOP BOT:</b> Cancels active monitoring. In-flight contracts are not cancelled (the broker settles them normally).',
                                    ] },
                                ] as const).map(s => (
                                    <div key={s.t} className='ou-modal__sec'>
                                        <div className={`ou-modal__sh ou-modal__sh--${s.c}`}>{s.t}</div>
                                        {s.items.map((txt, i) => <p key={i} dangerouslySetInnerHTML={{ __html: txt }} />)}
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── STATUS BAR (compact, no title) ── */}
            <div className='ou-statusbar'>
                <div className={`ou-status ou-status--${connState}`}>
                    <span className='ou-status__dot' />{connText}
                </div>
            </div>

            {/* ── HEATMAP ── */}
            <div className='ou-heatmap'>
                {digitStats.map((count, i) => {
                    const pct = (count / totalTicks) * 100;
                    const hot = i === maxIdx && count > 0;
                    const cold = i === minIdx && count > 0;
                    const active = last_digit === i;
                    const predicted = (is_differs_mode || is_differs_v2_mode) && differs_predicted_top4.includes(i);
                    const predRank = predicted ? differs_predicted_top4.indexOf(i) + 1 : -1;
                    return (
                        <motion.div key={i}
                            className={`ou-cell${active ? ' ou-cell--active' : ''}${hot ? ' ou-cell--hot' : cold ? ' ou-cell--cold' : ''}${predicted ? ' ou-cell--predicted' : ''}`}
                            whileHover={{ y: -4, scale: 1.05 }}
                            transition={{ type: 'spring', stiffness: 360, damping: 20 }}>
                            <span className={`ou-cell__badge${hot ? ' hot' : cold ? ' cold' : predicted ? ' predicted' : ''}`}>
                                {hot ? 'HOT' : cold ? 'LOW' : predicted ? `P${predRank}` : ''}
                            </span>
                            <div className='ou-cell__num'>{i}</div>
                            <div className='ou-cell__bar'>
                                <motion.div className='ou-cell__fill'
                                    animate={{ height: `${Math.max(pct, 2)}%` }}
                                    transition={{ duration: 0.4, ease: 'easeOut' }}
                                    style={{ background: hot ? 'linear-gradient(180deg,#10b981,#059669)' : cold ? 'linear-gradient(180deg,#ef4444,#b91c1c)' : 'linear-gradient(180deg,#3b82f6,#1d4ed8)' }}
                                />
                            </div>
                            <div className='ou-cell__pct'>{pct.toFixed(1)}%</div>
                        </motion.div>
                    );
                })}
            </div>

            {/* ── MOBILE TAB SWITCHER (Config / Monitor) ── */}
            <div className='ou-mobile-tabs'>
                <button
                    className={`ou-mtab${mobileView === 'config' ? ' ou-mtab--active' : ''}`}
                    onClick={() => setMobileView('config')}
                >
                    <Settings size={13} /> Config
                </button>
                <button
                    className={`ou-mtab${mobileView === 'monitor' ? ' ou-mtab--active' : ''}`}
                    onClick={() => setMobileView('monitor')}
                >
                    <Terminal size={13} /> Monitor
                </button>
            </div>

            {/* ── BODY ── */}
            <div className='ou-body'>

                {/* ══ CONFIG PANEL ══ */}
                <div className={`ou-panel${mobileView === 'monitor' ? ' ou-panel--hidden-mobile' : ''}`}>

                    {/* Panel title */}
                    <div className='ou-panel__title'>
                        <Cpu size={14} /> Configuration
                    </div>

                    {/* ── ROW: Market ── */}
                    <div className='ou-row-wrap'>
                        <div className='ou-row-label'><BarChart2 size={11} /> Market</div>
                        <div className='ou-grid'>
                            <div className='ou-f ou-f--full'>
                                <span className='ou-fl'>Volatility Index</span>
                                <select className='ou-sel' value={selected_symbol}
                                    onChange={e => setSelectedSymbol(e.target.value)} disabled={disabled || is_all_vol_mode}>
                                    {volatilityOptions.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                                </select>
                            </div>
                            <SwitchTile label='Auto Switch Volatility' on={is_volatility_changer}
                                onToggle={() => setIsVolatilityChanger(!is_volatility_changer)} disabled={disabled} />
                        </div>
                    </div>

                    {/* ── ROW: Strategy ── */}
                    <div className='ou-row-wrap'>
                        <div className='ou-row-label'><Layers size={11} /> Strategy</div>
                        <div className='ou-f ou-f--full'>
                            <span className='ou-fl'>Mode</span>
                            <select className='ou-sel ou-sel--strat'
                                value={activeStrategy}
                                onChange={e => selectStrategy(e.target.value as Strategy)}
                                disabled={disabled}
                                style={{ borderColor: meta.color, color: meta.color }}>
                                {(Object.entries(STRAT_META) as [Strategy, typeof STRAT_META[Strategy]][]).map(([val, s]) => (
                                    <option key={val} value={val}>{s.label}</option>
                                ))}
                            </select>
                        </div>
                        {/* Strategy description badge */}
                        <div className='ou-strat-info' style={{ '--c': meta.color } as React.CSSProperties}>
                            <span className='ou-strat-info__dot' />
                            <span>{meta.desc}</span>
                        </div>
                    </div>

                    {/* ── STRATEGY OPTIONS (animated) ── */}
                    <AnimatePresence mode='wait'>
                        <motion.div key={activeStrategy}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.18 }}
                            style={{ overflow: 'hidden' }}>

                            {activeStrategy === 'over_under' && (
                                <div className='ou-row-wrap'>
                                    <div className='ou-row-label'><Zap size={11} /> Trigger &amp; Options</div>
                                    <TriggerPanel
                                        color='#3b82f6'
                                        is_trigger_enabled={is_trigger_enabled}
                                        setIsTriggerEnabled={setIsTriggerEnabled}
                                        use_second_trigger={use_second_trigger}
                                        setUseSecondTrigger={setUseSecondTrigger}
                                        over_under={over_under}
                                        disabled={disabled}
                                    />
                                    <div className='ou-grid'>
                                        <SwitchTile label='All Volatilities' on={is_all_vol_mode} onToggle={() => setIsAllVolMode(!is_all_vol_mode)} disabled={disabled} />
                                        <SwitchTile label='Digit Filter' on={is_digit_occurrence_filter_active} onToggle={() => setIsDigitOccurrenceFilterActive(!is_digit_occurrence_filter_active)} disabled={disabled} />
                                        {use_second_trigger && (
                                            <SwitchTile label='Rebounce' on={is_rebounce_active} onToggle={() => setIsRebounceActive(!is_rebounce_active)} disabled={disabled} />
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeStrategy === 'differs' && (
                                <div className='ou-row-wrap'>
                                    <div className='ou-row-label'><Activity size={11} /> Trigger &amp; Options</div>
                                    <TriggerPanel
                                        color='#a855f7'
                                        is_trigger_enabled={is_trigger_enabled}
                                        setIsTriggerEnabled={setIsTriggerEnabled}
                                        use_second_trigger={use_second_trigger}
                                        setUseSecondTrigger={setUseSecondTrigger}
                                        over_under={over_under}
                                        disabled={disabled}
                                    />
                                    <div className='ou-grid'>
                                        <SwitchTile label='2-Term Compound' on={is_2term_mode} onToggle={() => setIs2termMode(!is_2term_mode)} disabled={disabled} color='#a855f7' />
                                        <SwitchTile label='Auto Cycle' on={is_automate} onToggle={() => setIsAutomate(!is_automate)} disabled={disabled} color='#a855f7' />
                                        <SwitchTile label='All Volatilities' on={is_all_vol_mode} onToggle={() => setIsAllVolMode(!is_all_vol_mode)} disabled={disabled} color='#a855f7' />
                                    </div>
                                </div>
                            )}

                            {activeStrategy === 'differs_v2' && (
                                <div className='ou-row-wrap'>
                                    <div className='ou-row-label'><Activity size={11} /> Trigger &amp; Options</div>
                                    <TriggerPanel
                                        color='#ec4899'
                                        is_trigger_enabled={is_trigger_enabled}
                                        setIsTriggerEnabled={setIsTriggerEnabled}
                                        use_second_trigger={use_second_trigger}
                                        setUseSecondTrigger={setUseSecondTrigger}
                                        over_under={over_under}
                                        disabled={disabled}
                                    />
                                    <div className='ou-grid'>
                                        <SwitchTile label='Tatu Bora' on={is_tatu_bora_mode} onToggle={() => setIsTatuBoraMode(!is_tatu_bora_mode)} disabled={disabled} color='#ec4899' />
                                        <SwitchTile label='Nne Kwisha' on={is_nne_kwisha_mode} onToggle={() => setIsNneKwishaMode(!is_nne_kwisha_mode)} disabled={disabled} color='#ec4899' />
                                        <SwitchTile label='2-Term Compound' on={is_2term_mode} onToggle={() => setIs2termMode(!is_2term_mode)} disabled={disabled} color='#ec4899' />
                                        <SwitchTile label='Auto Cycle' on={is_automate} onToggle={() => setIsAutomate(!is_automate)} disabled={disabled} color='#ec4899' />
                                        <SwitchTile label='All Volatilities' on={is_all_vol_mode} onToggle={() => setIsAllVolMode(!is_all_vol_mode)} disabled={disabled} color='#ec4899' />
                                    </div>
                                </div>
                            )}

                            {activeStrategy === 'rise_fall' && (
                                <div className='ou-row-wrap'>
                                    <div className='ou-row-label'><TrendingUp size={11} /> Options</div>
                                    <div className='ou-grid'>
                                        <SwitchTile label='Auto Cycle' on={is_automate} onToggle={() => setIsAutomate(!is_automate)} disabled={disabled} color='#10b981' />
                                    </div>
                                </div>
                            )}

                            {activeStrategy === 'rise_fall_v2' && (
                                <div className='ou-row-wrap'>
                                    <div className='ou-row-label'><TrendingUp size={11} /> Options</div>
                                    <div className='ou-grid' style={{ marginTop: 8 }}>
                                        <SwitchTile label='Auto Switch Volatility' on={is_volatility_changer} onToggle={() => setIsVolatilityChanger(!is_volatility_changer)} disabled={disabled} color='#06b6d4' />
                                        <SwitchTile label='All Volatilities' on={is_all_vol_mode} onToggle={() => setIsAllVolMode(!is_all_vol_mode)} disabled={disabled} color='#06b6d4' />
                                    </div>
                                    <div className='ou-grid' style={{ marginTop: 8 }}>
                                        <div className='ou-f'>
                                            <span className='ou-fl'>Duration (Ticks)</span>
                                            <input
                                                className='ou-inp ou-inp--full'
                                                type='number'
                                                min='1'
                                                max='10'
                                                value={rise_fall_v2_duration}
                                                onChange={e => setRiseFallV2Duration(Number(e.target.value))}
                                                disabled={disabled}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeStrategy === 'manual' && (
                                <>
                                    <div className='ou-row-wrap'>
                                        <div className='ou-row-label'><Settings size={11} /> Contract</div>
                                        <div className='ou-grid'>
                                            <div className='ou-f ou-f--full'>
                                                <span className='ou-fl'>Contract Type</span>
                                                <select className='ou-sel' value={manual_contract_type}
                                                    onChange={e => setManualContractType(e.target.value)} disabled={disabled}>
                                                    <option value='DIGITOVER'>Over</option>
                                                    <option value='DIGITUNDER'>Under</option>
                                                    <option value='DIGITDIFF'>Differs</option>
                                                </select>
                                            </div>
                                            <div className='ou-f'>
                                                <span className='ou-fl'>Barrier</span>
                                                <input className='ou-inp ou-inp--full' type='number' min='0' max='9'
                                                    value={manual_barrier} onChange={e => setManualBarrier(e.target.value)} disabled={disabled} />
                                            </div>
                                            <div className='ou-f'>
                                                <span className='ou-fl'>Duration (Ticks)</span>
                                                <input className='ou-inp ou-inp--full' type='number' min='1' max='10'
                                                    value={manual_duration} onChange={e => setManualDuration(Number(e.target.value))} disabled={disabled} />
                                            </div>
                                        </div>
                                    </div>
                                    <div className='ou-row-wrap'>
                                        <div className='ou-row-label'><Zap size={11} /> Trigger &amp; Options</div>
                                        <TriggerPanel
                                            color='#f97316'
                                            is_trigger_enabled={is_trigger_enabled}
                                            setIsTriggerEnabled={setIsTriggerEnabled}
                                            use_second_trigger={use_second_trigger}
                                            setUseSecondTrigger={setUseSecondTrigger}
                                            over_under={over_under}
                                            disabled={disabled}
                                        />
                                        <div className='ou-grid'>
                                            <SwitchTile label='All Volatilities' on={is_all_vol_mode} onToggle={() => setIsAllVolMode(!is_all_vol_mode)} disabled={disabled} color='#f97316' />
                                        </div>
                                        <motion.button
                                            className={`ou-ai-btn ${is_ai_scanning ? 'scanning' : ''}`}
                                            onClick={() => over_under.startAiManualScan()}
                                            disabled={disabled || is_ai_scanning}
                                            whileHover={{ y: -1, scale: 1.01 }}
                                            whileTap={{ scale: 0.98 }}
                                            transition={{ type: 'spring', stiffness: 350, damping: 20 }}
                                            style={{ marginTop: 10, width: '100%' }}
                                        >
                                            <span className='ou-ai-btn__bg' />
                                            <span className='ou-ai-btn__ico'>
                                                {is_ai_scanning ? <RefreshCw size={14} className='ou-spin' /> : <Bot size={14} />}
                                            </span>
                                            <span className='ou-ai-btn__txt'>
                                                {is_ai_scanning ? 'ANALYSING…' : 'SCAN AI FOR BEST CONTRACT'}
                                            </span>
                                        </motion.button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </AnimatePresence>

                    {/* ── ROW: Stake & Risk ── */}
                    <div className='ou-row-wrap'>
                        <div className='ou-row-label'><BarChart2 size={11} /> Stake &amp; Risk</div>
                        <div className='ou-grid'>
                            <div className='ou-f'>
                                <span className='ou-fl'>Stake ($)</span>
                                <input className='ou-inp ou-inp--full' type='number' min='0.35' step='0.1'
                                    value={stake} onChange={e => setStake(Number(e.target.value))} disabled={disabled} />
                            </div>
                            <div className='ou-f'>
                                <span className='ou-fl'>Martingale ×</span>
                                <input className='ou-inp ou-inp--full' type='number' min='1' step='0.1'
                                    value={martingale} onChange={e => setMartingale(Number(e.target.value))} disabled={disabled} />
                            </div>
                            <SwitchTile label='Turbo Mode' on={is_turbo} onToggle={() => setIsTurbo(!is_turbo)} disabled={disabled} color='#f59e0b' />
                        </div>
                    </div>

                    {/* ── RECOVERY ── */}
                    <div className='ou-row-wrap ou-row-wrap--last'>
                        <button className='ou-collapse' onClick={() => setShowRecovery(!showRecovery)}>
                            <span><ShieldCheck size={11} /> Recovery System</span>
                            {showRecovery ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                        <AnimatePresence>
                            {showRecovery && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                                    style={{ overflow: 'hidden' }}>
                                    <div className='ou-grid' style={{ paddingTop: 10 }}>
                                        <SwitchTile label='Enable Recovery' on={is_recovery_enabled} onToggle={() => setIsRecoveryEnabled(!is_recovery_enabled)} disabled={disabled} color='#ef4444' />
                                        <SwitchTile label='Wait For Trigger' on={use_recovery_delay} onToggle={() => setUseRecoveryDelay(!use_recovery_delay)} disabled={disabled || !is_recovery_enabled} color='#ef4444' />
                                        <div className='ou-f ou-f--full'>
                                            <span className='ou-fl'>Recovery Contract</span>
                                            <select className='ou-sel' value={recovery_contract_type}
                                                onChange={e => setRecoveryContractType(e.target.value)} disabled={disabled || !is_recovery_enabled}>
                                                <option value='DIGITOVER'>Over</option>
                                                <option value='DIGITUNDER'>Under</option>
                                                <option value='DIGITDIFF'>Differs</option>
                                            </select>
                                        </div>
                                        <div className='ou-f'>
                                            <span className='ou-fl'>Barrier</span>
                                            <input className='ou-inp ou-inp--full' type='number' min='0' max='9'
                                                value={recovery_barrier} onChange={e => setRecoveryBarrier(e.target.value)} disabled={disabled || !is_recovery_enabled} />
                                        </div>
                                    </div>
                                    {use_recovery_delay && (
                                        <div className='ou-grid' style={{ paddingTop: 10 }}>
                                            <div className='ou-f'>
                                                <span className='ou-fl'>1st Trigger Digit</span>
                                                <input className='ou-inp ou-inp--full' type='number' min='0' max='9'
                                                    value={recovery_entry_digit} onChange={e => setRecoveryEntryDigit(Number(e.target.value))} disabled={disabled || !is_recovery_enabled} />
                                            </div>
                                            <SwitchTile label='Use 2nd Trigger' on={use_second_trigger} onToggle={() => setUseSecondTrigger(!use_second_trigger)} disabled={disabled || !is_recovery_enabled || !use_recovery_delay} color='#ef4444' />
                                            {use_second_trigger && (
                                                <div className='ou-f'>
                                                    <span className='ou-fl'>2nd Trigger Digit</span>
                                                    <input className='ou-inp ou-inp--full' type='number' min='0' max='9'
                                                        value={recovery_second_entry_digit} onChange={e => setRecoverySecondEntryDigit(Number(e.target.value))} disabled={disabled || !is_recovery_enabled} />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ── CTA ── */}
                    <div className='ou-cta-wrap'>
                        <motion.button
                            className={`ou-cta${is_auto_running ? ' ou-cta--stop' : ''}`}
                            style={{ '--ac': is_auto_running ? '#ef4444' : meta.color, '--ag': is_auto_running ? 'rgba(239,68,68,0.4)' : meta.glow } as React.CSSProperties}
                            onClick={handleStartStop}
                            disabled={is_authorizing}
                            whileHover={!is_authorizing ? { scale: 1.015 } : {}}
                            whileTap={!is_authorizing ? { scale: 0.985 } : {}}
                        >
                            <span className='ou-cta__ico'>
                                {is_auto_running
                                    ? (is_analyzing_volatility ? <RefreshCw size={17} className='ou-spin' /> : <Square size={17} />)
                                    : <Play size={17} />}
                            </span>
                            <span className='ou-cta__txt'>{ctaText}</span>
                            {is_auto_running && <span className='ou-cta__pulse' />}
                        </motion.button>
                    </div>
                </div>


                {/* ══ MONITOR PANEL ══ */}
                <div className={`ou-monitor${mobileView === 'config' ? ' ou-monitor--hidden-mobile' : ''}`}>
                    <div className='ou-monitor__head'>
                        <span><Terminal size={13} /> Live Monitor</span>
                        <button className='ou-monitor__clr' onClick={clearDebug}><Trash2 size={12} /></button>
                    </div>
                    <div className='ou-monitor__body'>
                        {debug_info.length === 0 ? (
                            <div className='ou-monitor__empty'><Zap size={26} /><span>Waiting for signals…</span></div>
                        ) : (
                            <div className='ou-monitor__logs'>
                                {debug_info.map((line, i) => {
                                    const win = /WON/i.test(line), loss = /LOST/i.test(line), pat = /PATTERN/i.test(line);
                                    return (
                                        <div key={i} className={`ou-log${win ? ' ou-log--win' : loss ? ' ou-log--loss' : pat ? ' ou-log--pat' : ''}`}>
                                            <span className='ou-log__bar' />
                                            <span className='ou-log__txt'>{line}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

export default OverUnder;
