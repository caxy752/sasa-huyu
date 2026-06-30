import { useCallback, useEffect, useState } from 'react';
import { clearCSRFToken, validateCSRFToken } from '@/components/shared';
import { clearAuthData } from '@/utils/auth-utils';

export interface LegacyAccount {
    loginid: string;
    token: string;
    currency: string;
}

export interface OAuthCallbackParams {
    code: string | null;
    state: string | null;
    error: string | null;
    error_description: string | null;
}

export interface OAuthCallbackResult {
    isProcessing: boolean;
    isValid: boolean;
    params: OAuthCallbackParams;
    legacyAccounts: LegacyAccount[];
    error: string | null;
    cleanupURL: () => void;
}

const parseLegacyAccounts = (urlParams: URLSearchParams): LegacyAccount[] => {
    const accounts: LegacyAccount[] = [];
    let index = 1;

    while (urlParams.has(`acct${index}`)) {
        const loginid = urlParams.get(`acct${index}`) || '';
        const token = urlParams.get(`token${index}`) || '';
        const currency = urlParams.get(`cur${index}`) || '';

        if (loginid && token) {
            accounts.push({ loginid, token, currency });
        }

        index += 1;
    }

    return accounts;
};

export const useOAuthCallback = (): OAuthCallbackResult => {
    const [result, setResult] = useState<Omit<OAuthCallbackResult, 'cleanupURL'>>({
        isProcessing: true,
        isValid: false,
        params: {
            code: null,
            state: null,
            error: null,
            error_description: null,
        },
        legacyAccounts: [],
        error: null,
    });

    const cleanupURL = useCallback(() => {
        const url = new URL(window.location.href);

        url.searchParams.delete('code');
        url.searchParams.delete('state');
        url.searchParams.delete('scope');
        url.searchParams.delete('error');
        url.searchParams.delete('error_description');

        let index = 1;
        while (url.searchParams.has(`acct${index}`)) {
            url.searchParams.delete(`acct${index}`);
            url.searchParams.delete(`token${index}`);
            url.searchParams.delete(`cur${index}`);
            index += 1;
        }

        window.history.replaceState({}, '', url.toString());
    }, []);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);

        const legacyAccounts = parseLegacyAccounts(urlParams);
        if (legacyAccounts.length > 0) {
            setResult({
                isProcessing: false,
                isValid: false,
                params: { code: null, state: null, error: null, error_description: null },
                legacyAccounts,
                error: null,
            });
            return;
        }

        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const error = urlParams.get('error');
        const error_description = urlParams.get('error_description');

        const isOAuthCallback = code !== null || error !== null || state !== null;

        if (!isOAuthCallback) {
            setResult({
                isProcessing: false,
                isValid: false,
                params: { code: null, state: null, error: null, error_description: null },
                legacyAccounts: [],
                error: null,
            });
            return;
        }

        if (error) {
            console.error('OAuth error:', error, error_description);
            setResult({
                isProcessing: false,
                isValid: false,
                params: { code, state, error, error_description },
                legacyAccounts: [],
                error: error_description || error,
            });
            cleanupURL();
            return;
        }

        if (!state) {
            console.error('[OAuth] Missing state parameter in callback');
            console.warn('[OAuth] URL had code but no state — this usually means the redirect URI went through a server-side handler that stripped the state parameter.');
            // Don't redirect — that causes an infinite loop. Just skip the OAuth processing.
            setResult({
                isProcessing: false,
                isValid: false,
                params: { code, state, error, error_description },
                legacyAccounts: [],
                error: 'Missing state parameter',
            });
            cleanupURL();
            return;
        }

        if (!validateCSRFToken(state)) {
            console.error('[OAuth] CSRF token validation failed');
            console.warn('[OAuth] State from URL:', state);
            console.warn('[OAuth] State in sessionStorage:', sessionStorage.getItem('oauth_csrf_token'));
            console.warn('[OAuth] This can happen if sessionStorage was cleared, the tab was navigated away, or the redirect went through a different origin.');
            // Don't clear auth data — this might be a stale callback, not a real attack
            setResult({
                isProcessing: false,
                isValid: false,
                params: { code, state, error, error_description },
                legacyAccounts: [],
                error: 'CSRF token validation failed',
            });
            cleanupURL();
            return;
        }

        clearCSRFToken();

        if (!code) {
            console.error('[OAuth] Missing authorization code in callback');
            setResult({
                isProcessing: false,
                isValid: false,
                params: { code, state, error, error_description },
                legacyAccounts: [],
                error: 'Missing authorization code',
            });
            cleanupURL();
            return;
        }

        setResult({
            isProcessing: false,
            isValid: true,
            params: { code, state, error, error_description },
            legacyAccounts: [],
            error: null,
        });
    }, [cleanupURL]);

    return {
        ...result,
        cleanupURL,
    };
};
