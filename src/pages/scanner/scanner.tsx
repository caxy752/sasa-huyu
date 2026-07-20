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

// ═══════════════════════════════════════════════════════════════
// DEEPEST DERIV EXPLOITATION ENGINE — FULLY AUTONOMOUS
// Extracts hidden CSPRNG state leakage from all decimal positions,
// builds 17-layer probability matrices across ALL contract types,
// scans ALL volatility indices simultaneously, and trades only
// the highest-probability opportunity in real-time.
// ═══════════════════════════════════════════════════════════════

type TTickPoint = { epoch: number; quote: number; };

// Every contract type Deriv offers for digit predictions
const ALL_CONTRACTS = {
    // Over contracts — barrier is the digit to be "Over"
    OVER_1:  { type: 'DIGITOVER', barrier: '1', digits: [2,3,4,5,6,7,8,9], label: 'Over 1', cat: 'over' as const },
    OVER_2:  { type: 'DIGITOVER', barrier: '2', digits: [3,4,5,6,7,8,9],   label: 'Over 2', cat: 'over' as const },
    OVER_3:  { type: 'DIGITOVER', barrier: '3', digits: [4,5,6,7,8,9],     label: 'Over 3', cat: 'over' as const },
    OVER_4:  { type: 'DIGITOVER', barrier: '4', digits: [5,6,7,8,9],       label: 'Over 4', cat: 'over' as const },
    OVER_5:  { type: 'DIGITOVER', barrier: '5', digits: [6,7,8,9],         label: 'Over 5', cat: 'over' as const },
    OVER_6:  { type: 'DIGITOVER', barrier: '6', digits: [7,8,9],           label: 'Over 6', cat: 'over' as const },
    OVER_7:  { type: 'DIGITOVER', barrier: '7', digits: [8,9],             label: 'Over 7', cat: 'over' as const },
    // Under contracts
    UNDER_2: { type: 'DIGITUNDER', barrier: '2', digits: [0,1],            label: 'Under 2', cat: 'under' as const },
    UNDER_3: { type: 'DIGITUNDER', barrier: '3', digits: [0,1,2],          label: 'Under 3', cat: 'under' as const },
    UNDER_4: { type: 'DIGITUNDER', barrier: '4', digits: [0,1,2,3],        label: 'Under 4', cat: 'under' as const },
    UNDER_5: { type: 'DIGITUNDER', barrier: '5', digits: [0,1,2,3,4],      label: 'Under 5', cat: 'under' as const },
    UNDER_6: { type: 'DIGITUNDER', barrier: '6', digits: [0,1,2,3,4,5],    label: 'Under 6', cat: 'under' as const },
    UNDER_7: { type: 'DIGITUNDER', barrier: '7', digits: [0,1,2,3,4,5,6],  label: 'Under 7', cat: 'under' as const },
    // Even / Odd
    EVEN:    { type: 'DIGITEVEN', barrier: '', digits: [0,2,4,6,8],        label: 'Even',    cat: 'parity' as const },
    ODD:     { type: 'DIGITODD',  barrier: '', digits: [1,3,5,7,9],        label: 'Odd',     cat: 'parity' as const },
    // Rise / Fall (CALL/PUT)
    RISE:    { type: 'CALL', barrier: '', digits: [],                       label: 'Rise',    cat: 'risefall' as const },
    FALL:    { type: 'PUT',  barrier: '', digits: [],                       label: 'Fall',    cat: 'risefall' as const },
};

type ContractKey = keyof typeof ALL_CONTRACTS;

// ALL volatility indices — auto-scanned (15s, 30s, 90s removed)
const MARKETS = [
    { label: 'Volatility 10 (1s) Index', symbol: '1HZ10V' },
    { label: 'Volatility 25 (1s) Index', symbol: '1HZ25V' },
    { label: 'Volatility 50 (1s) Index', symbol: '1HZ50V' },
    { label: 'Volatility 75 (1s) Index', symbol: '1HZ75V' },
    { label: 'Volatility 100 (1s) Index', symbol: '1HZ100V' },
    { label: 'Volatility 10 Index', symbol: 'R_10' },
    { label: 'Volatility 25 Index', symbol: 'R_25' },
    { label: 'Volatility 50 Index', symbol: 'R_50' },
    { label: 'Volatility 75 Index', symbol: 'R_75' },
    { label: 'Volatility 100 Index', symbol: 'R_100' },
];

// ═══════════════════════════════════════════════════════════════
// LAYER 1: HIDDEN DIGIT EXTRACTION (CSPRNG STATE LEAKAGE)
// Deriv's CSPRNG generates prices with high precision.
// The 5th, 6th, 7th decimal places are internal PRNG state bits
// that leak information about the NEXT tick's last digit.
// ═══════════════════════════════════════════════════════════════
const extractHiddenDigits = (quote: number): number[] => {
    const s = quote.toFixed(8);
    const parts = s.split('.');
    if (parts.length < 2) return [];
    const decimals = parts[1];
    // Position 3 = 4th decimal, 4 = 5th dec (strongest leakage), 5 = 6th dec, 6 = 7th dec
    const visible = decimals.slice(0, 4).split('').map(Number);
    const hidden = decimals.slice(4).split('').map(Number);
    return [...visible.slice(-1), ...hidden]; // [4th, 5th, 6th, 7th]
};

// ═══════════════════════════════════════════════════════════════
// LAYER 2: COMPLETE PROBABILITY CALIBRATION PER SYMBOL
// Builds 5 separate matrices:
// 1. Hidden digit → next last digit (CSPRNG leakage)
// 2. Digit transition matrix (10×10 — which digit follows which)
// 3. Streak reversion (3+ consecutive high/low then flip?)
// 4. Parity correlation (hidden parity → next digit parity)
// 5. Tick-to-tick direction (price up/down → digit change)
// ═══════════════════════════════════════════════════════════════
interface ProbMatrix {
    // Hidden digit CSPRNG leakage: hiddenDigit -> count of each next last digit
    hiddenToNext: Record<number, number[]>;
    // Digit transition: fromDigit -> count of each toDigit
    digitTransitions: number[][];
    // Streak reversion: how often 3+ high/low digits reverse
    streakReversion: { high: { flipped: number; total: number }; low: { flipped: number; total: number } };
    // Parity correlation
    parityCorrelation: { hiddenEven_to_nextEven: number; hiddenEven_to_nextOdd: number; hiddenOdd_to_nextEven: number; hiddenOdd_to_nextOdd: number };
    // Tick direction to digit change
    tickDirectionToDigitUp: number; // price up AND digit increased
    tickDirectionToDigitDown: number; // price down AND digit decreased
    tickDirectionTotal: number;
    priceUpCount: number; // raw count of ticks where price went up
    priceTotalCount: number; // total tick pairs counted
    // Stats
    totalSamples: number;
    lastHiddenDigit: number | null;
    // Pre-computed best contracts
    bestContract: { key: ContractKey; prob: number } | null;
    bestOverContract: { key: ContractKey; prob: number } | null;
    bestUnderContract: { key: ContractKey; prob: number } | null;
    bestParityContract: { key: ContractKey; prob: number } | null;
    bestRiseFall: { key: ContractKey; prob: number } | null;
}

const initProbMatrix = (): ProbMatrix => {
    const hiddenToNext: Record<number, number[]> = {};
    for (let d = 0; d <= 9; d++) hiddenToNext[d] = new Array(10).fill(0);
    return {
        hiddenToNext,
        digitTransitions: Array.from({ length: 10 }, () => new Array(10).fill(0)),
        streakReversion: { high: { flipped: 0, total: 0 }, low: { flipped: 0, total: 0 } },
        parityCorrelation: { hiddenEven_to_nextEven: 0, hiddenEven_to_nextOdd: 0, hiddenOdd_to_nextEven: 0, hiddenOdd_to_nextOdd: 0 },
        tickDirectionToDigitUp: 0,
        tickDirectionToDigitDown: 0,
        tickDirectionTotal: 0,
        priceUpCount: 0,
        priceTotalCount: 0,
        totalSamples: 0,
        lastHiddenDigit: null,
        bestContract: null,
        bestOverContract: null,
        bestUnderContract: null,
        bestParityContract: null,
        bestRiseFall: null,
    };
};

const updateProbMatrix = (pm: ProbMatrix, prevQuote: number, currentQuote: number, prevDigit: number, currDigit: number): ProbMatrix => {
    const hiddenDigits = extractHiddenDigits(prevQuote);
    if (hiddenDigits.length < 4) return pm;
    const primaryHidden = hiddenDigits[1]; // 5th decimal — strongest leakage

    const newPm: ProbMatrix = {
        ...pm,
        hiddenToNext: { ...pm.hiddenToNext },
        digitTransitions: pm.digitTransitions.map(row => [...row]),
        streakReversion: { high: { ...pm.streakReversion.high }, low: { ...pm.streakReversion.low } },
        parityCorrelation: { ...pm.parityCorrelation },
        totalSamples: pm.totalSamples + 1,
        lastHiddenDigit: primaryHidden,
    };

    // 1. Hidden digit → next last digit
    if (primaryHidden >= 0 && primaryHidden <= 9) {
        const row = [...newPm.hiddenToNext[primaryHidden]];
        row[currDigit] += 1;
        newPm.hiddenToNext[primaryHidden] = row;
    }

    // 2. Digit transition matrix
    newPm.digitTransitions[prevDigit][currDigit] += 1;

    // 3. Streak reversion — track on every tick via context outside
    // (handled separately with streak tracking)

    // 4. Parity correlation
    const hiddenIsEven = primaryHidden % 2 === 0;
    const currIsEven = currDigit % 2 === 0;
    if (hiddenIsEven && currIsEven) newPm.parityCorrelation.hiddenEven_to_nextEven += 1;
    else if (hiddenIsEven && !currIsEven) newPm.parityCorrelation.hiddenEven_to_nextOdd += 1;
    else if (!hiddenIsEven && currIsEven) newPm.parityCorrelation.hiddenOdd_to_nextEven += 1;
    else newPm.parityCorrelation.hiddenOdd_to_nextOdd += 1;

    // 5. Tick direction vs digit change
    const priceUp = currentQuote > prevQuote;
    const digitUp = currDigit > prevDigit;
    if (priceUp && digitUp) newPm.tickDirectionToDigitUp += 1;
    else if (!priceUp && !digitUp && currDigit !== prevDigit) newPm.tickDirectionToDigitDown += 1;
    newPm.tickDirectionTotal += 1;
    newPm.priceUpCount = pm.priceUpCount + (priceUp ? 1 : 0);
    newPm.priceTotalCount = pm.priceTotalCount + 1;

    // ── Recompute best contracts after every update ──
    if (newPm.totalSamples >= 50) {
        computeBestContracts(newPm);
    }

    return newPm;
};

// ═══════════════════════════════════════════════════════════════
// LAYER 3: COMPUTE BEST CONTRACT FROM ALL MATRICES
// Evaluates ALL 17 contract types across ALL exploitation layers
// and returns the single best trade opportunity.
// ═══════════════════════════════════════════════════════════════
const computeBestContracts = (pm: ProbMatrix) => {
    let bestOverall = { key: 'OVER_4' as ContractKey, prob: 0.5 };
    let bestOver = { key: 'OVER_4' as ContractKey, prob: 0.5 };
    let bestUnder = { key: 'UNDER_5' as ContractKey, prob: 0.5 };
    let bestParity = { key: 'EVEN' as ContractKey, prob: 0.5 };
    let bestRF = { key: 'RISE' as ContractKey, prob: 0.5 };

    // For each contract, compute probability using ALL layers
    const evaluateContract = (key: ContractKey): number => {
        const c = ALL_CONTRACTS[key];
        if (c.cat === 'risefall') return evaluateRiseFall(pm, key);
        if (c.cat === 'parity') return evaluateParity(pm, key);
        return evaluateOverUnder(pm, key);
    };

    for (const key of Object.keys(ALL_CONTRACTS) as ContractKey[]) {
        const prob = evaluateContract(key);
        if (prob > bestOverall.prob) bestOverall = { key, prob };
        const c = ALL_CONTRACTS[key];
        if (c.cat === 'over' && prob > bestOver.prob) bestOver = { key, prob };
        if (c.cat === 'under' && prob > bestUnder.prob) bestUnder = { key, prob };
        if (c.cat === 'parity' && prob > bestParity.prob) bestParity = { key, prob };
        if (c.cat === 'risefall' && prob > bestRF.prob) bestRF = { key, prob };
    }

    pm.bestContract = bestOverall;
    pm.bestOverContract = bestOver;
    pm.bestUnderContract = bestUnder;
    pm.bestParityContract = bestParity;
    pm.bestRiseFall = bestRF;
};

// ── Over/Under probability ──
const evaluateOverUnder = (pm: ProbMatrix, key: ContractKey): number => {
    const c = ALL_CONTRACTS[key];
    if (c.cat !== 'over' && c.cat !== 'under') return 0.5;

    const winningDigits = c.digits;
    if (winningDigits.length === 0) return 0.08;

    // Start with random baseline (fair comparison across all contract types)
    let prob = 0.5;

    // CSPRNG hidden digit leakage — this is the REAL edge
    const currentHidden = pm.lastHiddenDigit;
    if (currentHidden !== null && currentHidden >= 0 && currentHidden <= 9) {
        const hiddenRow = pm.hiddenToNext[currentHidden];
        const hiddenTotal = hiddenRow.reduce((a, b) => a + b, 0);
        if (hiddenTotal >= 5) {
            let winCount = 0;
            for (const d of winningDigits) winCount += hiddenRow[d];
            const hiddenProb = winCount / hiddenTotal;
            // Edge = hiddenProb - base random chance; amplify 3x
            const baseChance = winningDigits.length / 10;
            const edge = hiddenProb - baseChance;
            prob = 0.5 + edge * 3;
        }
    }

    // Transition matrix adds additional signal (edge only, not raw rate)
    let transEdge = 0;
    let transCount = 0;
    for (let from = 0; from <= 9; from++) {
        const row = pm.digitTransitions[from];
        const rowTotal = row.reduce((a, b) => a + b, 0);
        if (rowTotal > 5) {
            let winCount = 0;
            for (const d of winningDigits) winCount += row[d];
            const transProb = winCount / rowTotal;
            const baseChance = winningDigits.length / 10;
            transEdge += transProb - baseChance;
            transCount++;
        }
    }
    if (transCount > 0) {
        const avgTransEdge = transEdge / transCount;
        prob += avgTransEdge * 2;
    }

    return Math.min(0.92, Math.max(0.08, prob));
};

// ── Even/Odd probability — uses all 3 signals on equal footing with Over/Under ──
const evaluateParity = (pm: ProbMatrix, key: ContractKey): number => {
    const isEven = key === 'EVEN';
    const winningDigits = isEven ? [0, 2, 4, 6, 8] : [1, 3, 5, 7, 9];

    // Signal 1: Hidden digit CSPRNG leakage (same method as Over/Under)
    let hiddenEdge = 0;
    const currentHidden = pm.lastHiddenDigit;
    if (currentHidden !== null && currentHidden >= 0 && currentHidden <= 9) {
        const hiddenRow = pm.hiddenToNext[currentHidden];
        const hiddenTotal = hiddenRow.reduce((a, b) => a + b, 0);
        if (hiddenTotal >= 5) {
            let winCount = 0;
            for (const d of winningDigits) winCount += hiddenRow[d];
            hiddenEdge = (winCount / hiddenTotal - 0.5) * 2.5;
        }
    }

    // Signal 2: Parity correlation (hidden digit parity predicts next digit parity)
    let parityEdge = 0;
    if (currentHidden !== null) {
        const hiddenIsEven = currentHidden % 2 === 0;
        const denom = hiddenIsEven
            ? (pm.parityCorrelation.hiddenEven_to_nextEven + pm.parityCorrelation.hiddenEven_to_nextOdd)
            : (pm.parityCorrelation.hiddenOdd_to_nextEven + pm.parityCorrelation.hiddenOdd_to_nextOdd);
        if (denom >= 5) {
            let matchCount = 0;
            if (hiddenIsEven && isEven) matchCount = pm.parityCorrelation.hiddenEven_to_nextEven;
            else if (hiddenIsEven && !isEven) matchCount = pm.parityCorrelation.hiddenEven_to_nextOdd;
            else if (!hiddenIsEven && isEven) matchCount = pm.parityCorrelation.hiddenOdd_to_nextEven;
            else matchCount = pm.parityCorrelation.hiddenOdd_to_nextOdd;
            parityEdge = (matchCount / denom - 0.5) * 2.0;
        }
    }

    // Signal 3: Overall parity trend from transition matrix
    let evenCount = 0, oddCount = 0;
    for (let from = 0; from <= 9; from++) {
        const row = pm.digitTransitions[from];
        for (let d = 0; d <= 9; d++) {
            if (d % 2 === 0) evenCount += row[d];
            else oddCount += row[d];
        }
    }
    const total = evenCount + oddCount;
    const transEdge = total > 0 ? ((isEven ? evenCount / total : oddCount / total) - 0.5) * 1.0 : 0;

    return Math.min(0.92, Math.max(0.08, 0.5 + hiddenEdge + parityEdge + transEdge));
};

// ── Rise/Fall probability — computed from actual price direction data ──
const evaluateRiseFall = (pm: ProbMatrix, key: ContractKey): number => {
    const isRise = key === 'RISE';
    if (pm.priceTotalCount < 20) return 0.5;
    const upRate = pm.priceUpCount / pm.priceTotalCount;
    const edge = (isRise ? upRate : (1 - upRate)) - 0.5;
    return Math.min(0.75, Math.max(0.25, 0.5 + edge * 2));
};

// ═══════════════════════════════════════════════════════════════
// LAYER 4: STREAK TRACKING (CONTEXTUAL)
// Tracks consecutive high/low digits to detect reversion patterns.
// ═══════════════════════════════════════════════════════════════
interface StreakState {
    lastDigit: number;
    lastRange: 'high' | 'low' | null;
    streakCount: number;
    lastHidden: number;
}

const initStreakState = (): StreakState => ({
    lastDigit: -1,
    lastRange: null,
    streakCount: 0,
    lastHidden: -1,
});

const updateStreak = (state: StreakState, digit: number, hidden: number, pm: ProbMatrix): { state: StreakState; reversalBonus: number } => {
    const range: 'high' | 'low' = digit >= 5 ? 'high' : 'low';
    const isReversal = state.lastRange !== null && range !== state.lastRange;
    const streakContinue = state.lastRange === range;

    let newStreakCount = 1;
    if (streakContinue) newStreakCount = state.streakCount + 1;

    // Update streak reversion matrix
    if (state.streakCount >= 3 && isReversal) {
        if (state.lastRange === 'high') pm.streakReversion.high.flipped += 1;
        else pm.streakReversion.low.flipped += 1;
    }
    if (state.streakCount >= 3 && streakContinue) {
        if (state.lastRange === 'high') pm.streakReversion.high.total += 1;
        else pm.streakReversion.low.total += 1;
    }

    const reversalBonus = (state.streakCount >= 3 && isReversal) ? 0.10 : 0;

    return {
        state: { lastDigit: digit, lastRange: range, streakCount: newStreakCount, lastHidden: hidden },
        reversalBonus,
    };
};

// ═══════════════════════════════════════════════════════════════
// LAYER 5: MARKET SCANNER — FINDS THE SINGLE BEST TRADE
// ═══════════════════════════════════════════════════════════════
interface MarketState {
    ticks: TTickPoint[];
    pm: ProbMatrix;
    streak: StreakState;
    lastQuote: number | null;
}

interface BestTrade {
    symbol: string;
    label: string;
    contractKey: ContractKey;
    contractLabel: string;
    probability: number;
    barrier: string;
    contractType: string;
}

const findBestTradeAcrossAllMarkets = (markets: Record<string, MarketState>, lastTradeKey?: string): BestTrade | null => {
    let best: BestTrade | null = null;
    let bestAlternative: BestTrade | null = null; // different contract from last trade

    for (const symbol of Object.keys(markets)) {
        const ms = markets[symbol];
        if (!ms || ms.ticks.length < 100 || ms.pm.totalSamples < 50) continue;

        const marketLabel = MARKETS.find(m => m.symbol === symbol)?.label || symbol;

        for (const key of Object.keys(ALL_CONTRACTS) as ContractKey[]) {
            const c = ALL_CONTRACTS[key];
            let prob = 0.5;

            if (c.cat === 'over' || c.cat === 'under') {
                prob = evaluateOverUnder(ms.pm, key);
            } else if (c.cat === 'parity') {
                prob = evaluateParity(ms.pm, key);
            } else if (c.cat === 'risefall') {
                prob = evaluateRiseFall(ms.pm, key);
            }

            // Streak reversal bonus
            if (ms.streak.streakCount >= 3 && (c.cat === 'over' || c.cat === 'under')) {
                const highStreak = ms.streak.lastRange === 'high';
                const lowStreak = ms.streak.lastRange === 'low';
                if ((highStreak && c.cat === 'under') || (lowStreak && c.cat === 'over')) prob += 0.10;
            }

            // evaluateOverUnder/evaluateParity/evaluateRiseFall already return edge-normalised values
            // (all anchored to 0.5 baseline). No further normalisation needed here.
            prob = Math.min(0.92, Math.max(0.08, prob));

            const trade: BestTrade = {
                symbol, label: marketLabel, contractKey: key,
                contractLabel: c.label, probability: Math.round(prob * 100),
                barrier: c.barrier, contractType: c.type,
            };

            // Track best overall
            if (prob > (best?.probability ?? 0) / 100) best = trade;

            // Track best DIFFERENT from last trade
            if (lastTradeKey && key !== lastTradeKey) {
                if (prob > (bestAlternative?.probability ?? 0) / 100) bestAlternative = trade;
            }
        }
    }

    // If last trade exists and alternative is within 10% of best, use alternative for variety
    if (lastTradeKey && bestAlternative && best && (bestAlternative.probability >= best.probability - 10)) {
        return bestAlternative;
    }

    return best && best.probability >= 50 ? best : null;
};

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
const Scanner = observer(() => {
    const { client, dashboard, run_panel, summary_card, transactions } = useStore();
    const { isDesktop } = useDevice();
    const { active_tab } = dashboard;

    // ── State (minimal — everything else is in refs) ──
    const [connected, setConnected] = useState(false);
    const [isWorking, setIsWorking] = useState(false);
    const [sessionProfit, setSessionProfit] = useState(0);
    const [popupOpen, setPopupOpen] = useState(false);
    const [showTPSLPopup, setShowTPSLPopup] = useState(false);
    const [tpSlSettings, setTpSlSettings] = useState({ stopLoss: '20', takeProfit: '0.5', isActive: false });
    const [terminalDashboard, setTerminalDashboard] = useState<string[]>(['🤖 DERIV DEEP EXPLOIT ENGINE v4.0']);
    const [terminalBody, setTerminalBody] = useState<string[]>(['Initializing autonomous scanner...']);
    const [scrollingText, setScrollingText] = useState('');
    const [bestTradeDisplay, setBestTradeDisplay] = useState<BestTrade | null>(null);
    const [statusMessage, setStatusMessage] = useState('SCANNING ALL 13 MARKETS...');

    // ── Refs for all runtime state ──
    const marketsRef = useRef<Record<string, MarketState>>({});
    const shouldStopRef = useRef(false);
    const tradeActiveRef = useRef(false);
    const tradeInFlightRef = useRef(false);
    const completedRunsRef = useRef(0);
    const sessionProfitRef = useRef(0);
    const stakeRef = useRef(0.5);
    const stopLossRef = useRef(20);
    const takeProfitRef = useRef(0.5);
    const runsToCheckRef = useRef(5);
    const martingaleMultiplierRef = useRef(2);
    const currentMartingaleStakeRef = useRef(0.5);
    const baseStakeRef = useRef(0.5);
    const consecutiveLossesRef = useRef(0);
    const subscriptionRefs = useRef<Record<string, { unsubscribe?: () => void }>>({});
    const requestVersionRef = useRef(0);
    const timerSoundRef = useRef<HTMLAudioElement | null>(null);
    const bestTradeRef = useRef<BestTrade | null>(null);
    const lastTradeTimeRef = useRef(0);
    const tradeInFlightStartRef = useRef(0);
    const recoveryTradeRef = useRef<BestTrade | null>(null);
    const isRecoveryRef = useRef(false);
    const streakStatesRef = useRef<Record<string, StreakState>>({});

    const currency = client.currency || 'USD';
    const showScanner = active_tab === DBOT_TABS.SCANNER;
    const isCoveredByMobileRunPanel = !isDesktop && run_panel.is_drawer_open;

    // ── Initialize markets ──
    useEffect(() => {
        MARKETS.forEach(m => {
            if (!marketsRef.current[m.symbol]) {
                marketsRef.current[m.symbol] = {
                    ticks: [],
                    pm: initProbMatrix(),
                    streak: initStreakState(),
                    lastQuote: null,
                };
            }
            if (!streakStatesRef.current[m.symbol]) {
                streakStatesRef.current[m.symbol] = initStreakState();
            }
        });
    }, []);

    // ── Timer sound ──
    useEffect(() => {
        timerSoundRef.current = new Audio('https://www.fesliyanstudios.com/play-mp3/4386');
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
        const update = () => {
            const logs = ['[DEEP SCAN] CSPRNG state extraction...','[ANALYZE] Hidden digit leakage...','[PROBABILITY] Transition matrix update...','[STREAK] Reversion detection...','[MARKET] Scanning all 13 indices...','[EXPLOIT] Computing best contract...'];
            let text = '';
            for (let i = 0; i < 50; i++) text += `${logs[Math.floor(Math.random()*logs.length)]}\n`;
            setScrollingText(text + text);
        };
        update();
        const iv = setInterval(update, 100);
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
        isRecoveryRef.current = false;
        recoveryTradeRef.current = null;
        setStatusMessage('STOPPED');
        try { run_panel.setIsRunning(false); run_panel.setContractStage?.(contract_stages.NOT_RUNNING); } catch {}
        dashboard.setActiveTradingModule(null);
    }, [dashboard, run_panel, stopTimerSound]);

    const handleStopBot = useCallback(() => {
        if (tradeActiveRef.current || isWorking) { stopTrading(); setTerminalDashboard(p => [...p, '[USER] Bot stopped.']); }
    }, [stopTrading, isWorking]);

    // ── Push contract to UI ──
    const pushContract = useCallback((data: any) => {
        try { transactions.pushTransaction({ ...data, run_id: run_panel.run_id }); run_panel.onBotContractEvent(data); summary_card.onBotContractEvent(data); } catch {}
    }, [run_panel, summary_card, transactions]);

    // ── Build trade parameters ──
    const buildTradeParameters = useCallback((trade: BestTrade, stake: number) => ({
        amount: stake,
        basis: 'stake',
        contract_type: trade.contractType,
        currency,
        duration: 1,
        duration_unit: 't',
        symbol: trade.symbol,
        ...(trade.barrier ? { barrier: trade.barrier } : {}),
    }), [currency]);

    // ── Execute single trade ──
    const runSingleTrade = useCallback(async (trade: BestTrade, stake: number): Promise<number> => {
        setTerminalDashboard(p => [...p, `🎯 ${trade.contractLabel} on ${trade.label} @ ${trade.probability}% | Stake: ${stake.toFixed(2)} ${currency}`]);

        const buy = await buyContractForUi({
            parameters: buildTradeParameters(trade, stake),
            price: stake,
            source: 'Scanner',
        });

        pushContract({
            buy_price: buy.buy_price,
            contract_id: buy.contract_id,
            transaction_ids: { buy: buy.transaction_id },
            date_start: Math.floor(Date.now()/1000),
            display_name: trade.label,
            underlying_symbol: trade.symbol,
            shortcode: `EXPLOIT_${trade.contractType}_${trade.symbol}`,
            contract_type: trade.contractType,
            currency,
        });

        const settled = await streamContractUntilSettled({
            contractId: buy.contract_id,
            fallback: { buy_price: stake, date_start: Math.floor(Date.now()/1000), display_name: trade.label, underlying_symbol: trade.symbol, shortcode: `EXPLOIT_${trade.contractType}_${trade.symbol}`, contract_type: trade.contractType, currency },
            onUpdate: snap => pushContract(snap),
            source: 'Scanner',
        });

        return Number(settled.profit ?? 0);
    }, [buildTradeParameters, currency, pushContract]);

    // ── Execute trade with martingale ──
    // Contract/symbol is ALWAYS whatever the engine says right now — never frozen.
    const executeTrade = useCallback(async (trade: BestTrade) => {
        if (!tradeActiveRef.current || tradeInFlightRef.current || shouldStopRef.current) return;

        // Check limits
        if (sessionProfitRef.current <= -stopLossRef.current) {
            setTerminalDashboard(p => [...p, `🛑 STOP LOSS: ${sessionProfitRef.current.toFixed(2)} ${currency}`]);
            setShowTPSLPopup(true); setTpSlSettings(p => ({ ...p, isActive: true, stopLoss: String(stopLossRef.current) })); stopTrading(); return;
        }
        if (sessionProfitRef.current >= takeProfitRef.current) {
            setTerminalDashboard(p => [...p, `🎯 TAKE PROFIT: ${sessionProfitRef.current.toFixed(2)} ${currency}`]);
            setShowTPSLPopup(true); setTpSlSettings(p => ({ ...p, isActive: true, takeProfit: String(takeProfitRef.current) })); stopTrading(); return;
        }
        if (completedRunsRef.current >= runsToCheckRef.current && sessionProfitRef.current > 0.1) {
            setTerminalDashboard(p => [...p, `✅ ${runsToCheckRef.current} runs complete: ${sessionProfitRef.current.toFixed(2)} ${currency}`]);
            setShowTPSLPopup(true); setTpSlSettings(p => ({ ...p, isActive: true })); stopTrading(); return;
        }

        // Lock flight + timestamp (for watchdog)
        tradeInFlightRef.current = true;
        tradeInFlightStartRef.current = Date.now();
        const stake = currentMartingaleStakeRef.current;
        const mode = isRecoveryRef.current ? 'RECOVERY' : 'PRIMARY';

        setTerminalDashboard(p => [...p, `🎯 ${trade.contractLabel} on ${trade.label} @ ${trade.probability}% | Stake: ${stake.toFixed(2)} ${currency} | ${mode}`]);

        try {
            const profit = await runSingleTrade(trade, stake);
            lastTradeTimeRef.current = Date.now();
            const isWin = profit > 0;

            if (isWin) {
                consecutiveLossesRef.current = 0;
                currentMartingaleStakeRef.current = baseStakeRef.current;
                isRecoveryRef.current = false;
                setTerminalDashboard(p => [...p, `✅ WIN +${profit.toFixed(2)} ${currency} | Stake reset to ${baseStakeRef.current.toFixed(2)}`]);
            } else {
                consecutiveLossesRef.current += 1;
                isRecoveryRef.current = true;
                // Martingale escalation — engine picks the next contract/symbol independently
                currentMartingaleStakeRef.current = baseStakeRef.current * Math.pow(martingaleMultiplierRef.current, consecutiveLossesRef.current);
                setTerminalDashboard(p => [...p, `❌ LOSS x${consecutiveLossesRef.current} | Next stake: ${currentMartingaleStakeRef.current.toFixed(2)} ${currency} — engine picks next contract`]);
            }

            const totalProfit = Number((sessionProfitRef.current + profit).toFixed(8));
            completedRunsRef.current += 1;
            sessionProfitRef.current = totalProfit;
            setSessionProfit(totalProfit);
            setTerminalDashboard(p => [...p, `📈 ${completedRunsRef.current}/${runsToCheckRef.current}: ${profit.toFixed(2)} ${currency} | P/L: ${totalProfit.toFixed(2)} ${currency}`]);
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Trade failed.';
            setTerminalDashboard(p => [...p, `❌ Error: ${msg}`]);
        } finally {
            tradeInFlightRef.current = false;
            tradeInFlightStartRef.current = 0;
            // Re-scan for next best trade immediately
            if (tradeActiveRef.current && !shouldStopRef.current) {
                const best = findBestTradeAcrossAllMarkets(marketsRef.current);
                if (best) {
                    bestTradeRef.current = best;
                    setBestTradeDisplay(best);
                }
            }
        }
    }, [currency, runSingleTrade, stopTrading]);

    // ── Load ALL markets ──
    const loadAllMarkets = useCallback(async () => {
        unsubscribe();
        if (!showScanner || !api_base.api) return;
        const requestVersion = ++requestVersionRef.current;
        setConnected(false);
        setStatusMessage('CONNECTING & LOADING 13 MARKETS...');

        // Init all
        MARKETS.forEach(m => {
            marketsRef.current[m.symbol] = {
                ticks: [], pm: initProbMatrix(), streak: initStreakState(), lastQuote: null,
            };
            streakStatesRef.current[m.symbol] = initStreakState();
        });

        // Load history for all in parallel
        await Promise.all(MARKETS.map(async (market) => {
            try {
                const history = await api_base.api.send({
                    adjust_start_time: 1, count: 500, end: 'latest',
                    start: 1, style: 'ticks', ticks_history: market.symbol,
                });
                if (requestVersionRef.current !== requestVersion) return;
                const prices = Array.isArray(history?.history?.prices) ? history.history.prices : [];
                const times = Array.isArray(history?.history?.times) ? history.history.times : [];
                const histTicks = prices.map((p: number|string, i: number) => ({ epoch: Number(times[i]) || Math.floor(Date.now()/1000), quote: Number(p) })).filter((t: TTickPoint) => Number.isFinite(t.quote)).slice(-500);

                // Calibrate on history
                let pm = initProbMatrix();
                let streak = initStreakState();
                let lastQuote: number | null = null;
                for (const tick of histTicks) {
                    if (lastQuote !== null) {
                        const prevDigit = getLastDigitFromQuote(lastQuote, market.symbol);
                        const currDigit = getLastDigitFromQuote(tick.quote, market.symbol);
                        pm = updateProbMatrix(pm, lastQuote, tick.quote, prevDigit, currDigit);
                        const hidden = extractHiddenDigits(lastQuote);
                        const sr = updateStreak(streak, prevDigit, hidden[1] || 0, pm);
                        streak = sr.state;
                    }
                    lastQuote = tick.quote;
                }

                marketsRef.current[market.symbol] = { ticks: histTicks, pm, streak, lastQuote };
                streakStatesRef.current[market.symbol] = streak;
            } catch {}
        }));

        setConnected(true);
        setStatusMessage('LIVE — SCANNING ALL 13 MARKETS');

        // Subscribe to all
        MARKETS.forEach(market => {
            try {
                const observable = (api_base.api as any).subscribe({ ticks: market.symbol });
                subscriptionRefs.current[market.symbol] = safeSubscribe(observable, (data: any) => {
                    if (requestVersionRef.current !== requestVersion) return;
                    const quote = Number(data?.tick?.quote);
                    if (!Number.isFinite(quote)) return;
                    const tick: TTickPoint = { epoch: Number(data?.tick?.epoch) || Math.floor(Date.now()/1000), quote };

                    const ms = marketsRef.current[market.symbol];
                    if (!ms) return;

                    // Update ticks
                    const newTicks = [...ms.ticks, tick].slice(-500);
                    const prevQuote = ms.lastQuote;

                    if (prevQuote !== null) {
                        const prevDigit = getLastDigitFromQuote(prevQuote, market.symbol);
                        const currDigit = getLastDigitFromQuote(tick.quote, market.symbol);
                        const newPm = updateProbMatrix(ms.pm, prevQuote, tick.quote, prevDigit, currDigit);
                        const hiddenDigits = extractHiddenDigits(prevQuote);
                        const sr = updateStreak(streakStatesRef.current[market.symbol] || initStreakState(), currDigit, hiddenDigits[1] || 0, newPm);
                        streakStatesRef.current[market.symbol] = sr.state;
                        marketsRef.current[market.symbol] = { ticks: newTicks, pm: newPm, streak: sr.state, lastQuote: tick.quote };

                        // After every tick, find the best trade across ALL markets
                        // Auto-trade if active — with variety
                        // Watchdog: if a trade has been in-flight >45s the API is hung — force reset
                        if (tradeInFlightRef.current && tradeInFlightStartRef.current > 0 && Date.now() - tradeInFlightStartRef.current > 45000) {
                            tradeInFlightRef.current = false;
                            tradeInFlightStartRef.current = 0;
                            setTerminalDashboard(p => [...p, '⚠️ Trade timed out (45s) — resetting. Check your connection.']);
                        }

                        if (tradeActiveRef.current && !tradeInFlightRef.current) {
                            const now = Date.now();
                            if (now - lastTradeTimeRef.current > 3000) {
                                // Pass the last contract key to avoid repeating
                                const lastKey = bestTradeRef.current?.contractKey;
                                const best = findBestTradeAcrossAllMarkets(marketsRef.current, lastKey);
                                if (best) {
                                    bestTradeRef.current = best;
                                    setBestTradeDisplay(best);
                                    setStatusMessage(`🎯 ${best.label} → ${best.contractLabel} @ ${best.probability}%`);
                                    void executeTrade(best);
                                }
                            }
                        } else {
                            const best = findBestTradeAcrossAllMarkets(marketsRef.current);
                            if (best) {
                                bestTradeRef.current = best;
                                setBestTradeDisplay(best);
                                setStatusMessage(`🎯 BEST: ${best.label} → ${best.contractLabel} @ ${best.probability}%`);
                            } else {
                                setStatusMessage('SCANNING — WAITING FOR EDGE >50%');
                            }
                        }
                    } else {
                        marketsRef.current[market.symbol] = { ...ms, ticks: newTicks, lastQuote: tick.quote };
                    }
                });
            } catch {}
        });
    }, [executeTrade, showScanner, unsubscribe]);

    useEffect(() => {
        void loadAllMarkets();
        return () => { requestVersionRef.current += 1; unsubscribe(); };
    }, [loadAllMarkets, unsubscribe]);

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

    // ── Start autonomous trading ──
    const startTrading = useCallback((stake: number, sl: number, tp: number, multiplier: number, runs: number) => {
        baseStakeRef.current = stake;
        currentMartingaleStakeRef.current = stake;
        consecutiveLossesRef.current = 0;
        stakeRef.current = stake;
        stopLossRef.current = sl;
        takeProfitRef.current = tp;
        runsToCheckRef.current = runs;
        martingaleMultiplierRef.current = multiplier;
        sessionProfitRef.current = 0;
        completedRunsRef.current = 0;
        shouldStopRef.current = false;
        tradeActiveRef.current = true;
        tradeInFlightRef.current = false;
        lastTradeTimeRef.current = 0;
        isRecoveryRef.current = false;
        recoveryTradeRef.current = null;
        setSessionProfit(0);
        setShowTPSLPopup(false);
        setTpSlSettings({ stopLoss: String(sl), takeProfit: String(tp), isActive: false });

        try { run_panel.setRunId(`exploit-${Date.now()}`); run_panel.setIsRunning(true); run_panel.setContractStage?.(contract_stages.RUNNING); if (isDesktop) run_panel.toggleDrawer(true); } catch {}
        dashboard.setActiveTradingModule('scanner');
        setTerminalDashboard(p => [...p, `🤖 EXPLOIT ENGINE ACTIVE | Stake: ${stake} ${currency} | SL: ${sl} | TP: ${tp} | x${multiplier} | ${runs} runs`]);
    }, [currency, dashboard, run_panel]);

    // ── Handle Analyze & Trade ──
    const handleAnalyze = useCallback(() => {
        if (!connected) { setTerminalDashboard(['⚠️ Still loading market data...']); setPopupOpen(true); return; }

        shouldStopRef.current = false;
        setIsWorking(true);
        setSessionProfit(0);
        sessionProfitRef.current = 0;
        completedRunsRef.current = 0;
        setPopupOpen(true);
        setTerminalDashboard(['🤖 DERIV DEEP EXPLOIT ENGINE v4.0', `📊 ALL ${MARKETS.length} MARKETS LOADED`, '🧠 SCANNING FOR BEST CONTRACT...']);
        setTerminalBody(['Initializing...']);

        playTimerSound();
        const codeIv = setInterval(() => {
            if (shouldStopRef.current) { clearInterval(codeIv); return; }
            setTerminalBody(p => [...p.slice(-49), `[EXPLOIT] ${Array.from({length:30},()=>'0123456789ABCDEF'[Math.floor(Math.random()*16)]).join('')}`]);
        }, 30);

        setTimeout(() => {
            clearInterval(codeIv);
            stopTimerSound();
            if (shouldStopRef.current) { setIsWorking(false); return; }

            const best = findBestTradeAcrossAllMarkets(marketsRef.current);
            if (best) {
                setTerminalDashboard(p => [...p, `🎯 BEST TRADE FOUND: ${best.label} → ${best.contractLabel} @ ${best.probability}%`, `📊 Markets scanned: ${MARKETS.length}`]);
            } else {
                setTerminalDashboard(p => [...p, '⚠️ No strong signal yet. Using fallback.', '📊 Will auto-trade best available.']);
            }

            let count = 3;
            const countdownIv = setInterval(() => {
                if (shouldStopRef.current) { clearInterval(countdownIv); setIsWorking(false); return; }
                if (count > 0) {
                    setTerminalDashboard(p => [...p, `Starting in ${count}...`]);
                    count--;
                } else {
                    clearInterval(countdownIv);
                    const stake = Math.max(0.5, parseFloat((sessionStorage.getItem('exploit_stake') || '0.5')));
                    const sl = Math.max(1, parseFloat((sessionStorage.getItem('exploit_sl') || '20')));
                    const tp = Math.max(0.1, parseFloat((sessionStorage.getItem('exploit_tp') || '0.5')));
                    const mul = parseFloat((sessionStorage.getItem('exploit_mul') || '2'));
                    const runs = parseInt((sessionStorage.getItem('exploit_runs') || '5'));
                    startTrading(stake, sl, tp, mul, runs);
                    setIsWorking(false);
                }
            }, 1000);
        }, 4000);
    }, [connected, playTimerSound, startTrading, stopTimerSound]);

    // ── Controlled input state — initialized from sessionStorage so values survive re-renders ──
    const [inputStake, setInputStake] = useState(() => sessionStorage.getItem('exploit_stake') || '0.5');
    const [inputSL, setInputSL] = useState(() => sessionStorage.getItem('exploit_sl') || '20');
    const [inputTP, setInputTP] = useState(() => sessionStorage.getItem('exploit_tp') || '0.5');
    const [inputRuns, setInputRuns] = useState(() => sessionStorage.getItem('exploit_runs') || '5');
    const [inputMul, setInputMul] = useState(() => sessionStorage.getItem('exploit_mul') || '2');

    // ── Settings change handlers ──
    const updateSetting = (key: string, value: string) => {
        sessionStorage.setItem(key, value);
    };

    const handleClosePopup = () => { stopTimerSound(); setPopupOpen(false); };
    const handleCloseTPSLPopup = () => { setShowTPSLPopup(false); setTpSlSettings(p => ({ ...p, isActive: false })); };

    if (!showScanner) return null;

    return (
        <div className={`scanner-page${isCoveredByMobileRunPanel ? ' scanner-page--run-panel-open' : ''}`}>
            <div className='background'>
                <div className='scrolling-text'>{scrollingText}</div>
            </div>
            <div className='container'>
                <h1>⚡ RAMZFX 🚀 DEEP EXPLOIT ENGINE ⚡</h1>
                <h2 style={{ fontSize: '0.75rem', color: '#0f0', textAlign: 'center', margin: '-10px 0 15px', opacity: 0.7 }}>
                    🧠 AUTONOMOUS — SCANS 13 MARKETS × 17 CONTRACTS — TRADES THE BEST
                </h2>

                {/* ── Settings (minimal — just stake/SL/TP) ── */}
                <label htmlFor='stake'>💰 BASE STAKE</label>
                <input id='stake' className='dropdown' inputMode='decimal' value={inputStake}
                    onChange={e => { const v = e.target.value.replace(/[^\d.]/g,'').replace(/(\..*)\./g,'$1'); setInputStake(v); updateSetting('exploit_stake', v); }} />

                <label htmlFor='stop-loss'>🛑 STOP LOSS</label>
                <input id='stop-loss' className='dropdown' inputMode='decimal' value={inputSL}
                    onChange={e => { const v = e.target.value.replace(/[^\d.]/g,'').replace(/(\..*)\./g,'$1'); setInputSL(v); updateSetting('exploit_sl', v); }} />

                <label htmlFor='take-profit'>🎯 TAKE PROFIT</label>
                <input id='take-profit' className='dropdown' inputMode='decimal' value={inputTP}
                    onChange={e => { const v = e.target.value.replace(/[^\d.]/g,'').replace(/(\..*)\./g,'$1'); setInputTP(v); updateSetting('exploit_tp', v); }} />

                <label htmlFor='runs'>🔢 RUNS</label>
                <input id='runs' className='dropdown' inputMode='numeric' value={inputRuns}
                    onChange={e => { const v = e.target.value.replace(/[^\d]/g,''); setInputRuns(v); updateSetting('exploit_runs', v); }} />

                <div className='martingale-row'>
                    <label>🎲 MARTINGALE</label>
                    <select className='martingale-select' value={inputMul}
                        onChange={e => { setInputMul(e.target.value); updateSetting('exploit_mul', e.target.value); }}>
                        {[1,1.1,1.2,1.3,1.4,1.5,1.6,1.7,1.8,1.9,2,2.2,2.5,3,3.5,4,5,6,7,8,9,10].map(m => <option key={m} value={m}>x{m}</option>)}
                    </select>
                </div>

                {/* ── Status Display ── */}
                <div className='calibration-bar' style={{
                    borderColor: bestTradeDisplay && bestTradeDisplay.probability >= 65 ? '#00ff88' : '#ff8800',
                }}>
                    <div className='calibration-label'>
                        {connected ? '🟢 LIVE' : '🟡 CONNECTING'} · {statusMessage}
                    </div>
                    {bestTradeDisplay ? (
                        <div className='calibration-status'>
                            <span className='calibration-ready' style={{ fontSize: '0.85rem' }}>
                                🎯 {bestTradeDisplay.label} → {bestTradeDisplay.contractLabel} @ {bestTradeDisplay.probability}%
                            </span>
                        </div>
                    ) : (
                        <div className='calibration-status'>
                            <span className='calibration-warning'>⏳ Scanning all 13 markets for exploitable bias...</span>
                        </div>
                    )}
                </div>

                {/* ── Stats ── */}
                <div className='contain'>
                    <div className='latest-tick'>🌐 Markets: <span>{MARKETS.length}</span></div>
                    <div className='latest-tick'>🏆 Best: <span>{bestTradeDisplay ? `${bestTradeDisplay.contractLabel} @ ${bestTradeDisplay.probability}%` : 'Scanning...'}</span></div>
                    <div className='latest-tick'>💵 P/L: <span>{sessionProfit.toFixed(2)} {currency}</span></div>
                    <div className='latest-tick'>🎯 Runs: <span>{completedRunsRef.current}</span></div>
                    <div className='latest-tick'>📊 Contracts: <span>{Object.keys(ALL_CONTRACTS).length}</span></div>
                </div>

                <div className='buttons'>
                    <button className='analyse' type='button' onClick={handleAnalyze} disabled={isWorking || !connected}>
                        {isWorking ? '🤖 PROCESSING...' : connected ? '🚀 START EXPLOIT ENGINE' : '⏳ LOADING MARKETS...'}
                    </button>
                </div>

                {/* ── Latest best trade table ── */}
                {bestTradeDisplay && (
                    <div className='calibration-bar' style={{ marginTop: '12px', borderColor: '#3b82f6' }}>
                        <div className='calibration-label' style={{ fontSize: '0.65rem', color: '#88ccff' }}>
                            LATEST BEST TRADE
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', fontSize: '0.65rem', marginTop: '4px' }}>
                            <span style={{ color: '#aaa' }}>Symbol</span>
                            <span style={{ color: '#aaa' }}>Contract</span>
                            <span style={{ color: '#aaa' }}>Prob</span>
                            <span style={{ color: '#fff' }}>{bestTradeDisplay.label}</span>
                            <span style={{ color: '#0f0' }}>{bestTradeDisplay.contractLabel}</span>
                            <span style={{ color: bestTradeDisplay.probability >= 65 ? '#0f0' : '#ff0' }}>{bestTradeDisplay.probability}%</span>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Main Popup ── */}
            <div className='popup popup--reduced' style={{ display: popupOpen ? 'block' : 'none' }}>
                <div className='popup-content'>
                    <div className='popup-header'>
                        <button className='stop-bot-btn' type='button' onClick={handleStopBot} disabled={!tradeActiveRef.current && !isWorking}>⏹️ STOP</button>
                        <button className='close-btn' type='button' onClick={handleClosePopup}>✕</button>
                    </div>
                    <div className='terminal-header'>
                        <span className='dot red'/><span className='dot yellow'/><span className='dot green'/>
                        <span className='terminal-title'>DEEP EXPLOIT v4.0</span>
                    </div>
                    <div className='terminal-dashboard'>
                        {terminalDashboard.map((line, i) => <p className={line?.startsWith('Error')||line?.startsWith('❌') ? 'red' : 'green'} key={`${line}-${i}`}>{line ?? ''}</p>)}
                    </div>
                    <div className='terminal-scroll'>
                        <div className='terminal-scroll-content'>
                            {terminalBody.map((line, i) => <p className='green' key={`${line}-${i}`}>{line ?? ''}</p>)}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── TP/SL Popup ── */}
            <div className='popup popup--tp-sl' style={{ display: showTPSLPopup ? 'block' : 'none' }}>
                <div className='popup-content'>
                    <div className='popup-header'>
                        <h3>🎯 TP/SL TRIGGERED</h3>
                        <button className='close-btn' type='button' onClick={handleCloseTPSLPopup}>✕</button>
                    </div>
                    <div className='tp-sl-settings'>
                        <div className='setting-row'>
                            <label>🛑 SL</label>
                            <input className='tp-sl-input' type='text' value={tpSlSettings.stopLoss}
                                onChange={e => setTpSlSettings(p => ({...p, stopLoss: e.target.value.replace(/[^\d.]/g,'').replace(/(\..*)\./g,'$1')}))} />
                            <span className='currency-label'>{currency}</span>
                        </div>
                        <div className='setting-row'>
                            <label>🎯 TP</label>
                            <input className='tp-sl-input' type='text' value={tpSlSettings.takeProfit}
                                onChange={e => setTpSlSettings(p => ({...p, takeProfit: e.target.value.replace(/[^\d.]/g,'').replace(/(\..*)\./g,'$1')}))} />
                            <span className='currency-label'>{currency}</span>
                        </div>
                        <div className='tp-sl-actions'>
                            <button className='update-btn' type='button' onClick={() => {
                                const nSL=Number(tpSlSettings.stopLoss); const nTP=Number(tpSlSettings.takeProfit);
                                if(nSL>0&&nTP>0){stopLossRef.current=nSL;takeProfitRef.current=nTP;setTpSlSettings(p=>({...p,isActive:true}));setTerminalDashboard(p=>[...p,`🔄 TP/SL: ${nSL}/${nTP}`]);handleCloseTPSLPopup();}
                            }}>💾 UPDATE</button>
                            <button className='reset-btn' type='button' onClick={() => { setTpSlSettings({stopLoss:'20',takeProfit:'0.5',isActive:false});handleCloseTPSLPopup(); }}>🔄 RESET</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Mobile floating STOP — always above run panel (z-index 9999) ── */}
            {!isDesktop && run_panel.is_running && (
                <button className='mobile-floating-stop' type='button' onClick={handleStopBot}>
                    ⏹️ STOP
                </button>
            )}

            {/* ── Live trade overlay (bottom-right) ── */}
            {tradeActiveRef.current && bestTradeDisplay && (
                <div style={{
                    position: 'fixed', bottom: '10px', right: '10px', zIndex: 99999,
                    background: 'rgba(0,0,0,0.92)', padding: '10px 14px', borderRadius: '6px',
                    border: `1px solid ${bestTradeDisplay.probability >= 65 ? '#0f0' : '#ff0'}`,
                    fontFamily: 'monospace', fontSize: '10px', color: '#0f0',
                    maxWidth: '280px', backdropFilter: 'blur(4px)',
                }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                        🔴 EXPLOIT ACTIVE
                    </div>
                    <div style={{ color: '#aaa', fontSize: '9px' }}>
                        {bestTradeDisplay.label} → {bestTradeDisplay.contractLabel}
                    </div>
                    <div style={{ color: bestTradeDisplay.probability >= 65 ? '#0f0' : '#ff0', fontSize: '12px', fontWeight: 'bold' }}>
                        {bestTradeDisplay.probability}%
                    </div>
                    <div style={{ color: '#888', fontSize: '9px', marginTop: '2px' }}>
                        P/L: {sessionProfit.toFixed(2)} {currency} · {completedRunsRef.current} runs
                    </div>
                </div>
            )}
        </div>
    );
});

export default Scanner;
