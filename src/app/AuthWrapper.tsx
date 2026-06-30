import React from 'react';
import Cookies from 'js-cookie';
import ChunkLoader from '@/components/loader/chunk-loader';
// Reference login/auth persistence flow adapted from https://github.com/DukeNyamasege/new-user-interface.git
import { api_base } from '@/external/bot-skeleton';
import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import { clearAuthData } from '@/utils/auth-utils';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import { localize } from '@deriv-com/translations';
import { URLUtils } from '@deriv-com/utils';
import App from './App';

// Extend Window interface to include is_tmb_enabled property
declare global {
    interface Window {
        is_tmb_enabled?: boolean;
    }
}

const restoreLoginFromServerSession = async () => {
    try {
        const response = await fetch('/api/oauth/session', {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            return false;
        }

        const sessionData = await response.json();

        if (!sessionData.logged_in || !sessionData.access_token) {
            return false;
        }

        const sessionToken = sessionData.access_token;
        const preferredLoginId = sessionData.account_id;
        const accountsList: Record<string, string> = {};
        const clientAccounts: Record<
            string,
            { loginid: string; token: string; currency: string; account_type?: string; balance?: string }
        > = {};

        if (Array.isArray(sessionData.accounts) && sessionData.accounts.length) {
            sessionData.accounts.forEach((account: any) => {
                if (account.loginid) {
                    accountsList[account.loginid] = sessionToken;
                    clientAccounts[account.loginid] = {
                        loginid: account.loginid,
                        token: sessionToken,
                        currency: account.currency || '',
                        account_type: account.account_type || (account.is_virtual ? 'demo' : 'real'),
                        balance: account.balance ?? '0',
                    };
                }
            });
        }

        // Only add preferred account if it's not null and we don't already have accounts
        if (!Object.keys(accountsList).length && preferredLoginId) {
            accountsList[preferredLoginId] = sessionToken;
            clientAccounts[preferredLoginId] = {
                loginid: preferredLoginId,
                token: sessionToken,
                currency: sessionData.currency || '',
                account_type: sessionData.account_type || 'real',
                balance: sessionData.balance ?? '0',
            };
        }
        try {
            const deriv_accounts = (Array.isArray(sessionData.accounts) ? sessionData.accounts : []).map(a => ({
                account_id: a.loginid || a.account_id,
                balance: a.balance || '0',
                currency: a.currency || '',
                group: a.group || '',
                status: a.status || '',
                account_type: a.account_type || (a.is_virtual ? 'demo' : 'real'),
            }));
            if (deriv_accounts.length) {
                DerivWSAccountsService.storeAccounts(deriv_accounts as any);
            }
        } catch (e) {
            console.warn('Failed to store deriv accounts via service', e);
        }
        localStorage.setItem('authToken', sessionToken);
        
        // CRITICAL: Set active_loginid BEFORE api_base.init() so it can use it
        if (preferredLoginId) {
            localStorage.setItem('active_loginid', preferredLoginId);
        } else if (Object.keys(accountsList).length > 0) {
            // If no preferred ID, use the first account
            const firstAccountId = Object.keys(accountsList)[0];
            localStorage.setItem('active_loginid', firstAccountId);
        }

        if (sessionData.currency) {
            sessionStorage.setItem('query_param_currency', sessionData.currency);
        }

        // Store auth_info centrally for client-side services
        try {
            if (sessionData.access_token) {
                OAuthTokenExchangeService.setAuthInfo({
                    access_token: sessionData.access_token,
                    token_type: sessionData.token_type || 'bearer',
                    expires_in: sessionData.expires_in || 3600,
                    expires_at: Date.now() + (sessionData.expires_in || 3600) * 1000,
                    scope: sessionData.scope,
                    refresh_token: sessionData.refresh_token,
                });
            }
        } catch (e) {
            console.warn('Failed to set auth_info via OAuthTokenExchangeService', e);
        }

        // Now initialize API with active_loginid already set
        await api_base.init(true);

        const authorize = api_base.account_info as any;
        const discoveredAccounts = authorize?.account_list || [];
        
        // If no accounts discovered via api_base, that's okay - store what we have
        // The accounts may be populated later when the API connection is ready
        const accountsToStore = discoveredAccounts.length > 0 
            ? discoveredAccounts 
            : (Array.isArray(sessionData.accounts) && sessionData.accounts.length > 0 
                ? sessionData.accounts 
                : []);

        let selectedLoginId = localStorage.getItem('active_loginid') || '';
        const authorizedAccountsList: Record<string, string> = {};
        const authorizedClientAccounts: Record<
            string,
            { loginid: string; token: string; currency: string; account_type?: string; balance?: string }
        > = {};

        if (accountsToStore.length > 0) {
            accountsToStore.forEach((account: any) => {
                authorizedAccountsList[account.loginid] = sessionToken;
                authorizedClientAccounts[account.loginid] = {
                    loginid: account.loginid,
                    token: sessionToken,
                    currency: account.currency || '',
                    account_type: account.account_type || (account.is_virtual ? 'demo' : 'real'),
                    balance: account.balance ?? '0',
                };
            });

            // Validate selectedLoginId is still in discovered accounts
            if (selectedLoginId && !accountsToStore.some((acc: any) => acc.loginid === selectedLoginId)) {
                selectedLoginId = accountsToStore[0]?.loginid || '';
            }
        } else if (preferredLoginId) {
            // Fall back to the preferred login ID from session if we have it
            selectedLoginId = preferredLoginId;
            authorizedAccountsList[preferredLoginId] = sessionToken;
            authorizedClientAccounts[preferredLoginId] = {
                loginid: preferredLoginId,
                token: sessionToken,
                currency: sessionData.currency || '',
                account_type: sessionData.account_type || 'real',
                balance: sessionData.balance ?? '0',
            };
        }

        localStorage.setItem('accountsList', JSON.stringify(authorizedAccountsList));
        localStorage.setItem('clientAccounts', JSON.stringify(authorizedClientAccounts));
        
        // Ensure active_loginid is set from discovered accounts
        if (selectedLoginId) {
            localStorage.setItem('active_loginid', selectedLoginId);
            const selectedAccount = authorizedClientAccounts[selectedLoginId];
            if (selectedAccount?.account_type) {
                localStorage.setItem('account_type', selectedAccount.account_type);
            }
        }
        localStorage.setItem('client.country', authorize?.country || sessionData.currency || '');

        Cookies.set('logged_state', 'true', {
            domain: window.location.hostname,
            expires: 30,
            path: '/',
            secure: window.location.protocol === 'https:',
        });

        return true;
    } catch (error) {
        console.error('Restoring server-side OAuth session failed:', error);
        clearAuthData();
        return false;
    }
};

const setLocalStorageToken = async (
    loginInfo: URLUtils.LoginInfo[],
    paramsToDelete: string[],
    setIsAuthComplete: React.Dispatch<React.SetStateAction<boolean>>
) => {
    if (loginInfo.length) {
        try {
            const defaultActiveAccount = URLUtils.getDefaultActiveAccount(loginInfo);
            if (!defaultActiveAccount) return;

            const accountsList: Record<string, string> = {};
            const clientAccounts: Record<string, { loginid: string; token: string; currency: string; account_type?: string; balance?: string }> = {};

            loginInfo.forEach((account: { loginid: string; token: string; currency: string; account_type?: string; balance?: string }) => {
                accountsList[account.loginid] = account.token;
                clientAccounts[account.loginid] = {
                    ...account,
                    account_type: account.account_type || (account.loginid?.startsWith('VRTC') || account.loginid?.startsWith('VR') ? 'demo' : 'real'),
                    balance: account.balance ?? '0',
                };
            });

            // CRITICAL: Save all account data first to ensure persistence
            localStorage.setItem('accountsList', JSON.stringify(accountsList));
            localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));

            // Also store accounts in DerivWSAccountsService for centralized handling
            try {
                const deriv_accounts = loginInfo.map(acc => ({
                    account_id: acc.loginid,
                    balance: acc.balance || '0',
                    currency: acc.currency || '',
                    group: acc.group || '',
                    status: acc.status || '',
                    account_type: acc.account_type || (acc.is_virtual ? 'demo' : 'real'),
                }));
                if (deriv_accounts.length) DerivWSAccountsService.storeAccounts(deriv_accounts as any);
            } catch (e) {
                console.warn('Failed to store deriv accounts via service', e);
            }

            URLUtils.filterSearchParams(paramsToDelete);

            const selectedLoginInfo = defaultActiveAccount;
            const selectedToken = selectedLoginInfo.token;
            const selectedLoginId = selectedLoginInfo.loginid;

            localStorage.setItem('authToken', selectedToken);
            localStorage.setItem('active_loginid', selectedLoginId);
            localStorage.setItem(
                'account_type',
                selectedLoginInfo.account_type || (selectedLoginId.startsWith('VRTC') || selectedLoginId.startsWith('VR') ? 'demo' : 'real')
            );

            // Store auth_info centrally for other services
            try {
                OAuthTokenExchangeService.setAuthInfo({
                    access_token: selectedToken,
                    token_type: 'bearer',
                    expires_in: 3600,
                    expires_at: Date.now() + 3600 * 1000,
                });
            } catch (e) {
                console.warn('Failed to set auth_info via OAuthTokenExchangeService', e);
            }

            await api_base.init(true);

            if (!api_base.is_authorized) {
                const error = { code: 'InvalidToken' } as any;
                // Set isAuthComplete to true to prevent the app from getting stuck in loading state
                setIsAuthComplete(true);

                const is_tmb_enabled = window.is_tmb_enabled === true;
                // Only emit the InvalidToken event if logged_state is true
                if (Cookies.get('logged_state') === 'true' && !is_tmb_enabled) {
                    // Emit an event that can be caught by the application to retrigger OIDC authentication
                    globalObserver.emit('InvalidToken', { error });
                }

                if (Cookies.get('logged_state') === 'false') {
                    // If the user is not logged out, we need to clear the local storage
                    clearAuthData();
                }
            } else {
                const authorize = api_base.account_info as any;
                localStorage.setItem('client.country', authorize?.country || '');

                // CRITICAL: Set logged_state cookie to ensure session persists
                Cookies.set('logged_state', 'true', {
                    domain: window.location.hostname,
                    expires: 30,
                    path: '/',
                    secure: window.location.protocol === 'https:',
                });
                return;
            }

            // Fallback: Set tokens even if API authorization fails
            localStorage.setItem('authToken', selectedToken);
            localStorage.setItem('active_loginid', selectedLoginId);

            // CRITICAL: Set logged_state cookie to ensure session persists
            Cookies.set('logged_state', 'true', {
                domain: window.location.hostname,
                expires: 30,
                path: '/',
                secure: window.location.protocol === 'https:',
            });
        } catch (error) {
            console.error('Error setting up login info:', error);
        }
    }
};

export const AuthWrapper = () => {
    const [isAuthComplete, setIsAuthComplete] = React.useState(false);
    const { loginInfo, paramsToDelete } = URLUtils.getLoginInfoFromURL();

    React.useEffect(() => {
        const initializeAuth = async () => {
            if (!loginInfo.length) {
                const hasAccounts = Boolean(localStorage.getItem('accountsList') || localStorage.getItem('authToken'));
                if (!hasAccounts) {
                    await restoreLoginFromServerSession();
                } else {
                    // Returning user: accounts already in localStorage, init the API.
                    // For new OAuth PKCE flow the Bearer token can't WS-authorize, but
                    // handleTokenExchangeIfNeeded() in api-base.ts handles that safely.
                    await api_base.init(true);
                }
            }

            await setLocalStorageToken(loginInfo, paramsToDelete, setIsAuthComplete);
            URLUtils.filterSearchParams(['lang']);
            setIsAuthComplete(true);
        };

        initializeAuth();
    }, [loginInfo, paramsToDelete]);

    if (!isAuthComplete) {
        return <ChunkLoader message={localize('Initializing...')} />;
    }

    return <App />;
};
