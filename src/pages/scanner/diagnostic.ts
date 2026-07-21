// ═══════════════════════════════════════════════════════════════
// DIAGNOSTIC: Is the digit distribution ACTUALLY uniform?
// Run this BEFORE touching anything else
// ═══════════════════════════════════════════════════════════════

import { getLastDigitFromQuote } from '@/utils/market-data';
import { TTickPoint } from '@/types';

interface DiagnosticResult {
    isUniform: boolean;
    chiSquare: number;
    criticalValue: number;
    digitDistribution: { digit: number; count: number; pct: number; deviationPct: number }[];
    contractEdges: { contract: string; empiricalPct: number; theoreticalPct: number }[];
    recommendation: string;
}

export const runDigitDistributionDiagnostic = (ticks: TTickPoint[]): DiagnosticResult => {
    if (ticks.length < 100) {
        return {
            isUniform: true,
            chiSquare: 0,
            criticalValue: 16.92,
            digitDistribution: [],
            contractEdges: [],
            recommendation: '❌ INSUFFICIENT DATA: Need at least 100 ticks. Currently have ' + ticks.length,
        };
    }

    // Count each digit (0-9)
    const counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const t of ticks) {
        const d = getLastDigitFromQuote(t.quote);
        counts[d]++;
    }

    const total = ticks.length;
    const expected = total / 10; // Expected count per digit if uniform

    // Chi-square test
    const chi2 = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    // Critical value for 9 degrees of freedom at p=0.05: 16.92
    // Critical value for 9 degrees of freedom at p=0.01: 21.67
    const CRITICAL_005 = 16.92;
    const isUniform = chi2 <= CRITICAL_005;

    // Digit distribution table
    const digitDistribution = counts.map((count, digit) => ({
        digit,
        count,
        pct: (count / total) * 100,
        deviationPct: ((count / total) - 0.10) * 100,
    }));

    // Check every contract type empirically
    const contractEdges: { contract: string; empiricalPct: number; theoreticalPct: number }[] = [];
    const contracts = [
        { name: 'OVER_0',  type: 'OVER',  barrier: 0,  theory: 90 },
        { name: 'OVER_1',  type: 'OVER',  barrier: 1,  theory: 80 },
        { name: 'OVER_2',  type: 'OVER',  barrier: 2,  theory: 70 },
        { name: 'OVER_3',  type: 'OVER',  barrier: 3,  theory: 60 },
        { name: 'OVER_4',  type: 'OVER',  barrier: 4,  theory: 50 },
        { name: 'OVER_5',  type: 'OVER',  barrier: 5,  theory: 40 },
        { name: 'OVER_6',  type: 'OVER',  barrier: 6,  theory: 30 },
        { name: 'OVER_7',  type: 'OVER',  barrier: 7,  theory: 20 },
        { name: 'OVER_8',  type: 'OVER',  barrier: 8,  theory: 10 },
        { name: 'UNDER_1', type: 'UNDER', barrier: 1,  theory: 10 },
        { name: 'UNDER_2', type: 'UNDER', barrier: 2,  theory: 20 },
        { name: 'UNDER_3', type: 'UNDER', barrier: 3,  theory: 30 },
        { name: 'UNDER_4', type: 'UNDER', barrier: 4,  theory: 40 },
        { name: 'UNDER_5', type: 'UNDER', barrier: 5,  theory: 50 },
        { name: 'UNDER_6', type: 'UNDER', barrier: 6,  theory: 60 },
        { name: 'UNDER_7', type: 'UNDER', barrier: 7,  theory: 70 },
        { name: 'UNDER_8', type: 'UNDER', barrier: 8,  theory: 80 },
        { name: 'UNDER_9', type: 'UNDER', barrier: 9,  theory: 90 },
        { name: 'EVEN',    type: 'EVEN',  barrier: -1, theory: 50 },
        { name: 'ODD',     type: 'ODD',   barrier: -1, theory: 50 },
    ];

    for (const c of contracts) {
        let wins = 0;
        // Simulate: settlement is the NEXT tick after the observation tick
        for (let i = 0; i < ticks.length - 1; i++) {
            const settlementTick = ticks[i + 1];
            if (!settlementTick) continue;

            const digit = getLastDigitFromQuote(settlementTick.quote);
            let won = false;

            if (c.type === 'OVER' && digit > c.barrier) won = true;
            else if (c.type === 'UNDER' && digit < c.barrier) won = true;
            else if (c.type === 'EVEN' && digit % 2 === 0) won = true;
            else if (c.type === 'ODD' && digit % 2 === 1) won = true;

            if (won) wins++;
        }

        const empiricalPct = (wins / (ticks.length - 1)) * 100;
        contractEdges.push({
            contract: c.name,
            empiricalPct: parseFloat(empiricalPct.toFixed(2)),
            theoreticalPct: c.theory,
        });
    }

    // Find contracts where empirical differs from theoretical by more than 1.5%
    const anomalies = contractEdges.filter(c => Math.abs(c.empiricalPct - c.theoreticalPct) > 1.5);

    let recommendation: string;
    if (!isUniform) {
        recommendation = `🔴 NON-UNIFORM DISTRIBUTION DETECTED (χ²=${chi2.toFixed(2)} > ${CRITICAL_005})\n`
            + `The digit stream has exploitable structure!\n`
            + `Contracts with anomalous empirical probability:\n`
            + anomalies.map(a => `  ${a.contract}: empirical=${a.empiricalPct}% vs theory=${a.theoreticalPct}% (diff=${(a.empiricalPct - a.theoreticalPct).toFixed(2)}%)`).join('\n')
            + `\n→ The empirical engine will find positive edge trades.`;
    } else {
        // Even if uniform, check if ANY contract has empirical > theoretical + 1.5%
        const bestUpside = contractEdges.filter(c => c.empiricalPct > c.theoreticalPct + 1.5);
        if (bestUpside.length > 0) {
            recommendation = `🟡 Distribution is uniform (χ²=${chi2.toFixed(2)} ≤ ${CRITICAL_005})\n`
                + `BUT some contracts show empirical > theoretical:\n`
                + bestUpside.map(a => `  ${a.contract}: empirical=${a.empiricalPct}% vs theory=${a.theoreticalPct}%`).join('\n')
                + `\n→ The empirical engine may STILL find trades.`;
        } else {
            recommendation = `✅ Distribution is truly uniform (χ²=${chi2.toFixed(2)} ≤ ${CRITICAL_005})\n`
                + `All contract empirical probabilities match theoretical within ±1.5%.\n`
                + `→ No exploitable structure exists. Engine will remain stuck correctly.`;
        }
    }

    return {
        isUniform,
        chiSquare: parseFloat(chi2.toFixed(2)),
        criticalValue: CRITICAL_005,
        digitDistribution,
        contractEdges,
        recommendation,
    };
};
