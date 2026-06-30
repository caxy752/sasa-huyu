/**
 * Safe JSON Parse Utility
 * Catches parse errors, logs details, and returns fallback instead of throwing
 */
export function safeParse<T = any>(raw: string | null | undefined, fallback: T = {} as T): T {
    if (raw === null || raw === undefined || raw.trim() === '') {
        return fallback;
    }
    try {
        return JSON.parse(raw) as T;
    } catch (error) {
        console.error('[safeParse] Invalid JSON encountered:', error);
        console.error('[safeParse] Raw Response was:', raw);
        return fallback;
    }
}

export default safeParse;
