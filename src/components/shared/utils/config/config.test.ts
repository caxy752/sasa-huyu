import {
    clearCSRFToken,
    clearOAuthSession,
    forceUpdateAppId,
    generateOAuthURL,
    getAppId,
    getAuthRedirectUri,
    getCodeVerifier,
    validateCSRFToken,
} from './config';

describe('auth config helpers', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        delete process.env.APP_ID;
        delete process.env.CLIENT_ID;
        delete process.env.OAUTH_CLIENT_ID;
        delete process.env.OAUTH_REDIRECT_URI;
        delete process.env.OAUTH_LEGACY_APP_ID;
        delete process.env.OAUTH_SCOPE;
        delete process.env.OAUTH_BASE_URL;
        delete process.env.OAUTH_AUTHORIZATION_PATH;
        delete process.env.DERIV_OAUTH_CLIENT_ID;
        delete process.env.DERIV_REDIRECT_URI;
        delete process.env.DERIV_OAUTH_REDIRECT_URI;
        delete process.env.REACT_APP_OAUTH_CLIENT_ID;
        delete process.env.REACT_APP_OAUTH_REDIRECT_URI;
        delete process.env.REACT_APP_OAUTH_SCOPE;
        delete process.env.REACT_APP_OAUTH_BASE_URL;
        delete process.env.REACT_APP_OAUTH_AUTHORIZATION_PATH;
        delete process.env.VITE_OAUTH_CLIENT_ID;
        delete process.env.VITE_OAUTH_REDIRECT_URI;
        delete process.env.VITE_OAUTH_SCOPE;
        delete process.env.VITE_OAUTH_BASE_URL;
        delete process.env.VITE_OAUTH_AUTHORIZATION_PATH;
    });

    it('uses the configured client ID for OAuth and generates a direct PKCE authorization URL', async () => {
        process.env.CLIENT_ID = 'client-123';

        const oauthUrl = await generateOAuthURL();
        const parsedUrl = new URL(oauthUrl);

        expect(parsedUrl.origin).toBe('https://auth.deriv.com');
        expect(parsedUrl.pathname).toBe('/oauth2/auth');
        expect(parsedUrl.searchParams.get('client_id')).toBe('client-123');
        expect(parsedUrl.searchParams.get('redirect_uri')).toBe(`${window.location.origin}/`);
        expect(parsedUrl.searchParams.get('scope')).toBe('trade+account_manage');
        expect(parsedUrl.searchParams.get('state')).toBeTruthy();
        expect(parsedUrl.searchParams.get('code_challenge_method')).toBe('S256');
        expect(parsedUrl.searchParams.get('code_challenge')).toBeTruthy();
        expect(parsedUrl.searchParams.get('app_id')).toBeNull();
        expect(sessionStorage.getItem('oauth_csrf_token')).toBeTruthy();
        expect(sessionStorage.getItem('oauth_code_verifier')).toBeTruthy();
    });

    it('supports OAUTH_CLIENT_ID and OAUTH_REDIRECT_URI env aliases for production Vercel deployment', async () => {
        delete process.env.CLIENT_ID;
        process.env.OAUTH_CLIENT_ID = 'oauth-client-456';
        process.env.OAUTH_REDIRECT_URI = 'https://app.example.com/';

        const oauthUrl = await generateOAuthURL();
        const parsedUrl = new URL(oauthUrl);

        expect(parsedUrl.searchParams.get('client_id')).toBe('oauth-client-456');
        expect(parsedUrl.searchParams.get('redirect_uri')).toBe('https://app.example.com/');
        expect(parsedUrl.searchParams.get('scope')).toBe('trade+account_manage');
        expect(sessionStorage.getItem('oauth_csrf_token')).toBeTruthy();
        expect(sessionStorage.getItem('oauth_code_verifier')).toBeTruthy();
    });

    it('supports DERIV_OAUTH_CLIENT_ID and DERIV_REDIRECT_URI env aliases', async () => {
        delete process.env.CLIENT_ID;
        process.env.DERIV_OAUTH_CLIENT_ID = 'deriv-client-789';
        process.env.DERIV_REDIRECT_URI = 'https://deriv.example.com/';

        const oauthUrl = await generateOAuthURL();
        const parsedUrl = new URL(oauthUrl);

        expect(parsedUrl.searchParams.get('client_id')).toBe('deriv-client-789');
        expect(parsedUrl.searchParams.get('redirect_uri')).toBe('https://deriv.example.com/');
        expect(parsedUrl.searchParams.get('scope')).toBe('trade+account_manage');
        expect(sessionStorage.getItem('oauth_csrf_token')).toBeTruthy();
        expect(sessionStorage.getItem('oauth_code_verifier')).toBeTruthy();
    });

    it('returns a DERIV_REDIRECT_URI configured auth callback URL', () => {
        process.env.DERIV_REDIRECT_URI = 'https://deriv.example.com/';
        expect(getAuthRedirectUri()).toBe('https://deriv.example.com/');
    });

    it('persists the configured APP_ID into localStorage', () => {
        process.env.APP_ID = '987654';

        const appId = forceUpdateAppId();

        expect(appId).toBe(987654);
        expect(localStorage.getItem('config.app_id')).toBe('987654');
    });

    it('includes optional app_id when both client_id and app_id are configured', async () => {
        process.env.CLIENT_ID = 'client-123';
        process.env.APP_ID = '246810';

        const oauthUrl = await generateOAuthURL();
        const parsedUrl = new URL(oauthUrl);

        expect(parsedUrl.searchParams.get('client_id')).toBe('client-123');
        expect(parsedUrl.searchParams.get('app_id')).toBe('246810');
    });

    it('returns the current origin as the auth callback URL', () => {
        expect(getAuthRedirectUri()).toBe(`${window.location.origin}/`);
    });

    it('returns the configured app id from getAppId when available', () => {
        process.env.APP_ID = '246810';

        expect(getAppId()).toBe(246810);
    });

    it('generates a PKCE-based OAuth URL with the exact Deriv authorization endpoint when legacy app_id is configured without CLIENT_ID', async () => {
        process.env.APP_ID = '246810';

        const oauthUrl = await generateOAuthURL();
        const parsedUrl = new URL(oauthUrl);

        expect(parsedUrl.origin).toBe('https://auth.deriv.com');
        expect(parsedUrl.pathname).toBe('/oauth2/auth');
        expect(parsedUrl.searchParams.has('client_id')).toBe(false);
        expect(parsedUrl.searchParams.get('response_type')).toBe('code');
        expect(parsedUrl.searchParams.get('scope')).toBe('trade+account_manage');
        expect(parsedUrl.searchParams.get('code_challenge_method')).toBe('S256');
        expect(parsedUrl.searchParams.get('code_challenge')).toBeTruthy();
        expect(parsedUrl.searchParams.get('state')).toBeTruthy();
        expect(parsedUrl.searchParams.get('redirect_uri')).toBe(`${window.location.origin}/`);
        expect(parsedUrl.searchParams.get('app_id')).toBe('246810');
        expect(sessionStorage.getItem('oauth_csrf_token')).toBeTruthy();
        expect(sessionStorage.getItem('oauth_code_verifier')).toBeTruthy();
        expect(sessionStorage.getItem('oauth_csrf_token_timestamp')).toBeTruthy();
        expect(sessionStorage.getItem('oauth_code_verifier_timestamp')).toBeTruthy();
    });

    it('validates CSRF tokens and clears both OAuth session values when requested', async () => {
        process.env.APP_ID = '246810';

        await generateOAuthURL();
        const state = sessionStorage.getItem('oauth_csrf_token');

        expect(state).toBeTruthy();
        expect(validateCSRFToken(state as string)).toBe(true);

        clearCSRFToken();
        expect(validateCSRFToken(state as string)).toBe(false);

        await generateOAuthURL();
        expect(getCodeVerifier()).toBeTruthy();
        clearOAuthSession();
        expect(getCodeVerifier()).toBeNull();
    });
});
