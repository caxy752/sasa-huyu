
self.onmessage = (event) => {
    const { ticks, contract_type, barrier } = event.data;

    const calculateInstability = (
        p_ticks: number[],
        p_contract_type: string,
        p_barrier: string
    ): number => {
        if (p_ticks.length < 50) return Infinity;

        const barrier_num = parseInt(p_barrier, 10);
        let target_digits: number[] = [];

        if (p_contract_type === 'DIGITOVER') {
            for (let i = 0; i < barrier_num; i++) {
                target_digits.push(i);
            }
        } else { // DIGITUNDER
            for (let i = barrier_num + 1; i < 10; i++) {
                target_digits.push(i);
            }
        }

        if (target_digits.length === 0) {
            return Infinity;
        }

        const recent_ticks = p_ticks.slice(-50);
        const first_half = recent_ticks.slice(0, 25);
        const second_half = recent_ticks.slice(25, 50);

        const countInFirstHalf = first_half.filter(t => target_digits.includes(t)).length;
        const countInSecondHalf = second_half.filter(t => target_digits.includes(t)).length;

        const percentInFirstHalf = (countInFirstHalf / 25) * 100;
        const percentInSecondHalf = (countInSecondHalf / 25) * 100;

        // Trend of "bad" digits. Higher is worse.
        const trend = Math.max(0, percentInSecondHalf - percentInFirstHalf);

        const totalCount = recent_ticks.filter(t => target_digits.includes(t)).length;
        const totalPercent = (totalCount / 50) * 100;

        // Instability score: weighted sum of trend and total percentage of "bad" digits.
        // A lower score is better (more stable).
        const instability_score = (trend * 1.5) + totalPercent;

        return instability_score;
    };

    const score = calculateInstability(ticks, contract_type, barrier);

    self.postMessage({ score });
};
