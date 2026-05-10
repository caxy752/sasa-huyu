import { getAppId, getSocketURL } from '@/components/shared';

export const ALL_SYMBOLS = [
    'R_10', 'R_25', 'R_50', 'R_75', 'R_100',
    '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V',
];

export const SYMBOL_LABELS: Record<string, string> = {
    R_10: 'V 10', R_25: 'V 25', R_50: 'V 50', R_75: 'V 75', R_100: 'V 100',
    '1HZ10V': 'V 10 (1s)', '1HZ25V': 'V 25 (1s)', '1HZ50V': 'V 50 (1s)',
    '1HZ75V': 'V 75 (1s)', '1HZ100V': 'V 100 (1s)',
};

export const PIP_SIZES: Record<string, number> = {
    R_100: 2, R_75: 4, R_50: 4, R_25: 3, R_10: 3,
    '1HZ100V': 2, '1HZ75V': 2, '1HZ50V': 2, '1HZ25V': 2, '1HZ10V': 2,
};

export function getToken(): string | null {
    try {
        const active_loginid = localStorage.getItem('active_loginid');
        if (!active_loginid) return null;
        const ca = localStorage.getItem('client.accounts');
        if (ca) {
            const token = JSON.parse(ca)[active_loginid]?.token;
            if (token) return token;
        }
        const al = localStorage.getItem('accountsList');
        if (al) {
            const token = JSON.parse(al)[active_loginid];
            if (token) return token;
        }
    } catch (_) {}
    return null;
}

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
    const appId = getAppId();
    const serverUrl = getSocketURL();
    const ws = new WebSocket(`wss://${serverUrl}/websockets/v3?app_id=${appId}`);

    ws.onopen = () => {
        const token = getToken();
        if (token) {
            ws.send(JSON.stringify({ authorize: token }));
        } else {
            onReady();
        }
    };

    ws.onmessage = (evt) => {
        try {
            const data = JSON.parse(evt.data);
            if (data.msg_type === 'authorize') {
                onReady();
            }
            onMessage(data);
        } catch (_) {}
    };

    ws.onerror = () => {};
    ws.onclose = () => onClose();

    return {
        send: (msg: object) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
        },
        close: () => { try { ws.close(); } catch (_) {} },
        isOpen: () => ws.readyState === WebSocket.OPEN,
    };
}

export function getDigitPcts(ticks: number[], count = 100): number[] {
    const arr = ticks.slice(-count);
    const total = arr.length || 1;
    const counts = Array(10).fill(0);
    arr.forEach(d => { if (d >= 0 && d <= 9) counts[d]++; });
    return counts.map(c => (c / total) * 100);
}

export function calcEMA(prices: number[], period: number): number[] {
    if (prices.length < period) return [];
    const k = 2 / (period + 1);
    const result: number[] = [];
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push(ema);
    for (let i = period; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
        result.push(ema);
    }
    return result;
}

export interface TradeSignal {
    contract_type: string;
    barrier: string;
    confidence: number;
    reason: string;
}

export function analyzeSignal(ticks: number[], prices: number[]): TradeSignal | null {
    if (ticks.length < 30) return null;

    const last100 = ticks.slice(-100);
    const last50 = ticks.slice(-50);
    const last20 = ticks.slice(-20);
    const last10 = ticks.slice(-10);
    const last5 = ticks.slice(-5);

    const countPcts = (arr: number[]) => {
        const total = arr.length || 1;
        const c = Array(10).fill(0);
        arr.forEach(d => c[d]++);
        return c.map(v => (v / total) * 100);
    };

    const pcts100 = countPcts(last100);
    const pcts50 = countPcts(last50);
    const pcts20 = countPcts(last20);

    const lastDigit = last10[last10.length - 1];

    let streak = 1;
    for (let i = last5.length - 2; i >= 0; i--) {
        if (last5[i] === lastDigit) streak++;
        else break;
    }

    if (streak >= 3) {
        return {
            contract_type: 'DIGITDIFF',
            barrier: String(lastDigit),
            confidence: Math.min(88, 65 + streak * 7),
            reason: `Digit ${lastDigit} repeated ${streak}× — reversal imminent`,
        };
    }

    if (prices.length >= 20) {
        const ema9 = calcEMA(prices, 9);
        const ema21 = calcEMA(prices, 21);
        if (ema9.length >= 2 && ema21.length >= 2) {
            const bullCross = ema9[ema9.length - 1] > ema21[ema21.length - 1] &&
                              ema9[ema9.length - 2] <= ema21[ema21.length - 2];
            const bearCross = ema9[ema9.length - 1] < ema21[ema21.length - 1] &&
                              ema9[ema9.length - 2] >= ema21[ema21.length - 2];
            if (bullCross) return { contract_type: 'CALL', barrier: '', confidence: 78, reason: 'EMA 9 crossed above EMA 21 — bullish' };
            if (bearCross) return { contract_type: 'PUT', barrier: '', confidence: 78, reason: 'EMA 9 crossed below EMA 21 — bearish' };
        }

        const recentPrices = prices.slice(-20);
        const firstHalf = recentPrices.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
        const secondHalf = recentPrices.slice(10).reduce((a, b) => a + b, 0) / 10;
        const trendPct = Math.abs(secondHalf - firstHalf) / firstHalf * 100;
        if (trendPct > 0.008) {
            if (secondHalf > firstHalf) {
                return { contract_type: 'CALL', barrier: '', confidence: Math.min(82, 62 + trendPct * 500), reason: `Uptrend +${trendPct.toFixed(4)}% — RISE` };
            } else {
                return { contract_type: 'PUT', barrier: '', confidence: Math.min(82, 62 + trendPct * 500), reason: `Downtrend ${trendPct.toFixed(4)}% — FALL` };
            }
        }
    }

    const high789_50 = pcts50[7] + pcts50[8] + pcts50[9];
    const low0123_50 = pcts50[0] + pcts50[1] + pcts50[2] + pcts50[3];
    const high789_20 = pcts20[7] + pcts20[8] + pcts20[9];
    const low0123_20 = pcts20[0] + pcts20[1] + pcts20[2] + pcts20[3];

    if (high789_50 > 38 && high789_20 > 35) {
        const barrier = high789_50 > 46 ? '6' : '5';
        return { contract_type: 'DIGITOVER', barrier, confidence: Math.min(84, 62 + (high789_50 - 30) * 1.5), reason: `High digits 7-9 at ${high789_50.toFixed(1)}% — OVER ${barrier}` };
    }

    if (low0123_50 > 42 && low0123_20 > 40) {
        const barrier = low0123_50 > 50 ? '4' : '3';
        return { contract_type: 'DIGITUNDER', barrier, confidence: Math.min(84, 62 + (low0123_50 - 35) * 1.3), reason: `Low digits 0-3 at ${low0123_50.toFixed(1)}% — UNDER ${barrier}` };
    }

    const hotDigit = pcts100.reduce((best, p, i) => p > best.p ? { d: i, p } : best, { d: -1, p: 0 });
    if (hotDigit.p > 14 && pcts20[hotDigit.d] > 18) {
        return { contract_type: 'DIGITDIFF', barrier: String(hotDigit.d), confidence: Math.min(80, 60 + (hotDigit.p - 10) * 2), reason: `Digit ${hotDigit.d} overheated at ${hotDigit.p.toFixed(1)}% — DIFF` };
    }

    const mid56 = pcts50[5] + pcts50[6] + pcts50[7] + pcts50[8] + pcts50[9];
    if (mid56 > 55) {
        return { contract_type: 'DIGITOVER', barrier: '4', confidence: 62, reason: `Upper half dominant ${mid56.toFixed(1)}% — OVER 4` };
    }

    return { contract_type: 'DIGITOVER', barrier: '5', confidence: 58, reason: 'Default safe spread — OVER 5 / UNDER 4' };
}
