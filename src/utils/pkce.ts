/**
 * PKCE (Proof Key for Code Exchange) helpers for the new-accounts OAuth2 flow.
 * Uses the Web Crypto API — available in all modern browsers.
 */

function base64UrlEncode(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let str = '';
    for (let i = 0; i < bytes.length; i++) {
        str += String.fromCharCode(bytes[i]);
    }
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const verifier = base64UrlEncode(array.buffer);
    const encoded = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    const challenge = base64UrlEncode(digest);
    return { verifier, challenge };
}

export function generateState(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return base64UrlEncode(array.buffer);
}

const NEW_ACCOUNTS_CLIENT_ID = '337DJLKi2OJ4VsyFSLIt9';
const NEW_ACCOUNTS_REDIRECT_URI = 'https://makotitraderss.vercel.app/callback';
const NEW_ACCOUNTS_AUTH_BASE = 'https://auth.deriv.com/oauth2/auth';

/** Storage key for the PKCE verifier — read by the callback on makotitraderss.vercel.app */
export const PKCE_VERIFIER_KEY = 'new_accounts_pkce_verifier';
export const PKCE_STATE_KEY = 'new_accounts_pkce_state';

export async function redirectToNewAccountsLogin(): Promise<void> {
    const { verifier, challenge } = await generatePKCE();
    const state = generateState();

    // Persist verifier so the callback page (same or different app) can retrieve it.
    // We also encode it in the state as a fallback for cross-domain scenarios.
    try {
        localStorage.setItem(PKCE_VERIFIER_KEY, verifier);
        localStorage.setItem(PKCE_STATE_KEY, state);
    } catch {
        // localStorage may not be available — state fallback still works
    }

    // Encode verifier into state so the Vercel callback can extract it even
    // when it cannot access this origin's localStorage.
    const statePayload = btoa(JSON.stringify({ s: state, v: verifier }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: NEW_ACCOUNTS_CLIENT_ID,
        redirect_uri: NEW_ACCOUNTS_REDIRECT_URI,
        scope: 'trade',
        state: statePayload,
        code_challenge: challenge,
        code_challenge_method: 'S256',
    });

    window.location.href = `${NEW_ACCOUNTS_AUTH_BASE}?${params.toString()}`;
}
