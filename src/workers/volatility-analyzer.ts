
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

        // For DIFFERS, the "bad" digit is exactly the barrier.
        // For OVER/UNDER, the "bad" digits are those that don't meet the condition.
        if (p_contract_type === 'DIGITDIFF') {
            target_digits = [barrier_num];
        } else if (p_contract_type === 'DIGITOVER') {
            for (let i = 0; i <= barrier_num; i++) {
                target_digits.push(i);
            }
        } else if (p_contract_type === 'DIGITUNDER') {
            for (let i = barrier_num; i < 10; i++) {
                target_digits.push(i);
            }
        }

        if (target_digits.length === 0) {
            return Infinity;
        }

        const recent_ticks = p_ticks.slice(-50);
        
        // New logic for DIFFERS: Look for volatility where digits rarely repeat themselves
        if (p_contract_type === 'DIGITDIFF') {
            let repeat_count = 0;
            for (let i = 1; i < recent_ticks.length; i++) {
                if (recent_ticks[i] === recent_ticks[i - 1]) {
                    repeat_count++;
                }
            }
            
            // Calculate percentage of repeats
            const repeat_percent = (repeat_count / (recent_ticks.length - 1)) * 100;
            
            // Base instability from original logic
            const totalCount = recent_ticks.filter(t => target_digits.includes(t)).length;
            const totalPercent = (totalCount / 50) * 100;
            
            // Combine: we want low repeats AND low appearance of the barrier digit
            // Lower score is better.
            return (repeat_percent * 2.0) + totalPercent;
        }

        const first_half = recent_ticks.slice(0, 25);
        const second_half = recent_ticks.slice(25, 50);

        const countInFirstHalf = first_half.filter(t => target_digits.includes(t)).length;
        const countInSecondHalf = second_half.filter(t => target_digits.includes(t)).length;

        const percentInFirstHalf = (countInFirstHalf / 25) * 100;
        const percentInSecondHalf = (countInSecondHalf / 25) * 100;

        // Trend of "bad" digits. Higher is worse.
        const trend = percentInSecondHalf - percentInFirstHalf;

        const totalCount = recent_ticks.filter(t => target_digits.includes(t)).length;
        const totalPercent = (totalCount / 50) * 100;

        // Instability score: weighted sum of trend and total percentage of "bad" digits.
        let instability_score = (trend * 2.0) + totalPercent;

        return instability_score;
    };

    const score = calculateInstability(ticks, contract_type, barrier);

    self.postMessage({ score });
};
