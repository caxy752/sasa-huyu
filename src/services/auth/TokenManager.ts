/**
 * TokenManager - Secure Token Management Service
 * Handles token storage, refresh, validation, and expiry
 */

export interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: 'Bearer';
    scope?: string;
}

export interface StoredToken extends TokenResponse {
    stored_at: number;
    expires_at: number;
}

const ACCESS_TOKEN_KEY = 'oauth_access_token';
const REFRESH_TOKEN_KEY = 'oauth_refresh_token';
const TOKEN_EXPIRY_KEY = 'oauth_token_expiry';
const TOKEN_SCOPE_KEY = 'oauth_token_scope';
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

class TokenManager {
    private static instance: TokenManager;
    private refreshTimer: NodeJS.Timeout | null = null;
    private onTokenRefreshListeners: ((token: TokenResponse) => void)[] = [];
    private onTokenExpiredListeners: (() => void)[] = [];

    private constructor() {
        this.initializeTokenRefresh();
    }

    static getInstance(): TokenManager {
        if (!TokenManager.instance) {
            TokenManager.instance = new TokenManager();
        }
        return TokenManager.instance;
    }

    /**
     * Store token response
     */
    storeToken(tokenResponse: TokenResponse): void {
        const now = Date.now();
        const expiresAt = now + tokenResponse.expires_in * 1000;

        try {
            localStorage.setItem(ACCESS_TOKEN_KEY, tokenResponse.access_token);
            localStorage.setItem(TOKEN_EXPIRY_KEY, expiresAt.toString());

            if (tokenResponse.refresh_token) {
                localStorage.setItem(REFRESH_TOKEN_KEY, tokenResponse.refresh_token);
            }

            if (tokenResponse.scope) {
                localStorage.setItem(TOKEN_SCOPE_KEY, tokenResponse.scope);
            }

            // Schedule token refresh
            this.scheduleTokenRefresh(expiresAt);

            // Notify listeners
            this.onTokenRefreshListeners.forEach(listener => listener(tokenResponse));
        } catch (error) {
            console.error('Failed to store token:', error);
            throw error;
        }
    }

    /**
     * Get stored access token
     */
    getAccessToken(): string | null {
        try {
            const token = localStorage.getItem(ACCESS_TOKEN_KEY);
            if (!token) {
                return null;
            }

            // Check if token is expired
            if (this.isTokenExpired()) {
                return null;
            }

            return token;
        } catch (error) {
            console.error('Failed to retrieve access token:', error);
            return null;
        }
    }

    /**
     * Get stored refresh token
     */
    getRefreshToken(): string | null {
        try {
            return localStorage.getItem(REFRESH_TOKEN_KEY);
        } catch (error) {
            console.error('Failed to retrieve refresh token:', error);
            return null;
        }
    }

    /**
     * Get token expiry time
     */
    getTokenExpiry(): number | null {
        try {
            const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
            return expiry ? parseInt(expiry, 10) : null;
        } catch (error) {
            console.error('Failed to retrieve token expiry:', error);
            return null;
        }
    }

    /**
     * Get time until token expires (in ms)
     */
    getTimeUntilExpiry(): number | null {
        const expiry = this.getTokenExpiry();
        if (!expiry) {
            return null;
        }

        return Math.max(0, expiry - Date.now());
    }

    /**
     * Check if token is expired
     */
    isTokenExpired(): boolean {
        const expiry = this.getTokenExpiry();
        if (!expiry) {
            return true;
        }

        return Date.now() >= expiry;
    }

    /**
     * Check if token is expiring soon
     */
    isTokenExpiringSoon(): boolean {
        const timeUntilExpiry = this.getTimeUntilExpiry();
        if (!timeUntilExpiry) {
            return true;
        }

        return timeUntilExpiry < TOKEN_REFRESH_THRESHOLD_MS;
    }

    /**
     * Get token metadata
     */
    getTokenMetadata(): {
        scope: string | null;
        expiresAt: number | null;
        timeUntilExpiry: number | null;
        isExpired: boolean;
        isExpiringSoon: boolean;
    } {
        return {
            scope: localStorage.getItem(TOKEN_SCOPE_KEY),
            expiresAt: this.getTokenExpiry(),
            timeUntilExpiry: this.getTimeUntilExpiry(),
            isExpired: this.isTokenExpired(),
            isExpiringSoon: this.isTokenExpiringSoon(),
        };
    }

    /**
     * Clear all stored tokens
     */
    clearTokens(): void {
        try {
            localStorage.removeItem(ACCESS_TOKEN_KEY);
            localStorage.removeItem(REFRESH_TOKEN_KEY);
            localStorage.removeItem(TOKEN_EXPIRY_KEY);
            localStorage.removeItem(TOKEN_SCOPE_KEY);

            this.clearRefreshTimer();
        } catch (error) {
            console.error('Failed to clear tokens:', error);
        }
    }

    /**
     * Schedule automatic token refresh
     */
    private scheduleTokenRefresh(expiresAt: number): void {
        this.clearRefreshTimer();

        const timeUntilRefresh = Math.max(0, expiresAt - Date.now() - TOKEN_REFRESH_THRESHOLD_MS);

        this.refreshTimer = setTimeout(() => {
            this.onTokenExpiredListeners.forEach(listener => listener());
        }, timeUntilRefresh);
    }

    /**
     * Clear refresh timer
     */
    private clearRefreshTimer(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    /**
     * Initialize token refresh on page load
     */
    private initializeTokenRefresh(): void {
        const expiry = this.getTokenExpiry();
        if (expiry) {
            this.scheduleTokenRefresh(expiry);
        }
    }

    /**
     * Register token refresh listener
     */
    onTokenRefresh(listener: (token: TokenResponse) => void): () => void {
        this.onTokenRefreshListeners.push(listener);

        // Return unsubscribe function
        return () => {
            this.onTokenRefreshListeners = this.onTokenRefreshListeners.filter(l => l !== listener);
        };
    }

    /**
     * Register token expired listener
     */
    onTokenExpired(listener: () => void): () => void {
        this.onTokenExpiredListeners.push(listener);

        // Return unsubscribe function
        return () => {
            this.onTokenExpiredListeners = this.onTokenExpiredListeners.filter(l => l !== listener);
        };
    }

    /**
     * Notify token refresh to listeners (for manual refresh)
     */
    notifyTokenRefresh(token: TokenResponse): void {
        this.onTokenRefreshListeners.forEach(listener => listener(token));
    }

    /**
     * Validate token has required scopes
     */
    hasRequiredScopes(requiredScopes: string[]): boolean {
        const storedScope = localStorage.getItem(TOKEN_SCOPE_KEY) || '';
        const scopes = storedScope.split(' ').filter(s => s.length > 0);

        return requiredScopes.every(required => scopes.includes(required));
    }

    /**
     * Get stored token as authorization header
     */
    getAuthorizationHeader(): string | null {
        const token = this.getAccessToken();
        return token ? `Bearer ${token}` : null;
    }
}

export default TokenManager.getInstance();
