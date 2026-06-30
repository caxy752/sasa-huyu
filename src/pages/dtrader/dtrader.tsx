import React, { useEffect, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';
import { getAppId } from '@/components/shared/utils/config/config';
import { V2GetActiveToken, V2GetActiveClientId } from '@/external/bot-skeleton/services/api/appId';

const Dtrader = observer(() => {
    const [iframeSrc, setIframeSrc] = useState<string>('');
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

    const buildIframeUrl = useCallback((token: string, loginId: string) => {
        // Get currency from clientAccounts or accountsList
        const clientAccountsStr = localStorage.getItem('clientAccounts') || '{}';
        const accountsListStr = localStorage.getItem('accountsList') || '{}';
        let currency = 'USD'; // Default currency

        try {
            const clientAccounts = JSON.parse(clientAccountsStr);
            const account = clientAccounts[loginId];
            if (account?.currency) {
                currency = account.currency;
            } else {
                // Fallback to accountsList
                const accountsList = JSON.parse(accountsListStr);
                const accountInfo = Object.keys(accountsList).find(key => key === loginId);
                if (accountInfo) {
                    // Try to get currency from account info if available
                    const accountData = JSON.parse(localStorage.getItem('accountList') || '[]');
                    const acc = accountData.find((a: any) => a.loginid === loginId);
                    if (acc?.currency) {
                        currency = acc.currency;
                    }
                }
            }
        } catch (error) {
            console.error('Error parsing clientAccounts:', error);
        }

        // Get app ID (same as used in login auth)
        // getAppId() always returns the correct app_id and updates localStorage
        const appId = getAppId() || 114292;

        // Build iframe URL with authentication parameters
        // Try multiple parameters to disable bot controls in DTrader
        const params = new URLSearchParams({
            acct1: loginId,
            token1: token,
            cur1: currency,
            lang: 'EN',
            app_id: appId.toString(),
            chart_type: 'area',
            interval: '1t',
            symbol: '1HZ100V',
            trade_type: 'over_under',
            // Multiple attempts to disable bot controls
            hide_bot: '1',
            bot_disabled: 'true',
            disable_bot: '1',
            no_bot: '1',
            manual_only: '1',
            hide_bot_controls: 'true',
        });

        const url = `https://deriv-dtrader.vercel.app/dtrader?${params.toString()}`;
        setIframeSrc(url);
    }, []);

    useEffect(() => {
        // Check if user is authenticated
        const token = V2GetActiveToken();
        const activeLoginId = V2GetActiveClientId();

        if (token && activeLoginId) {
            setIsAuthenticated(true);
            buildIframeUrl(token, activeLoginId);
        } else {
            setIsAuthenticated(false);
            // Load dtrader without authentication (will prompt login)
            setIframeSrc(
                'https://deriv-dtrader.vercel.app/dtrader?chart_type=area&interval=1t&symbol=1HZ100V&trade_type=over_under'
            );
        }
    }, [buildIframeUrl]);

    // Listen for account switches and authentication changes
    useEffect(() => {
        const checkAuthAndUpdate = () => {
            const token = V2GetActiveToken();
            const activeLoginId = V2GetActiveClientId();

            if (token && activeLoginId) {
                if (!isAuthenticated) {
                    setIsAuthenticated(true);
                }
                buildIframeUrl(token, activeLoginId);
            } else if (isAuthenticated) {
                setIsAuthenticated(false);
                setIframeSrc(
                    'https://deriv-dtrader.vercel.app/dtrader?chart_type=area&interval=1t&symbol=1HZ100V&trade_type=over_under'
                );
            }
        };

        // Listen for storage changes (account switches from other tabs)
        const handleStorageChange = (e: StorageEvent) => {
            if (
                e.key === 'authToken' ||
                e.key === 'active_loginid' ||
                e.key === 'clientAccounts' ||
                e.key === 'accountsList' ||
                e.key === 'show_as_cr'
            ) {
                checkAuthAndUpdate();
            }
        };

        window.addEventListener('storage', handleStorageChange);

        // Check periodically for localStorage changes (same tab)
        // This handles cases where auth is set after component mount
        const interval = setInterval(checkAuthAndUpdate, 2000);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(interval);
        };
    }, [isAuthenticated, buildIframeUrl]);

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
