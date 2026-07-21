// ═══════════════════════════════════════════════════════════════
// EMPIRICAL PROBABILITY ENGINE v1.0
// Replaces the theoretical probability approach
// Uses Deriv's OWN tick history to compute win rates
// ═══════════════════════════════════════════════════════════════

import { getLastDigitFromQuote } from '@/utils/market-data';
import { TTickPoint } from '@/types';

interface EmpiricalResult {
    probability: number;    // 0-1
    samples: number;
    confidence: number;     // 0-1, higher = more reliable
    winRate: number;        // 0-1
    loseRate: number;       // 0-1
}

interface ContractDecision {
    contractType: string;
    barrier: string;
    empiricalProb: number;
    theoreticalProb: number;
    breakEven: number;      // From live API proposal
    edge: number;           // empiricalProb - breakEven
    confidence: number;
    shouldTrade: boolean;
    reason: string;
}

export class EmpiricalProbabilityEngine {
    private tickBuffer: TTickPoint[] = [];
    private readonly MAX_BUFFER = 500;
    private digitCounts: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    private totalTicks = 0;

    // ── FEED TICKS FROM DERIV API ──────────────────────────
    feedTick(tick: TTickPoint): void {
        this.tickBuffer.push(tick);
        if (this.tickBuffer.length > this.MAX_BUFFER) {
            this.tickBuffer.shift();
        }

        const digit = getLastDigitFromQuote(tick.quote);
        this.digitCounts[digit]++;
        this.totalTicks++;
    }

    // ── RESET FOR SEED ROTATION ────────────────────────────
    reset(): void {
        this.tickBuffer = [];
        this.digitCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        this.totalTicks = 0;
    }

    get tickCount(): number {
        return this.tickBuffer.length;
    }

    // ── EMPIRICAL PROBABILITY FOR ANY CONTRACT ─────────────
    // This checks: "If I had traded this contract on every
    // observation→next-tick pair in the buffer, what % would win?"
    getEmpiricalProbability(
        contractType: string,
        barrier: number
    ): EmpiricalResult {
        if (this.tickBuffer.length < 10) {
            return { probability: 0.1, samples: 0, confidence: 0, winRate: 0, loseRate: 0 };
        }

        let wins = 0;
        let losses = 0;

        // Simulate: observation at index i, settlement at index i+1
        for (let i = 0; i < this.tickBuffer.length - 1; i++) {
            const settlementTick = this.tickBuffer[i + 1];
            if (!settlementTick) continue;

            const digit = getLastDigitFromQuote(settlementTick.quote);
            let won = false;

            switch (contractType) {
                case 'DIGITOVER':
                    won = digit > barrier;
                    break;
                case 'DIGITUNDER':
                    won = digit < barrier;
                    break;
                case 'DIGITEVEN':
                    won = digit % 2 === 0;
                    break;
                case 'DIGITODD':
                    won = digit % 2 === 1;
                    break;
                case 'DIGITMATCH':
                    won = digit === barrier;
                    break;
                case 'DIGITDIFFERS':
                    won = digit !== barrier;
                    break;
                default:
                    won = false;
            }

            if (won) wins++;
            else losses++;
        }

        const total = wins + losses;
        const prob = total > 0 ? wins / total : 0.1;
        const confidence = total >= 200 ? 0.95
            : total >= 100 ? 0.80
            : total >= 50  ? 0.60
            : total >= 20  ? 0.40
            : 0.10;

        return {
            probability: parseFloat(prob.toFixed(4)),
            samples: total,
            confidence,
            winRate: total > 0 ? wins / total : 0,
            loseRate: total > 0 ? losses / total : 0,
        };
    }

    // ── MULTI-GAP ANALYSIS (1-tick, 2-tick, 3-tick) ──────
    // The "1 tick" contract on Deriv settles on Tick_{N+2} due to
    // processing delay. This measures actual gaps that occurred.
    getMultiGapProbability(
        contractType: string,
        barrier: number,
        gapTicks: number // 1, 2, or 3
    ): EmpiricalResult {
        if (this.tickBuffer.length < gapTicks + 2) {
            return { probability: 0.1, samples: 0, confidence: 0, winRate: 0, loseRate: 0 };
        }

        let wins = 0;
        let losses = 0;

        for (let i = 0; i < this.tickBuffer.length - gapTicks; i++) {
            const settlementTick = this.tickBuffer[i + gapTicks];
            if (!settlementTick) continue;

            const digit = getLastDigitFromQuote(settlementTick.quote);
            let won = false;

            switch (contractType) {
                case 'DIGITOVER':
                    won = digit > barrier;
                    break;
                case 'DIGITUNDER':
                    won = digit < barrier;
                    break;
                case 'DIGITEVEN':
                    won = digit % 2 === 0;
                    break;
                case 'DIGITODD':
                    won = digit % 2 === 1;
                    break;
                default:
                    won = false;
            }

            if (won) wins++;
            else losses++;
        }

        const total = wins + losses;
        const prob = total > 0 ? wins / total : 0.1;
        const confidence = total >= 200 ? 0.95 : total >= 100 ? 0.80 : total >= 50 ? 0.60 : 0.10;

        return {
            probability: parseFloat(prob.toFixed(4)),
            samples: total,
            confidence,
            winRate: total > 0 ? wins / total : 0,
            loseRate: total > 0 ? losses / total : 0,
        };
    }

    // ── THE DECISION FUNCTION ──────────────────────────────
    // This is what replaces the old theoretical check.
    // It requires a LIVE proposal from Deriv's API.
    evaluateContract(
        contractType: string,
        barrier: string,
        liveProposal: { payout: number; ask_price: number }
    ): ContractDecision {
        const b = parseInt(barrier);

        // Get empirical probability from Deriv's own tick data
        const emp = this.getEmpiricalProbability(contractType, b);

        // Also check 2-tick gap (more realistic for actual settlement)
        const emp2Tick = this.getMultiGapProbability(contractType, b, 2);

        // Best estimate: weighted average of 1 and 2 tick gaps
        let bestProb = emp.probability;
        if (emp2Tick.samples >= 50) {
            const w1 = emp.samples;
            const w2 = emp2Tick.samples;
            bestProb = (emp.probability * w1 + emp2Tick.probability * w2) / (w1 + w2);
        }
        const totalSamples = emp.samples + emp2Tick.samples;

        // Theoretical probability (for comparison)
        let theoreticalProb: number;
        switch (contractType) {
            case 'DIGITOVER':
                theoreticalProb = (9 - b) / 10;
                break;
            case 'DIGITUNDER':
                theoreticalProb = b / 10;
                break;
            case 'DIGITEVEN':
            case 'DIGITODD':
                theoreticalProb = 0.5;
                break;
            default:
                theoreticalProb = 0.1;
        }

        // Break-even from Deriv's LIVE payout
        const payoutPct = (liveProposal.payout - liveProposal.ask_price) / liveProposal.ask_price;
        const breakEven = 1 / (1 + payoutPct);

        // Edge = empirical probability - break-even (NOT theoretical - break-even)
        const edge = bestProb - breakEven;

        // Decision: any positive edge AND at least 30 samples (confidence ≥ 0.4)
        const shouldTrade = edge > 0.001 && emp.confidence >= 0.4;

        let reason: string;
        if (shouldTrade) {
            reason = `✅ EDGE FOUND: empirical=${(bestProb * 100).toFixed(1)}% vs break-even=${(breakEven * 100).toFixed(1)}% → edge=${(edge * 100).toFixed(2)}% (${totalSamples} samples)`;
        } else if (edge > 0) {
            reason = `⏳ Small edge but low confidence: ${(edge * 100).toFixed(2)}% edge, confidence=${emp.confidence}, samples=${totalSamples}`;
        } else {
            reason = `❌ No edge: empirical=${(bestProb * 100).toFixed(1)}% ≤ break-even=${(breakEven * 100).toFixed(1)}% → edge=${(edge * 100).toFixed(2)}% (${totalSamples} samples)`;
        }

        const bestConfidence = emp.samples >= 200 ? 0.95 : emp.samples >= 100 ? 0.80 : emp.samples >= 50 ? 0.60 : 0.30;

        return {
            contractType,
            barrier,
            empiricalProb: bestProb,
            theoreticalProb,
            breakEven,
            edge: parseFloat(edge.toFixed(4)),
            confidence: bestConfidence,
            shouldTrade,
            reason,
        };
    }

    // ── CHI-SQUARE TEST (Detection Layer: Seed Rotation) ───
    // Run every 100 ticks. If chi² > 21.67 (p<0.01),
    // the distribution has shifted → reset buffer
    detectSeedRotation(): boolean {
        if (this.totalTicks < 100) return false;

        const expected = this.totalTicks / 10;
        const chi2 = this.digitCounts.reduce(
            (sum, c) => sum + (c - expected) ** 2 / expected,
            0
        );

        // Critical value at 9 df, p<0.01 = 21.67
        return chi2 > 21.67;
    }
}
