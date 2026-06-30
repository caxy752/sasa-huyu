import { useState } from 'react';
import { useEffect } from 'react';
import Cookies from 'js-cookie';
import { generateOAuthURL, getAuthRedirectUri } from '@/components/shared';
import RootStore from '@/stores/root-store';
import { Analytics } from '@deriv-com/analytics';
import { OAuth2Logout } from '@deriv-com/auth-client';

/**
 * Provides an object with properties: `oAuthLogout`, `retriggerOAuth2Login`, and `isSingleLoggingIn`.
 *
 * `oAuthLogout` is a function that logs out the user of the OAuth2-enabled app.
 *
 * `retriggerOAuth2Login` is a function that retriggers the OAuth2 login flow to get a new token.
 *
 * `isSingleLoggingIn` is a boolean that indicates whether the user is currently logging in.
 *
 * The `handleLogout` argument is an optional function that will be called after logging out the user.
 * If `handleLogout` is not provided, the function will resolve immediately.
 *
 * @param {{ handleLogout?: () => Promise<void> }} [options] - An object with an optional `handleLogout` property.
 * @returns {{ oAuthLogout: () => Promise<void>; retriggerOAuth2Login: () => Promise<void>; isSingleLoggingIn: boolean }}
 */
export const useOauth2 = ({
    handleLogout,
    client,
}: {
    handleLogout?: () => Promise<void>;
    client?: RootStore['client'];
} = {}) => {
    const [isSingleLoggingIn, setIsSingleLoggingIn] = useState(false);
    const accountsList = JSON.parse(localStorage.getItem('accountsList') ?? '{}');
    const isClientAccountsPopulated = Object.keys(accountsList).length > 0;
    const isSilentLoginExcluded =
        window.location.pathname.includes('callback') || window.location.pathname.includes('endpoint');

    const loggedState = Cookies.get('logged_state');

    useEffect(() => {
        window.addEventListener('unhandledrejection', event => {
            if (event?.reason?.error?.code === 'InvalidToken') {
                setIsSingleLoggingIn(false);
            }
        });
    }, []);

    useEffect(() => {
        const willEventuallySSO = loggedState === 'true' && !isClientAccountsPopulated;
        const willEventuallySLO = loggedState === 'false' && isClientAccountsPopulated;

        if (!isSilentLoginExcluded && (willEventuallySSO || willEventuallySLO)) {
            setIsSingleLoggingIn(true);
        } else {
            setIsSingleLoggingIn(false);
        }
    }, [isClientAccountsPopulated, loggedState, isSilentLoginExcluded]);

    const logoutHandler = async () => {
        client?.setIsLoggingOut(true);

        // CRITICAL: Clear all data FIRST, then redirect immediately
        // Don't wait for async operations - just clear and redirect

        // Clear logged_state cookie to prevent auto-login
        const domain = window.location.hostname.split('.').slice(-2).join('.');
        Cookies.set('logged_state', 'false', {
            domain: '.' + domain,
            expires: 0,
            path: '/',
            secure: window.location.protocol === 'https:',
        });
        Cookies.set('logged_state', 'false', {
            domain: window.location.hostname,
            expires: 0,
            path: '/',
            secure: window.location.protocol === 'https:',
        });
        Cookies.remove('logged_state', { domain: '.' + domain, path: '/' });
        Cookies.remove('logged_state', { domain: window.location.hostname, path: '/' });

        // Clear all localStorage
        localStorage.removeItem('active_loginid');
        localStorage.removeItem('accountsList');
        localStorage.removeItem('authToken');
        localStorage.removeItem('clientAccounts');
        localStorage.removeItem('show_as_cr');
        localStorage.removeItem('adminMirrorModeEnabled');
        localStorage.removeItem('adminRealAccountUsingDemo');
        localStorage.removeItem('adminRealAccountDisplayLoginId');
        localStorage.removeItem('adminSwitchingFromRealTab');
        localStorage.removeItem('cr_loginid');
        localStorage.removeItem('fullAccountsList');
        localStorage.removeItem('client.accounts');
        localStorage.removeItem('client.country');
        localStorage.removeItem('callback_token');

        // Clear sessionStorage
        if (typeof window !== 'undefined' && window.sessionStorage) {
            sessionStorage.clear();
        }

        Analytics.reset();

        // Clear client state
        if (client) {
            client.account_list = [];
            client.accounts = {};
            client.is_logged_in = false;
            client.loginid = '';
            client.balance = '0';
            client.currency = 'USD';
            client._all_accounts_balance = null;
        }

        // Call OAuth2Logout and client.logout in background (don't wait)
        // But redirect immediately
        OAuth2Logout({
            redirectCallbackUri: getAuthRedirectUri(),
            WSLogoutAndRedirect: handleLogout ?? (() => Promise.resolve()),
            postLogoutRedirectUri: window.location.origin,
        }).catch(() => {});

        client?.logout().catch(() => {});

        // CRITICAL: Force immediate redirect - don't wait for anything
        window.location.replace('/');
    };
    const retriggerOAuth2Login = async () => {
        try {
            window.location.replace(await generateOAuthURL());
        } catch (error) {
            console.error('Failed to retrigger OAuth login', error);
        }
    };

    return { oAuthLogout: logoutHandler, retriggerOAuth2Login, isSingleLoggingIn };
};
