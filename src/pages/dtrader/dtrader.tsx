import React, { useEffect, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';
import {
    getMainAppActiveToken,
    getMainAppActiveLoginId,
} from '@/external/bot-skeleton/services/api/appId';
import { isNewLoggedIn } from '@/auth/NewDerivAuth';

const DTRADER_BASE = 'https://deriv-dtrader.vercel.app/';

const Dtrader = observer(() => {
    const [iframeSrc, setIframeSrc] = useState<string>('');
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [isNewAuth, setIsNewAuth] = useState<boolean>(false);

    const buildIframeUrl = useCallback((token: string, loginId: string) => {
        // Read all accounts from clientAccounts (has loginid, token, currency for each)
        // and pass them all as acct1/token1/cur1, acct2/token2/cur2 etc.
        // so DTrader can pick the active one.
        let allAccounts: Array<{ loginid: string; token: string; currency: string }> = [];

        try {
            const clientAccountsStr = localStorage.getItem('clientAccounts') || '{}';
            const clientAccounts = JSON.parse(clientAccountsStr);

            if (Array.isArray(clientAccounts)) {
                allAccounts = clientAccounts;
            } else {
                allAccounts = Object.values(clientAccounts) as Array<{
                    loginid: string;
                    token: string;
                    currency: string;
                }>;
            }
        } catch (_) {}

        // Fallback: if clientAccounts empty, try accountsList
        if (!allAccounts.length) {
            try {
                const accountsListStr = localStorage.getItem('accountsList') || '{}';
                const accountsList = JSON.parse(accountsListStr) as Record<string, string>;
                allAccounts = Object.entries(accountsList).map(([lid, tok]) => ({
                    loginid: lid,
                    token: tok,
                    currency: 'USD',
                }));
            } catch (_) {}
        }

        // Ensure the active account is always included (covers new-auth token)
        const activeAlreadyIncluded = allAccounts.some(
            a => a.loginid === loginId && a.token === token
        );
        if (!activeAlreadyIncluded) {
            let activeCurrency = 'USD';
            try {
                const clientAccounts = JSON.parse(localStorage.getItem('clientAccounts') || '{}');
                if (Array.isArray(clientAccounts)) {
                    const found = clientAccounts.find((a: any) => a.loginid === loginId);
                    if (found?.currency) activeCurrency = found.currency;
                } else if (clientAccounts[loginId]?.currency) {
                    activeCurrency = clientAccounts[loginId].currency;
                }
            } catch (_) {}
            allAccounts = [{ loginid: loginId, token, currency: activeCurrency }, ...allAccounts];
        } else {
            allAccounts = [
                ...allAccounts.filter(a => a.loginid === loginId),
                ...allAccounts.filter(a => a.loginid !== loginId),
            ];
        }

        // Build URL params — ONLY the standard Deriv acct/token/cur pairs.
        // Do NOT inject app_id or lang — those override DTrader's internal
        // registered app and break WebSocket trade execution.
        const params = new URLSearchParams();

        allAccounts.slice(0, 10).forEach((acc, idx) => {
            const n = idx + 1;
            params.set(`acct${n}`, acc.loginid);
            params.set(`token${n}`, acc.token);
            params.set(`cur${n}`, acc.currency || 'USD');
        });

        const url = `${DTRADER_BASE}?${params.toString()}`;
        setIframeSrc(url);
    }, []);

    const checkAuth = useCallback(() => {
        const newAuth = isNewLoggedIn();
        setIsNewAuth(newAuth);

        const token = getMainAppActiveToken();
        const activeLoginId = getMainAppActiveLoginId();

        if (newAuth) {
            // New-auth users have no real Deriv API token to pass to DTrader.
            // Show a prompt instead of embedding a foreign login page in the iframe.
            setIsAuthenticated(false);
            setIframeSrc('');
        } else if (token && activeLoginId) {
            setIsAuthenticated(true);
            buildIframeUrl(token, activeLoginId);
        } else {
            setIsAuthenticated(false);
            setIframeSrc(DTRADER_BASE);
        }
    }, [buildIframeUrl]);

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    // Listen for account switches and authentication changes
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (
                e.key === 'authToken' ||
                e.key === 'NEW_AUTH_token' ||
                e.key === 'active_loginid' ||
                e.key === 'clientAccounts' ||
                e.key === 'accountsList' ||
                e.key === 'show_as_cr'
            ) {
                checkAuth();
            }
        };

        window.addEventListener('storage', handleStorageChange);
        const interval = setInterval(checkAuth, 2000);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(interval);
        };
    }, [checkAuth]);

    // New-auth users: no legacy token available — open DTrader in a new tab
    if (isNewAuth) {
        const loginId = getMainAppActiveLoginId() || '';
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: '16px',
                padding: '40px',
                textAlign: 'center',
                color: '#fff',
            }}>
                <div style={{ fontSize: '48px' }}>📈</div>
                <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>Open DTrader</h2>
                <p style={{ margin: 0, maxWidth: '420px', color: '#aaa', fontSize: '14px', lineHeight: 1.6 }}>
                    You&apos;re signed in with the new Deriv account system. DTrader uses its own
                    sign-in flow — click below to open it in a new tab and log in there.
                    {loginId ? ` Your account ID is ${loginId}.` : ''}
                </p>
                <button
                    onClick={() => window.open(DTRADER_BASE, '_blank', 'noopener,noreferrer')}
                    style={{
                        padding: '12px 32px',
                        background: 'linear-gradient(135deg, #ff444f, #cc2233)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '15px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(255,68,79,0.35)',
                    }}
                >
                    Open DTrader
                </button>
                <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
                    Opens in a new tab — sign in with your Deriv account there.
                </p>
            </div>
        );
    }

    if (!iframeSrc) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <p>Loading DTrader...</p>
            </div>
        );
    }

    return <IframeWrapper src={iframeSrc} title='DTrader' className='dtrader-container' />;
});

export default Dtrader;
