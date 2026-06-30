import { getAppId, getSocketURL } from '@/components/shared';
import { website_name } from '@/utils/site-config';
import DerivAPIBasic from '@deriv/deriv-api/dist/DerivAPIBasic';
import { getInitialLanguage } from '@deriv-com/translations';
import APIMiddleware from './api-middleware';
import { getDemoAccountIdForSpecialCR, isSpecialCRAccount } from '@/utils/special-accounts-config';

// Track the app_id used for the current WebSocket connection
let currentConnectionAppId = null;
const APP_ID_SWITCHING_DISABLED = true;

/**
 * Generate a Deriv API instance with a specific app_id
 * @param {number} specificAppId - Optional specific app_id to use. If not provided, uses getAppId()
 */
export const generateDerivApiInstance = (specificAppId = null, authenticatedUrl = null) => {
    const cleanedServer = getSocketURL().replace(/[^a-zA-Z0-9.]/g, '');
    const requestedAppId = specificAppId !== null ? specificAppId : getAppId();
    const appId =
        currentConnectionAppId !== null && APP_ID_SWITCHING_DISABLED && specificAppId === null
            ? currentConnectionAppId
            : requestedAppId;
    const cleanedAppId = appId?.toString()?.replace?.(/[^a-zA-Z0-9]/g, '') ?? appId?.toString();

    // Store the app_id used for this connection
    if (currentConnectionAppId === null || specificAppId !== null) {
        currentConnectionAppId = appId;
    }

    if (specificAppId === null) {
        if (currentConnectionAppId === appId) {
            console.log(`🔗 [WEBSOCKET] Creating new connection with App ID ${appId}`);
        }
    } else {
        console.log(`🔗 [WEBSOCKET] Creating connection with specific App ID ${appId}`);
    }

    const socket_url = authenticatedUrl || `wss://${cleanedServer}/websockets/v3?app_id=${cleanedAppId}&l=${getInitialLanguage()}&brand=${website_name.toLowerCase()}`;

    const deriv_socket = new WebSocket(socket_url);
    const deriv_api = new DerivAPIBasic({
        connection: deriv_socket,
        middleware: new APIMiddleware({}),
    });
    return deriv_api;
};

/**
 * Check if the current app_id in localStorage has changed from the one used for the WebSocket connection
 * Returns true if app_id has changed and reconnection is needed
 */
export const hasAppIdChanged = () => {
    if (APP_ID_SWITCHING_DISABLED) {
        return false;
    }
    const currentAppId = getAppId();
    return currentConnectionAppId !== null && currentAppId !== currentConnectionAppId;
};

/**
 * Get the app_id that was used for the current WebSocket connection
 */
export const getCurrentConnectionAppId = () => {
    return currentConnectionAppId;
};

/**
 * Ensure the API instance is using the current app_id from localStorage
 * If app_id has changed, returns true indicating a new instance should be created
 * This should be called before making trades to ensure correct app_id is used
 */
export const shouldRecreateApiInstance = storedAppId => {
    if (APP_ID_SWITCHING_DISABLED) {
        return false;
    }
    const currentAppId = getAppId();
    return storedAppId !== currentAppId;
};

export const getLoginId = () => {
    const login_id = localStorage.getItem('active_loginid');
    if (login_id && login_id !== 'null') return login_id;
    return null;
};

import OAuthTokenExchangeService from '@/services/oauth-token-exchange.service';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';

export const V2GetActiveToken = () => {
    // CRITICAL: If show_as_cr flag is set, always use demo account token
    // This ensures all trades are executed on demo account, even when a special CR account is displayed
    const showAsCR = typeof window !== 'undefined' ? localStorage.getItem('show_as_cr') : null;
    if (showAsCR) {
        const accountsList =
            typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('accountsList') || '{}') : {};
        const demoAccountId = isSpecialCRAccount(showAsCR) ? getDemoAccountIdForSpecialCR(showAsCR) : 'VRTC10109979';
        const demoToken = demoAccountId ? accountsList[demoAccountId] : undefined;
        if (demoToken) {
            console.log('[V2GetActiveToken] 🎯 Using demo token for special account', showAsCR, '->', demoAccountId);
            return demoToken;
        }
        console.warn('[V2GetActiveToken] ⚠️ No demo token found for special account', showAsCR, 'using fallback');
    }

    // Prefer token from centralized OAuthTokenExchangeService
    try {
        const oauthToken = OAuthTokenExchangeService.getAccessToken();
        if (oauthToken) return oauthToken;
    } catch (e) {
        // Ignore and fallback
    }

    const token = localStorage.getItem('authToken');
    if (token && token !== 'null') return token;
    return null;
};

export const V2GetActiveClientId = () => {
    // CRITICAL: If show_as_cr flag is set, always return demo account ID
    // This ensures API always uses demo account for trading
    const showAsCR = typeof window !== 'undefined' ? localStorage.getItem('show_as_cr') : null;
    if (showAsCR) {
        const demoAccountId = isSpecialCRAccount(showAsCR) ? getDemoAccountIdForSpecialCR(showAsCR) : 'VRTC10109979';
        if (demoAccountId) {
            console.log(
                '[V2GetActiveClientId] 🎯 Using demo account ID for special account',
                showAsCR,
                '->',
                demoAccountId
            );
            return demoAccountId;
        }
    }

    const active_loginid = getLoginId();
    if (active_loginid) {
        return active_loginid;
    }

    const token = V2GetActiveToken();
    if (!token) return null;

    // Prefer stored accounts from DerivWSAccountsService
    try {
        const storedAccounts = DerivWSAccountsService.getStoredAccounts();
        const account_list_map = JSON.parse(localStorage.getItem('accountsList') || '{}');
        if (storedAccounts && Object.keys(account_list_map).length) {
            for (const acc of storedAccounts) {
                if (acc?.account_id && account_list_map[acc.account_id] === token) {
                    return acc.account_id;
                }
            }
        }
    } catch (e) {
        // ignore and fallback
    }

    const account_list = JSON.parse(localStorage.getItem('accountsList') || '{}');
    if (account_list && account_list !== 'null') {
        return Object.keys(account_list).find(key => account_list[key] === token) ?? null;
    }
    return null;
};

export const getToken = () => {
    const active_loginid = getLoginId();
    const client_accounts = JSON.parse(localStorage.getItem('accountsList')) ?? undefined;
    const active_account = (client_accounts && client_accounts[active_loginid]) || {};
    return {
        token: active_account ?? undefined,
        account_id: active_loginid ?? undefined,
    };
};
