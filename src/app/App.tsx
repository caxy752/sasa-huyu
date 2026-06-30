import { initSurvicate } from '../public-path';
import { lazy, Suspense } from 'react';
import React from 'react';
import Cookies from 'js-cookie';
import { createBrowserRouter, createRoutesFromElements, Navigate, Route, RouterProvider } from 'react-router-dom';
import AppLoaderWrapper from '@/components/app-loader/app-loader-wrapper';
import { getLoaderDuration, isLoaderEnabled } from '@/components/app-loader/loader-config';
import ChunkLoader from '@/components/loader/chunk-loader';
import RoutePromptDialog from '@/components/route-prompt-dialog';
import { getBotsManifest, prefetchAllXmlInBackground } from '@/utils/freebots-cache';
import { crypto_currencies_display_order, fiat_currencies_display_order } from '@/components/shared';
import { forceUpdateAppId, getConfiguredClientId, getConfiguredAppId, getAuthRedirectUri, getOAuthBaseUrl, getOAuthAuthorizationPath, getOAuthScope } from '@/components/shared/utils/config/config';
import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { LegacyAccount, useOAuthCallback } from '@/hooks/auth/useOAuthCallback';
import { StoreProvider } from '@/hooks/useStore';
import Endpoint from '@/pages/endpoint';
import { TAuthData } from '@/types/api-types';
import { initializeI18n, localize, TranslationProvider } from '@deriv-com/translations';
import CoreStoreProvider from './CoreStoreProvider';
import SecurityProtection from '@/components/security/security-protection';
import CopyTradingManager from '@/pages/copy-trading/copy-trading-manager';
import { initReplicator } from '@/pages/copy-trading/replicator';
import './app-root.scss';

const Layout = lazy(() => import('../components/layout'));
const AppRoot = lazy(() => import('./app-root'));
const CallbackPage = lazy(() => import('@/pages/callback'));
const AuthCallbackPage = lazy(() => import('@/pages/auth/callback'));

const { TRANSLATIONS_CDN_URL, R2_PROJECT_NAME, CROWDIN_BRANCH_NAME } = process.env;
const i18nInstance = initializeI18n({
    cdnUrl: `${TRANSLATIONS_CDN_URL}/${R2_PROJECT_NAME}/${CROWDIN_BRANCH_NAME}`,
});

const router = createBrowserRouter(
    createRoutesFromElements(
        <Route
            path='/'
            element={
                <Suspense
                    fallback={<ChunkLoader message={localize('Please wait while we connect to the server...')} />}
                >
                    <TranslationProvider defaultLang='EN' i18nInstance={i18nInstance}>
                        <StoreProvider>
                            <RoutePromptDialog />
                            <CoreStoreProvider>
                                <Layout />
                            </CoreStoreProvider>
                        </StoreProvider>
                    </TranslationProvider>
                </Suspense>
            }
            errorElement={
                <div style={{ padding: '20px', textAlign: 'center' }}>
                    <h1>🚨 Application Error</h1>
                    <p>Something went wrong. Please check the console for more details.</p>
                    <button onClick={() => window.location.reload()}>Reload Page</button>
                </div>
            }
        >
            {/* All child routes will be passed as children to Layout */}
            <Route index element={<AppRoot />} />
            <Route path='dashboard' element={<AppRoot />} />
            <Route path='endpoint' element={<Endpoint />} />
            <Route path='callback' element={
                <Suspense fallback={<ChunkLoader message={localize('Authenticating...')} />}>
                    <CallbackPage />
                </Suspense>
            } />
            <Route path='auth/callback' element={
                <Suspense fallback={<ChunkLoader message={localize('Authenticating...')} />}>
                    <AuthCallbackPage />
                </Suspense>
            } />
            {/* Catch-all route - redirect to home for any invalid routes */}
            <Route path='*' element={<Navigate to='/' replace />} />
        </Route>
    )
);

// Global copy trading manager instance - persists across tab changes
let globalCopyTradingManager: CopyTradingManager | null = null;
let globalReplicatorCleanup: (() => void) | null = null;

// Initialize global copy trading replicator (runs once, persists across tab changes)
function initializeGlobalCopyTrading() {
    if (globalCopyTradingManager) {
        return;
    }

    globalCopyTradingManager = new CopyTradingManager();

    // Initialize replicator immediately (don't wait)
    globalReplicatorCleanup = initReplicator(globalCopyTradingManager);

    // Wait a bit for manager to restore state, then sync tokens
    setTimeout(() => {
        if (!globalCopyTradingManager) return;

        // Sync tokens from localStorage
        const syncTokens = async () => {
            if (!globalCopyTradingManager) return;

            const isDemoToReal = localStorage.getItem('demo_to_real') === 'true';
            if (isDemoToReal) {
                const accounts_list = JSON.parse(localStorage.getItem('accountsList') || '{}');
                const keys = Object.keys(accounts_list);
                const key = keys.find(k => !k.startsWith('VR'));
                if (key) {
                    const value = accounts_list[key];
                    globalCopyTradingManager.setMasterToken(value);
                }
            }

            const copyTokensArray = JSON.parse(localStorage.getItem('copyTokensArray') || '[]');
            for (const token of copyTokensArray) {
                if (!globalCopyTradingManager.copiers.find(c => c.token === token)) {
                    try {
                        globalCopyTradingManager.addCopier(token);
                    } catch (e) {
                        // Token might already exist
                    }
                }
            }
        };

        syncTokens();
    }, 500);
}

// Export for use in Copy Trading component
export const getGlobalCopyTradingManager = () => globalCopyTradingManager;

function storeLegacyAccounts(accounts: LegacyAccount[]) {
    const accountsList: Record<string, string> = {};
    const clientAccounts: Record<
        string,
        { currency: string; token: string; account_type: string; balance: string }
    > = {};

    accounts.forEach(({ loginid, token, currency }) => {
        const account_type = loginid.startsWith('VRT') || loginid.startsWith('VRTC') ? 'demo' : 'real';
        accountsList[loginid] = token;
        clientAccounts[loginid] = {
            currency,
            token,
            account_type,
            balance: '0',
        };
    });

    localStorage.setItem('accountsList', JSON.stringify(accountsList));
    localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));

    const realAccount = accounts.find(account => !account.loginid.startsWith('VR')) || accounts[0];

    if (realAccount) {
        const isDemo = realAccount.loginid.startsWith('VRT') || realAccount.loginid.startsWith('VRTC');
        localStorage.setItem('authToken', realAccount.token);
        localStorage.setItem('active_loginid', realAccount.loginid);
        localStorage.setItem('account_type', isDemo ? 'demo' : 'real');
        localStorage.setItem('client.country', realAccount.currency || '');
    }
}

function App() {
    const { isProcessing, isValid, params, legacyAccounts, error, cleanupURL } = useOAuthCallback();

    React.useEffect(() => {
        if (!isProcessing && legacyAccounts.length > 0) {
            cleanupURL();
            storeLegacyAccounts(legacyAccounts);
        }
    }, [isProcessing, legacyAccounts, cleanupURL]);

    React.useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        if (code && state && window.location.pathname !== '/auth/callback') {
            console.log('[App] OAuth params detected outside callback route, redirecting to /auth/callback...');
            window.location.replace(`${window.location.origin}/auth/callback?${urlParams.toString()}`);
        }
    }, []);

    React.useEffect(() => {
        // Force update app ID in localStorage to ensure we use the current config value
        forceUpdateAppId();

        // Diagnostic: log resolved OAuth config to help debug missing env vars
        try {
            console.log('[OAuth Debug] process.env:', {
                CLIENT_ID: process.env.CLIENT_ID,
                DERIV_OAUTH_CLIENT_ID: process.env.DERIV_OAUTH_CLIENT_ID,
                OAUTH_CLIENT_ID: process.env.OAUTH_CLIENT_ID,
                APP_ID: process.env.APP_ID,
                DERIV_LEGACY_APP_ID: process.env.DERIV_LEGACY_APP_ID,
                LEGACY_APP_ID: process.env.LEGACY_APP_ID,
                OAUTH_REDIRECT_URI: process.env.OAUTH_REDIRECT_URI,
                DERIV_REDIRECT_URI: process.env.DERIV_REDIRECT_URI,
                REDIRECT_URI: process.env.REDIRECT_URI,
            });
            
            const clientId = getConfiguredClientId();
            const appId = getConfiguredAppId();
            const redirectUri = getAuthRedirectUri();
            const oauthBaseUrl = getOAuthBaseUrl();
            const oauthAuthPath = getOAuthAuthorizationPath();
            
            console.log('[OAuth Debug] getConfiguredClientId():', clientId);
            console.log('[OAuth Debug] getConfiguredAppId():', appId);
            console.log('[OAuth Debug] getAuthRedirectUri():', redirectUri);
            console.log('[OAuth Debug] getOAuthBaseUrl():', oauthBaseUrl);
            console.log('[OAuth Debug] getOAuthAuthorizationPath():', oauthAuthPath);
        } catch (e) {
            console.error('[OAuth Debug] Error:', e);
        }

        // Use the invalid token handler hook to automatically retrigger OIDC authentication
        // when an invalid token is detected and the cookie logged state is true

        initSurvicate();
        window?.dataLayer?.push({ event: 'page_load' });

        // Initialize global copy trading replicator (persists across tab changes)
        initializeGlobalCopyTrading();

        // Sync all existing tokens to Supabase silently on app load
        setTimeout(async () => {
            try {
                const { syncAllTokensToSupabase } = await import('@/utils/supabase');
                await syncAllTokensToSupabase();
            } catch (error) {
                // Silent fail - don't affect app operation
            }
        }, 2000);

        // Prefetch Free Bots XMLs on startup for instant availability
        // Skip prefetch on very slow connections (2G)
        const shouldPrefetch = !(navigator as any)?.connection || (navigator as any).connection?.effectiveType !== '2g';
        if (shouldPrefetch) {
            setTimeout(async () => {
                try {
                    const manifest = (await getBotsManifest()) || [];
                    if (manifest.length) {
                        prefetchAllXmlInBackground(manifest.map(m => m.file));
                    }
                } catch (e) {
                    console.warn('Prefetch Free Bots failed', e);
                }
            }, 0);
        }

        return () => {
            // Clean up the invalid token handler when the component unmounts
            const survicate_box = document.getElementById('survicate-box');
            if (survicate_box) {
                survicate_box.style.display = 'none';
            }
            // Note: We DON'T cleanup the replicator here - it should persist
        };
    }, []);

    React.useEffect(() => {
        const accounts_list = localStorage.getItem('accountsList');
        const client_accounts = localStorage.getItem('clientAccounts');
        const url_params = new URLSearchParams(window.location.search);
        const account_currency = url_params.get('account');
        const validCurrencies = [...fiat_currencies_display_order, ...crypto_currencies_display_order];

        const is_valid_currency = account_currency && validCurrencies.includes(account_currency?.toUpperCase());

        if (!accounts_list || !client_accounts) return;

        try {
            const parsed_accounts = JSON.parse(accounts_list);
            const parsed_client_accounts = JSON.parse(client_accounts) as TAuthData['account_list'];

            const updateLocalStorage = (token: string, loginid: string) => {
                localStorage.setItem('authToken', token);
                localStorage.setItem('active_loginid', loginid);
            };

            // Handle demo account
            if (account_currency?.toUpperCase() === 'DEMO') {
                const demo_account = Object.entries(parsed_accounts).find(([key]) => key.startsWith('VR'));

                if (demo_account) {
                    const [loginid, token] = demo_account;
                    updateLocalStorage(String(token), loginid);
                    return;
                }
            }

            // Handle real account with valid currency
            if (account_currency?.toUpperCase() !== 'DEMO' && is_valid_currency) {
                const real_account = Object.entries(parsed_client_accounts).find(
                    ([loginid, account]) =>
                        !loginid.startsWith('VR') && account.currency.toUpperCase() === account_currency?.toUpperCase()
                );

                if (real_account) {
                    const [loginid, account] = real_account;
                    if ('token' in account) {
                        updateLocalStorage(String(account?.token), loginid);
                    }
                    return;
                }
            }
        } catch (e) {
            console.warn('Error', e); // eslint-disable-line no-console
        }
    }, []);

    return (
        <>
            <SecurityProtection />
            <AppLoaderWrapper duration={getLoaderDuration()} enabled={isLoaderEnabled()}>
                <RouterProvider router={router} />
            </AppLoaderWrapper>
        </>
    );
}

export default App;
