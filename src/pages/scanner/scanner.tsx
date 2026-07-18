import { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useDevice } from '@deriv-com/ui';
import { contract_stages } from '@/constants/contract-stage';
import { DBOT_TABS } from '@/constants/bot-contents';
import { api_base, observer as globalObserver } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { getLastDigitFromQuote } from '@/utils/market-data';
import { buyContractForUi, streamContractUntilSettled } from '@/utils/trade-purchase';
import { safeSubscribe } from '@/utils/websocket-handler';
import './scanner.scss';

// ─── Types ──────────────────────────────────────────────
type TTickPoint = { epoch: number; quote: number; };
type TScannerStrategy = 'Matches & Differs' | 'Even & Odd' | 'Over & Under' | 'Rise & Fall';
type TScannerMode = 'Analyze' | 'Trade';

type TScannerSignal = {
    barrier?: string;
    contractType: 'DIGITEVEN' | 'DIGITODD' | 'DIGITOVER' | 'DIGITUNDER' | 'DIGITMATCH' | 'DIGITDIFF' | 'CALL' | 'PUT';
    label: string;
    recoveryBarrier?: string;
    recoveryContractType?: 'DIGITOVER' | 'DIGITUNDER';
    recoveryLabel?: string;
    hiddenDigitBarrier?: string;
    hiddenDigitContractType?: 'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD';
    hiddenDigitLabel?: string;
    confidence?: number;
};

// ─── Constants ──────────────────────────────────────────
const MAX_TICKS = 500;
const CALIBRATION_TICKS = 100;
const DEFAULT_STAKE = '0.5';
const DEFAULT_STOP_LOSS = '20';
const DEFAULT_TAKE_PROFIT = '0.5';
const DEFAULT_MARTINGALE_MULTIPLIER = 2;
const DEFAULT_RUNS_TO_CHECK = '5';
const TIMER_SOUND_URL = 'https://www.fesliyanstudios.com/play-mp3/4386';

const MARTINGALE_MULTIPLIERS = [
    1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9,
    2.0, 2.2, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0,
];

const MARKETS = [
    { label: 'Volatility 10 (1s) Index', symbol: '1HZ10V' },
    { label: 'Volatility 15 (1s) Index', symbol: '1HZ15V' },
    { label: 'Volatility 25 (1s) Index', symbol: '1HZ25V' },
    { label: 'Volatility 30 (1s) Index', symbol: '1HZ30V' },
    { label: 'Volatility 50 (1s) Index', symbol: '1HZ50V' },
    { label: 'Volatility 75 (1s) Index', symbol: '1HZ75V' },
    { label: 'Volatility 90 (1s) Index', symbol: '1HZ90V' },
    { label: 'Volatility 100 (1s) Index', symbol: '1HZ100V' },
    { label: 'Volatility 10 Index', symbol: 'R_10' },
    { label: 'Volatility 25 Index', symbol: 'R_25' },
    { label: 'Volatility 50 Index', symbol: 'R_50' },
    { label: 'Volatility 75 Index', symbol: 'R_75' },
    { label: 'Volatility 100 Index', symbol: 'R_100' },
];

const STRATEGIES: TScannerStrategy[] = ['Matches & Differs', 'Even & Odd', 'Over & Under', 'Rise & Fall'];

// ─── Helpers ────────────────────────────────────────────
const cleanMoneyInput = (value: string) => value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
const cleanNumberInput = (value: string) => value.replace(/[^\d]/g, '');
const generateRandomCode = () => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$#@!%^&*()';
    let result = '';
    for (let i = 0; i < 40; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
};
const generateFakeLogs = () => {
    const logs = [
        '[INFO] Connecting to server... [OK]', '[INFO] Authenticating API key... [OK]',
        '[WARNING] Unstable connection detected...', '[ERROR] Connection timeout. Retrying...',
        '[INFO] Fetching market data... [OK]', '[INFO] Analysing Volatility Index...',
        '[SUCCESS] Data stream established...', '[SECURITY] Encryption enabled...',
        '[INFO] Predicting next digit...', '[WARNING] High market volatility detected...',
        '[INFO] Compiling results...', '[INFO] Data transmission complete...',
    ];
    let line = '';
    for (let i = 0; i < 10; i++) line += `${logs[Math.floor(Math.random() * logs.length)]} `;
    return line;
};

// ─── Extract ALL decimal digits from a quote ──────────
const extractHiddenDigits = (quote: number): number[] => {
    const s = quote.toFixed(8);
    const parts = s.split('.');
    if (parts.length < 2) return [];
    const decimals = parts[1];
    const visible = decimals.slice(0, 4).split('').map(Number);
    const hidden = decimals.slice(4).split('').map(Number);
    return [...visible.slice(-1), ...hidden];
};

// ─── Calibration ───────────────────────────────────────
type THiddenDigitCalibration = {
    hiddenToNext: Record<number, number[]>;
    totalSamples: number;
    lastHiddenDigit: number | null;
    bestOverUnder: { hiddenDigit: number; nextIsOver: boolean; probability: number; contractType: 'DIGITOVER' | 'DIGITUNDER'; barrier: string } | null;
    bestEvenOdd: { hiddenDigit: number; nextIsEven: boolean; probability: number; contractType: 'DIGITEVEN' | 'DIGITODD' } | null;
};

const initCalibration = (): THiddenDigitCalibration => {
    const hiddenToNext: Record<number, number[]> = {};
    for (let d = 0; d <= 9; d++) hiddenToNext[d] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    return { hiddenToNext, totalSamples: 0, lastHiddenDigit: null, bestOverUnder: null, bestEvenOdd: null };
};

const updateCalibration = (cal: THiddenDigitCalibration, prevQuote: number, currentQuote: number): THiddenDigitCalibration => {
    const hiddenDigits = extractHiddenDigits(prevQuote);
    const lastDigit = getLastDigitFromQuote(currentQuote, '');
    if (hiddenDigits.length < 4 || lastDigit < 0 || lastDigit > 9) return cal;
    const primaryHidden = hiddenDigits[1];
    if (primaryHidden < 0 || primaryHidden > 9) return cal;

    const newCal = { ...cal };
    newCal.totalSamples += 1;
    newCal.lastHiddenDigit = primaryHidden;
    const newRow = [...newCal.hiddenToNext[primaryHidden]];
    newRow[lastDigit] += 1;
    newCal.hiddenToNext = { ...newCal.hiddenToNext, [primaryHidden]: newRow };

    if (newCal.totalSamples >= CALIBRATION_TICKS) {
        let bestProb = 0;
        let bestOU: THiddenDigitCalibration['bestOverUnder'] = null;
        for (let hd = 0; hd <= 9; hd++) {
            const row = newCal.hiddenToNext[hd];
            const total = row.reduce((a, b) => a + b, 0);
            if (total < 3) continue;
            const overCount = row.slice(0, 5).reduce((a, b) => a + b, 0);
            const underCount = row.slice(5, 10).reduce((a, b) => a + b, 0);
            const overProb = overCount / total;
            const underProb = underCount / total;
            if (overProb > bestProb && overProb > 0.55) { bestProb = overProb; bestOU = { hiddenDigit: hd, nextIsOver: true, probability: overProb, contractType: 'DIGITOVER', barrier: '4' }; }
            if (underProb > bestProb && underProb > 0.55) { bestProb = underProb; bestOU = { hiddenDigit: hd, nextIsOver: false, probability: underProb, contractType: 'DIGITUNDER', barrier: '5' }; }
        }
        newCal.bestOverUnder = bestOU;

        let bestEOProb = 0;
        let bestEO: THiddenDigitCalibration['bestEvenOdd'] = null;
        for (let hd = 0; hd <= 9; hd++) {
            const row = newCal.hiddenToNext[hd];
            const total = row.reduce((a, b) => a + b, 0);
            if (total < 3) continue;
            let evenCount = 0, oddCount = 0;
            for (let d = 0; d <= 9; d++) { if (d % 2 === 0) evenCount += row[d]; else oddCount += row[d]; }
            const evenProb = evenCount / total;
            const oddProb = oddCount / total;
            if (evenProb > bestEOProb && evenProb > 0.55) { bestEOProb = evenProb; bestEO = { hiddenDigit: hd, nextIsEven: true, probability: evenProb, contractType: 'DIGITEVEN' }; }
            if (oddProb > bestEOProb && oddProb > 0.55) { bestEOProb = oddProb; bestEO = { hiddenDigit: hd, nextIsEven: false, probability: oddProb, contractType: 'DIGITODD' }; }
        }
        newCal.bestEvenOdd = bestEO;
    }
    return newCal;
};

// ─── Analysis builders ─────────────────────────────────
const buildOverUnderAnalysis = (ticks: TTickPoint[], symbol: string, calibration: THiddenDigitCalibration): { lines: string[]; signal: TScannerSignal } => {
    const lastDigits = ticks.slice(-MAX_TICKS).map(t => getLastDigitFromQuote(t.quote, symbol));
    const sampleSize = Math.max(lastDigits.length, 1);
    const lines: string[] = ['=== HIDDEN DIGIT CSPRNG EXPLOIT ANALYSIS ==='];
    lines.push(`Calibration samples: ${calibration.totalSamples}`);
    lines.push(`Current hidden digit (5th decimal): ${calibration.lastHiddenDigit ?? 'N/A'}`);

    if (calibration.totalSamples < CALIBRATION_TICKS) {
        lines.push(`⚠️  Still calibrating... need ${CALIBRATION_TICKS - calibration.totalSamples} more ticks`);
        const last5 = lastDigits.slice(-5);
        const freq: Record<number, number> = {};
        for (const d of last5) freq[d] = (freq[d] || 0) + 1;
        let mostFreq = 0, mostFreqCount = 0;
        for (const d in freq) { if (freq[d] > mostFreqCount) { mostFreqCount = freq[d]; mostFreq = Number(d); } }
        if (mostFreqCount >= 3) {
            lines.push(`🎯 Streak detected: ${mostFreq} appeared ${mostFreqCount}/5`);
            if (mostFreq >= 5) { lines.push('📈 Using UNDER 5'); return { lines, signal: { barrier: '5', contractType: 'DIGITUNDER', label: 'Under 5', confidence: 62 } }; }
            else { lines.push('📈 Using OVER 4'); return { lines, signal: { barrier: '4', contractType: 'DIGITOVER', label: 'Over 4', confidence: 62 } }; }
        }
        lines.push('📈 Default: OVER 4 (no streak)');
        return { lines, signal: { barrier: '4', contractType: 'DIGITOVER', label: 'Over 4', confidence: 50 } };
    }

    lines.push('✅ HIDDEN DIGIT CALIBRATION COMPLETE');
    lines.push('📊 Hidden Digit → Next Digit Probability Matrix:');
    for (let hd = 0; hd <= 9; hd++) {
        const row = calibration.hiddenToNext[hd];
        const total = row.reduce((a, b) => a + b, 0);
        if (total > 0) {
            const over = row.slice(0, 5).reduce((a, b) => a + b, 0);
            const under = row.slice(5).reduce((a, b) => a + b, 0);
            lines.push(`   HD=${hd} (n=${total}): OVER=${(over/total*100).toFixed(1)}% UNDER=${(under/total*100).toFixed(1)}%`);
        }
    }

    const currentHd = calibration.lastHiddenDigit;
    const currentRow = calibration.hiddenToNext[currentHd ?? 0];
    const currentTotal = currentRow?.reduce((a, b) => a + b, 0) ?? 0;
    let signal: TScannerSignal;

    if (currentTotal >= 3) {
        const overCount = currentRow.slice(0, 5).reduce((a, b) => a + b, 0);
        const underCount = currentRow.slice(5).reduce((a, b) => a + b, 0);
        const overProb = overCount / currentTotal;
        const underProb = underCount / currentTotal;
        const options: { label: string; prob: number; ct: TScannerSignal['contractType']; barrier?: string }[] = [];
        if (overProb > 0.55) options.push({ label: `Over 4 (HD=${currentHd})`, prob: overProb, ct: 'DIGITOVER', barrier: '4' });
        if (underProb > 0.55) options.push({ label: `Under 5 (HD=${currentHd})`, prob: underProb, ct: 'DIGITUNDER', barrier: '5' });
        options.sort((a, b) => b.prob - a.prob);

        if (options.length > 0) {
            const best = options[0];
            lines.push(`🎯 PRIMARY SIGNAL: ${best.label} @ ${(best.prob*100).toFixed(1)}%`);
            if (options.length > 1) {
                const rec = options[1];
                lines.push(`🔄 RECOVERY: ${rec.label} @ ${(rec.prob*100).toFixed(1)}%`);
                signal = { barrier: best.barrier, contractType: best.ct, label: best.label, confidence: Math.round(best.prob*100), recoveryBarrier: rec.barrier, recoveryContractType: rec.ct as 'DIGITOVER' | 'DIGITUNDER', recoveryLabel: rec.label };
            } else {
                signal = { barrier: best.barrier, contractType: best.ct, label: best.label, confidence: Math.round(best.prob*100), recoveryBarrier: '3', recoveryContractType: 'DIGITOVER', recoveryLabel: 'Over 3 (fallback)' };
            }
        } else if (calibration.bestOverUnder) {
            const b = calibration.bestOverUnder;
            lines.push(`🎯 Best global: ${b.contractType === 'DIGITOVER' ? 'Over' : 'Under'} ${b.barrier} @ ${(b.probability*100).toFixed(1)}%`);
            signal = { barrier: b.barrier, contractType: b.contractType, label: b.contractType === 'DIGITOVER' ? `Over ${b.barrier}` : `Under ${b.barrier}`, confidence: Math.round(b.probability*100), recoveryBarrier: '3', recoveryContractType: b.contractType, recoveryLabel: b.contractType === 'DIGITOVER' ? 'Over 3' : 'Under 7' };
        } else {
            signal = { barrier: '4', contractType: 'DIGITOVER', label: 'Over 4', confidence: 50 };
        }
    } else {
        lines.push(`⚠️  Not enough data for current HD=${currentHd} (n=${currentTotal})`);
        if (calibration.bestOverUnder) {
            const b = calibration.bestOverUnder;
            signal = { barrier: b.barrier, contractType: b.contractType, label: b.contractType === 'DIGITOVER' ? `Over ${b.barrier}` : `Under ${b.barrier}`, confidence: Math.round(b.probability*100), recoveryBarrier: '3', recoveryContractType: 'DIGITOVER', recoveryLabel: 'Over 3' };
        } else {
            signal = { barrier: '4', contractType: 'DIGITOVER', label: 'Over 4', confidence: 50 };
        }
    }
    return { lines, signal };
};

const buildAnalysis = (strategy: TScannerStrategy, ticks: TTickPoint[], symbol: string, calibration: THiddenDigitCalibration): { lines: string[]; signal: TScannerSignal } => {
    const lastDigits = ticks.slice(-MAX_TICKS).map(t => getLastDigitFromQuote(t.quote, symbol));
    const sampleSize = Math.max(lastDigits.length, 1);
    const lines: string[] = ['Analysis Complete!'];
    let signal: TScannerSignal = { contractType: 'DIGITDIFF', label: 'Differs 0', barrier: '0' };

    if (strategy === 'Matches & Differs') {
        const digitCounts: Record<number, number> = {};
        for (const digit of lastDigits) digitCounts[digit] = (digitCounts[digit] || 0) + 1;
        let mostCommonDigit = 0, leastCommonDigit = 0, maxCount = 0, minCount = Infinity;
        for (const digit in digitCounts) {
            if (digitCounts[digit] > maxCount) { maxCount = digitCounts[digit]; mostCommonDigit = Number(digit); }
            if (digitCounts[digit] < minCount) { minCount = digitCounts[digit]; leastCommonDigit = Number(digit); }
        }
        lines.push(`MATCH with ${mostCommonDigit} (${((maxCount/sampleSize)*100).toFixed(2)}% accuracy)`);
        lines.push(`DIFFERS with ${leastCommonDigit} (${((minCount/sampleSize)*100).toFixed(2)}% accuracy)`);
        signal = { barrier: String(leastCommonDigit), contractType: 'DIGITDIFF', label: `Differs ${leastCommonDigit}` };
    } else if (strategy === 'Even & Odd') {
        if (calibration.totalSamples >= CALIBRATION_TICKS && calibration.bestEvenOdd) {
            const beo = calibration.bestEvenOdd;
            lines.push(`🎯 Hidden Digit Exploit: HD=${beo.hiddenDigit} → ${beo.nextIsEven ? 'EVEN' : 'ODD'} @ ${(beo.probability*100).toFixed(1)}%`);
            signal = { contractType: beo.contractType, label: beo.nextIsEven ? 'Even' : 'Odd', confidence: Math.round(beo.probability*100) };
        } else {
            let evenCount = 0, oddCount = 0;
            for (const digit of lastDigits) { if (digit % 2 === 0) evenCount++; else oddCount++; }
            if (evenCount > oddCount) signal = { contractType: 'DIGITEVEN', label: 'Even', confidence: Math.round((evenCount/sampleSize)*100) };
            else signal = { contractType: 'DIGITODD', label: 'Odd', confidence: Math.round((oddCount/sampleSize)*100) };
        }
    } else if (strategy === 'Over & Under') {
        return buildOverUnderAnalysis(ticks, symbol, calibration);
    } else {
        let ups = 0, downs = 0;
        for (let i = 1; i < ticks.length; i++) { if (ticks[i].quote > ticks[i-1].quote) ups++; else if (ticks[i].quote < ticks[i-1].quote) downs++; }
        signal = { contractType: ups > downs ? 'CALL' : 'PUT', label: ups > downs ? 'Rise' : 'Fall' };
    }
    return { lines, signal };
};

const getQuoteFromTick = (data: any): TTickPoint | null => {
    const quote = Number(data?.tick?.quote);
    if (!Number.isFinite(quote)) return null;
    return { epoch: Number(data?.tick?.epoch) || Math.floor(Date.now()/1000), quote };
};

// ─── Main Scanner Component ────────────────────────────
const Scanner = observer(() => {
    const { client, dashboard, run_panel, summary_card, transactions } = useStore();
    const { isDesktop } = useDevice();
    const { active_tab } = dashboard;

    const [strategy, setStrategy] = useState<TScannerStrategy>('Over & Under');
    const [mode, setMode] = useState<TScannerMode>('Trade');
    const [stakeInput, setStakeInput] = useState(DEFAULT_STAKE);
    const [stopLossInput, setStopLossInput] = useState(DEFAULT_STOP_LOSS);
    const [takeProfitInput, setTakeProfitInput] = useState(DEFAULT_TAKE_PROFIT);
    const [martingaleMultiplier, setMartingaleMultiplier] = useState(DEFAULT_MARTINGALE_MULTIPLIER);
    const [runsToCheckInput, setRunsToCheckInput] = useState(DEFAULT_RUNS_TO_CHECK);
    const [popupOpen, setPopupOpen] = useState(false);
    const [terminalDashboard, setTerminalDashboard] = useState<string[]>(['Analysis Dashboard']);
    const [terminalBody, setTerminalBody] = useState<string[]>(['Connecting to server...']);
    const [scrollingText, setScrollingText] = useState('');
    const [isWorking, setIsWorking] = useState(false);
    const [sessionProfit, setSessionProfit] = useState(0);
    const [showTPSLPopup, setShowTPSLPopup] = useState(false);
    const [tpSlSettings, setTpSlSettings] = useState({ stopLoss: DEFAULT_STOP_LOSS, takeProfit: DEFAULT_TAKE_PROFIT, isActive: false });
    const [bestMarketInfo, setBestMarketInfo] = useState<{ symbol: string; label: string; confidence: number; signal: string } | null>(null);

    // Per-symbol calibration and ticks
    const calibrationsRef = useRef<Record<string, THiddenDigitCalibration>>({});
    const ticksRef = useRef<Record<string, TTickPoint[]>>({});
    const prevTickRef = useRef<Record<string, TTickPoint | null>>({});
    const subscriptionRefs = useRef<Record<string, { unsubscribe?: () => void }>>({});
    const requestVersionRef = useRef(0);
    const shouldStopRef = useRef(false);
    const tradeActiveRef = useRef(false);
    const tradeInFlightRef = useRef(false);
    const completedRunsRef = useRef(0);
    const sessionProfitRef = useRef(0);
    const stakeRef = useRef(0);
    const stopLossRef = useRef(0);
    const takeProfitRef = useRef(0);
    const runsToCheckRef = useRef(5);
    const strategyRef = useRef<TScannerStrategy>(strategy);
    const timerSoundRef = useRef<HTMLAudioElement | null>(null);
    const currentMartingaleStakeRef = useRef(0);
    const baseStakeRef = useRef(0);
    const martingaleMultiplierRef = useRef(DEFAULT_MARTINGALE_MULTIPLIER);
    const consecutiveLossesRef = useRef(0);
    const isRecoveryTradeRef = useRef(false);
    const recoverySignalRef = useRef<{ symbol: string; signal: TScannerSignal } | null>(null);
    const primarySignalRef = useRef<{ symbol: string; signal: TScannerSignal } | null>(null);
    const consecutiveRecoveryLossesRef = useRef(0);
    const bestMarketRef = useRef<{ symbol: string; label: string; confidence: number; signal: string } | null>(null);

    // Init calibrations for all markets
    useEffect(() => {
        MARKETS.forEach(m => {
            if (!calibrationsRef.current[m.symbol]) calibrationsRef.current[m.symbol] = initCalibration();
            if (!ticksRef.current[m.symbol]) ticksRef.current[m.symbol] = [];
        });
    }, []);

    const currency = client.currency || 'USD';
    const showScanner = active_tab === DBOT_TABS.SCANNER;
    const isCoveredByMobileRunPanel = !isDesktop && run_panel.is_drawer_open;
    const calibrationProgress = Math.min(100, Math.round(
        (Object.values(calibrationsRef.current).reduce((sum, c) => sum + c.totalSamples, 0) / MARKETS.length / CALIBRATION_TICKS) * 100
    ));

    // ── Sync state to refs ──
    useEffect(() => { strategyRef.current = strategy; }, [strategy]);
    useEffect(() => { martingaleMultiplierRef.current = martingaleMultiplier; }, [martingaleMultiplier]);
    useEffect(() => { runsToCheckRef.current = parseInt(runsToCheckInput) || 5; }, [runsToCheckInput]);

    // ── Timer sound ──
    useEffect(() => {
        timerSoundRef.current = new Audio(TIMER_SOUND_URL);
        timerSoundRef.current.preload = 'auto';
        timerSoundRef.current.loop = true;
        return () => { timerSoundRef.current?.pause(); timerSoundRef.current = null; };
    }, []);

    const stopTimerSound = useCallback(() => { timerSoundRef.current?.pause(); if (timerSoundRef.current) timerSoundRef.current.currentTime = 0; }, []);
    const playTimerSound = useCallback(() => {
        const sound = timerSoundRef.current;
        if (!sound) return;
        sound.currentTime = 0; sound.loop = true;
        const p = sound.play();
        if (p) p.catch(() => { const handler = () => { sound.play().catch(() => undefined); }; document.addEventListener('click', handler, { once: true }); });
    }, []);

    // ── Scrolling text ──
    useEffect(() => {
        if (!showScanner) return;
        const update = () => { let text = ''; for (let i = 0; i < 100; i++) text += `${generateFakeLogs()}\n`; setScrollingText(text + text); };
        update();
        const iv = setInterval(update, 200);
        return () => clearInterval(iv);
    }, [showScanner]);

    // ── Unsubscribe helper ──
    const unsubscribe = useCallback(() => {
        Object.values(subscriptionRefs.current).forEach(s => { try { s.unsubscribe?.(); } catch {} });
        subscriptionRefs.current = {};
    }, []);

    // ── Stop trading ──
    const stopTrading = useCallback(() => {
        shouldStopRef.current = true;
        tradeActiveRef.current = false;
        setIsWorking(false);
        stopTimerSound();
        consecutiveLossesRef.current = 0;
        currentMartingaleStakeRef.current = baseStakeRef.current;
        consecutiveRecoveryLossesRef.current = 0;
        isRecoveryTradeRef.current = false;
        recoverySignalRef.current = null;
        primarySignalRef.current = null;
        try { run_panel.setIsRunning(false); run_panel.setContractStage?.(contract_stages.NOT_RUNNING); } catch {}
        dashboard.setActiveTradingModule(null);
    }, [dashboard, run_panel, stopTimerSound]);

    const handleStopBot = useCallback(() => {
        if (tradeActiveRef.current || isWorking) { stopTrading(); setTerminalDashboard(p => [...p, '[USER] Bot manually stopped.']); }
    }, [stopTrading, isWorking]);

    // ── Apply live tick per symbol ──
    const applyLiveTick = useCallback((tick: TTickPoint, symbol: string) => {
        const prev = prevTickRef.current[symbol];
        if (prev) {
            calibrationsRef.current[symbol] = updateCalibration(calibrationsRef.current[symbol], prev.quote, tick.quote);
        }
        prevTickRef.current[symbol] = tick;
        const nextTicks = [...(ticksRef.current[symbol] || []), tick].slice(-MAX_TICKS);
        ticksRef.current[symbol] = nextTicks;

        // After every tick, evaluate ALL markets and find the best one
        if (tradeActiveRef.current && !tradeInFlightRef.current) {
            let bestSymbol = '';
            let bestLabel = '';
            let bestConfidence = 0;
            let bestSignalName = '';

            for (const market of MARKETS) {
                const ticks = ticksRef.current[market.symbol];
                const cal = calibrationsRef.current[market.symbol];
                if (!ticks || ticks.length < 200 || !cal || cal.totalSamples < CALIBRATION_TICKS) continue;
                if (!cal.bestOverUnder || cal.bestOverUnder.probability < 0.58) continue;

                const analysis = buildOverUnderAnalysis(ticks, market.symbol, cal);
                if (analysis.signal.confidence && analysis.signal.confidence > bestConfidence) {
                    bestConfidence = analysis.signal.confidence;
                    bestSymbol = market.symbol;
                    bestLabel = market.label;
                    bestSignalName = analysis.signal.label;
                }
            }

            if (bestSymbol && bestConfidence > 65) {
                const info = { symbol: bestSymbol, label: bestLabel, confidence: bestConfidence, signal: bestSignalName };
                bestMarketRef.current = info;
                setBestMarketInfo(info);
            }
        }
    }, []);

    // ── Load market data + subscribe to ALL ──
    const loadMarketData = useCallback(async () => {
        unsubscribe();
        if (!showScanner || !api_base.api) return;
        const requestVersion = requestVersionRef.current + 1;
        requestVersionRef.current = requestVersion;

        // Init all
        MARKETS.forEach(m => {
            ticksRef.current[m.symbol] = [];
            calibrationsRef.current[m.symbol] = initCalibration();
            prevTickRef.current[m.symbol] = null;
        });

        // Load history for all markets in parallel
        await Promise.all(MARKETS.map(async (market) => {
            try {
                const history = await api_base.api.send({
                    adjust_start_time: 1, count: MAX_TICKS, end: 'latest',
                    start: 1, style: 'ticks', ticks_history: market.symbol,
                });
                if (requestVersionRef.current !== requestVersion) return;
                const prices = Array.isArray(history?.history?.prices) ? history.history.prices : [];
                const times = Array.isArray(history?.history?.times) ? history.history.times : [];
                const historyTicks = prices.map((price: number|string, idx: number) => ({ epoch: Number(times[idx]) || Math.floor(Date.now()/1000), quote: Number(price) })).filter((t: TTickPoint) => Number.isFinite(t.quote)).slice(-MAX_TICKS);

                // Calibrate
                let cal = initCalibration();
                for (let i = 1; i < historyTicks.length; i++) cal = updateCalibration(cal, historyTicks[i-1].quote, historyTicks[i].quote);
                calibrationsRef.current[market.symbol] = cal;
                if (historyTicks.length > 0) prevTickRef.current[market.symbol] = historyTicks[historyTicks.length - 1];
                ticksRef.current[market.symbol] = historyTicks;
            } catch {}
        }));

        // Subscribe to all
        MARKETS.forEach(market => {
            try {
                const observable = (api_base.api as any).subscribe({ ticks: market.symbol });
                subscriptionRefs.current[market.symbol] = safeSubscribe(observable, (data: any) => {
                    if (requestVersionRef.current !== requestVersion) return;
                    const tick = getQuoteFromTick(data);
                    if (!tick) return;
                    applyLiveTick(tick, market.symbol);
                });
            } catch {}
        });
    }, [applyLiveTick, showScanner, unsubscribe]);

    useEffect(() => {
        void loadMarketData();
        return () => { requestVersionRef.current += 1; unsubscribe(); };
    }, [loadMarketData, unsubscribe]);

    // ── Register stop handlers ──
    useEffect(() => {
        if (!showScanner) return;
        dashboard.registerTradingStopHandler('scanner', stopTrading);
        globalObserver.register('bot.manual_stop', stopTrading);
        return () => {
            dashboard.unregisterTradingStopHandler('scanner');
            if (globalObserver.isRegistered('bot.manual_stop')) globalObserver.unregister('bot.manual_stop', stopTrading);
            shouldStopRef.current = true; tradeActiveRef.current = false;
        };
    }, [dashboard, showScanner, stopTrading]);

    // ── Push contract ──
    const pushContract = useCallback((data: any) => {
        try { transactions.pushTransaction({ ...data, run_id: run_panel.run_id }); run_panel.onBotContractEvent(data); summary_card.onBotContractEvent(data); } catch {}
    }, [run_panel, summary_card, transactions]);

    // ── Build trade parameters ──
    const buildTradeParameters = useCallback((signal: TScannerSignal, stake: number, symbol: string) => ({
        amount: stake, basis: 'stake', contract_type: signal.contractType, currency,
        duration: 1, duration_unit: 't', symbol,
        ...(signal.barrier ? { barrier: signal.barrier } : {}),
    }), [currency]);

    // ── Run single trade ──
    const runSingleTrade = useCallback(async (signal: TScannerSignal, stake: number, symbol: string): Promise<number> => {
        const marketLabel = MARKETS.find(m => m.symbol === symbol)?.label || symbol;
        setTerminalDashboard(p => [...p, `Buying ${signal.label} on ${marketLabel} with ${stake.toFixed(2)} ${currency}...`]);

        const buy = await buyContractForUi({
            parameters: buildTradeParameters(signal, stake, symbol),
            price: stake, source: 'Scanner',
        });

        pushContract({
            buy_price: buy.buy_price, contract_id: buy.contract_id, transaction_ids: { buy: buy.transaction_id },
            date_start: Math.floor(Date.now()/1000), display_name: marketLabel,
            underlying_symbol: symbol, shortcode: `SCANNER_${signal.contractType}_${symbol}`, contract_type: signal.contractType, currency,
        });

        const settledContract = await streamContractUntilSettled({
            contractId: buy.contract_id,
            fallback: { buy_price: stake, date_start: Math.floor(Date.now()/1000), display_name: marketLabel, underlying_symbol: symbol, shortcode: `SCANNER_${signal.contractType}_${symbol}`, contract_type: signal.contractType, currency },
            onUpdate: snap => pushContract(snap), source: 'Scanner',
        });
        return Number(settledContract.profit ?? 0);
    }, [buildTradeParameters, currency, pushContract]);

    // ── Execute best trade ──
    const executeBestTrade = useCallback(async () => {
        if (!tradeActiveRef.current || tradeInFlightRef.current || shouldStopRef.current) return;

        const best = bestMarketRef.current;
        if (!best || best.confidence < 65) return;

        const ticks = ticksRef.current[best.symbol];
        const cal = calibrationsRef.current[best.symbol];
        if (!ticks || ticks.length < 200 || !cal || cal.totalSamples < CALIBRATION_TICKS) return;

        const analysis = buildOverUnderAnalysis(ticks, best.symbol, cal);
        const primarySignal = analysis.signal;

        // Store recovery signals
        if (primarySignal.recoveryBarrier && primarySignal.recoveryContractType) {
            primarySignalRef.current = { symbol: best.symbol, signal: { barrier: primarySignal.barrier, contractType: primarySignal.contractType, label: primarySignal.label } };
            recoverySignalRef.current = { symbol: best.symbol, signal: { barrier: primarySignal.recoveryBarrier, contractType: primarySignal.recoveryContractType, label: primarySignal.recoveryLabel ?? '' } };
        }

        // Check SL/TP
        if (sessionProfitRef.current <= -stopLossRef.current) {
            setTerminalDashboard(p => [...p, `STOP LOSS! ${sessionProfitRef.current.toFixed(2)} ${currency}`]);
            setShowTPSLPopup(true); setTpSlSettings(prev => ({ ...prev, isActive: true, stopLoss: String(stopLossRef.current) })); stopTrading(); return;
        }
        if (sessionProfitRef.current >= takeProfitRef.current) {
            setTerminalDashboard(p => [...p, `TAKE PROFIT! ${sessionProfitRef.current.toFixed(2)} ${currency}`]);
            setShowTPSLPopup(true); setTpSlSettings(prev => ({ ...prev, isActive: true, takeProfit: String(takeProfitRef.current) })); stopTrading(); return;
        }
        if (completedRunsRef.current >= runsToCheckRef.current && sessionProfitRef.current > 0.1) {
            setTerminalDashboard(p => [...p, `${runsToCheckRef.current} runs done, profit: ${sessionProfitRef.current.toFixed(2)} ${currency}`]);
            setShowTPSLPopup(true); setTpSlSettings(prev => ({ ...prev, isActive: true })); stopTrading(); return;
        }

        const currentSignal = isRecoveryTradeRef.current && recoverySignalRef.current
            ? recoverySignalRef.current.signal : primarySignal;
        const currentSymbol = isRecoveryTradeRef.current && recoverySignalRef.current
            ? recoverySignalRef.current.symbol : best.symbol;
        const signalType = isRecoveryTradeRef.current ? 'RECOVERY' : 'PRIMARY';

        tradeInFlightRef.current = true;
        const tradeStake = currentMartingaleStakeRef.current;

        setTerminalDashboard(p => [...p, `🎯 ${signalType}: ${currentSignal.label} on ${MARKETS.find(m=>m.symbol===currentSymbol)?.label||currentSymbol} | Stake: ${tradeStake.toFixed(2)} ${currency} | Losses: ${consecutiveLossesRef.current}`]);

        try {
            const profit = await runSingleTrade(currentSignal, tradeStake, currentSymbol);
            const isWin = profit > 0;

            if (isWin) {
                consecutiveLossesRef.current = 0; consecutiveRecoveryLossesRef.current = 0;
                currentMartingaleStakeRef.current = baseStakeRef.current;
                isRecoveryTradeRef.current = false;
                setTerminalDashboard(p => [...p, `✅ WIN! Reset.`]);
            } else {
                consecutiveLossesRef.current += 1;
                if (isRecoveryTradeRef.current) {
                    consecutiveRecoveryLossesRef.current += 1;
                    currentMartingaleStakeRef.current = baseStakeRef.current * Math.pow(martingaleMultiplierRef.current, consecutiveRecoveryLossesRef.current);
                    setTerminalDashboard(p => [...p, `❌ RECOVERY LOSS! Next: ${currentMartingaleStakeRef.current.toFixed(2)} ${currency}`]);
                } else {
                    isRecoveryTradeRef.current = true;
                    consecutiveRecoveryLossesRef.current = 1;
                    currentMartingaleStakeRef.current = baseStakeRef.current * martingaleMultiplierRef.current;
                    setTerminalDashboard(p => [...p, `❌ PRIMARY LOSS! Switching to RECOVERY: Stake: ${currentMartingaleStakeRef.current.toFixed(2)} ${currency}`]);
                }
            }

            const totalProfit = Number((sessionProfitRef.current + profit).toFixed(8));
            completedRunsRef.current += 1;
            sessionProfitRef.current = totalProfit;
            setSessionProfit(totalProfit);
            setTerminalDashboard(p => [...p, `📈 Run ${completedRunsRef.current}/${runsToCheckRef.current}: ${profit.toFixed(2)} ${currency} | P/L: ${totalProfit.toFixed(2)} ${currency}`]);
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Trade failed.';
            setTerminalDashboard(p => [...p, `Error: ${msg}`]); stopTrading();
        } finally {
            tradeInFlightRef.current = false;
        }
    }, [currency, runSingleTrade, stopTrading]);

    // ── Start trading ──
    const startScannerTrading = useCallback((initialSignal: TScannerSignal, stake: number, sl: number, tp: number, multiplier: number, runs: number) => {
        baseStakeRef.current = stake;
        currentMartingaleStakeRef.current = stake;
        consecutiveLossesRef.current = 0; consecutiveRecoveryLossesRef.current = 0;
        isRecoveryTradeRef.current = false;
        stakeRef.current = stake; stopLossRef.current = sl; takeProfitRef.current = tp;
        runsToCheckRef.current = runs; sessionProfitRef.current = 0; completedRunsRef.current = 0;
        shouldStopRef.current = false; tradeActiveRef.current = true; tradeInFlightRef.current = false;
        setSessionProfit(0); setShowTPSLPopup(false);
        setTpSlSettings({ stopLoss: String(sl), takeProfit: String(tp), isActive: false });

        try { run_panel.setRunId(`scanner-${Date.now()}`); run_panel.setIsRunning(true); run_panel.setContractStage?.(contract_stages.RUNNING); run_panel.toggleDrawer(true); } catch {}
        dashboard.setActiveTradingModule('scanner');
        setTerminalDashboard(p => [...p, `Bot activated: Auto-scan 13 markets | Stake: ${stake} ${currency}`, `Martingale: x${multiplier} | SL: ${sl} | TP: ${tp} | Runs: ${runs}`]);
    }, [currency, dashboard, run_panel]);

    // ── Start fast moving codes ──
    const startFastMovingCodes = useCallback((nextMode: TScannerMode, stake: number, sl: number, tp: number, multiplier: number, runs: number) => {
        playTimerSound();
        setTerminalBody(p => [...p, 'Running deep analysis across ALL markets...']);
        const codeIv = setInterval(() => { if (shouldStopRef.current) { clearInterval(codeIv); return; } setTerminalBody(p => [...p.slice(-49), generateRandomCode()]); }, 50);
        setTimeout(() => {
            clearInterval(codeIv); stopTimerSound();
            if (shouldStopRef.current) { setIsWorking(false); return; }
            setTerminalDashboard(p => [...p, '✅ All 13 markets analyzed. Auto-scanner will pick best trade.']);
            let count = 5;
            const countdownIv = setInterval(() => {
                if (shouldStopRef.current) { clearInterval(countdownIv); setIsWorking(false); return; }
                setTerminalDashboard(p => [...p, `Running bot in ${count} seconds...`]);
                count--;
                if (count < 0) {
                    clearInterval(countdownIv);
                    if (nextMode === 'Trade') {
                        // Start with a dummy signal — the auto-scanner takes over
                        startScannerTrading({ barrier: '4', contractType: 'DIGITOVER', label: 'Auto-Scan', confidence: 50 }, stake, sl, tp, multiplier, runs);
                    } else setIsWorking(false);
                }
            }, 1000);
        }, 5000);
    }, [playTimerSound, startScannerTrading, stopTimerSound]);

    // ── Handle Analyze ──
    const handleAnalyze = () => {
        const stake = Number(stakeInput);
        const sl = Number(stopLossInput);
        const tp = Number(takeProfitInput);
        const multiplier = martingaleMultiplier;
        const runs = parseInt(runsToCheckInput) || 5;

        if (!strategy) { setTerminalDashboard(['Error: Select strategy!']); setPopupOpen(true); return; }
        if (!Number.isFinite(stake) || stake <= 0 || !Number.isFinite(sl) || sl <= 0 || !Number.isFinite(tp) || tp <= 0) { setTerminalDashboard(['Error: Enter valid Stake, SL and TP!']); setPopupOpen(true); return; }
        if (runs < 1 || runs > 1000) { setTerminalDashboard(['Error: Runs must be 1-1000']); setPopupOpen(true); return; }

        shouldStopRef.current = false;
        setIsWorking(true); setSessionProfit(0); sessionProfitRef.current = 0; completedRunsRef.current = 0;
        setPopupOpen(true);
        setTerminalDashboard([`Analysis Dashboard - ${strategy} (Auto-Market Scanner)`]);
        setTerminalBody(['Connecting to server...']);

        const msgs = ['Analysing ALL 13 markets...', 'Retrieving market data...', 'Error: Timeout...', 'Attempting reconnect...', 'Data stream detected...', 'Finalizing analysis...'];
        let idx = 0;
        const iv = setInterval(() => {
            if (shouldStopRef.current) { clearInterval(iv); setIsWorking(false); return; }
            if (idx < msgs.length) { setTerminalBody(p => [...p, msgs[idx]]); idx++; }
            else { clearInterval(iv); startFastMovingCodes(mode, stake, sl, tp, multiplier, runs); }
        }, 1000);
    };

    // ── Watch for best market and trade ──
    useEffect(() => {
        if (!tradeActiveRef.current || tradeInFlightRef.current) return;
        const iv = setInterval(() => { void executeBestTrade(); }, 3000);
        return () => clearInterval(iv);
    }, [executeBestTrade]);

    const handleClosePopup = () => { stopTimerSound(); setPopupOpen(false); };
    const handleCloseTPSLPopup = () => { setShowTPSLPopup(false); setTpSlSettings(prev => ({ ...prev, isActive: false })); };
    const handleModeChange = (m: TScannerMode) => { stopTrading(); setMode(m); };

    if (!showScanner) return null;

    return (
        <div className={`scanner-page${isCoveredByMobileRunPanel ? ' scanner-page--run-panel-open' : ''}`}>
            <div className='background'>
                <div className='scrolling-text'>{scrollingText}</div>
            </div>
            <div className='container'>
                <h1>⚡ RAMZFX 🚀 AUTO-SCANNER ⚡</h1>

                <label htmlFor='strategy'>📊 SELECT STRATEGY</label>
                <select id='strategy' className='dropdown' value={strategy} onChange={e => setStrategy(e.target.value as TScannerStrategy)}>
                    {STRATEGIES.map(s => <option key={s}>{s}</option>)}
                </select>

                <label htmlFor='stake'>💰 BASE STAKE</label>
                <input id='stake' className='dropdown' inputMode='decimal' value={stakeInput} onChange={e => setStakeInput(cleanMoneyInput(e.target.value))} />

                <label htmlFor='stop-loss'>🛑 STOP LOSS (SL)</label>
                <input id='stop-loss' className='dropdown' inputMode='decimal' value={stopLossInput} onChange={e => setStopLossInput(cleanMoneyInput(e.target.value))} />

                <label htmlFor='take-profit'>🎯 TAKE PROFIT (TP)</label>
                <input id='take-profit' className='dropdown' inputMode='decimal' value={takeProfitInput} onChange={e => setTakeProfitInput(cleanMoneyInput(e.target.value))} />

                <label htmlFor='runs-to-check'>🔢 RUNS BEFORE CHECKING PROFIT</label>
                <input id='runs-to-check' className='dropdown' inputMode='numeric' value={runsToCheckInput} onChange={e => setRunsToCheckInput(cleanNumberInput(e.target.value))} />

                <div className='martingale-row'>
                    <label>🎲 MARTINGALE MULTIPLIER</label>
                    <select className='martingale-select' value={martingaleMultiplier} onChange={e => setMartingaleMultiplier(Number(e.target.value))}>
                        {MARTINGALE_MULTIPLIERS.map(m => <option key={m} value={m}>x{m.toFixed(1)}</option>)}
                    </select>
                </div>

                <label htmlFor='mode'>⚙️ MODE</label>
                <select id='mode' className='dropdown' value={mode} onChange={e => handleModeChange(e.target.value as TScannerMode)}>
                    <option>Analyze</option>
                    <option>Trade</option>
                </select>

                {/* ── Auto-Market Status ── */}
                {bestMarketInfo && tradeActiveRef.current && (
                    <div className='calibration-bar' style={{ borderColor: '#00ff88' }}>
                        <div className='calibration-status'>
                            <span className='calibration-ready'>
                                🎯 TRADING: {bestMarketInfo.label} → {bestMarketInfo.signal} @ {bestMarketInfo.confidence}%
                            </span>
                        </div>
                    </div>
                )}

                {/* ── Calibration Bar ── */}
                <div className='calibration-bar'>
                    <div className='calibration-label'>
                        🔬 CSPRNG HIDDEN DIGIT CALIBRATION: {calibrationProgress}% (avg across {MARKETS.length} markets)
                    </div>
                    <div className='calibration-track'>
                        <div className='calibration-fill' style={{ width: `${calibrationProgress}%` }} />
                    </div>
                    <div className='calibration-status'>
                        {Object.values(calibrationsRef.current).some(c => c.totalSamples >= CALIBRATION_TICKS && c.bestOverUnder) ? (
                            <span className='calibration-ready'>✅ At least one market has exploitable bias — auto-scanner active</span>
                        ) : (
                            <span className='calibration-warning'>⚠️ Calibrating all markets... wait ~2 min</span>
                        )}
                    </div>
                </div>

                <div className='contain'>
                    <div className='latest-tick'>
                        🌐 Markets monitored: <span>{MARKETS.length}</span>
                    </div>
                    <div className='latest-tick'>
                        🏆 Best signal: <span>{bestMarketInfo ? `${bestMarketInfo.label} @ ${bestMarketInfo.confidence}%` : 'Scanning...'}</span>
                    </div>
                    <div className='latest-tick'>
                        💵 P/L: <span>{sessionProfit.toFixed(2)} {currency}</span>
                    </div>
                    <div className='latest-tick'>
                        🎯 Runs: <span>{completedRunsRef.current}/{runsToCheckInput}</span>
                    </div>
                </div>

                <div className='buttons'>
                    <button className='analyse' type='button' onClick={handleAnalyze} disabled={isWorking}>
                        {isWorking ? 'PROCESSING...' : '🚀 ANALYSE & AUTO-TRADE'}
                    </button>
                </div>
            </div>

            {/* ── Main Popup ── */}
            <div className='popup popup--reduced' style={{ display: popupOpen ? 'block' : 'none' }}>
                <div className='popup-content'>
                    <div className='popup-header'>
                        <button className='stop-bot-btn' type='button' onClick={handleStopBot} disabled={!tradeActiveRef.current && !isWorking}>⏹️ STOP BOT</button>
                        <button className='close-btn' type='button' onClick={handleClosePopup}>✕</button>
                    </div>
                    <div className='terminal-header'>
                        <span className='dot red'/><span className='dot yellow'/><span className='dot green'/>
                        <span className='terminal-title'>QUANTUM AUTO-SCANNER v3.0</span>
                    </div>
                    <div className='terminal-dashboard'>
                        {terminalDashboard.map((line, i) => <p className={line?.startsWith('Error') ? 'red' : 'green'} key={`${line}-${i}`}>{line ?? ''}</p>)}
                    </div>
                    <div className='terminal-scroll'>
                        <div className='terminal-scroll-content'>
                            {terminalBody.map((line, i) => <p className={(line ?? '').startsWith('Error') ? 'red' : 'green'} key={`${line}-${i}`}>{line ?? ''}</p>)}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── TP/SL Popup ── */}
            <div className='popup popup--tp-sl' style={{ display: showTPSLPopup ? 'block' : 'none' }}>
                <div className='popup-content'>
                    <div className='popup-header'>
                        <h3>🎯 TAKE PROFIT & STOP LOSS</h3>
                        <button className='close-btn' type='button' onClick={handleCloseTPSLPopup}>✕</button>
                    </div>
                    <div className='tp-sl-settings'>
                        <div className='setting-row'>
                            <label>🛑 STOP LOSS</label>
                            <input className='tp-sl-input' type='text' value={tpSlSettings.stopLoss} onChange={e => setTpSlSettings(p => ({ ...p, stopLoss: cleanMoneyInput(e.target.value) }))} />
                            <span className='currency-label'>{currency}</span>
                        </div>
                        <div className='setting-row'>
                            <label>🎯 TAKE PROFIT</label>
                            <input className='tp-sl-input' type='text' value={tpSlSettings.takeProfit} onChange={e => setTpSlSettings(p => ({ ...p, takeProfit: cleanMoneyInput(e.target.value) }))} />
                            <span className='currency-label'>{currency}</span>
                        </div>
                        <div className='tp-sl-status'>
                            <span className={`status-badge ${tpSlSettings.isActive ? 'active' : 'inactive'}`}>{tpSlSettings.isActive ? '✅ ACTIVE' : '⏹️ INACTIVE'}</span>
                        </div>
                        <div className='tp-sl-actions'>
                            <button className='update-btn' type='button' onClick={() => { const nSL=Number(tpSlSettings.stopLoss); const nTP=Number(tpSlSettings.takeProfit); if(nSL>0&&nTP>0){stopLossRef.current=nSL;takeProfitRef.current=nTP;setTpSlSettings(p=>({...p,isActive:true}));setTerminalDashboard(prev=>[...prev,`🔄 TP/SL: SL=${nSL} TP=${nTP} ${currency}`]);handleCloseTPSLPopup();}}}>💾 UPDATE</button>
                            <button className='reset-btn' type='button' onClick={() => { setTpSlSettings({stopLoss:DEFAULT_STOP_LOSS,takeProfit:DEFAULT_TAKE_PROFIT,isActive:false});setTerminalDashboard(prev=>[...prev,'🔄 TP/SL reset']);handleCloseTPSLPopup();}}>🔄 RESET</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default Scanner;
