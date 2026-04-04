
// ═══════════════════════════════════════════════════════════
//  Makoti AI - Advanced Over/Under Analysis Engine
// ═══════════════════════════════════════════════════════════

// ── Type Definitions ────────────────────────────────────────
export interface AnalysisResult {
    goldenEntries: GoldenEntry[];
}

export interface GoldenEntry {
    contractType: 'DIGITOVER' | 'DIGITUNDER';
    triggerDigits: number[];
    barrier: string;
    duration: number;
    winRate: number;
    confidence: number;
    analysis: string;
    triggerType: 'consecutive' | 'single';
}

interface StrategyInput {
    history: number[];
    pip_sizes: { [key: string]: number };
    symbol: string;
}

interface StrategyOutput {
    votes: { [key: string]: number }; // e.g., { 'OVER_3': 0.7, 'UNDER_6': -0.4 }
}

// ── 1. Probabilistic & Frequency Models ──────────────────────

/**
 * Calculates the historical probability of each digit.
 */
const globalFrequencyStrategy = (input: StrategyInput): StrategyOutput => {
    const { history } = input;
    const votes: { [key: string]: number } = {};
    if (history.length < 100) return { votes };

    const counts = Array(10).fill(0);
    history.forEach(digit => counts[digit]++);
    const total = history.length;

    for (let barrier = 0; barrier <= 9; barrier++) {
        // Vote for OVER
        let over_prob = 0;
        for (let i = barrier + 1; i <= 9; i++) {
            over_prob += (counts[i] / total);
        }
        votes[`OVER_${barrier}`] = (over_prob - 0.45) * 2; // Normalize around 0.5 avg

        // Vote for UNDER
        let under_prob = 0;
        for (let i = 0; i < barrier; i++) {
            under_prob += (counts[i] / total);
        }
        votes[`UNDER_${barrier}`] = (under_prob - 0.45) * 2; // Normalize around 0.5 avg
    }
    return { votes };
};

/**
 * Identifies "hot" or "cold" digits based on recent activity.
 */
const localFrequencyStrategy = (input: StrategyInput): StrategyOutput => {
    const { history } = input;
    const votes: { [key: string]: number } = {};
    if (history.length < 50) return { votes };
    const local_history = history.slice(-50);

    const counts = Array(10).fill(0);
    local_history.forEach(digit => counts[digit]++);

    for (let barrier = 3; barrier <= 6; barrier++) {
        const high_hotness = (counts[7] + counts[8] + counts[9]) / 15; // Avg 3 digits over 50 ticks
        const low_hotness = (counts[0] + counts[1] + counts[2]) / 15;

        votes[`OVER_${barrier}`] = (high_hotness - low_hotness) * 1.5;
        votes[`UNDER_${barrier}`] = (low_hotness - high_hotness) * 1.5;
    }
    return { votes };
};


// ── 2. Markovian & Transition Models ───────────────────────
/**
 * Uses a Lag-1 Transition Matrix to predict the next digit based on the current one.
 */
const markovChainStrategy = (input: StrategyInput): StrategyOutput => {
    const { history } = input;
    const votes: { [key: string]: number } = {};
    if (history.length < 200) return { votes };

    const matrix = Array(10).fill(0).map(() => Array(10).fill(0));
    for (let i = 1; i < history.length; i++) {
        const prev_digit = history[i - 1];
        const curr_digit = history[i];
        matrix[prev_digit][curr_digit]++;
    }

    const last_digit = history[history.length - 1];
    const next_digit_counts = matrix[last_digit];
    const total_transitions = next_digit_counts.reduce((a, b) => a + b, 0);
    if (total_transitions === 0) return { votes };

    const next_digit_probs = next_digit_counts.map(c => c / total_transitions);

    for (let barrier = 0; barrier <= 9; barrier++) {
        let over_prob = 0;
        for (let i = barrier + 1; i <= 9; i++) {
            over_prob += next_digit_probs[i];
        }
        votes[`OVER_${barrier}`] = (over_prob - 0.45) * 2.5; // Stronger weight

        let under_prob = 0;
        for (let i = 0; i < barrier; i++) {
            under_prob += next_digit_probs[i];
        }
        votes[`UNDER_${barrier}`] = (under_prob - 0.45) * 2.5;
    }
    return { votes };
};


// ── 3. Trend & Oscillator Adaptations ────────────────────────
/**
 * Adapts the Relative Strength Index (RSI) to measure momentum of high vs. low digits.
 */
const digitRSIStrategy = (input: StrategyInput): StrategyOutput => {
    const { history } = input;
    const votes: { [key: string]: number } = {};
    if (history.length < 30) return { votes };
    const period = 14;
    const rsi_history = history.slice(-30);

    let gains = 0;
    let losses = 0;

    for (let i = 1; i < rsi_history.length; i++) {
        const diff = rsi_history[i] - rsi_history[i - 1];
        if (diff > 0) {
            gains += diff;
        } else {
            losses -= diff;
        }
    }

    const avg_gain = gains / period;
    const avg_loss = losses / period;
    if (avg_loss === 0) return { votes };
    const rs = avg_gain / avg_loss;
    const rsi = 100 - (100 / (1 + rs));

    const rsi_vote = (rsi - 50) / 25; // Normalize: >0 is bullish (favors OVER), <0 is bearish (favors UNDER)

    for (let barrier = 3; barrier <= 6; barrier++) {
        votes[`OVER_${barrier}`] = rsi_vote;
        votes[`UNDER_${barrier}`] = -rsi_vote;
    }
    return { votes };
};

/**
 * Uses a moving average to find the "trend" of the digits.
 */
const digitMovingAverageStrategy = (input: StrategyInput): StrategyOutput => {
    const { history } = input;
    const votes: { [key:string]: number } = {};
    if (history.length < 20) return { votes };

    const short_ma_history = history.slice(-5);
    const long_ma_history = history.slice(-20);
    const short_ma = short_ma_history.reduce((a, b) => a + b, 0) / short_ma_history.length;
    const long_ma = long_ma_history.reduce((a, b) => a + b, 0) / long_ma_history.length;

    // If short MA is above long MA, it's an "uptrend" for digits (favors OVER)
    const ma_vote = (short_ma - long_ma); // Can be positive or negative

    for (let barrier = 3; barrier <= 6; barrier++) {
        votes[`OVER_${barrier}`] = ma_vote;
        votes[`UNDER_${barrier}`] = -ma_vote;
    }
    return { votes };
};


// ── Master Analysis Function ─────────────────────────────────

const strategies = [
    globalFrequencyStrategy,
    localFrequencyStrategy,
    markovChainStrategy,
    digitRSIStrategy,
    digitMovingAverageStrategy,
];

const simulateTrade = (
    history: number[],
    contractType: 'DIGITOVER' | 'DIGITUNDER',
    barrier: number,
    triggerDigit: number,
    duration: number
): number => {
    let wins = 0;
    let trades = 0;
    
    for (let i = 1; i < history.length - duration; i++) {
        if (history[i - 1] === triggerDigit) {
            trades++;
            const outcome_tick = history[i + duration - 1];
            if (contractType === 'DIGITOVER' && outcome_tick > barrier) {
                wins++;
            } else if (contractType === 'DIGITUNDER' && outcome_tick < barrier) {
                wins++;
            }
        }
    }
    return trades > 5 ? wins / trades : 0;
};

export const analyzeDigits = (history: number[], symbol: string): AnalysisResult => {
    const goldenEntries: GoldenEntry[] = [];
    if (history.length < 200) {
        return { goldenEntries };
    }

    const strategy_input: StrategyInput = { history, pip_sizes: {}, symbol };
    const all_votes: { [key: string]: number[] } = {};

    // 1. Run all strategies and collect votes
    strategies.forEach(strategy => {
        const output = strategy(strategy_input);
        for (const [key, value] of Object.entries(output.votes)) {
            if (!all_votes[key]) all_votes[key] = [];
            all_votes[key].push(value);
        }
    });

    // 2. Aggregate votes to get a final score for each potential trade
    const final_scores: { [key: string]: number } = {};
    for (const [key, values] of Object.entries(all_votes)) {
        final_scores[key] = values.reduce((a, b) => a + b, 0) / values.length;
    }
    
    // 3. Find the best trade opportunities by simulating them
    const potential_trades: {contractType: 'DIGITOVER' | 'DIGITUNDER', barrier: number}[] = [
        { contractType: 'DIGITOVER', barrier: 3 },
        { contractType: 'DIGITOVER', barrier: 4 },
        { contractType: 'DIGITUNDER', barrier: 5 },
        { contractType: 'DIGITUNDER', barrier: 6 },
    ];
    
    for (let triggerDigit = 0; triggerDigit <= 9; triggerDigit++) {
        for (const trade of potential_trades) {
             for (let duration = 1; duration <= 3; duration++) {
                // Check score from strategies
                const score_key = `${trade.contractType.replace('DIGIT', '')}_${trade.barrier}`;
                const confidence = final_scores[score_key] || 0;

                // Only proceed if the strategies show a strong signal
                if ((trade.contractType === 'DIGITOVER' && confidence > 0.5) || (trade.contractType === 'DIGITUNDER' && confidence < -0.5)) {
                    const winRate = simulateTrade(history, trade.contractType, trade.barrier, triggerDigit, duration);
                    
                    if (winRate > 0.65) { // High threshold for a golden entry
                        goldenEntries.push({
                            contractType: trade.contractType,
                            barrier: String(trade.barrier),
                            triggerDigits: [triggerDigit],
                            duration: duration,
                            winRate: winRate,
                            confidence: Math.abs(confidence),
                            analysis: `Trade ${trade.contractType.replace('DIGIT','')} ${trade.barrier} when trigger digit ${triggerDigit} appears. (WR: ${(winRate*100).toFixed(0)}%, Confidence: ${Math.abs(confidence).toFixed(2)})`,
                            triggerType: 'single',
                        });
                    }
                }
             }
        }
    }

    // 4. Sort to find the best of the best
    goldenEntries.sort((a, b) => {
        const score_a = a.winRate * a.confidence;
        const score_b = b.winRate * b.confidence;
        return score_b - score_a;
    });

    return { goldenEntries: goldenEntries.slice(0, 5) }; // Return top 5
};
