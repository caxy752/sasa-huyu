import { expose } from 'threads/worker';

const analyzeVolatility = async ({ tick_data, contract_type, barrier }) => {
    let bestVolatility = null;
    let minInstability = Infinity;

    const barrier_num = parseInt(barrier, 10);
    let target_digits = [];

    if (contract_type === 'DIGITOVER') {
        // Digits that should be stable (not appear) are below the barrier
        for (let i = 0; i < barrier_num; i++) {
            target_digits.push(i);
        }
    } else { // DIGITUNDER
        // Digits that should be stable (not appear) are above the barrier
        for (let i = barrier_num + 1; i < 10; i++) {
            target_digits.push(i);
        }
    }

    if (target_digits.length === 0) {
        // No digits to analyze, return a random one
        const symbols = Object.keys(tick_data);
        return symbols[Math.floor(Math.random() * symbols.length)];
    }

    for (const symbol in tick_data) {
        const ticks = tick_data[symbol];
        if (ticks.length < 50) continue;

        const first_half = ticks.slice(0, 25);
        const second_half = ticks.slice(25, 50);

        const countInFirstHalf = first_half.filter(t => target_digits.includes(t)).length;
        const countInSecondHalf = second_half.filter(t => target_digits.includes(t)).length;

        const percentInFirstHalf = (countInFirstHalf / 25) * 100;
        const percentInSecondHalf = (countInSecondHalf / 25) * 100;

        // We are looking for the smallest increase, or the largest decrease, in percentage.
        const instability_score = percentInSecondHalf - percentInFirstHalf;

        if (instability_score < minInstability) {
            minInstability = instability_score;
            bestVolatility = symbol;
        }
    }

    return bestVolatility;
};

expose({ analyzeVolatility });
