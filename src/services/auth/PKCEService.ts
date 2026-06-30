/**
 * PKCEService - OAuth 2.0 PKCE (Proof Key for Public Clients) Implementation
 * Handles code challenge generation using SHA256
 */

const PKCE_CODE_VERIFIER_KEY = 'pkce_code_verifier';
const PKCE_STATE_KEY = 'pkce_state';
const PKCE_STATE_TIMESTAMP_KEY = 'pkce_state_timestamp';
const PKCE_STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

class PKCEService {
    private static instance: PKCEService;

    private constructor() {}

    static getInstance(): PKCEService {
        if (!PKCEService.instance) {
            PKCEService.instance = new PKCEService();
        }
        return PKCEService.instance;
    }

    /**
     * Generate a random code verifier (43-128 characters)
     */
    generateCodeVerifier(): string {
        const length = 128;
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        let codeVerifier = '';

        const randomValues = new Uint8Array(length);
        crypto.getRandomValues(randomValues);

        for (let i = 0; i < length; i++) {
            codeVerifier += charset[randomValues[i] % charset.length];
        }

        return codeVerifier;
    }

    /**
     * Generate code challenge from verifier using SHA256
     */
    async generateCodeChallenge(codeVerifier: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(codeVerifier);

        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashString = String.fromCharCode.apply(null, hashArray as any);

        return this.base64UrlEncode(hashString);
    }

    /**
     * Generate state parameter (CSRF protection)
     */
    generateState(): string {
        const length = 32;
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let state = '';

        const randomValues = new Uint8Array(length);
        crypto.getRandomValues(randomValues);

        for (let i = 0; i < length; i++) {
            state += charset[randomValues[i] % charset.length];
        }

        return state;
    }

    /**
     * Store PKCE parameters for authorization flow
     */
    async generateAndStoreParameters(): Promise<{
        codeVerifier: string;
        codeChallenge: string;
        state: string;
    }> {
        try {
            const codeVerifier = this.generateCodeVerifier();
            const codeChallenge = await this.generateCodeChallenge(codeVerifier);
            const state = this.generateState();

            this.storeCodeVerifier(codeVerifier);
            this.storeState(state);

            return {
                codeVerifier,
                codeChallenge,
                state,
            };
        } catch (error) {
            console.error('Failed to generate PKCE parameters:', error);
            throw error;
        }
    }

    /**
     * Store code verifier in sessionStorage (not localStorage for security)
     */
    private storeCodeVerifier(codeVerifier: string): void {
        try {
            sessionStorage.setItem(PKCE_CODE_VERIFIER_KEY, codeVerifier);
        } catch (error) {
            console.error('Failed to store code verifier:', error);
        }
    }

    /**
     * Retrieve and clear code verifier
     */
    getAndClearCodeVerifier(): string | null {
        try {
            const verifier = sessionStorage.getItem(PKCE_CODE_VERIFIER_KEY);
            sessionStorage.removeItem(PKCE_CODE_VERIFIER_KEY);
            return verifier;
        } catch (error) {
            console.error('Failed to retrieve code verifier:', error);
            return null;
        }
    }

    /**
     * Store state parameter
     */
    private storeState(state: string): void {
        try {
            sessionStorage.setItem(PKCE_STATE_KEY, state);
            sessionStorage.setItem(PKCE_STATE_TIMESTAMP_KEY, Date.now().toString());
        } catch (error) {
            console.error('Failed to store state:', error);
        }
    }

    /**
     * Retrieve and validate state parameter
     */
    getAndClearState(): string | null {
        try {
            const state = sessionStorage.getItem(PKCE_STATE_KEY);
            const timestamp = sessionStorage.getItem(PKCE_STATE_TIMESTAMP_KEY);

            sessionStorage.removeItem(PKCE_STATE_KEY);
            sessionStorage.removeItem(PKCE_STATE_TIMESTAMP_KEY);

            if (!state || !timestamp) {
                return null;
            }

            // Check if state is still valid (not expired)
            const stateAge = Date.now() - parseInt(timestamp, 10);
            if (stateAge > PKCE_STATE_EXPIRY_MS) {
                console.warn('State parameter has expired');
                return null;
            }

            return state;
        } catch (error) {
            console.error('Failed to retrieve state:', error);
            return null;
        }
    }

    /**
     * Validate state parameter
     */
    validateState(returnedState: string): boolean {
        try {
            const storedState = sessionStorage.getItem(PKCE_STATE_KEY);

            if (!storedState) {
                console.warn('No stored state found');
                return false;
            }

            if (storedState !== returnedState) {
                console.warn('State mismatch');
                return false;
            }

            // Check state age
            const timestamp = sessionStorage.getItem(PKCE_STATE_TIMESTAMP_KEY);
            if (!timestamp) {
                return false;
            }

            const stateAge = Date.now() - parseInt(timestamp, 10);
            if (stateAge > PKCE_STATE_EXPIRY_MS) {
                console.warn('State parameter has expired');
                return false;
            }

            return true;
        } catch (error) {
            console.error('Failed to validate state:', error);
            return false;
        }
    }

    /**
     * Clear all PKCE parameters
     */
    clearParameters(): void {
        try {
            sessionStorage.removeItem(PKCE_CODE_VERIFIER_KEY);
            sessionStorage.removeItem(PKCE_STATE_KEY);
            sessionStorage.removeItem(PKCE_STATE_TIMESTAMP_KEY);
        } catch (error) {
            console.error('Failed to clear PKCE parameters:', error);
        }
    }

    /**
     * Base64URL encode (RFC 4648)
     */
    private base64UrlEncode(str: string): string {
        let binary = '';
        for (let i = 0; i < str.length; i++) {
            binary += String.fromCharCode(str.charCodeAt(i));
        }

        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
}

export default PKCEService.getInstance();
