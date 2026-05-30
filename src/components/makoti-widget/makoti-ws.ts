import { getAppId, getSocketURL } from '@/components/shared';

// ─── Symbols & pip sizes ──────────────────────────────────────────────────────

export const ALL_SYMBOLS = [
    'R_10', 'R_25', 'R_50', 'R_75', 'R_100',
    '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V',
];

export const SYMBOL_LABELS: Record<string, string> = {
    R_10: 'Volatility 10', R_25: 'Volatility 25', R_50: 'Volatility 50', R_75: 'Volatility 75', R_100: 'Volatility 100',
    '1HZ10V': 'Volatility 10 (1s)', '1HZ25V': 'Volatility 25 (1s)', '1HZ50V': 'Volatility 50 (1s)',
    '1HZ75V': 'Volatility 75 (1s)', '1HZ100V': 'Volatility 100 (1s)',
};

export const PIP_SIZES: Record<string, number> = {
    R_100: 2, R_75: 4, R_50: 4, R_25: 3, R_10: 3,
    '1HZ100V': 2, '1HZ75V': 2, '1HZ50V': 2, '1HZ25V': 2, '1HZ10V': 2,
};

// ─── Token helper ─────────────────────────────────────────────────────────────

export function getToken(): string | null {
    try {
        const active_loginid = localStorage.getItem('active_loginid');
        if (!active_loginid) return null;

        // Account IDs look like CR1234567 or VR1234567; real tokens are long JWTs/hex strings
        const isRealToken = (v: string) => v && !/^[A-Z]{2,3}\d+$/.test(v);

        const ca = localStorage.getItem('client.accounts');
        if (ca) { const t = JSON.parse(ca)[active_loginid]?.token; if (t && isRealToken(t)) return t; }

        const al = localStorage.getItem('accountsList');
        if (al) { const t = JSON.parse(al)[active_loginid]; if (t && isRealToken(t)) return t; }

        // Try direct authToken key (legacy auth sets a real token here)
        const authToken = localStorage.getItem('authToken');
        if (authToken && isRealToken(authToken)) return authToken;

        // Try token_<loginid> pattern used by some Deriv apps
        const tokenKey = `token_${active_loginid}`;
        const tokenVal = localStorage.getItem(tokenKey);
        if (tokenVal && isRealToken(tokenVal)) return tokenVal;
    } catch (_) {}
    return null;
}

// ─── WebSocket factory ────────────────────────────────────────────────────────

export type MakotiWS = {
    send: (msg: object) => void;
    close: () => void;
    isOpen: () => boolean;
};

export function openMakotiWS(
    onMessage: (data: any) => void,
    onReady: () => void,
    onClose: () => void,
): MakotiWS {
    const appId     = getAppId();
    const serverUrl = getSocketURL();
    const ws        = new WebSocket(`wss://${serverUrl}/websockets/v3?app_id=${appId}`);

    ws.onopen = () => {
        const token = getToken();
        if (token) ws.send(JSON.stringify({ authorize: token }));
        else       onReady();
    };

    ws.onmessage = (evt) => {
        try {
            const data = JSON.parse(evt.data);
            if (data.msg_type === 'authorize') onReady();
            onMessage(data);
        } catch (_) {}
    };

    ws.onerror = () => {};
    ws.onclose = () => onClose();

    return {
        send:   (msg) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); },
        close:  ()    => { try { ws.close(); } catch (_) {} },
        isOpen: ()    => ws.readyState === WebSocket.OPEN,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TECHNICAL INDICATORS
// ═══════════════════════════════════════════════════════════════════════════════

/** Exponential Moving Average */
export function calcEMA(prices: number[], period: number): number[] {
    if (prices.length < period) return [];
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const result = [ema];
    for (let i = period; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
        result.push(ema);
    }
    return result;
}

/**
 * RSI — Wilder smoothing, fast 7-period by default.
 * Returns value 0-100. < 30 oversold, > 70 overbought.
 */
function calcRSI(prices: number[], period = 7): number {
    if (prices.length < period + 1) return 50;
    const slice   = prices.slice(-(period * 4 + 1));   // last 4× period for warm-up
    const changes = slice.slice(1).map((p, i) => p - slice[i]);
    const gains   = changes.map(c => Math.max(0, c));
    const losses  = changes.map(c => Math.max(0, -c));

    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
}

/**
 * Bollinger Bands — returns the price's position within the bands (0 = lower, 1 = upper).
 * < 0.15 = near lower band (oversold), > 0.85 = near upper band (overbought).
 */
function calcBBPosition(prices: number[], period = 14): number {
    if (prices.length < period) return 0.5;
    const slice   = prices.slice(-period);
    const mean    = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const std     = Math.sqrt(variance);
    if (std === 0) return 0.5;
    const upper = mean + 2 * std;
    const lower = mean - 2 * std;
    return (prices[prices.length - 1] - lower) / (upper - lower);
}

/**
 * MACD — (EMA12 - EMA26). Returns current histogram value.
 * Positive and rising = bullish, negative and falling = bearish.
 */
function calcMACDHistogram(prices: number[]): { hist: number; prevHist: number } {
    if (prices.length < 28) return { hist: 0, prevHist: 0 };
    const ema12 = calcEMA(prices, 12);
    const ema26 = calcEMA(prices, 26);
    // align lengths
    const offset = ema12.length - ema26.length;
    const macdLine: number[] = ema26.map((v, i) => ema12[i + offset] - v);
    // Signal line = EMA(9) of MACD
    if (macdLine.length < 9) return { hist: macdLine.at(-1) ?? 0, prevHist: 0 };
    const signal   = calcEMA(macdLine, 9);
    const hist     = macdLine.at(-1)! - signal.at(-1)!;
    const prevHist = macdLine.at(-2)! - signal.at(-2)!;
    return { hist, prevHist };
}

/**
 * Consecutive price direction streak.
 * Positive = N consecutive up ticks, negative = N consecutive down ticks.
 */
function priceStreak(prices: number[]): number {
    if (prices.length < 2) return 0;
    const dir = prices.at(-1)! > prices.at(-2)! ? 1 : -1;
    let n = 1;
    for (let i = prices.length - 2; i > 0; i--) {
        if ((prices[i] > prices[i - 1] ? 1 : -1) === dir) n++;
        else break;
    }
    return dir * n;
}

/** Digit-percentage distribution over a window */
function digitPcts(ticks: number[], window: number): number[] {
    const arr   = ticks.slice(-window);
    const total = arr.length || 1;
    const c     = Array(10).fill(0);
    arr.forEach(d => { if (d >= 0 && d <= 9) c[d]++; });
    return c.map(v => (v / total) * 100);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  V3 HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Average Directional Index (ADX) from tick prices */
function calcADX(prices: number[], period = 14): number {
    if (prices.length < period * 2) return 0;
    const plusDM: number[] = [], minusDM: number[] = [], tr: number[] = [];
    for (let i = 1; i < prices.length; i++) {
        const up = prices[i] - prices[i - 1], dn = prices[i - 1] - prices[i];
        plusDM.push(Math.max(0, up > dn ? up : 0));
        minusDM.push(Math.max(0, dn > up ? dn : 0));
        tr.push(Math.abs(prices[i] - prices[i - 1]));
    }
    let aPD = plusDM.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let aMD = minusDM.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let aTR = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const dx: number[] = [];
    for (let i = period; i < plusDM.length; i++) {
        aPD = (aPD * (period - 1) + plusDM[i]) / period;
        aMD = (aMD * (period - 1) + minusDM[i]) / period;
        aTR = (aTR * (period - 1) + tr[i]) / period;
        if (aTR === 0) continue;
        const pDI = 100 * aPD / aTR, mDI = 100 * aMD / aTR, s = pDI + mDI;
        if (s === 0) continue;
        dx.push(100 * Math.abs(pDI - mDI) / s);
    }
    if (dx.length < period) return 0;
    let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dx.length; i++) adx = (adx * (period - 1) + dx[i]) / period;
    return adx;
}

/** Linear regression slope over N bars (normalized) */
function calcLinRegSlope(prices: number[], period = 14): number {
    if (prices.length < period) return 0;
    const s = prices.slice(-period), n = s.length;
    const sumX = (n - 1) * n / 2, sumY = s.reduce((a, b) => a + b, 0);
    let xy = 0, x2 = 0;
    for (let i = 0; i < n; i++) { xy += i * s[i]; x2 += i * i; }
    return (n * xy - sumX * sumY) / (n * x2 - sumX * sumX);
}

/** RSI divergence between recent and prior 15-bar windows */
function detectRSIDivergence(prices: number[]): { type: 'bull' | 'bear' | null; strength: number } {
    if (prices.length < 40) return { type: null, strength: 0 };
    const r = prices.slice(-15), p = prices.slice(-30, -15);
    const rsiR = calcRSI(r, 7), rsiP = calcRSI(p, 7);
    const rMin = Math.min(...r), rMax = Math.max(...r);
    const pMin = Math.min(...p), pMax = Math.max(...p);
    if (rMin < pMin && rsiR > rsiP + 5) return { type: 'bull', strength: 2 };
    if (rMax > pMax && rsiR < rsiP - 5) return { type: 'bear', strength: 2 };
    return { type: null, strength: 0 };
}

/** Micro pattern detection on tick prices (2-3 bar reversals / continuations) */
function detectMicroPattern(prices: number[]): { type: 'bull' | 'bear' | null; strength: number } {
    if (prices.length < 6) return { type: null, strength: 0 };
    const p = prices.slice(-6), ch = p.slice(1).map((v, i) => v - p[i]);
    const l3 = ch.slice(-3);
    if (l3[0] < 0 && l3[1] < 0 && l3[2] > 0 && l3[2] > Math.abs(l3[0]) + Math.abs(l3[1])) return { type: 'bull', strength: 2 };
    if (l3[0] > 0 && l3[1] > 0 && l3[2] < 0 && Math.abs(l3[2]) > l3[0] + l3[1]) return { type: 'bear', strength: 2 };
    const r3 = ch.slice(-4, -1).reduce((a, b) => a + b, 0), lm = ch[ch.length - 1];
    if (r3 > 0 && lm < 0 && Math.abs(lm) > Math.abs(r3) * 1.5) return { type: 'bear', strength: 2 };
    if (r3 < 0 && lm > 0 && lm > Math.abs(r3) * 1.5) return { type: 'bull', strength: 2 };
    const l4 = ch.slice(-4);
    if (l4.every(c => c > 0)) return { type: 'bull', strength: 1 };
    if (l4.every(c => c < 0)) return { type: 'bear', strength: 1 };
    return { type: null, strength: 0 };
}

/** Momentum strategy: MACD + EMA cross + linreg slope */
function momentumStrategy(prices: number[]): { direction: 'bull' | 'bear' | 'neutral'; score: number } {
    if (prices.length < 28) return { direction: 'neutral', score: 0 };
    let s = 0;
    const { hist: mH, prevHist: mP } = calcMACDHistogram(prices);
    if (mH > 0 && mP <= 0) s += 2; else if (mH > 0) s += 1;
    if (mH < 0 && mP >= 0) s -= 2; else if (mH < 0) s -= 1;
    if (prices.length >= 22) {
        const e9 = calcEMA(prices, 9), e21 = calcEMA(prices, 21);
        if (e9.length >= 2 && e21.length >= 2) {
            const l = e9.length - 1;
            if (e9[l] > e21[l] && e9[l - 1] <= e21[l - 1]) s += 2;
            if (e9[l] < e21[l] && e9[l - 1] >= e21[l - 1]) s -= 2;
        }
    }
    const slp = calcLinRegSlope(prices, 14);
    const avg = prices.slice(-14).reduce((a, b) => a + b, 0) / 14;
    const pct = avg > 0 ? (slp / avg) * 100 : 0;
    if (pct > 0.01) s += 1; else if (pct < -0.01) s -= 1;
    if (s >= 2) return { direction: 'bull', score: Math.min(3, Math.abs(s)) };
    if (s <= -2) return { direction: 'bear', score: Math.min(3, Math.abs(s)) };
    return { direction: 'neutral', score: 0 };
}

/** Mean reversion strategy: RSI + BB extremes, divergence, streak reversal */
function meanReversionStrategy(ticks: number[], prices: number[]): { direction: 'bull' | 'bear' | 'neutral'; score: number } {
    if (prices.length < 20) return { direction: 'neutral', score: 0 };
    let s = 0;
    const rsi = calcRSI(prices, 7), bb = calcBBPosition(prices, 14);
    const stk = priceStreak(prices.slice(-20)), div = detectRSIDivergence(prices);
    if (rsi < 20) s += 3; else if (rsi < 25) s += 2; else if (rsi < 30) s += 1;
    if (rsi > 80) s -= 3; else if (rsi > 75) s -= 2; else if (rsi > 70) s -= 1;
    if (bb < 0.08) s += 2; else if (bb < 0.15) s += 1;
    if (bb > 0.92) s -= 2; else if (bb > 0.85) s -= 1;
    if (div.type === 'bull') s += 2;
    if (div.type === 'bear') s -= 2;
    if (stk >= 6) s -= 1;  // extended up → expect reversion down
    if (stk <= -6) s += 1; // extended down → expect reversion up
    if (s >= 2) return { direction: 'bull', score: Math.min(3, Math.abs(s)) };
    if (s <= -2) return { direction: 'bear', score: Math.min(3, Math.abs(s)) };
    return { direction: 'neutral', score: 0 };
}

/** Pattern strategy: micro patterns + EMA50 trend alignment + momentum confirmation */
function patternStrategy(ticks: number[], prices: number[]): { direction: 'bull' | 'bear' | 'neutral'; score: number } {
    if (prices.length < 30) return { direction: 'neutral', score: 0 };
    let s = 0;
    const pat = detectMicroPattern(prices);
    if (pat.type === 'bull') s += pat.strength * 2;
    if (pat.type === 'bear') s -= pat.strength * 2;
    if (prices.length >= 55) {
        const e50 = calcEMA(prices, 50), lp = prices[prices.length - 1], ev = e50[e50.length - 1];
        if (ev != null) { if (lp > ev) s += 1; else if (lp < ev) s -= 1; }
    }
    if (prices.length >= 10) {
        const sma = prices.slice(-10).reduce((a, b) => a + b, 0) / 10, lp = prices[prices.length - 1];
        if (lp > sma * 1.001) s += 1; else if (lp < sma * 0.999) s -= 1;
    }
    if (s >= 2) return { direction: 'bull', score: Math.min(3, Math.abs(s)) };
    if (s <= -2) return { direction: 'bear', score: Math.min(3, Math.abs(s)) };
    return { direction: 'neutral', score: 0 };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SIGNAL ENGINE v3  — Multi-strategy consensus voting
// ═══════════════════════════════════════════════════════════════════════════════

export interface TradeSignal {
    contract_type: string;
    barrier: string;
    confidence: number;
    reason: string;
    indicators: string;
}

/**
 * Core analysis function — v3 multi-strategy consensus.
 * Runs three independent strategies (momentum, mean reversion, pattern).
 * Primary: all 3 agree (score >= 2) → strong signal.
 * Fallback: 2/3 agree with score >= 2 and outvote the third.
 */
export function analyzeSignal(ticks: number[], prices: number[]): TradeSignal | null {
    if (ticks.length < 30 || prices.length < 15) return null;

    // Run three strategies
    const momentum = momentumStrategy(prices);
    const meanRev = meanReversionStrategy(ticks, prices);
    const pattern = patternStrategy(ticks, prices);

    const strategies = [momentum, meanRev, pattern];
    const stratNames = ['Mom', 'MRv', 'Ptn'];

    let bullCount = 0, bearCount = 0;
    let totalBullScore = 0, totalBearScore = 0;
    const bullReasons: string[] = [], bearReasons: string[] = [];

    strategies.forEach((s, i) => {
        if (s.direction === 'bull' && s.score >= 2) {
            bullCount++; totalBullScore += s.score; bullReasons.push(stratNames[i]);
        }
        if (s.direction === 'bear' && s.score >= 2) {
            bearCount++; totalBearScore += s.score; bearReasons.push(stratNames[i]);
        }
    });

    const consensusDisplay = strategies.map((s, i) =>
        `${stratNames[i]}:${s.direction === 'neutral' ? '—' : s.direction}(${s.score})`
    ).join(' ');

    // Bull consensus: all 3 agree OR 2/3 agree and outvote the third
    if (bullCount >= 3 || (bullCount >= 2 && bullCount > bearCount)) {
        const isUnanimous = bullCount >= 3;
        const base = isUnanimous ? 78 : 70;
        const conf = Math.min(95, base + totalBullScore * 3 + (bullCount - 1) * 4);
        return {
            contract_type: 'CALL', barrier: '',
            confidence: conf,
            reason: `RISE — ${bullReasons.join(', ')}${isUnanimous ? ' (unanimous)' : ''}`,
            indicators: consensusDisplay,
        };
    }

    // Bear consensus
    if (bearCount >= 3 || (bearCount >= 2 && bearCount > bullCount)) {
        const isUnanimous = bearCount >= 3;
        const base = isUnanimous ? 78 : 70;
        const conf = Math.min(95, base + totalBearScore * 3 + (bearCount - 1) * 4);
        return {
            contract_type: 'PUT', barrier: '',
            confidence: conf,
            reason: `FALL — ${bearReasons.join(', ')}${isUnanimous ? ' (unanimous)' : ''}`,
            indicators: consensusDisplay,
        };
    }

    return null;
}

// ─── Digit pct helper (used by scanner) ──────────────────────────────────────

export function getDigitPcts(ticks: number[], count = 100): number[] {
    return digitPcts(ticks, count);
}
