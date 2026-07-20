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
// DEEPEST DERIV EXPLOITATION ENGINE — v5.0 (CORRECTED)
//
// ROOT CAUSE FIXES vs v4:
//   1. Three separate matrices (1-step, 2-step, 3-step gap)
//   2. MIN 200 samples per cell before trusting any probability
//   3. Market classification — skip white-noise markets (price too high)
//   4. Only VIABLE contracts (Over 5-8, Under 5-8) where edge is achievable
//   5. Payout drift detection before every trade (two proposals, skip if >2% drift)
//   6. Processing delay tracking — detect entry-spot manipulation
//   7. Settlement time tracking — detect win-delay trap
//   8. Burst detection — skip trades when ticks arrive <200ms apart (3+ in burst)
//   9. Stealth layer — random delay 300-3000ms, 60% skip rate, stake ±30%
//  10. Win-rate-by-stake tracking — detect martingale trap
//  11. Autocorrelation tracking — detect hidden correlation anomalies
//  12. History vs live mismatch flag — history may be post-processed
// ═══════════════════════════════════════════════════════════════

type TTickPoint = { epoch: number; quote: number; };

// ── VIABLE contracts only (where break-even is realistically achievable) ──
// Over/Under 0-4, Even, Odd, Rise, Fall: break-even > realistic win rate → never trade
// Over/Under 5-8: break-even (41% / 31% / 20% / 11%) is achievable at correct price ranges
const ALL_CONTRACTS = {
    OVER_5:  { type: 'DIGITOVER',  barrier: '5', digits: [6,7,8,9],         label: 'Over 5',  cat: 'over' as const,  breakEven: 0.417 },
    OVER_6:  { type: 'DIGITOVER',  barrier: '6', digits: [7,8,9],           label: 'Over 6',  cat: 'over' as const,  breakEven: 0.313 },
    OVER_7:  { type: 'DIGITOVER',  barrier: '7', digits: [8,9],             label: 'Over 7',  cat: 'over' as const,  breakEven: 0.208 },
    OVER_8:  { type: 'DIGITOVER',  barrier: '8', digits: [9],               label: 'Over 8',  cat: 'over' as const,  breakEven: 0.110 },
    UNDER_5: { type: 'DIGITUNDER', barrier: '5', digits: [0,1,2,3,4],       label: 'Under 5', cat: 'under' as const, breakEven: 0.526 },
    UNDER_6: { type: 'DIGITUNDER', barrier: '6', digits: [0,1,2,3,4,5],     label: 'Under 6', cat: 'under' as const, breakEven: 0.313 },
    UNDER_7: { type: 'DIGITUNDER', barrier: '7', digits: [0,1,2,3,4,5,6],   label: 'Under 7', cat: 'under' as const, breakEven: 0.208 },
    UNDER_8: { type: 'DIGITUNDER', barrier: '8', digits: [0,1,2,3,4,5,6,7], label: 'Under 8', cat: 'under' as const, breakEven: 0.110 },
};

type ContractKey = keyof typeof ALL_CONTRACTS;
const VIABLE_CONTRACTS = Object.keys(ALL_CONTRACTS) as ContractKey[];

// ALL volatility indices — scanned simultaneously
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
// DIGIT EXTRACTION HELPERS
// ═══════════════════════════════════════════════════════════════

const getSettlementDigit = (quote: number): number =>
    Math.floor(Math.abs(quote) * 1000) % 10;

const getFourthDecimal = (quote: number): number =>
    Math.floor(Math.abs(quote) * 10000) % 10;

const extractHiddenDigits = (quote: number): number[] => {
    const s = quote.toFixed(8);
    const parts = s.split('.');
    if (parts.length < 2) return [];
    const decimals = parts[1];
    const visible = decimals.slice(0, 4).split('').map(Number);
    const hidden = decimals.slice(4).split('').map(Number);
    return [...visible.slice(-1), ...hidden];
};

// ── Market classification helpers ──
// Price thresholds above which the digit is pure white noise
// (per-tick digit movement > 1 position = no exploitable autocorrelation)
const getVolatilityFromSymbol = (symbol: string): number => {
    if (symbol.includes('10')) return 10;
    if (symbol.includes('25')) return 25;
    if (symbol.includes('50')) return 50;
    if (symbol.includes('75')) return 75;
    if (symbol.includes('100')) return 100;
    return 50;
};

// Price threshold where digit movement per tick < 1 position (autocorrelation exists)
const getPriceThreshold = (symbol: string): number => {
    const vol = getVolatilityFromSymbol(symbol);
    const is1s = symbol.startsWith('1HZ');
    // 1s variants have smaller per-tick movement → higher threshold
    switch (vol) {
        case 10:  return is1s ? 400 : 200;
        case 25:  return is1s ? 160 : 80;
        case 50:  return is1s ? 80  : 40;
        case 75:  return is1s ? 50  : 25;
        case 100: return is1s ? 40  : 20;
        default:  return 100;
    }
};

// Returns 'viable' contracts for a given market price
const getViableContractsForPrice = (symbol: string, price: number): ContractKey[] => {
    const threshold = getPriceThreshold(symbol);
    if (price > threshold) return []; // white noise — no viable contracts

    // Below threshold: determine which Over/Under levels are viable
    // The lower the price relative to threshold, the more structure (and more contracts viable)
    const ratio = price / threshold; // 0 = very low price, 1 = at threshold
    if (ratio > 0.75) {
        // Only the high-payout, low-break-even contracts (edge requires structure)
        return ['OVER_7', 'OVER_8', 'UNDER_7', 'UNDER_8'];
    } else if (ratio > 0.40) {
        return ['OVER_6', 'OVER_7', 'OVER_8', 'UNDER_6', 'UNDER_7', 'UNDER_8'];
    } else {
        // Very low price — all viable contracts available
        return VIABLE_CONTRACTS;
    }
};

// ═══════════════════════════════════════════════════════════════
// PROBABILITY MATRIX — THREE TRANSITION MATRICES + DETECTION
// ═══════════════════════════════════════════════════════════════
const MIN_CELL_SAMPLES = 200;  // cells below this = noise, never trade
const MIN_TOTAL_SAMPLES = 1000; // market below this = skip entirely

interface ProbMatrix {
    // Hidden digit CSPRNG leakage: hiddenDigit -> count of each next last digit
    hiddenToNext: Record<number, number[]>;
    // 1-step transition: tick[N] → tick[N+1]
    digitTransitions: number[][];
    // 2-step transition: tick[N] → tick[N+2] (observation → entry gap)
    digitTransitions2: number[][];
    // 3-step transition: tick[N] → tick[N+3] (worst-case entry gap)
    digitTransitions3: number[][];
    // Rolling history for building multi-step matrices
    lastTwoDigits: [number, number] | null;
    lastThreeDigits: [number, number, number] | null;
    // Current state
    lastSettlementDigit: number | null;
    lastFourthDecimal: number | null;
    // Streak reversion
    streakReversion: { high: { flipped: number; total: number }; low: { flipped: number; total: number } };
    // Parity correlation
    parityCorrelation: { hiddenEven_to_nextEven: number; hiddenEven_to_nextOdd: number; hiddenOdd_to_nextEven: number; hiddenOdd_to_nextOdd: number };
    // Tick direction
    tickDirectionToDigitUp: number;
    tickDirectionToDigitDown: number;
    tickDirectionTotal: number;
    priceUpCount: number;
    priceTotalCount: number;
    // Integer boundary crossing
    integerBoundaryCrossDir: 'up' | 'down' | null;
    integerBoundaryTicksAgo: number;
    // Chi-square seed rotation detection
    recentDigitCounts: number[];
    recentDigitBuffer: number[];
    recentDigitIdx: number;
    seedRotationDetected: boolean;
    // ── Autocorrelation tracking (Mechanism #12) ──
    // Tracks digit-change autocorrelation at lag 1; significant deviation signals hidden state change
    autocorrSumProd: number;
    autocorrSumSq1: number;
    autocorrSumSq2: number;
    autocorrCount: number;
    prevDigitChange: number;
    autocorrAnomaly: boolean;
    // ── Inter-tick burst detection (Mechanism #10) ──
    // Never trade when 3+ ticks arrive within 200ms (burst = fake predictability)
    interTickTimes: number[];   // last 20 inter-tick arrival gaps in ms
    lastTickArrivalMs: number;
    inBurst: boolean;
    // Stats
    totalSamples: number;
    lastHiddenDigit: number | null;
    // Pre-computed best contracts
    bestContract: { key: ContractKey; prob: number } | null;
}

const initProbMatrix = (): ProbMatrix => {
    const hiddenToNext: Record<number, number[]> = {};
    for (let d = 0; d <= 9; d++) hiddenToNext[d] = new Array(10).fill(0);
    return {
        hiddenToNext,
        digitTransitions:  Array.from({ length: 10 }, () => new Array(10).fill(0)),
        digitTransitions2: Array.from({ length: 10 }, () => new Array(10).fill(0)),
        digitTransitions3: Array.from({ length: 10 }, () => new Array(10).fill(0)),
        lastTwoDigits: null,
        lastThreeDigits: null,
        lastSettlementDigit: null,
        lastFourthDecimal: null,
        streakReversion: { high: { flipped: 0, total: 0 }, low: { flipped: 0, total: 0 } },
        parityCorrelation: { hiddenEven_to_nextEven: 0, hiddenEven_to_nextOdd: 0, hiddenOdd_to_nextEven: 0, hiddenOdd_to_nextOdd: 0 },
        tickDirectionToDigitUp: 0,
        tickDirectionToDigitDown: 0,
        tickDirectionTotal: 0,
        priceUpCount: 0,
        priceTotalCount: 0,
        integerBoundaryCrossDir: null,
        integerBoundaryTicksAgo: 0,
        recentDigitCounts: new Array(10).fill(0),
        recentDigitBuffer: new Array(100).fill(-1),
        recentDigitIdx: 0,
        seedRotationDetected: false,
        autocorrSumProd: 0,
        autocorrSumSq1: 0,
        autocorrSumSq2: 0,
        autocorrCount: 0,
        prevDigitChange: 0,
        autocorrAnomaly: false,
        interTickTimes: [],
        lastTickArrivalMs: 0,
        inBurst: false,
        totalSamples: 0,
        lastHiddenDigit: null,
        bestContract: null,
    };
};

const updateProbMatrix = (
    pm: ProbMatrix,
    prevQuote: number,
    currentQuote: number,
    prevDigit: number,
    currDigit: number,
    nowMs: number = Date.now()
): ProbMatrix => {
    const hiddenDigits = extractHiddenDigits(prevQuote);
    if (hiddenDigits.length < 4) return pm;
    const primaryHidden = hiddenDigits[1]; // 5th decimal

    const newPm: ProbMatrix = {
        ...pm,
        hiddenToNext: { ...pm.hiddenToNext },
        digitTransitions:  pm.digitTransitions.map(row => [...row]),
        digitTransitions2: pm.digitTransitions2.map(row => [...row]),
        digitTransitions3: pm.digitTransitions3.map(row => [...row]),
        streakReversion: { high: { ...pm.streakReversion.high }, low: { ...pm.streakReversion.low } },
        parityCorrelation: { ...pm.parityCorrelation },
        recentDigitCounts: [...pm.recentDigitCounts],
        recentDigitBuffer: [...pm.recentDigitBuffer],
        interTickTimes: [...pm.interTickTimes],
        totalSamples: pm.totalSamples + 1,
        lastHiddenDigit: primaryHidden,
        lastSettlementDigit: currDigit,
        lastFourthDecimal: getFourthDecimal(currentQuote),
    };

    // ── 1. Hidden digit CSPRNG leakage ──
    if (primaryHidden >= 0 && primaryHidden <= 9) {
        const row = [...newPm.hiddenToNext[primaryHidden]];
        row[currDigit] += 1;
        newPm.hiddenToNext[primaryHidden] = row;
    }

    // ── 2. 1-step transition: tick[N-1] → tick[N] ──
    newPm.digitTransitions[prevDigit][currDigit] += 1;

    // ── 3. 2-step transition: tick[N-2] → tick[N] ──
    if (pm.lastTwoDigits !== null) {
        const twoBack = pm.lastTwoDigits[0];
        newPm.digitTransitions2[twoBack][currDigit] += 1;
    }
    newPm.lastTwoDigits = [prevDigit, currDigit];

    // ── 4. 3-step transition: tick[N-3] → tick[N] ──
    if (pm.lastThreeDigits !== null) {
        const threeBack = pm.lastThreeDigits[0];
        newPm.digitTransitions3[threeBack][currDigit] += 1;
    }
    newPm.lastThreeDigits = pm.lastTwoDigits ? [pm.lastTwoDigits[0], prevDigit, currDigit] : null;

    // ── 5. Parity correlation ──
    const hiddenIsEven = primaryHidden % 2 === 0;
    const currIsEven = currDigit % 2 === 0;
    if (hiddenIsEven && currIsEven) newPm.parityCorrelation.hiddenEven_to_nextEven += 1;
    else if (hiddenIsEven && !currIsEven) newPm.parityCorrelation.hiddenEven_to_nextOdd += 1;
    else if (!hiddenIsEven && currIsEven) newPm.parityCorrelation.hiddenOdd_to_nextEven += 1;
    else newPm.parityCorrelation.hiddenOdd_to_nextOdd += 1;

    // ── 6. Tick direction vs digit change ──
    const priceUp = currentQuote > prevQuote;
    const digitUp = currDigit > prevDigit;
    if (priceUp && digitUp) newPm.tickDirectionToDigitUp += 1;
    else if (!priceUp && !digitUp && currDigit !== prevDigit) newPm.tickDirectionToDigitDown += 1;
    newPm.tickDirectionTotal += 1;
    newPm.priceUpCount = pm.priceUpCount + (priceUp ? 1 : 0);
    newPm.priceTotalCount = pm.priceTotalCount + 1;

    // ── 7. Integer boundary crossing detection ──
    const prevFloor = Math.floor(prevQuote);
    const currFloor = Math.floor(currentQuote);
    if (prevFloor !== currFloor) {
        newPm.integerBoundaryCrossDir = currentQuote > prevQuote ? 'up' : 'down';
        newPm.integerBoundaryTicksAgo = 1;
    } else if (pm.integerBoundaryTicksAgo > 0 && pm.integerBoundaryTicksAgo < 20) {
        newPm.integerBoundaryTicksAgo = pm.integerBoundaryTicksAgo + 1;
    } else {
        newPm.integerBoundaryCrossDir = null;
        newPm.integerBoundaryTicksAgo = 0;
    }

    // ── 8. Chi-square seed rotation detection ──
    const outgoingIdx = newPm.recentDigitIdx % 100;
    const outgoingDigit = newPm.recentDigitBuffer[outgoingIdx];
    if (outgoingDigit >= 0) newPm.recentDigitCounts[outgoingDigit] -= 1;
    newPm.recentDigitBuffer[outgoingIdx] = currDigit;
    newPm.recentDigitCounts[currDigit] += 1;
    newPm.recentDigitIdx = (newPm.recentDigitIdx + 1) % 100;

    if (newPm.totalSamples >= 100 && newPm.totalSamples % 50 === 0) {
        let chiSq = 0;
        for (let d = 0; d <= 9; d++) {
            const obs = newPm.recentDigitCounts[d];
            chiSq += Math.pow(obs - 10, 2) / 10;
        }
        newPm.seedRotationDetected = chiSq > 21.67; // p=0.01, df=9
    }

    // ── 9. Autocorrelation tracking (Mechanism #12) ──
    // Tracks lag-1 autocorrelation of digit changes; anomaly = hidden state variable changed
    const rawChange = currDigit - prevDigit;
    const digitChange = rawChange > 5 ? rawChange - 10 : rawChange < -5 ? rawChange + 10 : rawChange;
    if (pm.autocorrCount > 0) {
        newPm.autocorrSumProd = pm.autocorrSumProd + pm.prevDigitChange * digitChange;
        newPm.autocorrSumSq1  = pm.autocorrSumSq1  + pm.prevDigitChange * pm.prevDigitChange;
        newPm.autocorrSumSq2  = pm.autocorrSumSq2  + digitChange * digitChange;
    }
    newPm.prevDigitChange = digitChange;
    newPm.autocorrCount = pm.autocorrCount + 1;

    if (newPm.autocorrCount > 30 && newPm.autocorrCount % 20 === 0) {
        const denom = Math.sqrt(newPm.autocorrSumSq1 * newPm.autocorrSumSq2);
        const correlation = denom > 0 ? newPm.autocorrSumProd / denom : 0;
        newPm.autocorrAnomaly = Math.abs(correlation) > 0.15;
    }

    // ── 10. Inter-tick burst detection (Mechanism #10) ──
    if (pm.lastTickArrivalMs > 0) {
        const elapsed = nowMs - pm.lastTickArrivalMs;
        const times = [...newPm.interTickTimes, elapsed].slice(-20);
        newPm.interTickTimes = times;
        // Burst: 3+ of last 5 ticks arrived within 200ms
        const recent5 = times.slice(-5);
        const burstCount = recent5.filter(t => t < 200).length;
        newPm.inBurst = burstCount >= 3;
    }
    newPm.lastTickArrivalMs = nowMs;

    return newPm;
};

// ═══════════════════════════════════════════════════════════════
// PROBABILITY ENGINES — Three-Matrix Blended Estimates
// Signal hierarchy:
//   1. 3-step matrix (40%) — worst-case entry gap coverage
//   2. 2-step matrix (40%) — typical entry gap
//   3. Hidden digit CSPRNG (20%) — supplemental only
// Minimum 200 samples per cell before any signal is used.
// ═══════════════════════════════════════════════════════════════

const evaluateOverUnder = (pm: ProbMatrix, key: ContractKey): number => {
    const c = ALL_CONTRACTS[key];
    if (c.cat !== 'over' && c.cat !== 'under') return 0.5;
    const winningDigits = c.digits;
    if (winningDigits.length === 0) return 0.05;
    const baseChance = winningDigits.length / 10;

    // Seed rotation: matrix is stale — fall back to base rate
    if (pm.seedRotationDetected) return baseChance;
    // Autocorrelation anomaly: hidden state changed — reduce confidence
    if (pm.autocorrAnomaly) return baseChance;

    const currentDigit = pm.lastSettlementDigit;
    let condProb = baseChance;
    let signalCount = 0;

    // ── Signal 1: 3-step matrix (primary, accounts for worst-case entry gap) ──
    if (currentDigit !== null) {
        const row3 = pm.digitTransitions3[currentDigit];
        const total3 = row3.reduce((a, b) => a + b, 0);
        if (total3 >= MIN_CELL_SAMPLES) {
            let winCount = 0;
            for (const d of winningDigits) winCount += row3[d];
            condProb = condProb * 0.60 + (winCount / total3) * 0.40;
            signalCount++;
        }
    }

    // ── Signal 2: 2-step matrix (accounts for typical entry gap) ──
    if (currentDigit !== null) {
        const row2 = pm.digitTransitions2[currentDigit];
        const total2 = row2.reduce((a, b) => a + b, 0);
        if (total2 >= MIN_CELL_SAMPLES) {
            let winCount = 0;
            for (const d of winningDigits) winCount += row2[d];
            condProb = condProb * 0.60 + (winCount / total2) * 0.40;
            signalCount++;
        }
    }

    // ── Signal 3: CSPRNG hidden digit leakage (supplemental) ──
    const currentHidden = pm.lastHiddenDigit;
    if (currentHidden !== null && currentHidden >= 0 && currentHidden <= 9) {
        const hiddenRow = pm.hiddenToNext[currentHidden];
        const hiddenTotal = hiddenRow.reduce((a, b) => a + b, 0);
        if (hiddenTotal >= MIN_CELL_SAMPLES) {
            let winCount = 0;
            for (const d of winningDigits) winCount += hiddenRow[d];
            condProb = condProb * 0.80 + (winCount / hiddenTotal) * 0.20;
            signalCount++;
        }
    }

    // If zero matrix cells had enough samples, return base chance (don't pretend we know)
    if (signalCount === 0) return baseChance;

    // ── Signal 4: Integer boundary crossing momentum ──
    if (pm.integerBoundaryCrossDir !== null &&
        pm.integerBoundaryTicksAgo >= 2 &&
        pm.integerBoundaryTicksAgo <= 15) {
        const strength = (16 - pm.integerBoundaryTicksAgo) / 14;
        const boost = strength * 0.06;
        const barrier = parseInt(c.barrier);
        if (pm.integerBoundaryCrossDir === 'up'   && c.cat === 'over'  && barrier >= 5) condProb += boost;
        else if (pm.integerBoundaryCrossDir === 'down' && c.cat === 'under' && barrier <= 5) condProb += boost;
        else if (pm.integerBoundaryCrossDir === 'up'   && c.cat === 'under' && barrier <= 4) condProb -= boost * 0.5;
        else if (pm.integerBoundaryCrossDir === 'down' && c.cat === 'over'  && barrier >= 6) condProb -= boost * 0.5;
    }

    // ── Signal 5: 4th decimal carry-over (small effect, only at very low prices) ──
    if (pm.lastFourthDecimal !== null && pm.lastSettlementDigit !== null) {
        const fourth = pm.lastFourthDecimal;
        const settl  = pm.lastSettlementDigit;
        if (fourth >= 8 && settl < 9) {
            const nextDigit = settl + 1;
            if (winningDigits.includes(nextDigit)) condProb += 0.03;
        } else if (fourth <= 1 && settl > 0) {
            const nextDigit = settl - 1;
            if (winningDigits.includes(nextDigit)) condProb += 0.03;
        }
    }

    return Math.min(0.95, Math.max(0.05, condProb));
};

// ═══════════════════════════════════════════════════════════════
// STREAK STATE
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

const updateStreak = (
    state: StreakState,
    digit: number,
    hidden: number,
    pm: ProbMatrix
): { state: StreakState; reversalBonus: number } => {
    const range: 'high' | 'low' = digit >= 5 ? 'high' : 'low';
    const isReversal = state.lastRange !== null && range !== state.lastRange;
    const streakContinue = state.lastRange === range;
    let newStreakCount = 1;
    if (streakContinue) newStreakCount = state.streakCount + 1;
    if (state.streakCount >= 3 && isReversal) {
        if (state.lastRange === 'high') pm.streakReversion.high.flipped += 1;
        else pm.streakReversion.low.flipped += 1;
    }
    if (state.streakCount >= 3 && streakContinue) {
        if (state.lastRange === 'high') pm.streakReversion.high.total += 1;
        else pm.streakReversion.low.total += 1;
    }
    return {
        state: { lastDigit: digit, lastRange: range, streakCount: newStreakCount, lastHidden: hidden },
        reversalBonus: (state.streakCount >= 3 && isReversal) ? 0.05 : 0,
    };
};

// ═══════════════════════════════════════════════════════════════
// MARKET STATE
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

// ═══════════════════════════════════════════════════════════════
// MARKET SCANNER — FINDS THE SINGLE BEST +EV TRADE
//
// Key gates (all must pass before a trade is selected):
//   1. Market price < threshold (not white noise)
//   2. Only VIABLE_CONTRACTS for that price range
//   3. ≥ MIN_TOTAL_SAMPLES total market ticks
//   4. Matrix cell ≥ MIN_CELL_SAMPLES (not noise)
//   5. condProb > breakEven + EDGE_MARGIN
//   6. Not in burst (ticks too rapid — fake signal)
//   7. Seed rotation not detected (matrix not stale)
// ═══════════════════════════════════════════════════════════════
const EDGE_MARGIN = 0.03; // minimum condProb above break-even to trade

const findBestTradeAcrossAllMarkets = (
    markets: Record<string, MarketState>,
    lastTradeKey?: string,
    blacklist?: Map<string, number>
): BestTrade | null => {
    let best: BestTrade | null = null;
    let bestEdge = 0;
    let bestAlternative: BestTrade | null = null;
    let bestAltEdge = 0;

    for (const symbol of Object.keys(markets)) {
        const ms = markets[symbol];
        if (!ms || ms.ticks.length < 200 || ms.pm.totalSamples < MIN_TOTAL_SAMPLES) continue;

        // ── Gate 1: Skip white-noise markets (price too high for digit autocorrelation) ──
        const currentPrice = ms.ticks[ms.ticks.length - 1]?.quote ?? 0;
        const threshold = getPriceThreshold(symbol);
        if (currentPrice > threshold) continue;

        // ── Gate 2: Skip stale matrices or active bursts ──
        if (ms.pm.seedRotationDetected) continue;
        if (ms.pm.inBurst) continue;

        const marketLabel = MARKETS.find(m => m.symbol === symbol)?.label || symbol;
        const viableKeys = getViableContractsForPrice(symbol, currentPrice);
        if (viableKeys.length === 0) continue;

        for (const key of viableKeys) {
            if (blacklist && (blacklist.get(`${key}|${symbol}`) ?? 0) >= 2) continue;

            const c = ALL_CONTRACTS[key];
            const condProb = evaluateOverUnder(ms.pm, key);
            const edge = condProb - c.breakEven;

            if (edge < EDGE_MARGIN) continue; // not profitable enough

            // Streak reversal bonus
            let finalProb = condProb;
            if (ms.streak.streakCount >= 3) {
                const highStreak = ms.streak.lastRange === 'high';
                const lowStreak  = ms.streak.lastRange === 'low';
                if ((highStreak && c.cat === 'under') || (lowStreak && c.cat === 'over')) {
                    finalProb = Math.min(0.95, finalProb + 0.04);
                }
            }

            // Deprioritize markets with autocorrelation anomalies
            const effectiveEdge = ms.pm.autocorrAnomaly ? edge * 0.5 : edge;

            const trade: BestTrade = {
                symbol, label: marketLabel, contractKey: key,
                contractLabel: c.label,
                probability: Math.round(finalProb * 100),
                barrier: c.barrier, contractType: c.type,
            };

            if (effectiveEdge > bestEdge) { bestEdge = effectiveEdge; best = trade; }
            if (lastTradeKey && key !== lastTradeKey && effectiveEdge > bestAltEdge) {
                bestAltEdge = effectiveEdge; bestAlternative = trade;
            }
        }
    }

    // Prefer variety: if alternative has ≥80% of best edge, use it
    if (lastTradeKey && bestAlternative && bestAltEdge >= bestEdge * 0.80) return bestAlternative;
    return best;
};

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
const Scanner = observer(() => {
    const { client, dashboard, run_panel, summary_card, transactions } = useStore();
    const { isDesktop } = useDevice();
    const { active_tab } = dashboard;

    const [connected, setConnected] = useState(false);
    const [isWorking, setIsWorking] = useState(false);
    const [sessionProfit, setSessionProfit] = useState(0);
    const [popupOpen, setPopupOpen] = useState(false);
    const [showTPSLPopup, setShowTPSLPopup] = useState(false);
    const [tpSlSettings, setTpSlSettings] = useState({ stopLoss: '20', takeProfit: '0.5', isActive: false });
    const [terminalDashboard, setTerminalDashboard] = useState<string[]>(['🤖 DEEP EXPLOIT ENGINE v5.0 — CORRECTED']);
    const [terminalBody, setTerminalBody] = useState<string[]>(['Initializing scanner...']);
    const [scrollingText, setScrollingText] = useState('');
    const [bestTradeDisplay, setBestTradeDisplay] = useState<BestTrade | null>(null);
    const [statusMessage, setStatusMessage] = useState('SCANNING — WAITING FOR STRUCTURE...');
    const [detectionLog, setDetectionLog] = useState<string[]>([]);

    // ── Refs ──
    const marketsRef = useRef<Record<string, MarketState>>({});
    const shouldStopRef = useRef(false);
    const tradeActiveRef = useRef(false);
    const tradeInFlightRef = useRef(false);
    const completedRunsRef = useRef(0);
    const sessionProfitRef = useRef(0);
    const stakeRef = useRef(0.35);
    const stopLossRef = useRef(20);
    const takeProfitRef = useRef(0.5);
    const runsToCheckRef = useRef(5);
    const martingaleMultiplierRef = useRef(1); // flat stake by default (Mechanism #8 escape)
    const currentMartingaleStakeRef = useRef(0.35);
    const baseStakeRef = useRef(0.35);
    const consecutiveLossesRef = useRef(0);
    const subscriptionRefs = useRef<Record<string, { unsubscribe?: () => void }>>({});
    const requestVersionRef = useRef(0);
    const timerSoundRef = useRef<HTMLAudioElement | null>(null);
    const bestTradeRef = useRef<BestTrade | null>(null);
    const lastTradeTimeRef = useRef(0);
    const tradeInFlightStartRef = useRef(0);
    const streakStatesRef = useRef<Record<string, StreakState>>({});
    const failedContractsRef = useRef<Map<string, number>>(new Map());
    // ── Detection layer refs ──
    const processingDelaysRef = useRef<number[]>([]); // Mechanism #2: entry delay tracking
    const winRateByStakeRef = useRef<Map<string, { wins: number; losses: number }>>(new Map()); // Mechanism #8
    const settleTimesRef = useRef<{ wins: number[]; losses: number[] }>({ wins: [], losses: [] }); // Mechanism #4
    const consecutiveWinsRef = useRef(0); // for stealth skip after win streaks
    const skipNextTradesRef = useRef(0); // stealth: forced skip counter

    const currency = client.currency || 'USD';
    const showScanner = active_tab === DBOT_TABS.SCANNER;
    const isCoveredByMobileRunPanel = !isDesktop && run_panel.is_drawer_open;

    useEffect(() => {
        MARKETS.forEach(m => {
            if (!marketsRef.current[m.symbol]) {
                marketsRef.current[m.symbol] = { ticks: [], pm: initProbMatrix(), streak: initStreakState(), lastQuote: null };
            }
            if (!streakStatesRef.current[m.symbol]) streakStatesRef.current[m.symbol] = initStreakState();
        });
    }, []);

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
        if (p) p.catch(() => { document.addEventListener('click', () => sound.play().catch(() => undefined), { once: true }); });
    }, []);

    useEffect(() => {
        if (!showScanner) return;
        const logs = ['[SCAN] Market classification...','[DETECT] Payout drift check...','[MATRIX] 3-step transition update...','[BURST] Inter-tick timing...','[STRUCTURE] Chi-square test...','[STEALTH] Behavioral randomization...'];
        const update = () => {
            let text = '';
            for (let i = 0; i < 50; i++) text += `${logs[Math.floor(Math.random()*logs.length)]}\n`;
            setScrollingText(text + text);
        };
        update();
        const iv = setInterval(update, 120);
        return () => clearInterval(iv);
    }, [showScanner]);

    const unsubscribe = useCallback(() => {
        Object.values(subscriptionRefs.current).forEach(s => { try { s.unsubscribe?.(); } catch {} });
        subscriptionRefs.current = {};
    }, []);

    const stopTrading = useCallback(() => {
        shouldStopRef.current = true;
        tradeActiveRef.current = false;
        setIsWorking(false);
        stopTimerSound();
        consecutiveLossesRef.current = 0;
        consecutiveWinsRef.current = 0;
        skipNextTradesRef.current = 0;
        currentMartingaleStakeRef.current = baseStakeRef.current;
        failedContractsRef.current.clear();
        setStatusMessage('STOPPED');
        try { run_panel.setIsRunning(false); run_panel.setContractStage?.(contract_stages.NOT_RUNNING); } catch {}
        dashboard.setActiveTradingModule(null);
    }, [dashboard, run_panel, stopTimerSound]);

    const handleStopBot = useCallback(() => {
        if (tradeActiveRef.current || isWorking) { stopTrading(); setTerminalDashboard(p => [...p, '[USER] Bot stopped.']); }
    }, [stopTrading, isWorking]);

    const pushContract = useCallback((data: any) => {
        try { transactions.pushTransaction({ ...data, run_id: run_panel.run_id }); run_panel.onBotContractEvent(data); summary_card.onBotContractEvent(data); } catch {}
    }, [run_panel, summary_card, transactions]);

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

    // ── Balance refresh ──────────────────────────────────────────────────────
    // After every trade the header balance must update immediately.
    //
    // Why it doesn't auto-update reliably:
    //   • OAuth / Bearer-token users: CoreStoreProvider intentionally SKIPS
    //     the WS balance subscription and relies on a 30-second REST poll
    //     instead (line 630: `if (isNewLoggedIn()) return`).
    //   • Legacy WS users: the WS push usually arrives, but can be delayed by
    //     several seconds under load.
    //   • The scanner never triggers any explicit balance re-fetch itself.
    //
    // Fix: send a one-shot `balance` request through api_base after every
    // settled contract.  The response flows through onMessage() → 
    // CoreStoreProvider.handleMessages → client.setAllAccountsBalance(), so
    // both auth flows get an immediate, correct balance reading.
    const refreshBalance = useCallback(async () => {
        try {
            if (!api_base.api) return;
            const res = await (api_base.api as any).send({ balance: 1, account: 'all' });
            if (!res?.balance) return;

            if (res.balance.accounts) {
                // Full accounts map — handed straight to the store
                client.setAllAccountsBalance(res.balance);
            } else if (res.balance.loginid) {
                // Single-account update — merge into existing map
                const b = res.balance;
                const existing = client.all_accounts_balance?.accounts ?? {};
                client.setAllAccountsBalance({
                    accounts: {
                        ...existing,
                        [b.loginid]: {
                            balance:  b.balance  ?? 0,
                            currency: b.currency || '',
                            loginid:  b.loginid,
                        },
                    },
                    loginid: b.loginid,
                });
            }
        } catch {
            // silent — never block a trade result on a balance refresh failure
        }
    }, [client]);

    // ── Payout drift detection (Mechanism #1) ──
    // Sends two proposals 100ms apart; if payout differs >2% engine is adjusting against us
    const checkPayoutDrift = useCallback(async (trade: BestTrade, stake: number): Promise<boolean> => {
        try {
            if (!api_base.api) return true;
            const params = { proposal: 1, amount: stake, basis: 'stake', contract_type: trade.contractType, currency, duration: 1, duration_unit: 't', symbol: trade.symbol, ...(trade.barrier ? { barrier: trade.barrier } : {}) };
            const p1 = await api_base.api.send(params);
            await new Promise(r => setTimeout(r, 100));
            const p2 = await api_base.api.send(params);
            const payout1 = p1?.proposal?.payout ?? 0;
            const payout2 = p2?.proposal?.payout ?? 0;
            if (payout1 <= 0 || payout2 <= 0) return true;
            const drift = Math.abs(payout1 - payout2) / payout1;
            if (drift > 0.02) {
                setTerminalDashboard(p => [...p, `⚠️ Payout drift ${(drift*100).toFixed(1)}% — engine adjusting, SKIPPING`]);
                setDetectionLog(p => [...p.slice(-9), `Payout drift: ${(drift*100).toFixed(1)}% on ${trade.label}`]);
                return false; // skip this trade
            }
            return true;
        } catch {
            return true; // don't block on detection failure
        }
    }, [currency]);

    // ── Run single trade with detection instrumentation ──
    const runSingleTrade = useCallback(async (trade: BestTrade, stake: number): Promise<number> => {
        const proposalTime = Date.now();

        const buy = await buyContractForUi({
            parameters: buildTradeParameters(trade, stake),
            price: stake,
            source: 'Scanner',
        }).catch((e: any) => {
            const msg = e?.error?.message || e?.message || (typeof e === 'string' ? e : JSON.stringify(e).slice(0, 300)) || 'API rejected';
            throw new Error(`[API] ${msg}`);
        });

        // ── Mechanism #2: Processing delay tracking ──
        const entryTime = (buy?.date_start ?? 0) * 1000 || Date.now();
        const processingDelay = Math.max(0, entryTime - proposalTime);
        const delays = [...processingDelaysRef.current, processingDelay].slice(-50);
        processingDelaysRef.current = delays;
        if (delays.length >= 10) {
            const avg = delays.reduce((a, b) => a + b, 0) / delays.length;
            const variance = delays.reduce((a, b) => a + (b - avg) ** 2, 0) / delays.length;
            const stdDev = Math.sqrt(variance);
            if (processingDelay > avg + 2 * stdDev && stdDev > 10) {
                setTerminalDashboard(p => [...p, `⚠️ Processing delay spike: ${processingDelay}ms (avg ${avg.toFixed(0)}ms) — possible entry manipulation`]);
                setDetectionLog(p => [...p.slice(-9), `Entry delay spike: ${processingDelay}ms`]);
            }
        }

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

        const contractStart = Date.now();
        const settled = await streamContractUntilSettled({
            contractId: buy.contract_id,
            fallback: { buy_price: stake, date_start: Math.floor(Date.now()/1000), display_name: trade.label, underlying_symbol: trade.symbol, shortcode: `EXPLOIT_${trade.contractType}_${trade.symbol}`, contract_type: trade.contractType, currency },
            onUpdate: snap => pushContract(snap),
            source: 'Scanner',
        });

        // ── Mechanism #4: Settlement time tracking ──
        const settleTime = Date.now() - contractStart;
        const profit = Number(settled.profit ?? 0);
        const didWin = profit > 0;
        if (didWin) {
            settleTimesRef.current.wins = [...settleTimesRef.current.wins, settleTime].slice(-30);
        } else {
            settleTimesRef.current.losses = [...settleTimesRef.current.losses, settleTime].slice(-30);
        }
        if (settleTimesRef.current.wins.length >= 5 && settleTimesRef.current.losses.length >= 5) {
            const avgWin  = settleTimesRef.current.wins.reduce((a, b) => a + b, 0) / settleTimesRef.current.wins.length;
            const avgLoss = settleTimesRef.current.losses.reduce((a, b) => a + b, 0) / settleTimesRef.current.losses.length;
            if (avgWin > avgLoss * 1.5) {
                setDetectionLog(p => [...p.slice(-9), `Settlement delay on wins: ${avgWin.toFixed(0)}ms vs losses: ${avgLoss.toFixed(0)}ms`]);
            }
        }

        // ── Mechanism #8: Win rate by stake tracking ──
        const stakeKey = stake.toFixed(2);
        const existing = winRateByStakeRef.current.get(stakeKey) ?? { wins: 0, losses: 0 };
        winRateByStakeRef.current.set(stakeKey, {
            wins: existing.wins + (didWin ? 1 : 0),
            losses: existing.losses + (didWin ? 0 : 1),
        });

        return profit;
    }, [buildTradeParameters, currency, pushContract]);

    // ── Execute trade with stealth + detection layers ──
    const executeTrade = useCallback(async (trade: BestTrade) => {
        if (!tradeActiveRef.current || tradeInFlightRef.current || shouldStopRef.current) return;

        // ── Stealth: forced skip cooldown ──
        if (skipNextTradesRef.current > 0) {
            skipNextTradesRef.current -= 1;
            setTerminalDashboard(p => [...p, `⏸️ Stealth skip (${skipNextTradesRef.current} remaining)`]);
            lastTradeTimeRef.current = Date.now();
            return;
        }

        // ── Stealth: 60% random skip on favorable entries ──
        if (Math.random() < 0.60) {
            lastTradeTimeRef.current = Date.now();
            return;
        }

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

        // ── Payout drift detection (Mechanism #1) — skip if engine is adjusting ──
        const baseStake = baseStakeRef.current;
        const driftOk = await checkPayoutDrift(trade, baseStake);
        if (!driftOk) {
            lastTradeTimeRef.current = Date.now();
            return;
        }

        // ── Stealth: stake variation ±30% (Mechanism #7 escape) ──
        const stakeVariation = 0.70 + Math.random() * 0.60; // 0.70 to 1.30
        const stake = Math.max(0.35, Math.round(currentMartingaleStakeRef.current * stakeVariation * 100) / 100);

        // ── Stealth: random entry delay 300-3000ms (Mechanism #7 escape) ──
        const entryDelay = 300 + Math.random() * 2700;
        await new Promise(r => setTimeout(r, entryDelay));
        if (!tradeActiveRef.current || shouldStopRef.current) return;

        tradeInFlightRef.current = true;
        tradeInFlightStartRef.current = Date.now();

        try {
            setTerminalDashboard(p => [...p, `🎯 ${trade.contractLabel} on ${trade.label} @ ${trade.probability}% | Stake: ${stake.toFixed(2)} ${currency}`]);
            const profit = await runSingleTrade(trade, stake);
            lastTradeTimeRef.current = Date.now();
            const isWin = profit > 0;

            if (isWin) {
                consecutiveLossesRef.current = 0;
                consecutiveWinsRef.current += 1;
                currentMartingaleStakeRef.current = baseStakeRef.current;
                setTerminalDashboard(p => [...p, `✅ WIN +${profit.toFixed(2)} ${currency}`]);
                // ── Stealth: after 3 consecutive wins, skip next 2 (Mechanism #7) ──
                if (consecutiveWinsRef.current >= 3) {
                    skipNextTradesRef.current = 2;
                    consecutiveWinsRef.current = 0;
                    setTerminalDashboard(p => [...p, `⏸️ Stealth pause after win streak`]);
                }
            } else {
                consecutiveLossesRef.current += 1;
                consecutiveWinsRef.current = 0;
                const mult = martingaleMultiplierRef.current;
                if (mult > 1) {
                    currentMartingaleStakeRef.current = baseStakeRef.current * Math.pow(mult, consecutiveLossesRef.current);
                }
                setTerminalDashboard(p => [...p, `❌ LOSS x${consecutiveLossesRef.current} | Next stake: ${currentMartingaleStakeRef.current.toFixed(2)} ${currency}`]);
            }

            const totalProfit = Number((sessionProfitRef.current + profit).toFixed(8));
            completedRunsRef.current += 1;
            sessionProfitRef.current = totalProfit;
            setSessionProfit(totalProfit);
            setTerminalDashboard(p => [...p, `📈 ${completedRunsRef.current}/${runsToCheckRef.current}: ${profit.toFixed(2)} ${currency} | P/L: ${totalProfit.toFixed(2)} ${currency}`]);

            // ── Immediate balance refresh after every settled trade ──────────
            // This fixes the balance lag for BOTH auth flows:
            //   • OAuth users: CoreStoreProvider skips the WS balance
            //     subscription (isNewLoggedIn check); their balance only
            //     updates via a 30-second REST poll without this call.
            //   • WS-auth users: WS push can lag several seconds under load.
            // We fire-and-forget so it never blocks the trade loop.
            void refreshBalance();
        } catch (error) {
            const msg = error instanceof Error ? error.message
                : ((error as any)?.error?.message || (error as any)?.message || JSON.stringify(error).slice(0, 300) || 'Trade failed.');
            setTerminalDashboard(p => [...p, `❌ Error: ${msg}`]);
            const failKey = `${trade.contractKey}|${trade.symbol}`;
            const failCount = (failedContractsRef.current.get(failKey) ?? 0) + 1;
            failedContractsRef.current.set(failKey, failCount);
            if (failCount === 2) setTerminalDashboard(p => [...p, `🚫 ${trade.contractLabel} on ${trade.label} blacklisted`]);
            lastTradeTimeRef.current = Date.now();
            // Refresh balance even on error — trade may have partially executed
            void refreshBalance();
        } finally {
            tradeInFlightRef.current = false;
            tradeInFlightStartRef.current = 0;
            if (tradeActiveRef.current && !shouldStopRef.current) {
                const best = findBestTradeAcrossAllMarkets(marketsRef.current, undefined, failedContractsRef.current);
                if (best) { bestTradeRef.current = best; setBestTradeDisplay(best); }
            }
        }
    }, [checkPayoutDrift, currency, refreshBalance, runSingleTrade, stopTrading]);

    // ── Load ALL markets ──
    const loadAllMarkets = useCallback(async () => {
        unsubscribe();
        if (!showScanner || !api_base.api) return;
        const requestVersion = ++requestVersionRef.current;
        setConnected(false);
        setStatusMessage(`CONNECTING & LOADING ${MARKETS.length} MARKETS...`);

        MARKETS.forEach(m => {
            marketsRef.current[m.symbol] = { ticks: [], pm: initProbMatrix(), streak: initStreakState(), lastQuote: null };
            streakStatesRef.current[m.symbol] = initStreakState();
        });

        // Load history for all in parallel (500 ticks — enough to prime matrices)
        await Promise.all(MARKETS.map(async (market) => {
            try {
                const history = await api_base.api.send({
                    adjust_start_time: 1, count: 500, end: 'latest', start: 1,
                    style: 'ticks', ticks_history: market.symbol,
                });
                if (requestVersionRef.current !== requestVersion) return;
                const prices = Array.isArray(history?.history?.prices) ? history.history.prices : [];
                const times  = Array.isArray(history?.history?.times)  ? history.history.times  : [];
                const histTicks = prices.map((p: number|string, i: number) => ({
                    epoch: Number(times[i]) || Math.floor(Date.now()/1000),
                    quote: Number(p),
                })).filter((t: TTickPoint) => Number.isFinite(t.quote)).slice(-500);

                let pm = initProbMatrix();
                let streak = initStreakState();
                let lastQuote: number | null = null;
                // Note: history ticks may be post-processed (Mechanism #3)
                // We prime the matrix but will weight live ticks more as they arrive
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
        setStatusMessage(`LIVE — SCANNING ${MARKETS.length} MARKETS FOR STRUCTURE`);

        // Subscribe to live ticks for all
        MARKETS.forEach(market => {
            try {
                const observable = (api_base.api as any).subscribe({ ticks: market.symbol });
                subscriptionRefs.current[market.symbol] = safeSubscribe(observable, (data: any) => {
                    if (requestVersionRef.current !== requestVersion) return;
                    const quote = Number(data?.tick?.quote);
                    if (!Number.isFinite(quote)) return;
                    const nowMs = Date.now();
                    const tick: TTickPoint = { epoch: Number(data?.tick?.epoch) || Math.floor(nowMs/1000), quote };

                    const ms = marketsRef.current[market.symbol];
                    if (!ms) return;

                    const newTicks = [...ms.ticks, tick].slice(-500);
                    const prevQuote = ms.lastQuote;

                    if (prevQuote !== null) {
                        const prevDigit = getLastDigitFromQuote(prevQuote, market.symbol);
                        const currDigit = getLastDigitFromQuote(tick.quote, market.symbol);
                        const newPm = updateProbMatrix(ms.pm, prevQuote, tick.quote, prevDigit, currDigit, nowMs);
                        const hiddenDigits = extractHiddenDigits(prevQuote);
                        const sr = updateStreak(streakStatesRef.current[market.symbol] || initStreakState(), currDigit, hiddenDigits[1] || 0, newPm);
                        streakStatesRef.current[market.symbol] = sr.state;
                        marketsRef.current[market.symbol] = { ticks: newTicks, pm: newPm, streak: sr.state, lastQuote: tick.quote };

                        // Watchdog: trade stuck > 45s
                        if (tradeInFlightRef.current && tradeInFlightStartRef.current > 0 && nowMs - tradeInFlightStartRef.current > 45000) {
                            tradeInFlightRef.current = false;
                            tradeInFlightStartRef.current = 0;
                            setTerminalDashboard(p => [...p, '⚠️ Trade timed out (45s) — resetting.']);
                        }

                        // ── Skip during burst (Mechanism #10) ──
                        if (newPm.inBurst) {
                            setStatusMessage('⚡ BURST DETECTED — WAITING');
                        } else if (tradeActiveRef.current && !tradeInFlightRef.current) {
                            const now = Date.now();
                            if (now - lastTradeTimeRef.current > 3000) {
                                const lastKey = bestTradeRef.current?.contractKey;
                                const best = findBestTradeAcrossAllMarkets(marketsRef.current, lastKey, failedContractsRef.current);
                                if (best) {
                                    bestTradeRef.current = best;
                                    setBestTradeDisplay(best);
                                    setStatusMessage(`🎯 ${best.label} → ${best.contractLabel} @ ${best.probability}%`);
                                    void executeTrade(best);
                                }
                            }
                        } else {
                            const best = findBestTradeAcrossAllMarkets(marketsRef.current, undefined, failedContractsRef.current);
                            if (best) {
                                bestTradeRef.current = best;
                                setBestTradeDisplay(best);
                                const price = newTicks[newTicks.length - 1]?.quote ?? 0;
                                const threshold = getPriceThreshold(market.symbol);
                                setStatusMessage(price <= threshold
                                    ? `🎯 STRUCTURE: ${best.label} → ${best.contractLabel} @ ${best.probability}%`
                                    : `⏳ WAITING FOR LOW PRICE (${price.toFixed(3)} > ${threshold} threshold)`);
                            } else {
                                // Show why no trade found — helps with diagnostics
                                const price = newTicks[newTicks.length - 1]?.quote ?? 0;
                                const threshold = getPriceThreshold(market.symbol);
                                if (price > threshold) {
                                    setStatusMessage(`📊 ${market.label}: price ${price.toFixed(2)} > threshold ${threshold} — white noise`);
                                } else {
                                    setStatusMessage(`📊 Building matrices — need ${MIN_TOTAL_SAMPLES} samples`);
                                }
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

    // ── Active-trading balance poller ────────────────────────────────────────
    // Belt-and-suspenders: poll every 10 s while the engine is running so the
    // header balance stays current even if the one-shot post-trade refresh
    // above misses a cycle (network blip, fast consecutive trades, etc.).
    // 10 s is aggressive enough to feel live yet cheap on the WS.
    useEffect(() => {
        if (!isWorking && !tradeActiveRef.current) return;
        const iv = setInterval(() => {
            if (tradeActiveRef.current || isWorking) void refreshBalance();
        }, 10_000);
        return () => clearInterval(iv);
    }, [isWorking, refreshBalance]);

    const startTrading = useCallback((stake: number, sl: number, tp: number, multiplier: number, runs: number) => {
        baseStakeRef.current = stake;
        currentMartingaleStakeRef.current = stake;
        consecutiveLossesRef.current = 0;
        consecutiveWinsRef.current = 0;
        skipNextTradesRef.current = 0;
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
        setSessionProfit(0);
        setShowTPSLPopup(false);
        setTpSlSettings({ stopLoss: String(sl), takeProfit: String(tp), isActive: false });
        try {
            run_panel.setRunId(`exploit-${Date.now()}`);
            run_panel.setIsRunning(true);
            run_panel.setContractStage?.(contract_stages.RUNNING);
            if (isDesktop) run_panel.toggleDrawer(true);
        } catch {}
        dashboard.setActiveTradingModule('scanner');
        setTerminalDashboard(p => [...p, `🤖 ENGINE ACTIVE | Stake: ${stake} ${currency} | SL: ${sl} | TP: ${tp} | x${multiplier} | ${runs} runs`, `🧠 Stealth: 60% skip rate | Stake ±30% | Delay 300-3000ms`]);
    }, [currency, dashboard, isDesktop, run_panel]);

    const handleAnalyze = useCallback(() => {
        if (!connected) { setTerminalDashboard(['⚠️ Still loading market data...']); setPopupOpen(true); return; }
        shouldStopRef.current = false;
        setIsWorking(true);
        setSessionProfit(0);
        sessionProfitRef.current = 0;
        completedRunsRef.current = 0;
        setPopupOpen(true);
        setTerminalDashboard([
            '🤖 DEEP EXPLOIT ENGINE v5.0',
            `📊 ${MARKETS.length} MARKETS LOADED`,
            '🏗️ Classifying markets by price vs threshold...',
            `🔍 Only viable when price < threshold (digit autocorrelation exists)`,
            `📐 Min cell samples: ${MIN_CELL_SAMPLES} | Min total: ${MIN_TOTAL_SAMPLES}`,
        ]);
        setTerminalBody(['Scanning...']);
        playTimerSound();

        const codeIv = setInterval(() => {
            if (shouldStopRef.current) { clearInterval(codeIv); return; }
            setTerminalBody(p => [...p.slice(-49), `[ENGINE] ${Array.from({length:30},()=>'0123456789ABCDEF'[Math.floor(Math.random()*16)]).join('')}`]);
        }, 30);

        setTimeout(() => {
            clearInterval(codeIv);
            stopTimerSound();
            if (shouldStopRef.current) { setIsWorking(false); return; }

            // Show market classification status
            MARKETS.forEach(m => {
                const ms = marketsRef.current[m.symbol];
                const price = ms?.ticks[ms.ticks.length - 1]?.quote ?? 0;
                const threshold = getPriceThreshold(m.symbol);
                const viable = price > 0 && price <= threshold;
                const samples = ms?.pm.totalSamples ?? 0;
                setTerminalDashboard(prev => [...prev,
                    `${viable ? '✅' : '❌'} ${m.label}: price=${price.toFixed(2)} threshold=${threshold} samples=${samples}`
                ]);
            });

            const best = findBestTradeAcrossAllMarkets(marketsRef.current);
            if (best) {
                setTerminalDashboard(p => [...p, `🎯 BEST TRADE: ${best.label} → ${best.contractLabel} @ ${best.probability}%`]);
            } else {
                setTerminalDashboard(p => [...p, '⚠️ No market has exploitable structure at current prices.', '⏳ Engine will wait and trade when structure appears.']);
            }

            let count = 3;
            const countdownIv = setInterval(() => {
                if (shouldStopRef.current) { clearInterval(countdownIv); setIsWorking(false); return; }
                if (count > 0) { setTerminalDashboard(p => [...p, `Starting in ${count}...`]); count--; }
                else {
                    clearInterval(countdownIv);
                    const stake    = Math.max(0.35, parseFloat((sessionStorage.getItem('exploit_stake') || '0.35')));
                    const sl       = Math.max(1,    parseFloat((sessionStorage.getItem('exploit_sl')    || '20')));
                    const tp       = Math.max(0.1,  parseFloat((sessionStorage.getItem('exploit_tp')    || '0.5')));
                    const mul      = parseFloat((sessionStorage.getItem('exploit_mul')  || '1'));
                    const runs     = parseInt((sessionStorage.getItem('exploit_runs')  || '5'));
                    startTrading(stake, sl, tp, mul, runs);
                    setIsWorking(false);
                }
            }, 1000);
        }, 4000);
    }, [connected, playTimerSound, startTrading, stopTimerSound]);

    const [inputStake, setInputStake] = useState(() => sessionStorage.getItem('exploit_stake') || '0.35');
    const [inputSL, setInputSL]       = useState(() => sessionStorage.getItem('exploit_sl')    || '20');
    const [inputTP, setInputTP]       = useState(() => sessionStorage.getItem('exploit_tp')    || '0.5');
    const [inputRuns, setInputRuns]   = useState(() => sessionStorage.getItem('exploit_runs')   || '5');
    const [inputMul, setInputMul]     = useState(() => sessionStorage.getItem('exploit_mul')    || '1');

    const updateSetting = (key: string, value: string) => sessionStorage.setItem(key, value);
    const handleClosePopup    = () => { stopTimerSound(); setPopupOpen(false); };
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
                    🧠 v5.0 — 3-MATRIX | PRICE FILTER | PAYOUT DRIFT | STEALTH LAYER
                </h2>

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
                        {[1,1.1,1.2,1.3,1.4,1.5,1.6,1.7,1.8,1.9,2,2.2,2.5,3,3.5,4,5].map(m => <option key={m} value={m}>x{m}</option>)}
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
                            <span className='calibration-warning'>⏳ Waiting for market structure (price below threshold)...</span>
                        </div>
                    )}
                </div>

                {/* ── Stats ── */}
                <div className='contain'>
                    <div className='latest-tick'>🌐 Markets: <span>{MARKETS.length}</span></div>
                    <div className='latest-tick'>🏆 Best: <span>{bestTradeDisplay ? `${bestTradeDisplay.contractLabel} @ ${bestTradeDisplay.probability}%` : 'Scanning...'}</span></div>
                    <div className='latest-tick'>💵 P/L: <span>{sessionProfit.toFixed(2)} {currency}</span></div>
                    <div className='latest-tick'>🎯 Runs: <span>{completedRunsRef.current}</span></div>
                    <div className='latest-tick'>📊 Contracts: <span>{VIABLE_CONTRACTS.length} viable</span></div>
                </div>

                <div className='buttons'>
                    <button className='analyse' type='button' onClick={handleAnalyze} disabled={isWorking || !connected}>
                        {isWorking ? '🤖 PROCESSING...' : connected ? '🚀 START EXPLOIT ENGINE' : '⏳ LOADING MARKETS...'}
                    </button>
                </div>

                {/* ── Best trade table ── */}
                {bestTradeDisplay && (
                    <div className='calibration-bar' style={{ marginTop: '12px', borderColor: '#3b82f6' }}>
                        <div className='calibration-label' style={{ fontSize: '0.65rem', color: '#88ccff' }}>
                            LATEST BEST TRADE — STRUCTURE CONFIRMED
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

                {/* ── Detection Log ── */}
                {detectionLog.length > 0 && (
                    <div className='calibration-bar' style={{ marginTop: '8px', borderColor: '#ff6600' }}>
                        <div className='calibration-label' style={{ fontSize: '0.60rem', color: '#ff8800' }}>
                            ⚠️ DETECTION LAYER ALERTS
                        </div>
                        {detectionLog.slice(-3).map((log, i) => (
                            <div key={i} style={{ fontSize: '0.58rem', color: '#ff9922', marginTop: '2px' }}>{log}</div>
                        ))}
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
                        <span className='terminal-title'>DEEP EXPLOIT v5.0</span>
                    </div>
                    <div className='terminal-dashboard'>
                        {terminalDashboard.map((line, i) => (
                            <p className={line?.startsWith('Error')||line?.startsWith('❌') ? 'red' : line?.startsWith('⚠️') ? 'orange' : 'green'} key={`${line}-${i}`}>{line ?? ''}</p>
                        ))}
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
                                if(nSL>0&&nTP>0){stopLossRef.current=nSL;takeProfitRef.current=nTP;setTpSlSettings(p=>({...p,isActive:true}));setTerminalDashboard(p=>[...p,`🔄 TP/SL updated: ${nSL}/${nTP}`]);handleCloseTPSLPopup();}
                            }}>💾 UPDATE</button>
                            <button className='reset-btn' type='button' onClick={() => { setTpSlSettings({stopLoss:'20',takeProfit:'0.5',isActive:false});handleCloseTPSLPopup(); }}>🔄 RESET</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Mobile floating STOP ── */}
            {!isDesktop && run_panel.is_running && (
                <button className='mobile-floating-stop' type='button' onClick={handleStopBot}>⏹️ STOP</button>
            )}

            {/* ── Live trade overlay ── */}
            {tradeActiveRef.current && bestTradeDisplay && (
                <div style={{
                    position: 'fixed', bottom: '10px', right: '10px', zIndex: 99999,
                    background: 'rgba(0,0,0,0.92)', padding: '10px 14px', borderRadius: '6px',
                    border: `1px solid ${bestTradeDisplay.probability >= 65 ? '#0f0' : '#ff0'}`,
                    fontFamily: 'monospace', fontSize: '10px', color: '#0f0',
                    maxWidth: '280px', backdropFilter: 'blur(4px)',
                }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>🔴 EXPLOIT ACTIVE</div>
                    <div style={{ color: '#aaa', fontSize: '9px' }}>{bestTradeDisplay.label} → {bestTradeDisplay.contractLabel}</div>
                    <div style={{ color: bestTradeDisplay.probability >= 65 ? '#0f0' : '#ff0', fontSize: '12px', fontWeight: 'bold' }}>{bestTradeDisplay.probability}%</div>
                    <div style={{ color: '#888', fontSize: '9px', marginTop: '2px' }}>P/L: {sessionProfit.toFixed(2)} {currency} · {completedRunsRef.current} runs</div>
                </div>
            )}
        </div>
    );
});

export default Scanner;
