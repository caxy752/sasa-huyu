import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getAppId, getSocketURL } from '@/components/shared';
import './signal-zone.scss';

// ================================================================
// TYPE DEFINITIONS
// ================================================================

type SignalStatus = 'rise' | 'fall' | 'over' | 'under' | 'even' | 'odd' | 'neutral';

interface SymbolSignal {
    symbol: string;
    label: string;
    rise: SignalStatus;
    fall: SignalStatus;
    over2: SignalStatus;
    under7: SignalStatus;
    even: SignalStatus;
    odd: SignalStatus;
    riseStrength: number;
    fallStrength: number;
    lastPrice: number;
    tickCount: number;
}

interface HiddenDigitState {
    lastDigits: number[];
    lastHidden: number[];
    streakCount: number;
    lastDigit: number;
    lastRange: 'high' | 'low' | null;
}

interface CalibrationData {
    hiddenDigitToNextDigit: Record<number, { up: number; down: number; same: number; total: number }>;
    digitTransitionMatrix: number[][];
    hiddenParityCorrelation: { evenToEven: number; oddToOdd: number; total: number };
    streakReversionRates: Record<string, { flipped: number; stayed: number; total: number }>;
    tickToTickDigitChange: Record<number, { increased: number; decreased: number; stayed: number; total: number }>;
    calibrationComplete: boolean;
    ticksAnalyzed: number;
}

interface PendingProposal {
    symbol: string;
    contractType: string;
    stake: number;
    timestamp: number;
    proposalId?: string;
    askPrice?: number;
}

interface ContractConfig {
    type: string;
    barrier: string;
    category: 'over' | 'under' | 'evenodd';
    winningDigits: number[];
    label: string;
}

interface TradeRecord {
    timestamp: number;
    symbol: string;
    contract: string;
    stake: number;
    result: 'win' | 'loss' | 'pending';
    profit: number;
}

// ================================================================
// CONSTANTS
// ================================================================

const SYMBOLS = [
    { symbol: 'R_10', label: 'Vol 10 Index' },
    { symbol: 'R_25', label: 'Vol 25 Index' },
    { symbol: 'R_50', label: 'Vol 50 Index' },
    { symbol: 'R_75', label: 'Vol 75 Index' },
    { symbol: 'R_100', label: 'Vol 100 Index' },
    { symbol: '1HZ10V', label: 'Vol 10 (1s)' },
    { symbol: '1HZ25V', label: 'Vol 25 (1s)' },
    { symbol: '1HZ50V', label: 'Vol 50 (1s)' },
    { symbol: '1HZ75V', label: 'Vol 75 (1s)' },
    { symbol: '1HZ100V', label: 'Vol 100 (1s)' },
];

const ALL_CONTRACTS: Record<string, ContractConfig> = {
    'OVER_6':   { type: 'DIGOVER',  barrier: '6', category: 'over',    winningDigits: [7,8,9],         label: 'Over 6' },
    'OVER_5':   { type: 'DIGOVER',  barrier: '5', category: 'over',    winningDigits: [6,7,8,9],       label: 'Over 5' },
    'OVER_4':   { type: 'DIGOVER',  barrier: '4', category: 'over',    winningDigits: [5,6,7,8,9],     label: 'Over 4' },
    'OVER_3':   { type: 'DIGOVER',  barrier: '3', category: 'over',    winningDigits: [4,5,6,7,8,9],   label: 'Over 3' },
    'OVER_2':   { type: 'DIGOVER',  barrier: '2', category: 'over',    winningDigits: [3,4,5,6,7,8,9], label: 'Over 2' },
    'UNDER_7':  { type: 'DIGUNDER', barrier: '7', category: 'under',   winningDigits: [0,1,2,3,4,5,6], label: 'Under 7' },
    'UNDER_6':  { type: 'DIGUNDER', barrier: '6', category: 'under',   winningDigits: [0,1,2,3,4,5],   label: 'Under 6' },
    'UNDER_5':  { type: 'DIGUNDER', barrier: '5', category: 'under',   winningDigits: [0,1,2,3,4],     label: 'Under 5' },
    'UNDER_4':  { type: 'DIGUNDER', barrier: '4', category: 'under',   winningDigits: [0,1,2,3],       label: 'Under 4' },
    'UNDER_3':  { type: 'DIGUNDER', barrier: '3', category: 'under',   winningDigits: [0,1,2],         label: 'Under 3' },
    'UNDER_2':  { type: 'DIGUNDER', barrier: '2', category: 'under',   winningDigits: [0,1],           label: 'Under 2' },
    'EVEN':     { type: 'DIGEVEN',  barrier: '0', category: 'evenodd', winningDigits: [0,2,4,6,8],     label: 'Even' },
    'ODD':      { type: 'DIGODD',   barrier: '0', category: 'evenodd', winningDigits: [1,3,5,7,9],     label: 'Odd' },
};

const MAX_DAILY_TRADES = 60;
const MAX_CONSECUTIVE_LOSSES = 5;
const MIN_STAKE = 0.50;
const MAX_STAKE = 5.00;
const SYMBOL_COOLDOWN_MS = 10000; // 10s cooldown per symbol after a trade
const RECALIBRATE_INTERVAL_MS = 30000; // recalibrate every 30s with fresh ticks

// ================================================================
// COMPONENT
// ================================================================

const SignalZone: React.FC = () => {
    // ---- Core State ----
    const [signals, setSignals] = useState<SymbolSignal[]>(
        SYMBOLS.map(s => ({
            ...s,
            rise: 'neutral',
            fall: 'neutral',
            over2: 'neutral',
            under7: 'neutral',
            even: 'neutral',
            odd: 'neutral',
            riseStrength: 50,
            fallStrength: 50,
            lastPrice: 0,
            tickCount: 0,
        }))
    );
    const [connected, setConnected] = useState(false);
    const [running, setRunning] = useState(true);
    const [activeView, setActiveView] = useState<'rise-fall' | 'over-under' | 'even-odd'>('over-under');
    const [calibrationData, setCalibrationData] = useState<CalibrationData | null>(null);
    const [showCalibration, setShowCalibration] = useState(false);
    const [apiToken, setApiToken] = useState('');
    const [autoTrade, setAutoTrade] = useState(false);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [latency, setLatency] = useState(200);
    const [dailyStats, setDailyStats] = useState({ trades: 0, wins: 0, losses: 0, profit: 0 });
    const [stakeAmount, setStakeAmount] = useState(1.0);

    // ---- Refs ----
    const ticksRef = useRef<Record<string, number[]>>({});
    const hiddenStateRef = useRef<Record<string, HiddenDigitState>>({});
    const wsRef = useRef<WebSocket | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pendingProposalRef = useRef<PendingProposal | null>(null);
    const proposalTimersRef = useRef<Record<string, NodeJS.Timeout>>({});
    const calibrationBuildCountRef = useRef(0);
    const latencyRef = useRef<number>(200);
    const latencyPingRef = useRef<number>(0);
    const consecutiveLossesRef = useRef(0);
    const dailyTradeCountRef = useRef(0);
    const dailyProfitRef = useRef(0);
    const tradeHistoryRef = useRef<TradeRecord[]>([]);
    const latencyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // ---- Stability refs (avoid stale closures in intervals) ----
    const calibrationRef = useRef<CalibrationData | null>(null);
    const signalsRef = useRef<SymbolSignal[]>([]);
    const isAuthorizedRef = useRef(false);
    const isTradingRef = useRef(false);
    const symbolCooldownRef = useRef<Record<string, number>>({});
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stakeAmountRef = useRef(1.0);
    const apiTokenRef = useRef('');
    const autoTradeRef = useRef(false);

    // Keep plain refs in sync with state so interval callbacks always read latest values
    useEffect(() => { stakeAmountRef.current = stakeAmount; }, [stakeAmount]);
    useEffect(() => { apiTokenRef.current = apiToken; }, [apiToken]);
    useEffect(() => { autoTradeRef.current = autoTrade; }, [autoTrade]);

    // Wrapper: update both React state and the ref so intervals see latest signals immediately
    const updateSignals = useCallback((updater: (prev: SymbolSignal[]) => SymbolSignal[]) => {
        setSignals(prev => {
            const next = updater(prev);
            signalsRef.current = next;
            return next;
        });
    }, []);

    // ============================================================
    // HELPER: Get decimal architecture for ANY symbol
    // ============================================================
    const getDecimalArchitecture = useCallback((symbol: string): { display: number; hidden: number; pipSize: number } => {
        if (symbol === 'R_50' || symbol === 'R_75' || symbol === '1HZ50V' || symbol === '1HZ75V') {
            return { display: 4, hidden: 5, pipSize: 4 };
        }
        if (symbol === 'R_100' || symbol === 'R_150' || symbol === 'R_250' ||
            symbol === '1HZ100V' || symbol === '1HZ150V' || symbol === '1HZ250V') {
            return { display: 2, hidden: 3, pipSize: 3 };
        }
        return { display: 3, hidden: 4, pipSize: 4 };
    }, []);

    // ============================================================
    // HELPER: Extract digit and hidden digit from price
    // ============================================================
    const extractDigits = useCallback((price: number, symbol: string) => {
        const arch = getDecimalArchitecture(symbol);
        const multiplier = Math.pow(10, arch.display);
        const hiddenMultiplier = Math.pow(10, arch.hidden);

        const scaled = Math.floor(price * multiplier + 0.0000001);
        const hiddenScaled = Math.floor(price * hiddenMultiplier + 0.0000001);

        return {
            digit: scaled % 10,
            hiddenDigit: hiddenScaled % 10,
            fullScaled: scaled,
            fullHiddenScaled: hiddenScaled,
        };
    }, [getDecimalArchitecture]);

    // ============================================================
    // VALIDATE HIDDEN DIGIT INTEGRITY
    // ============================================================
    const validateHiddenDigitIntegrity = useCallback(() => {
        console.log('========================================');
        console.log('🔬 HIDDEN DIGIT INTEGRITY CHECK');

        SYMBOLS.forEach(({ symbol, label }) => {
            const prices = ticksRef.current[symbol];
            if (!prices || prices.length < 20) return;

            const uniqueHiddenDigits = new Set<number>();
            let totalSamples = 0;

            for (let i = 0; i < Math.min(prices.length, 100); i++) {
                const { hiddenDigit } = extractDigits(prices[i], symbol);
                uniqueHiddenDigits.add(hiddenDigit);
                totalSamples++;
            }

            const isReal = uniqueHiddenDigits.size > 1;
            const status = isReal ? '✅' : '❌';
            console.log(`   ${status} ${label} (${symbol}): ${uniqueHiddenDigits.size}/10 unique hidden digits (${totalSamples} samples)`);

            if (!isReal) {
                console.warn(`   ⚠️  ${label}: Hidden digit ALWAYS ${[...uniqueHiddenDigits][0]}. Proxy stripping precision. CSPRNG exploit DISABLED.`);
            }
        });

        console.log('========================================');
    }, [extractDigits]);

    // ============================================================
    // CALIBRATION ENGINE
    // ============================================================
    const buildCalibration = useCallback(() => {
        calibrationBuildCountRef.current++;

        const calData: CalibrationData = {
            hiddenDigitToNextDigit: {},
            digitTransitionMatrix: Array.from({ length: 10 }, () => new Array(10).fill(0)),
            hiddenParityCorrelation: { evenToEven: 0, oddToOdd: 0, total: 0 },
            streakReversionRates: {},
            tickToTickDigitChange: {},
            calibrationComplete: false,
            ticksAnalyzed: 0,
        };

        for (let i = 0; i <= 9; i++) {
            calData.hiddenDigitToNextDigit[i] = { up: 0, down: 0, same: 0, total: 0 };
            calData.tickToTickDigitChange[i] = { increased: 0, decreased: 0, stayed: 0, total: 0 };
        }

        SYMBOLS.forEach(({ symbol }) => {
            const prices = ticksRef.current[symbol];
            if (!prices || prices.length < 20) return;

            for (let i = 0; i < prices.length - 1; i++) {
                const { digit: currentDigit, hiddenDigit: currentHidden } = extractDigits(prices[i], symbol);
                const { digit: nextDigit } = extractDigits(prices[i + 1], symbol);

                const entry = calData.hiddenDigitToNextDigit[currentHidden];
                if (entry) {
                    if (nextDigit > currentDigit) entry.up++;
                    else if (nextDigit < currentDigit) entry.down++;
                    else entry.same++;
                    entry.total++;
                }

                calData.digitTransitionMatrix[currentDigit][nextDigit]++;

                const changeEntry = calData.tickToTickDigitChange[currentDigit];
                if (changeEntry) {
                    if (nextDigit > currentDigit) changeEntry.increased++;
                    else if (nextDigit < currentDigit) changeEntry.decreased++;
                    else changeEntry.stayed++;
                    changeEntry.total++;
                }

                const currentIsEven = currentHidden % 2 === 0;
                const nextIsEven = nextDigit % 2 === 0;
                calData.hiddenParityCorrelation.total++;
                if (currentIsEven === nextIsEven) {
                    calData.hiddenParityCorrelation.evenToEven++;
                } else {
                    calData.hiddenParityCorrelation.oddToOdd++;
                }

                if (i >= 3) {
                    const prev3Digits: number[] = [];
                    for (let j = i - 3; j < i; j++) {
                        const { digit: d } = extractDigits(prices[j], symbol);
                        prev3Digits.push(d);
                    }
                    const allHigh = prev3Digits.every(d => d >= 5);
                    const allLow = prev3Digits.every(d => d < 5);

                    if (allHigh || allLow) {
                        const rangeStr = allHigh ? 'high' : 'low';
                        const streakKey = `streak_${rangeStr}_len3`;
                        if (!calData.streakReversionRates[streakKey]) {
                            calData.streakReversionRates[streakKey] = { flipped: 0, stayed: 0, total: 0 };
                        }
                        const flipped = allHigh ? nextDigit < 5 : nextDigit >= 5;
                        if (flipped) calData.streakReversionRates[streakKey].flipped++;
                        else calData.streakReversionRates[streakKey].stayed++;
                        calData.streakReversionRates[streakKey].total++;
                    }
                }

                calData.ticksAnalyzed++;
            }
        });

        calData.calibrationComplete = calData.ticksAnalyzed > 200;

        // FIX: Update both React state AND the ref so interval callbacks see fresh data immediately
        calibrationRef.current = calData;
        setCalibrationData(calData);

        if (calData.calibrationComplete && calibrationBuildCountRef.current <= 2) {
            console.log('========================================');
            console.log('🔴 EDGE ENGINE — CALIBRATION COMPLETE');
            console.log(`   Ticks analyzed: ${calData.ticksAnalyzed}`);
            console.log(`   Symbols: ${SYMBOLS.length}`);
            console.log(`   Latency: ${Math.round(latencyRef.current)}ms`);
            console.log('');
            console.log('   Hidden Digit → Direction Probability:');
            let hasSignificantBias = false;
            for (let h = 0; h <= 9; h++) {
                const e = calData.hiddenDigitToNextDigit[h];
                if (e && e.total > 3) {
                    const up = (e.up / e.total * 100).toFixed(1);
                    const down = (e.down / e.total * 100).toFixed(1);
                    const arrow = parseFloat(up) > 54 ? '🔼' : parseFloat(down) > 54 ? '🔽' : '➡️';
                    console.log(`   H:${h} ${arrow}  Up:${up}%  Down:${down}%  (n=${e.total})`);
                    if (parseFloat(up) > 54 || parseFloat(down) > 54) hasSignificantBias = true;
                }
            }
            console.log('');
            console.log(`   CSPRNG Exploit: ${hasSignificantBias ? '✅ ACTIVE' : '⚠️ WEAK (check hidden digit integrity)'}`);
            console.log('');
            console.log('   Streak Reversion Rates:');
            Object.entries(calData.streakReversionRates).forEach(([key, val]) => {
                const flipPct = (val.flipped / val.total * 100).toFixed(1);
                console.log(`   ${key}: Flip ${flipPct}% (n=${val.total})`);
            });
            console.log('========================================');

            validateHiddenDigitIntegrity();
        }

        return calData;
    }, [extractDigits, validateHiddenDigitIntegrity]);

    // ============================================================
    // PROBABILITY: Over/Under
    // ============================================================
    const computeWinProbability = useCallback((
        currentDigit: number,
        hiddenDigit: number,
        streak: number,
        currentRange: 'high' | 'low' | null,
        calData: CalibrationData,
        contractCategory: 'over' | 'under',
        barrier: number
    ): number => {
        const winningDigits = contractCategory === 'over'
            ? Array.from({ length: 9 - barrier }, (_, i) => barrier + 1 + i)
            : Array.from({ length: barrier }, (_, i) => i);
        if (winningDigits.length === 0) return 0.1;

        const transitions = calData.digitTransitionMatrix[currentDigit];
        let baseProb = 0;
        let totalTransitions = 0;

        if (transitions) {
            totalTransitions = transitions.reduce((a: number, b: number) => a + b, 0);
            if (totalTransitions > 5) {
                for (const d of winningDigits) {
                    baseProb += transitions[d] / totalTransitions;
                }
            }
        }

        if (totalTransitions < 5) {
            baseProb = 0;
            for (const d of winningDigits) {
                if (d === currentDigit) {
                    baseProb += 0.28;
                } else {
                    const distance = Math.min(Math.abs(d - currentDigit), 10 - Math.abs(d - currentDigit));
                    baseProb += (1 / (distance + 1)) * 0.12;
                }
            }
        }

        const hiddenEntry = calData.hiddenDigitToNextDigit[hiddenDigit];
        if (hiddenEntry && hiddenEntry.total > 5) {
            const upProb = hiddenEntry.up / hiddenEntry.total;
            const downProb = hiddenEntry.down / hiddenEntry.total;
            const bias = upProb - downProb;

            if (contractCategory === 'over') {
                baseProb += bias * 0.15;
            } else {
                baseProb -= bias * 0.15;
            }
        }

        const streakLen = Math.min(streak, 5);
        if (streakLen >= 3 && currentRange) {
            const streakKey = `streak_${currentRange}_len3`;
            const reversionData = calData.streakReversionRates[streakKey];
            if (reversionData && reversionData.total > 3) {
                const flipRate = reversionData.flipped / reversionData.total;

                if (contractCategory === 'over' && currentRange === 'high') {
                    baseProb -= flipRate * 0.2;
                } else if (contractCategory === 'under' && currentRange === 'low') {
                    baseProb -= flipRate * 0.2;
                } else if (contractCategory === 'over' && currentRange === 'low') {
                    baseProb += flipRate * 0.18;
                } else if (contractCategory === 'under' && currentRange === 'high') {
                    baseProb += flipRate * 0.18;
                }
            }
        }

        if (contractCategory === 'over') {
            const distanceAbove = currentDigit - barrier;
            if (distanceAbove <= 0) {
                baseProb *= 0.65;
                if (hiddenEntry && hiddenEntry.total > 5) {
                    const upProb = hiddenEntry.up / hiddenEntry.total;
                    if (upProb > 0.55) baseProb *= 1.2;
                }
            } else {
                baseProb *= Math.min(1 + distanceAbove * 0.06, 1.25);
            }
        } else {
            const distanceBelow = barrier - currentDigit;
            if (distanceBelow <= 0) {
                baseProb *= 0.65;
                if (hiddenEntry && hiddenEntry.total > 5) {
                    const downProb = hiddenEntry.down / hiddenEntry.total;
                    if (downProb > 0.55) baseProb *= 1.2;
                }
            } else {
                baseProb *= Math.min(1 + distanceBelow * 0.06, 1.25);
            }
        }

        return Math.min(0.92, Math.max(0.08, baseProb));
    }, []);

    // ============================================================
    // PROBABILITY: Even/Odd
    // ============================================================
    const computeParityProbability = useCallback((
        currentDigit: number,
        hiddenDigit: number,
        calData: CalibrationData,
        targetParity: 'even' | 'odd'
    ): number => {
        const targetIsEven = targetParity === 'even';

        let prob = 0.5;
        const transitions = calData.digitTransitionMatrix[currentDigit];

        if (transitions) {
            const total = transitions.reduce((a: number, b: number) => a + b, 0);
            if (total > 5) {
                let evenCount = 0, oddCount = 0;
                for (let d = 0; d <= 9; d++) {
                    if (d % 2 === 0) evenCount += transitions[d];
                    else oddCount += transitions[d];
                }
                prob = targetIsEven ? evenCount / total : oddCount / total;
            }
        }

        const hiddenIsEven = hiddenDigit % 2 === 0;
        if (hiddenIsEven === targetIsEven) {
            prob += 0.05;
        } else {
            prob -= 0.05;
        }

        return Math.min(0.85, Math.max(0.15, prob));
    }, []);

    // ============================================================
    // SIGNAL COMPUTATION
    // FIX: Uses calibrationRef (not state) so the interval never
    //      has a stale value and doesn't restart on every update.
    // ============================================================
    const computeRealSignals = useCallback(() => {
        // Always read from ref — never from closed-over state
        const currentCalData = calibrationRef.current || buildCalibration();
        if (!currentCalData || !currentCalData.calibrationComplete) return;

        updateSignals(prev =>
            prev.map(sig => {
                const symbol = sig.symbol;
                const ticks = ticksRef.current[symbol] || [];
                const hiddenState = hiddenStateRef.current[symbol];

                if (ticks.length < 5 || !hiddenState) return sig;

                const currentPrice = ticks[ticks.length - 1];
                const { digit: currentDigit, hiddenDigit: currentHidden } = extractDigits(currentPrice, symbol);
                const streak = hiddenState.streakCount;
                const currentRange = hiddenState.lastRange;

                let bestOverProb = 0;
                let bestUnderProb = 0;
                let bestEvenProb = 0;
                let bestOddProb = 0;

                Object.entries(ALL_CONTRACTS).forEach(([, config]) => {
                    let prob: number;

                    if (config.category === 'over') {
                        prob = computeWinProbability(
                            currentDigit, currentHidden, streak, currentRange,
                            currentCalData, 'over', parseInt(config.barrier)
                        );
                        if (prob > bestOverProb) bestOverProb = prob;
                    } else if (config.category === 'under') {
                        prob = computeWinProbability(
                            currentDigit, currentHidden, streak, currentRange,
                            currentCalData, 'under', parseInt(config.barrier)
                        );
                        if (prob > bestUnderProb) bestUnderProb = prob;
                    } else if (config.category === 'evenodd') {
                        if (config.label === 'Even') {
                            prob = computeParityProbability(currentDigit, currentHidden, currentCalData, 'even');
                            if (prob > bestEvenProb) bestEvenProb = prob;
                        } else {
                            prob = computeParityProbability(currentDigit, currentHidden, currentCalData, 'odd');
                            if (prob > bestOddProb) bestOddProb = prob;
                        }
                    }
                });

                const threshold = currentCalData.ticksAnalyzed > 500 ? 0.72 : 0.65;

                return {
                    ...sig,
                    rise: 'neutral',
                    fall: 'neutral',
                    over2: bestOverProb > threshold ? 'over' : 'neutral',
                    under7: bestUnderProb > threshold ? 'under' : 'neutral',
                    even: bestEvenProb > threshold ? 'even' : 'neutral',
                    odd: bestOddProb > threshold ? 'odd' : 'neutral',
                    riseStrength: Math.round(bestOverProb * 100),
                    fallStrength: Math.round(bestUnderProb * 100),
                    lastPrice: currentPrice,
                    tickCount: ticks.length,
                };
            })
        );
    }, [buildCalibration, extractDigits, computeWinProbability, computeParityProbability, updateSignals]);
    // NOTE: calibrationData intentionally NOT in deps — we use calibrationRef instead.

    // ============================================================
    // DYNAMIC STAKE CALCULATION  (Kelly Criterion, 25% fractional)
    // FIX: Respects user-set stakeAmountRef as a direct override.
    // ============================================================
    const calculateDynamicStake = useCallback((winProb: number): number => {
        // If user typed a specific stake, use it directly
        const userStake = stakeAmountRef.current;
        if (userStake > 0) {
            return Math.min(MAX_STAKE, Math.max(MIN_STAKE, userStake));
        }
        // Kelly fallback
        const p = winProb;
        const q = 1 - p;
        const b = 1.0; // net payout ratio for digit contracts (stake doubles on win)
        let kellyFraction = (b * p - q) / b;
        kellyFraction = Math.max(0, kellyFraction * 0.25);
        const stake = 500 * kellyFraction;
        return Math.round(Math.min(MAX_STAKE, Math.max(MIN_STAKE, stake)) * 2) / 2;
    }, []);

    // ============================================================
    // AUTO-TRADE EXECUTION
    // FIX: Checks isAuthorizedRef before sending. Uses per-symbol
    //      cooldown so we never send duplicate proposals.
    // ============================================================
    const executeAutoTrade = useCallback((symbol: string, contractType: string, stake: number) => {
        const token = apiTokenRef.current;
        if (!token || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        if (!isAuthorizedRef.current) {
            console.warn('[EDGE] ⛔ Not yet authorized — skipping trade');
            return;
        }
        if (isTradingRef.current) {
            console.log('[EDGE] ⏳ Trade already pending — skipping');
            return;
        }

        // Per-symbol cooldown to prevent double-firing on the same index
        const lastTrade = symbolCooldownRef.current[symbol] || 0;
        if (Date.now() - lastTrade < SYMBOL_COOLDOWN_MS) {
            console.log(`[EDGE] ⏳ ${symbol} in cooldown`);
            return;
        }

        if (dailyTradeCountRef.current >= MAX_DAILY_TRADES) {
            console.warn('[EDGE] ⛔ Max daily trades reached.');
            autoTradeRef.current = false;
            setAutoTrade(false);
            return;
        }

        let adjustedStake = stake;
        if (consecutiveLossesRef.current >= MAX_CONSECUTIVE_LOSSES) {
            console.warn('[EDGE] ⛔ Max consecutive losses — halving stake.');
            adjustedStake = Math.max(MIN_STAKE, stake * 0.5);
        }

        const config = ALL_CONTRACTS[contractType];
        if (!config) return;

        adjustedStake = Math.min(MAX_STAKE, Math.max(MIN_STAKE, adjustedStake));

        isTradingRef.current = true;
        symbolCooldownRef.current[symbol] = Date.now();

        const proposalReq = {
            proposal: 1,
            amount: adjustedStake,
            barrier: config.barrier,
            basis: 'stake',
            contract_type: config.type,
            currency: 'USD',
            duration: 1,
            duration_unit: 't',
            symbol: symbol,
            product_type: 'basic',
        };

        pendingProposalRef.current = {
            symbol,
            contractType,
            stake: adjustedStake,
            timestamp: Date.now(),
        };

        wsRef.current.send(JSON.stringify(proposalReq));
        console.log(`[EDGE] 📤 Proposal: ${symbol} ${config.label} $${adjustedStake.toFixed(2)}`);
    }, []);

    // ============================================================
    // CONNECT / RECONNECT WebSocket
    // ============================================================
    const connectWebSocket = useCallback(() => {
        // Clean up any existing socket
        if (wsRef.current &&
            (wsRef.current.readyState === WebSocket.OPEN ||
             wsRef.current.readyState === WebSocket.CONNECTING)) {
            wsRef.current.close();
        }
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }

        const wsUrl = `wss://${getSocketURL()}/websockets/v3?app_id=${getAppId()}`;
        console.log('[EDGE] 🔗 Connecting to:', wsUrl);

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            console.log('[EDGE] ✅ WebSocket Connected');

            SYMBOLS.forEach(({ symbol }) => {
                ticksRef.current[symbol] = [];

                if (!hiddenStateRef.current[symbol]) {
                    hiddenStateRef.current[symbol] = {
                        lastDigits: [],
                        lastHidden: [],
                        streakCount: 0,
                        lastDigit: -1,
                        lastRange: null,
                    };
                }

                ws.send(JSON.stringify({
                    ticks_history: symbol,
                    count: 255,
                    end: 'latest',
                    style: 'ticks',
                    subscribe: 1,
                }));
            });

            // Re-authorize if we already have a token and auto-trade is on
            if (apiTokenRef.current && autoTradeRef.current) {
                isAuthorizedRef.current = false;
                setIsAuthorized(false);
                ws.send(JSON.stringify({ authorize: apiTokenRef.current }));
                console.log('[EDGE] 🔑 Re-authorizing after reconnect...');
            }

            // Latency ping loop
            const latencyInt = setInterval(() => {
                if (ws.readyState !== WebSocket.OPEN) return;
                latencyPingRef.current = Date.now();
                ws.send(JSON.stringify({ ping: 1, req_id: latencyPingRef.current }));
            }, 10000);
            latencyIntervalRef.current = latencyInt;

            // Initial ping
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    latencyPingRef.current = Date.now();
                    ws.send(JSON.stringify({ ping: 1, req_id: latencyPingRef.current }));
                }
            }, 1000);
        };

        ws.onmessage = (evt: MessageEvent) => {
            try {
                const data = JSON.parse(evt.data);
                if (data.error) {
                    if (data.error.code !== 'AlreadySubscribed') {
                        console.warn('[EDGE] API Error:', data.error.code, data.error.message);
                    }
                    // If proposal errored, release trading lock
                    if (pendingProposalRef.current) {
                        pendingProposalRef.current = null;
                        isTradingRef.current = false;
                    }
                    return;
                }

                // ── Pong (latency) ──────────────────────────────
                if (data.pong || data.msg_type === 'pong') {
                    const rtt = Date.now() - latencyPingRef.current;
                    if (rtt > 0 && rtt < 10000) {
                        latencyRef.current = Math.round(latencyRef.current * 0.7 + rtt * 0.3);
                        setLatency(latencyRef.current);
                    }
                    return;
                }

                // ── Authorize response ─────────────────────────
                if (data.authorize) {
                    isAuthorizedRef.current = true;
                    setIsAuthorized(true);
                    console.log(`[EDGE] 🔑 Authorized as ${data.authorize.loginid} · Balance: ${data.authorize.currency} ${data.authorize.balance}`);
                    return;
                }

                // ── Tick history (initial load) ─────────────────
                if (data.history?.prices) {
                    // FIX: safe optional chaining on echo_req
                    const sym = data.echo_req?.ticks_history;
                    if (!sym) return;

                    const prices = data.history.prices.map((p: string) => parseFloat(p));

                    const existing = ticksRef.current[sym] || [];
                    if (existing.length === 0) {
                        ticksRef.current[sym] = prices;
                    } else if (prices.length > 0) {
                        const lastExisting = existing[existing.length - 1];
                        const newTicks = prices.filter((p: number) => Math.abs(p - lastExisting) > 0.00001);
                        ticksRef.current[sym] = [...existing, ...newTicks];
                    }

                    if (ticksRef.current[sym].length > 500) {
                        ticksRef.current[sym] = ticksRef.current[sym].slice(-500);
                    }

                    if (!hiddenStateRef.current[sym]) {
                        hiddenStateRef.current[sym] = {
                            lastDigits: [],
                            lastHidden: [],
                            streakCount: 0,
                            lastDigit: -1,
                            lastRange: null,
                        };
                    }

                    const state = hiddenStateRef.current[sym];
                    const lastPrices = ticksRef.current[sym];
                    if (lastPrices.length > 3) {
                        for (let i = Math.max(0, lastPrices.length - 5); i < lastPrices.length; i++) {
                            const { digit, hiddenDigit } = extractDigits(lastPrices[i], sym);
                            state.lastDigits.push(digit);
                            state.lastHidden.push(hiddenDigit);
                            if (i > Math.max(0, lastPrices.length - 5)) {
                                const currentRange = digit >= 5 ? 'high' : 'low';
                                if (currentRange === state.lastRange) {
                                    state.streakCount++;
                                } else {
                                    state.streakCount = 1;
                                    state.lastRange = currentRange;
                                }
                            } else {
                                state.streakCount = 1;
                                state.lastRange = digit >= 5 ? 'high' : 'low';
                            }
                            state.lastDigit = digit;
                        }
                    }
                }

                // ── Live tick ──────────────────────────────────
                if (data.tick) {
                    const sym = data.tick.symbol;
                    const rawPrice = parseFloat(data.tick.quote);

                    if (!ticksRef.current[sym]) ticksRef.current[sym] = [];
                    ticksRef.current[sym].push(rawPrice);
                    if (ticksRef.current[sym].length > 500) ticksRef.current[sym].shift();

                    if (!hiddenStateRef.current[sym]) {
                        hiddenStateRef.current[sym] = {
                            lastDigits: [],
                            lastHidden: [],
                            streakCount: 0,
                            lastDigit: -1,
                            lastRange: null,
                        };
                    }

                    const { digit, hiddenDigit } = extractDigits(rawPrice, sym);
                    const state = hiddenStateRef.current[sym];

                    state.lastDigits.push(digit);
                    state.lastHidden.push(hiddenDigit);
                    if (state.lastDigits.length > 100) {
                        state.lastDigits.shift();
                        state.lastHidden.shift();
                    }

                    const currentRange = digit >= 5 ? 'high' : 'low';
                    if (currentRange === state.lastRange) {
                        state.streakCount++;
                    } else {
                        state.streakCount = 1;
                        state.lastRange = currentRange;
                    }
                    state.lastDigit = digit;
                }

                // ── Proposal response ──────────────────────────
                if (data.proposal && pendingProposalRef.current) {
                    const pp = pendingProposalRef.current;
                    pp.proposalId = data.proposal.id;
                    pp.askPrice = data.proposal.ask_price;

                    const currentLatency = latencyRef.current;
                    const lookaheadMs = Math.max(50, Math.min(300, 300 - currentLatency));

                    console.log(`[EDGE] ⏳ Proposal received. Latency: ${currentLatency}ms · Lookahead: ${lookaheadMs}ms`);

                    const timerKey = `${pp.symbol}_${pp.contractType}_${pp.timestamp}`;
                    const timerId = setTimeout(() => {
                        const currentTicks = ticksRef.current[pp.symbol];
                        if (currentTicks && currentTicks.length > 0 && pp.proposalId && pp.askPrice) {
                            const { digit: currentDigit } = extractDigits(
                                currentTicks[currentTicks.length - 1], pp.symbol
                            );

                            const config = ALL_CONTRACTS[pp.contractType];
                            const favorable = config ? config.winningDigits.includes(currentDigit) : false;

                            if (favorable && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                                wsRef.current.send(JSON.stringify({ buy: pp.proposalId, price: pp.askPrice }));
                                dailyTradeCountRef.current++;
                                console.log(`[EDGE] ✅ BUY: ${pp.symbol} ${config?.label || pp.contractType} $${pp.stake.toFixed(2)} [#${dailyTradeCountRef.current}/${MAX_DAILY_TRADES}]`);
                            } else {
                                console.log(`[EDGE] ⏭️ SKIP: ${pp.symbol} digit ${currentDigit} not favorable for ${pp.contractType}`);
                                isTradingRef.current = false;
                            }
                        } else {
                            isTradingRef.current = false;
                        }
                        pendingProposalRef.current = null;
                    }, lookaheadMs);

                    if (proposalTimersRef.current[timerKey]) {
                        clearTimeout(proposalTimersRef.current[timerKey]);
                    }
                    proposalTimersRef.current[timerKey] = timerId;
                }

                // ── Buy response ───────────────────────────────
                if (data.buy) {
                    const contractId = data.buy.contract_id;
                    console.log(`[EDGE] ✅ Contract #${contractId} opened`);

                    tradeHistoryRef.current.push({
                        timestamp: Date.now(),
                        symbol: data.echo_req?.symbol || 'unknown',
                        contract: data.echo_req?.contract_type || 'unknown',
                        stake: data.buy.buy_price || 0,
                        result: 'pending',
                        profit: 0,
                    });

                    setDailyStats(prev => ({ ...prev, trades: prev.trades + 1 }));

                    // FIX: Subscribe to contract settlement so we can track wins/losses
                    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({
                            proposal_open_contract: 1,
                            subscribe: 1,
                            contract_id: contractId,
                        }));
                    }

                    // Release trading lock after buy is confirmed
                    isTradingRef.current = false;
                }

                // ── Contract settlement ────────────────────────
                if (data.proposal_open_contract) {
                    const contract = data.proposal_open_contract;
                    if (contract.is_sold || contract.status === 'sold') {
                        const profit = parseFloat(contract.profit) || 0;
                        const isWin = profit > 0;

                        dailyProfitRef.current += profit;
                        consecutiveLossesRef.current = isWin ? 0 : consecutiveLossesRef.current + 1;

                        const lastTrade = tradeHistoryRef.current[tradeHistoryRef.current.length - 1];
                        if (lastTrade && lastTrade.result === 'pending') {
                            lastTrade.result = isWin ? 'win' : 'loss';
                            lastTrade.profit = profit;
                        }

                        setDailyStats(prev => ({
                            trades: prev.trades,
                            wins: prev.wins + (isWin ? 1 : 0),
                            losses: prev.losses + (isWin ? 0 : 1),
                            profit: parseFloat((prev.profit + profit).toFixed(2)),
                        }));

                        const resultStr = isWin
                            ? `+$${profit.toFixed(2)}`
                            : `-$${Math.abs(profit).toFixed(2)}`;
                        console.log(`[EDGE] ${isWin ? '✅' : '❌'} Contract #${contract.contract_id || '?'} settled: ${resultStr} | Daily P&L: $${dailyProfitRef.current.toFixed(2)}`);

                        if (!isWin && consecutiveLossesRef.current >= MAX_CONSECUTIVE_LOSSES) {
                            console.warn(`[EDGE] ⛔ ${MAX_CONSECUTIVE_LOSSES} consecutive losses. Auto-trade paused.`);
                            setAutoTrade(false);
                            autoTradeRef.current = false;
                        }
                    }
                }

            } catch (e) {
                console.warn('[EDGE] Message parse error:', e);
            }
        };

        ws.onclose = (ev) => {
            setConnected(false);
            isAuthorizedRef.current = false;
            setIsAuthorized(false);
            if (latencyIntervalRef.current) clearInterval(latencyIntervalRef.current);
            console.log(`[EDGE] 🔌 Disconnected (code ${ev.code}) — reconnecting in 3s`);

            // FIX: Auto-reconnect after 3 seconds
            reconnectTimerRef.current = setTimeout(() => {
                console.log('[EDGE] 🔄 Reconnecting...');
                connectWebSocket();
            }, 3000);
        };

        ws.onerror = () => {
            setConnected(false);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [extractDigits]);

    // ============================================================
    // Mount: open WebSocket once
    // ============================================================
    useEffect(() => {
        connectWebSocket();
        return () => {
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            if (latencyIntervalRef.current) clearInterval(latencyIntervalRef.current);
            Object.values(proposalTimersRef.current).forEach(t => clearTimeout(t));
            proposalTimersRef.current = {};
            if (wsRef.current) wsRef.current.close();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ============================================================
    // AUTHORIZE when apiToken + autoTrade both active
    // FIX: Sends the Deriv authorize request so proposals/buys work
    // ============================================================
    useEffect(() => {
        if (!autoTrade || !apiToken) {
            if (!autoTrade) {
                isAuthorizedRef.current = false;
                setIsAuthorized(false);
            }
            return;
        }
        if (isAuthorizedRef.current) return; // already authorized this session

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            isAuthorizedRef.current = false;
            setIsAuthorized(false);
            wsRef.current.send(JSON.stringify({ authorize: apiToken }));
            console.log('[EDGE] 🔑 Sending authorize request...');
        }
    }, [autoTrade, apiToken]);

    // ============================================================
    // Signal computation interval + periodic recalibration
    // FIX: Uses stable computeRealSignals (no calibrationData dep)
    //      so the interval never restarts due to calibration updates.
    // ============================================================
    useEffect(() => {
        if (!running) {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            return;
        }

        // Initial calibration after ticks load
        const initialCalTimer = setTimeout(() => buildCalibration(), 2000);

        // Signal computation every 1.5s
        intervalRef.current = setInterval(computeRealSignals, 1500);

        // FIX: Periodic recalibration every 30s so the engine learns new tick patterns
        const recalTimer = setInterval(() => buildCalibration(), RECALIBRATE_INTERVAL_MS);

        return () => {
            clearTimeout(initialCalTimer);
            clearInterval(recalTimer);
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    // computeRealSignals and buildCalibration are stable (no calibrationData dep)
    }, [running, computeRealSignals, buildCalibration]);

    // ============================================================
    // AUTO-TRADE MONITOR
    // FIX: Uses signalsRef + calibrationRef to avoid stale closures.
    //      Deps no longer include `signals` or `calibrationData`,
    //      so the 3s interval actually runs instead of restarting.
    // ============================================================
    useEffect(() => {
        if (!autoTrade || !apiToken) return;

        const checkInterval = setInterval(() => {
            if (!autoTradeRef.current) return;
            if (!isAuthorizedRef.current) return;

            const calData = calibrationRef.current;
            if (!calData?.calibrationComplete) return;

            if (dailyTradeCountRef.current >= MAX_DAILY_TRADES) {
                console.warn('[EDGE] ⛔ Max daily trades reached. Stopping.');
                setAutoTrade(false);
                autoTradeRef.current = false;
                return;
            }

            if (Math.abs(dailyProfitRef.current) > 100) {
                console.warn(`[EDGE] ⛔ Daily P&L limit ±$100 reached. Stopping.`);
                setAutoTrade(false);
                autoTradeRef.current = false;
                return;
            }

            const currentSignals = signalsRef.current;
            currentSignals.forEach(sig => {
                if (!autoTradeRef.current || isTradingRef.current) return;

                const hasOverSignal = sig.over2 !== 'neutral' && sig.riseStrength > 70;
                const hasUnderSignal = sig.under7 !== 'neutral' && sig.fallStrength > 70;

                if (!hasOverSignal && !hasUnderSignal) return;

                const ticks = ticksRef.current[sig.symbol] || [];
                const hiddenState = hiddenStateRef.current[sig.symbol];
                if (ticks.length < 5 || !hiddenState) return;

                const currentPrice = ticks[ticks.length - 1];
                const { digit: currentDigit, hiddenDigit: currentHidden } = extractDigits(currentPrice, sig.symbol);
                const streak = hiddenState.streakCount;
                const currentRange = hiddenState.lastRange;

                let bestContractKey = '';
                let bestProb = 0;

                Object.entries(ALL_CONTRACTS).forEach(([key, config]) => {
                    let prob: number;
                    if (config.category === 'over' || config.category === 'under') {
                        prob = computeWinProbability(
                            currentDigit, currentHidden, streak, currentRange,
                            calData,
                            config.category as 'over' | 'under',
                            parseInt(config.barrier)
                        );
                    } else {
                        prob = computeParityProbability(
                            currentDigit, currentHidden, calData,
                            config.label === 'Even' ? 'even' : 'odd'
                        );
                    }
                    if (prob > bestProb) {
                        bestProb = prob;
                        bestContractKey = key;
                    }
                });

                const execThreshold = calData.ticksAnalyzed > 500 ? 0.75 : 0.70;
                if (bestProb > execThreshold && bestContractKey) {
                    const stake = calculateDynamicStake(bestProb);
                    executeAutoTrade(sig.symbol, bestContractKey, stake);
                }
            });
        }, 3000);

        return () => clearInterval(checkInterval);
    // FIX: Only depends on autoTrade + apiToken — signalsRef/calibrationRef
    //      are plain refs so no stale-closure restarts.
    }, [autoTrade, apiToken, executeAutoTrade, extractDigits, computeWinProbability, computeParityProbability, calculateDynamicStake]);

    // ============================================================
    // Daily stats reset at midnight
    // ============================================================
    useEffect(() => {
        const now = new Date();
        const msToMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();

        const resetTimer = setTimeout(() => {
            dailyTradeCountRef.current = 0;
            dailyProfitRef.current = 0;
            consecutiveLossesRef.current = 0;
            setDailyStats({ trades: 0, wins: 0, losses: 0, profit: 0 });
            console.log('[EDGE] 📅 Daily stats reset');
        }, msToMidnight);

        return () => clearTimeout(resetTimer);
    }, []);

    // ============================================================
    // RENDER HELPERS
    // ============================================================
    const getSignalBadge = (status: SignalStatus, label: string, strength?: number) => {
        const active = status !== 'neutral';
        return (
            <span
                className={`sz-badge sz-badge--${status} ${active ? 'sz-badge--active' : ''}`}
                style={active && strength ? {
                    borderColor: strength > 75 ? '#0f0' : strength > 65 ? '#ff0' : '#f80',
                    boxShadow: strength > 75 ? '0 0 8px rgba(0,255,0,0.5)' : 'none',
                    color: strength && strength > 65 ? '#fff' : undefined,
                } : {}}
            >
                {active ? `${label} ${strength ? `(${strength}%)` : ''}` : '—'}
            </span>
        );
    };

    const activeSignals = signals.filter(s =>
        activeView === 'rise-fall'
            ? s.rise !== 'neutral' || s.fall !== 'neutral'
            : activeView === 'over-under'
            ? s.over2 !== 'neutral' || s.under7 !== 'neutral'
            : s.even !== 'neutral' || s.odd !== 'neutral'
    ).length;

    // ============================================================
    // MAIN RENDER
    // ============================================================
    return (
        <div className='signal-zone'>
            {/* HEADER */}
            <div className='signal-zone__header'>
                <div className='signal-zone__header-left'>
                    <div className={`sz-pulse-dot ${!running ? 'sz-pulse-dot--stopped' : ''}`} />
                    <div>
                        <h1 className='signal-zone__title'>Signal Zone</h1>
                        <p className='signal-zone__subtitle'>
                            {!running ? 'Paused · signals frozen' :
                             connected
                                ? `Live · ${activeSignals} signal${activeSignals !== 1 ? 's' : ''} · ${Math.round(latency)}ms latency`
                                : 'Connecting…'}
                            {calibrationData?.calibrationComplete
                                ? ` · Calibrated ✅ (${calibrationData.ticksAnalyzed} ticks)`
                                : ` · Calibrating ${calibrationData?.ticksAnalyzed || 0}/200`}
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                        className={`sz-stop-btn ${running ? 'sz-stop-btn--running' : 'sz-stop-btn--stopped'}`}
                        onClick={() => setRunning(r => !r)}
                    >
                        {running ? '⏹ Stop' : '▶ Resume'}
                    </button>
                    <button
                        className='sz-stop-btn'
                        style={{
                            background: showCalibration ? '#0f0' : '#333',
                            color: showCalibration ? '#000' : '#fff',
                            border: showCalibration ? '1px solid #0f0' : '1px solid #555',
                        }}
                        onClick={() => setShowCalibration(s => !s)}
                        title='Toggle calibration data'
                    >
                        🔬 Cal
                    </button>
                </div>
            </div>

            {/* VIEW TABS */}
            <div className='signal-zone__views'>
                {(['rise-fall', 'over-under', 'even-odd'] as const).map(v => (
                    <button
                        key={v}
                        className={`sz-view-btn ${activeView === v ? 'sz-view-btn--active' : ''}`}
                        onClick={() => setActiveView(v)}
                    >
                        {v === 'rise-fall' ? '📈 Rise / Fall' : v === 'over-under' ? '🎯 Over / Under' : '⚖️ Even / Odd'}
                    </button>
                ))}
            </div>

            {/* AUTO-TRADE CONTROLS */}
            <div className='sz-auto-trade' style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
                padding: '10px 15px',
                background: '#1a1a2e',
                borderRadius: '8px',
                margin: '10px 0',
                border: autoTrade ? (isAuthorized ? '1px solid #0f0' : '1px solid #f80') : '1px solid #333',
                flexWrap: 'wrap',
            }}>
                <div style={{ color: '#888', fontSize: '12px', whiteSpace: 'nowrap' }}>🤖 Auto-Trade</div>
                <input
                    type='password'
                    placeholder='Deriv API Token'
                    value={apiToken}
                    onChange={e => setApiToken(e.target.value)}
                    style={{
                        flex: 1,
                        minWidth: '150px',
                        padding: '8px 12px',
                        background: '#0d0d1a',
                        border: '1px solid #333',
                        borderRadius: '4px',
                        color: '#fff',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                    }}
                />
                <input
                    type='number'
                    placeholder='Stake $'
                    value={stakeAmount}
                    onChange={e => setStakeAmount(parseFloat(e.target.value) || 1)}
                    min={MIN_STAKE}
                    max={MAX_STAKE}
                    step={0.50}
                    style={{
                        width: '70px',
                        padding: '8px 8px',
                        background: '#0d0d1a',
                        border: '1px solid #333',
                        borderRadius: '4px',
                        color: '#fff',
                        fontSize: '12px',
                        textAlign: 'center',
                    }}
                />
                <button
                    onClick={() => setAutoTrade(a => !a)}
                    style={{
                        padding: '8px 20px',
                        background: autoTrade ? (isAuthorized ? '#0f0' : '#f80') : '#333',
                        color: autoTrade ? '#000' : '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: apiToken ? 'pointer' : 'not-allowed',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        opacity: apiToken ? 1 : 0.5,
                    }}
                    disabled={!apiToken}
                >
                    {autoTrade ? (isAuthorized ? '🟢 LIVE' : '🟡 AUTH…') : '⚪ AUTO OFF'}
                </button>

                {/* Daily Stats */}
                {dailyStats.trades > 0 && (
                    <div style={{
                        display: 'flex',
                        gap: '12px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        marginLeft: 'auto',
                    }}>
                        <span style={{ color: '#888' }}>#{dailyStats.trades}/{MAX_DAILY_TRADES}</span>
                        <span style={{ color: '#22c55e' }}>W:{dailyStats.wins}</span>
                        <span style={{ color: '#ef4444' }}>L:{dailyStats.losses}</span>
                        <span style={{
                            color: dailyStats.profit >= 0 ? '#22c55e' : '#ef4444',
                            fontWeight: 'bold',
                        }}>
                            {dailyStats.profit >= 0 ? '+' : ''}${dailyStats.profit.toFixed(2)}
                        </span>
                    </div>
                )}
            </div>

            {/* CALIBRATION PANEL */}
            {showCalibration && calibrationData && (
                <div className='sz-calibration' style={{
                    margin: '10px 0',
                    padding: '15px',
                    background: '#1a1a2e',
                    borderRadius: '8px',
                    border: `1px solid ${calibrationData.calibrationComplete ? '#0f0' : '#f80'}`,
                    maxHeight: '400px',
                    overflowY: 'auto',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h3 style={{ color: calibrationData.calibrationComplete ? '#0f0' : '#f80', margin: 0, fontSize: '14px' }}>
                            {calibrationData.calibrationComplete ? '✅ CALIBRATED' : '⏳ CALIBRATING...'}
                        </h3>
                        <span style={{ color: '#888', fontSize: '11px' }}>
                            {calibrationData.ticksAnalyzed} ticks · {Math.round(latency)}ms · Threshold: {calibrationData.ticksAnalyzed > 500 ? '72%' : '65%'}
                        </span>
                    </div>

                    {/* Hidden Digit Direction Table */}
                    <div style={{ fontSize: '11px', marginBottom: '12px' }}>
                        <div style={{ color: '#888', marginBottom: '4px' }}>
                            Hidden Digit → Direction Bias (CSPRNG State Leakage):
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '3px' }}>
                            {[0,1,2,3,4,5,6,7,8,9].map(h => {
                                const entry = calibrationData.hiddenDigitToNextDigit[h];
                                const upPct = entry && entry.total > 3 ? (entry.up / entry.total * 100) : 50;
                                const downPct = entry && entry.total > 3 ? (entry.down / entry.total * 100) : 50;
                                const isUpBiased = upPct > 53;
                                const isDownBiased = downPct > 53;
                                return (
                                    <div key={h} style={{
                                        padding: '4px 2px',
                                        background: isUpBiased ? '#0a2e0a' : isDownBiased ? '#2e0a0a' : '#1a1a1a',
                                        borderRadius: '3px',
                                        textAlign: 'center',
                                        border: `1px solid ${isUpBiased ? '#0f0' : isDownBiased ? '#f44' : '#333'}`,
                                    }}>
                                        <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '12px' }}>{h}</div>
                                        <div style={{ color: isUpBiased ? '#0f0' : isDownBiased ? '#f44' : '#888', fontSize: '10px', fontWeight: 'bold' }}>
                                            {isUpBiased ? `🔼${upPct.toFixed(0)}` : isDownBiased ? `🔽${downPct.toFixed(0)}` : '➡️'}
                                        </div>
                                        <div style={{ color: '#555', fontSize: '8px' }}>n={entry?.total || 0}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Streak Reversion Table */}
                    <div style={{ fontSize: '11px', marginBottom: '12px' }}>
                        <div style={{ color: '#888', marginBottom: '4px' }}>
                            Streak Reversion (3+ same-range consecutive digits):
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {Object.entries(calibrationData.streakReversionRates).map(([key, val]) => {
                                const flipPct = val.total > 0 ? (val.flipped / val.total * 100) : 0;
                                const isSignificant = flipPct > 55 || flipPct < 45;
                                return (
                                    <div key={key} style={{
                                        padding: '6px 12px',
                                        background: '#0d0d1a',
                                        borderRadius: '4px',
                                        border: `1px solid ${isSignificant ? '#f80' : '#333'}`,
                                    }}>
                                        <div style={{ color: '#aaa', fontSize: '10px' }}>
                                            {key === 'streak_high_len3' ? '3+ High Digits (5-9)' : '3+ Low Digits (0-4)'}
                                        </div>
                                        <div style={{
                                            color: flipPct > 55 ? '#f80' : flipPct < 45 ? '#0f0' : '#888',
                                            fontWeight: 'bold',
                                            fontSize: '13px',
                                        }}>
                                            Reversion: {flipPct.toFixed(0)}%
                                        </div>
                                        <div style={{ color: '#555', fontSize: '9px' }}>n={val.total} samples</div>
                                    </div>
                                );
                            })}
                            {Object.keys(calibrationData.streakReversionRates).length === 0 && (
                                <div style={{ color: '#555', fontStyle: 'italic' }}>Waiting for streaks of 3+...</div>
                            )}
                        </div>
                    </div>

                    {/* Top Digit Transitions */}
                    <div style={{ fontSize: '11px' }}>
                        <div style={{ color: '#888', marginBottom: '4px' }}>Top 5 Digit Transitions:</div>
                        <div style={{ color: '#aaa', fontSize: '10px', lineHeight: '1.6' }}>
                            {(() => {
                                const transitions: { from: number; to: number; count: number }[] = [];
                                for (let f = 0; f <= 9; f++) {
                                    for (let t = 0; t <= 9; t++) {
                                        const count = calibrationData.digitTransitionMatrix[f]?.[t] || 0;
                                        if (count > 0) transitions.push({ from: f, to: t, count });
                                    }
                                }
                                transitions.sort((a, b) => b.count - a.count);
                                return transitions.slice(0, 5).map((t, i) => (
                                    <span key={i} style={{ marginRight: '12px' }}>
                                        {t.from}→{t.to} ({t.count}x)
                                    </span>
                                ));
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* SIGNAL GRID */}
            <div className='signal-zone__grid'>
                {signals.map(sig => {
                    const hasSignal =
                        activeView === 'rise-fall'
                            ? sig.rise !== 'neutral' || sig.fall !== 'neutral'
                            : activeView === 'over-under'
                            ? sig.over2 !== 'neutral' || sig.under7 !== 'neutral'
                            : sig.even !== 'neutral' || sig.odd !== 'neutral';

                    return (
                        <div
                            key={sig.symbol}
                            className={`sz-card ${hasSignal ? 'sz-card--signal' : ''}`}
                            style={hasSignal ? {
                                borderColor: '#0f0',
                                boxShadow: '0 0 12px rgba(0,255,0,0.3)',
                            } : {}}
                        >
                            <div className='sz-card__header'>
                                <span className='sz-card__symbol'>{sig.label}</span>
                                <span className='sz-card__ticks'>{sig.tickCount} ticks</span>
                            </div>

                            {activeView === 'over-under' && (
                                <div className='sz-card__signals'>
                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                        {getSignalBadge(sig.over2, '🔼 Over', sig.riseStrength)}
                                        {getSignalBadge(sig.under7, '🔽 Under', sig.fallStrength)}
                                    </div>
                                    {sig.over2 !== 'neutral' && (
                                        <div style={{ marginTop: '6px' }}>
                                            <div className='sz-strength-bar'>
                                                <div
                                                    className='sz-strength-bar__rise'
                                                    style={{
                                                        width: `${sig.riseStrength}%`,
                                                        background: sig.riseStrength > 75
                                                            ? 'linear-gradient(to right, #0a0, #0f0)'
                                                            : 'linear-gradient(to right, #aa0, #ff0)',
                                                    }}
                                                />
                                            </div>
                                            <div style={{ color: '#aaa', fontSize: '10px', marginTop: '2px' }}>
                                                Win Prob: {sig.riseStrength}% · Stake: ${calculateDynamicStake(sig.riseStrength / 100).toFixed(2)}
                                            </div>
                                        </div>
                                    )}
                                    {sig.under7 !== 'neutral' && (
                                        <div style={{ marginTop: '6px' }}>
                                            <div className='sz-strength-bar'>
                                                <div
                                                    className='sz-strength-bar__rise'
                                                    style={{
                                                        width: `${sig.fallStrength}%`,
                                                        background: sig.fallStrength > 75
                                                            ? 'linear-gradient(to right, #a00, #f44)'
                                                            : 'linear-gradient(to right, #a80, #f80)',
                                                    }}
                                                />
                                            </div>
                                            <div style={{ color: '#aaa', fontSize: '10px', marginTop: '2px' }}>
                                                Win Prob: {sig.fallStrength}% · Stake: ${calculateDynamicStake(sig.fallStrength / 100).toFixed(2)}
                                            </div>
                                        </div>
                                    )}
                                    {sig.over2 === 'neutral' && sig.under7 === 'neutral' && (
                                        <div style={{ color: '#555', fontSize: '11px', fontStyle: 'italic', marginTop: '4px' }}>
                                            Waiting for signal...
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeView === 'even-odd' && (
                                <div className='sz-card__signals'>
                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                        {getSignalBadge(sig.even, '⚖️ Even')}
                                        {getSignalBadge(sig.odd, '🎲 Odd')}
                                    </div>
                                    {sig.even === 'neutral' && sig.odd === 'neutral' && (
                                        <div style={{ color: '#555', fontSize: '11px', fontStyle: 'italic', marginTop: '4px' }}>
                                            Waiting for signal...
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeView === 'rise-fall' && (
                                <div className='sz-card__signals'>
                                    {getSignalBadge(sig.rise, '📈 Rise')}
                                    {getSignalBadge(sig.fall, '📉 Fall')}
                                    <div className='sz-strength-bar'>
                                        <div className='sz-strength-bar__rise' style={{ width: `${sig.riseStrength}%` }} />
                                    </div>
                                    <div className='sz-card__pct'>
                                        <span style={{ color: '#22c55e' }}>Rise {sig.riseStrength}%</span>
                                        <span style={{ color: '#ef4444' }}>Fall {sig.fallStrength}%</span>
                                    </div>
                                </div>
                            )}

                            {sig.tickCount < 30 && (
                                <div className='sz-card__loading'>
                                    <span className='sz-spinner' /> Loading ticks ({sig.tickCount}/30)…
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* LIVE CONFIDENCE OVERLAY */}
            {running && calibrationData?.calibrationComplete && (
                <div style={{
                    position: 'fixed',
                    bottom: '10px',
                    left: '10px',
                    background: 'rgba(0,0,0,0.92)',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    color: '#0f0',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    zIndex: 99999,
                    border: '1px solid #0f0',
                    maxWidth: '340px',
                    pointerEvents: 'none',
                    backdropFilter: 'blur(4px)',
                }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#0f0' }}>
                        🔴 EDGE ENGINE {autoTrade ? (isAuthorized ? '· 🟢 AUTO-TRADING' : '· 🟡 AUTHORIZING') : ''}
                    </div>
                    <div style={{ color: '#888', fontSize: '10px' }}>
                        Latency: {Math.round(latency)}ms · Trades: {dailyStats.trades}/{MAX_DAILY_TRADES} · P&L: {dailyStats.profit >= 0 ? '+' : ''}${dailyStats.profit.toFixed(2)}
                    </div>
                    <div style={{ color: '#888', fontSize: '10px' }}>
                        Signals: {signals.filter(s => s.over2 !== 'neutral').length} Over · {signals.filter(s => s.under7 !== 'neutral').length} Under
                    </div>
                    {signals.filter(s => s.over2 !== 'neutral' || s.under7 !== 'neutral').slice(0, 3).map(s => (
                        <div key={s.symbol} style={{
                            marginTop: '4px',
                            paddingTop: '4px',
                            borderTop: '1px solid #222',
                            fontSize: '10px',
                            display: 'flex',
                            justifyContent: 'space-between',
                        }}>
                            <span style={{ color: '#aaa' }}>{s.label}</span>
                            <span>
                                {s.over2 !== 'neutral' && (
                                    <span style={{ color: '#0f0', marginLeft: '4px' }}>Over {s.riseStrength}%</span>
                                )}
                                {s.under7 !== 'neutral' && (
                                    <span style={{ color: '#f44', marginLeft: '4px' }}>Under {s.fallStrength}%</span>
                                )}
                            </span>
                        </div>
                    ))}
                    <div style={{ marginTop: '4px', fontSize: '9px', color: '#555' }}>
                        {calibrationData.ticksAnalyzed} ticks analyzed · v2.1
                    </div>
                </div>
            )}
        </div>
    );
};

export default SignalZone;
