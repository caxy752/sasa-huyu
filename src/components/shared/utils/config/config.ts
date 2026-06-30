import { isStaging } from '../url/helpers';
import brandConfig from '../../brand.config.json';

export const APP_IDS = {
    LOCALHOST: 36300,
    TMP_STAGING: 64584,
    STAGING: 29934,
    STAGING_BE: 29934,
    STAGING_ME: 29934,
    PRODUCTION: 117164,
    PRODUCTION_BE: 117164,
    PRODUCTION_ME: 117164,
};

export const livechat_license_id = 12049137;
export const livechat_client_id = '66aa088aad5a414484c1fd1fa8a5ace7';

export const domain_app_ids = {
    'dbot12.netlify.app': 80491,
    'kingstraders.site': 85821,
    'www.kingstraders.site': 85821,
    'wallacetraders.site': 86003,
    'www.wallacetraders.site': 86003,
    'legoo.site': 85150,
    'www.legoo.site': 85150,
    'dbotprinters.site': 86059,
    'www.dbotprinters.site': 86059,
    'www.kenyanhennessy.site': 97088,
    'kenyanhennessy.site': 97088,
    'masterhunter.site': 96223,
    'developmentviewport.netlify.app': 97311,
    'www.developmentviewport.netlify.app': 97311,
    'qtropwinninghub.vercel.app': 107823,
    'www.qtropwinninghub.vercel.app': 107823,
    'qtropwinnershub.site': 107823,
    'www.qtropwinnershub.site': 107823,
    'dbotprov.vercel.app': 113830,
    'www.dbotprov.vercel.app': 113830,
};

export const getCurrentProductionDomain = () => {
    // If it's staging, return null to use staging app ID
    if (/^staging\./.test(window.location.hostname)) {
        return null;
    }

    // Check if domain is explicitly configured
    const exactMatch = Object.keys(domain_app_ids).find(domain => window.location.hostname === domain);
    if (exactMatch) {
        return exactMatch;
    }

    // For any other production domain, return the hostname to use production app ID
    return window.location.hostname;
};

export const getConfiguredAppId = () => {
    const configured_app_id =
        process.env.DERIV_APP_ID ||
        process.env.APP_ID ||
        process.env.OAUTH_LEGACY_APP_ID ||
        process.env.LEGACY_APP_ID ||
        process.env.DERIV_LEGACY_APP_ID ||
        process.env.REACT_APP_APP_ID ||
        process.env.REACT_APP_LEGACY_APP_ID ||
        process.env.VITE_APP_ID ||
        process.env.VITE_LEGACY_APP_ID ||
        localStorage.getItem('configured_app_id') ||
        (brandConfig.oauth?.app_id ? String(brandConfig.oauth.app_id) : '');

    if (!configured_app_id) {
        return null;
    }

    const parsed_app_id = Number(configured_app_id);

    if (!Number.isNaN(parsed_app_id)) {
        return parsed_app_id;
    }

    return null;
};

export const getConfiguredClientId = () =>
    process.env.CLIENT_ID ||
    process.env.DERIV_OAUTH_CLIENT_ID ||
    process.env.OAUTH_CLIENT_ID ||
    process.env.REACT_APP_CLIENT_ID ||
    process.env.REACT_APP_OAUTH_CLIENT_ID ||
    process.env.VITE_CLIENT_ID ||
    process.env.VITE_OAUTH_CLIENT_ID ||
    localStorage.getItem('configured_client_id') ||
    brandConfig.oauth?.client_id ||
    '';

export const getOAuthBaseUrl = () =>
    process.env.AUTH_BASE_URL ||
    process.env.OAUTH_BASE_URL ||
    process.env.DERIV_OAUTH_BASE_URL ||
    process.env.REACT_APP_AUTH_BASE_URL ||
    process.env.REACT_APP_OAUTH_AUTHORIZATION_URL?.replace('/oauth2/auth', '') ||
    process.env.REACT_APP_OAUTH_BASE_URL ||
    process.env.VITE_AUTH_BASE_URL ||
    process.env.VITE_OAUTH_AUTHORIZATION_URL?.replace('/oauth2/auth', '') ||
    process.env.VITE_OAUTH_BASE_URL ||
    brandConfig.oauth?.server_base_url ||
    'https://auth.deriv.com';

export const getOAuthAuthorizationPath = () =>
    process.env.AUTHORIZATION_PATH ||
    process.env.OAUTH_AUTHORIZATION_PATH ||
    process.env.REACT_APP_AUTHORIZATION_PATH ||
    process.env.REACT_APP_OAUTH_AUTHORIZATION_PATH ||
    process.env.VITE_AUTHORIZATION_PATH ||
    process.env.VITE_OAUTH_AUTHORIZATION_PATH ||
    brandConfig.oauth?.authorization_path ||
    '/oauth2/auth';

export const getOAuthScope = () =>
    (process.env.DERIV_OAUTH_SCOPES ||
    process.env.SCOPE ||
    process.env.OAUTH_SCOPE ||
    process.env.REACT_APP_SCOPE ||
    process.env.REACT_APP_OAUTH_SCOPE ||
    process.env.VITE_SCOPE ||
    process.env.VITE_OAUTH_SCOPE ||
    brandConfig.oauth?.scope ||
    '').replace(/\+/g, ' ');

const OAUTH_STATE_KEY = 'oauth_csrf_token';
const OAUTH_STATE_TIMESTAMP_KEY = 'oauth_csrf_token_timestamp';
const OAUTH_CODE_VERIFIER_KEY = 'oauth_code_verifier';
const OAUTH_CODE_VERIFIER_TIMESTAMP_KEY = 'oauth_code_verifier_timestamp';
const OAUTH_TOKEN_EXPIRY_MS = 600000;

/**
 * Generates a cryptographically secure CSRF token
 * @returns A random base64url-encoded string
 */
const generateCSRFToken = (): string => {
    // Generate 32 random bytes (256 bits) for strong security
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);

    // Convert to base64url encoding (URL-safe)
    const base64 = btoa(String.fromCharCode(...array));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

/**
 * Generates a PKCE code verifier (random string)
 * @returns A cryptographically random base64url-encoded string (43-128 characters)
 */
const generateCodeVerifier = (): string => {
    // Generate 32 random bytes (will result in 43 characters after base64url encoding)
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);

    // Convert to base64url encoding (URL-safe, no padding)
    const base64 = btoa(String.fromCharCode(...array));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

/**
 * Generates a PKCE code challenge from a code verifier using SHA-256
 * @param verifier The code verifier string
 * @returns Promise that resolves to the base64url-encoded SHA-256 hash
 */
const generateCodeChallenge = async (verifier: string): Promise<string> => {
    // Encode the verifier as UTF-8
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);

    // Hash with SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // Convert to base64url encoding
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const base64 = btoa(String.fromCharCode(...hashArray));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

/**
 * Stores PKCE code verifier in sessionStorage for token exchange
 * @param verifier The code verifier to store
 */
const storeCodeVerifier = (verifier: string): void => {
    sessionStorage.setItem(OAUTH_CODE_VERIFIER_KEY, verifier);
    // Also store timestamp for verifier expiration (e.g., 10 minutes)
    sessionStorage.setItem(OAUTH_CODE_VERIFIER_TIMESTAMP_KEY, Date.now().toString());
};

export const getCodeVerifier = () => {
    const code_verifier = sessionStorage.getItem(OAUTH_CODE_VERIFIER_KEY);
    const timestamp = sessionStorage.getItem(OAUTH_CODE_VERIFIER_TIMESTAMP_KEY);

    if (!code_verifier || !timestamp) {
        return null;
    }

    const timestamp_value = Number(timestamp);
    if (!Number.isFinite(timestamp_value)) {
        clearCodeVerifier();
        return null;
    }

    if (Date.now() - timestamp_value > OAUTH_TOKEN_EXPIRY_MS) {
        clearCodeVerifier();
        return null;
    }

    return code_verifier;
};

export const clearCodeVerifier = () => {
    sessionStorage.removeItem(OAUTH_CODE_VERIFIER_KEY);
    sessionStorage.removeItem(OAUTH_CODE_VERIFIER_TIMESTAMP_KEY);
};

export const clearOAuthSession = () => {
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(OAUTH_STATE_TIMESTAMP_KEY);
    clearCodeVerifier();
};

/**
 * Stores CSRF token in sessionStorage for validation after OAuth callback
 * @param token The CSRF token to store
 */
const storeCSRFToken = (token: string): void => {
    sessionStorage.setItem(OAUTH_STATE_KEY, token);
    // Also store timestamp for token expiration (e.g., 10 minutes)
    sessionStorage.setItem(OAUTH_STATE_TIMESTAMP_KEY, Date.now().toString());
};

export const validateCSRFToken = (token: string): boolean => {
    const stored_token = sessionStorage.getItem(OAUTH_STATE_KEY);
    const timestamp = sessionStorage.getItem(OAUTH_STATE_TIMESTAMP_KEY);

    if (!stored_token || !timestamp) {
        return false;
    }

    if (stored_token !== token) {
        return false;
    }

    const timestamp_value = Number(timestamp);
    if (!Number.isFinite(timestamp_value)) {
        clearOAuthSession();
        return false;
    }

    if (Date.now() - timestamp_value > OAUTH_TOKEN_EXPIRY_MS) {
        clearOAuthSession();
        return false;
    }

    return true;
};

export const clearCSRFToken = () => {
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(OAUTH_STATE_TIMESTAMP_KEY);
};

export const getAuthRedirectUri = () => {
    // Check environment variables first
    const envRedirectUri = 
        process.env.DERIV_REDIRECT_URI ||
        process.env.OAUTH_REDIRECT_URI ||
        process.env.REDIRECT_URI ||
        brandConfig.oauth?.redirect_uri;
    
    if (envRedirectUri) {
        return envRedirectUri;
    }
    
    // Fall back to current origin
    const protocol = window.location.protocol;
    const host = window.location.host;
    return `${protocol}//${host}`;
};

export const isProduction = () => {
    const all_domains = Object.keys(domain_app_ids).map(domain => `(www\\.)?${domain.replace('.', '\\.')}`);
    return new RegExp(`^(${all_domains.join('|')})$`, 'i').test(window.location.hostname);
};

export const isTestLink = () => {
    return (
        window.location.origin?.includes('.binary.sx') ||
        window.location.origin?.includes('bot-65f.pages.dev') ||
        isLocal()
    );
};

export const isLocal = () => /localhost(:\d+)?$/i.test(window.location.hostname);

const getDefaultServerURL = () => {
    const server = 'ws';
    const server_url = `${server}.derivws.com`;

    return server_url;
};

export const getDefaultAppIdAndUrl = () => {
    const server_url = getDefaultServerURL();

    if (isTestLink()) {
        return { app_id: APP_IDS.LOCALHOST, server_url };
    }

    const current_domain = getCurrentProductionDomain() ?? '';
    const app_id = domain_app_ids[current_domain as keyof typeof domain_app_ids] ?? APP_IDS.PRODUCTION;

    return { app_id, server_url };
};

// Default app ID - always 117164
const DEFAULT_APP_ID = 117164;

/**
 * No-op function for backward compatibility - app ID no longer switches
 */
export const switchAppIdAfterTrade = () => {
    // App ID switching is disabled - always use 117164
    return null;
};

// Force update app ID in localStorage on app initialization
export const forceUpdateAppId = () => {
    const app_id = getAppId();

    window.localStorage.setItem('config.app_id', app_id.toString());

    return app_id;
};

export const getAppId = () => {
    const configured_app_id = getConfiguredAppId();

    if (configured_app_id) {
        window.localStorage.setItem('configured_app_id', configured_app_id.toString());
        window.localStorage.setItem('config.app_id', configured_app_id.toString());

        return configured_app_id;
    }

    let app_id = null;

    if (isStaging()) {
        app_id = APP_IDS.STAGING;
    } else if (isTestLink()) {
        app_id = APP_IDS.LOCALHOST;
    } else {
        const current_domain = getCurrentProductionDomain();

        // If domain is explicitly configured, use that app ID
        if (current_domain && domain_app_ids[current_domain as keyof typeof domain_app_ids]) {
            app_id = domain_app_ids[current_domain as keyof typeof domain_app_ids];
        } else {
            // For production domains, always use default app ID 117164
            app_id = DEFAULT_APP_ID;
        }
    }

    // Always force update localStorage with the current app ID
    // This ensures the browser always uses the current app_id
    window.localStorage.setItem('config.app_id', app_id.toString());

    return app_id;
};

export const getSocketURL = () => {
    const local_storage_server_url = window.localStorage.getItem('config.server_url');
    if (local_storage_server_url) return local_storage_server_url;

    const server_url = getDefaultServerURL();

    return server_url;
};

export const checkAndSetEndpointFromUrl = () => {
    if (isTestLink()) {
        const url_params = new URLSearchParams(location.search.slice(1));

        if (url_params.has('qa_server') && url_params.has('app_id')) {
            const qa_server = url_params.get('qa_server') || '';
            const app_id = url_params.get('app_id') || '';

            url_params.delete('qa_server');
            url_params.delete('app_id');

            if (/^(^(www\.)?qa[0-9]{1,4}\.deriv.dev|(.*)\.derivws\.com)$/.test(qa_server) && /^[0-9]+$/.test(app_id)) {
                localStorage.setItem('config.app_id', app_id);
                localStorage.setItem('config.server_url', qa_server.replace(/"/g, ''));
            }

            const params = url_params.toString();
            const hash = location.hash;

            location.href = `${location.protocol}//${location.hostname}${location.pathname}${
                params ? `?${params}` : ''
            }${hash || ''}`;

            return true;
        }
    }

    return false;
};

export const getDebugServiceWorker = () => {
    const debug_service_worker_flag = window.localStorage.getItem('debug_service_worker');
    if (debug_service_worker_flag) return !!parseInt(debug_service_worker_flag);

    return false;
};

export const generateOAuthURL = async (prompt?: string) => {
    try {
        const environment = isProduction() ? 'production' : 'staging';
        const hostname = brandConfig?.platform?.auth2_url?.[environment] || 'https://auth.deriv.com/';
        const clientId = getConfiguredClientId() || String(getConfiguredAppId());

        if (hostname && clientId) {
            // Generate CSRF token for security
            const csrfToken = generateCSRFToken();

            // Store token for validation after callback
            storeCSRFToken(csrfToken);

            // Generate PKCE parameters
            const codeVerifier = generateCodeVerifier();
            const codeChallenge = await generateCodeChallenge(codeVerifier);

            // Store code verifier for token exchange
            storeCodeVerifier(codeVerifier);

            // Build redirect URL
            const redirectUrl = getAuthRedirectUri();
            const scopes = 'trade';

            // Build OAuth URL with PKCE parameters
            // - state: CSRF token for security
            // - code_challenge: SHA-256 hash of code_verifier
            // - code_challenge_method: S256 (SHA-256)
            let oauthUrl = `${hostname}oauth2/auth?scope=${scopes}&response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUrl)}&state=${csrfToken}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

            // Optional: prompt parameter (e.g. 'registration' for signup flow)
            if (prompt) {
                oauthUrl += `&prompt=${encodeURIComponent(prompt)}`;
            }

            // Optional: legacy app_id for routing users on the Legacy Deriv API platform
            const appId = getConfiguredAppId();
            if (appId) {
                oauthUrl += `&app_id=${encodeURIComponent(String(appId))}`;
            }

            console.log('OAuth Client ID:', clientId);
            console.log('App ID:', appId);
            console.log('OAuth URL:', oauthUrl);
            console.log({
              appId: appId,
              clientId: clientId,
              redirectUri: redirectUrl,
              authUrl: oauthUrl
            });

            return oauthUrl;
        }
    } catch (error) {
        console.error('Error generating OAuth URL:', error);
    }

    // Fallback to hardcoded URLs if brand config fails
    return '';
};
