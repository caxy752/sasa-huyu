/**
 * OAuthFlowService - Advanced OAuth 2.0 Flow with PKCE
 * Manages complete OAuth authorization and token lifecycle
 */

import AuthConfigManager from './AuthConfigManager';
import TokenManager, { TokenResponse } from './TokenManager';
import PKCEService from './PKCEService';
import SessionManager from './SessionManager';

export interface OAuthStartOptions {
    scope?: string;
    prompt?: 'login' | 'consent' | 'select_account';
    loginHint?: string;
    redirectUri?: string;
}

export interface OAuthToken {
    accessToken: string;
    refreshToken: string | null;
    expiresIn: number;
    tokenType: string;
    scope: string;
}

class OAuthFlowService {
    private static instance: OAuthFlowService;
    private isRefreshing: boolean = false;
    private refreshPromise: Promise<OAuthToken> | null = null;

    private constructor() {
        this.setupTokenRefreshListener();
    }

    static getInstance(): OAuthFlowService {
        if (!OAuthFlowService.instance) {
            OAuthFlowService.instance = new OAuthFlowService();
        }
        return OAuthFlowService.instance;
    }

    /**
     * Start OAuth authorization flow
     */
    async startAuthorizationFlow(options?: OAuthStartOptions): Promise<void> {
        try {
            const config = AuthConfigManager.getSensitiveConfig();
            if (!config) {
                throw new Error('OAuth configuration not initialized');
            }

            // Generate PKCE parameters
            const pkce = await PKCEService.generateAndStoreParameters();

            // Build authorization URL
            const params = new URLSearchParams({
                response_type: 'code',
                client_id: config.clientId,
                redirect_uri: options?.redirectUri || config.redirectUri,
                scope: options?.scope || config.scopes.join(' '),
                code_challenge: pkce.codeChallenge,
                code_challenge_method: 'S256',
                state: pkce.state,
            });

            if (options?.prompt) {
                params.append('prompt', options.prompt);
            }

            if (options?.loginHint) {
                params.append('login_hint', options.loginHint);
            }

            // Redirect to authorization endpoint
            const authUrl = `${config.authorizationUrl}?${params.toString()}`;
            window.location.href = authUrl;
        } catch (error) {
            console.error('Failed to start OAuth flow:', error);
            throw error;
        }
    }

    /**
     * Handle OAuth callback
     */
    async handleCallback(callbackParams: {
        code: string;
        state: string;
        error?: string;
        error_description?: string;
    }): Promise<OAuthToken> {
        try {
            // Validate state
            if (!PKCEService.validateState(callbackParams.state)) {
                throw new Error('Invalid state parameter');
            }

            if (callbackParams.error) {
                throw new Error(`OAuth error: ${callbackParams.error} - ${callbackParams.error_description || ''}`);
            }

            // Exchange code for tokens
            const token = await this.exchangeCodeForToken(callbackParams.code);

            // Clear PKCE parameters
            PKCEService.clearParameters();

            return token;
        } catch (error) {
            console.error('Failed to handle OAuth callback:', error);
            PKCEService.clearParameters();
            throw error;
        }
    }

    /**
     * Exchange authorization code for token
     */
    private async exchangeCodeForToken(code: string): Promise<OAuthToken> {
        try {
            const config = AuthConfigManager.getSensitiveConfig();
            if (!config) {
                throw new Error('OAuth configuration not initialized');
            }

            const codeVerifier = PKCEService.getAndClearCodeVerifier();
            if (!codeVerifier) {
                throw new Error('Code verifier not found');
            }

            const params = new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: config.clientId,
                code,
                redirect_uri: config.redirectUri,
                code_verifier: codeVerifier,
            });

            const response = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Token exchange failed: ${error.error} - ${error.error_description || ''}`);
            }

            const tokenResponse = (await response.json()) as TokenResponse;

            // Store token
            TokenManager.storeToken(tokenResponse);

            return {
                accessToken: tokenResponse.access_token,
                refreshToken: tokenResponse.refresh_token || null,
                expiresIn: tokenResponse.expires_in,
                tokenType: tokenResponse.token_type,
                scope: tokenResponse.scope || '',
            };
        } catch (error) {
            console.error('Failed to exchange code for token:', error);
            throw error;
        }
    }

    /**
     * Refresh access token
     */
    async refreshAccessToken(): Promise<OAuthToken> {
        // If already refreshing, return existing promise
        if (this.isRefreshing && this.refreshPromise) {
            return this.refreshPromise;
        }

        this.isRefreshing = true;

        try {
            this.refreshPromise = this.performTokenRefresh();
            const token = await this.refreshPromise;
            this.isRefreshing = false;
            this.refreshPromise = null;
            return token;
        } catch (error) {
            this.isRefreshing = false;
            this.refreshPromise = null;
            throw error;
        }
    }

    /**
     * Perform actual token refresh
     */
    private async performTokenRefresh(): Promise<OAuthToken> {
        try {
            const config = AuthConfigManager.getSensitiveConfig();
            if (!config) {
                throw new Error('OAuth configuration not initialized');
            }

            const refreshToken = TokenManager.getRefreshToken();
            if (!refreshToken) {
                throw new Error('No refresh token available');
            }

            const params = new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: config.clientId,
                refresh_token: refreshToken,
            });

            const response = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
            });

            if (!response.ok) {
                if (response.status === 400 || response.status === 401) {
                    // Refresh token expired, need to re-authenticate
                    TokenManager.clearTokens();
                    throw new Error('Refresh token expired - re-authentication required');
                }

                const error = await response.json();
                throw new Error(`Token refresh failed: ${error.error} - ${error.error_description || ''}`);
            }

            const tokenResponse = (await response.json()) as TokenResponse;

            // Store new token
            TokenManager.storeToken(tokenResponse);

            return {
                accessToken: tokenResponse.access_token,
                refreshToken: tokenResponse.refresh_token || null,
                expiresIn: tokenResponse.expires_in,
                tokenType: tokenResponse.token_type,
                scope: tokenResponse.scope || '',
            };
        } catch (error) {
            console.error('Failed to refresh token:', error);
            throw error;
        }
    }

    /**
     * Get valid access token (refresh if needed)
     */
    async getValidAccessToken(): Promise<string> {
        const token = TokenManager.getAccessToken();

        // If token exists and not expiring soon, return it
        if (token && !TokenManager.isTokenExpiringSoon()) {
            return token;
        }

        // If token is expiring soon, refresh it
        if (TokenManager.getRefreshToken()) {
            const newToken = await this.refreshAccessToken();
            return newToken.accessToken;
        }

        // No valid token available
        throw new Error('No valid access token available');
    }

    /**
     * Logout and clean up
     */
    async logout(): Promise<void> {
        try {
            // Clear all auth data
            TokenManager.clearTokens();
            SessionManager.clearSession();
            AuthConfigManager.clearConfig();
            PKCEService.clearParameters();
        } catch (error) {
            console.error('Failed to logout:', error);
            throw error;
        }
    }

    /**
     * Setup automatic token refresh before expiry
     */
    private setupTokenRefreshListener(): void {
        TokenManager.onTokenExpired(async () => {
            try {
                const refreshToken = TokenManager.getRefreshToken();
                if (refreshToken) {
                    await this.refreshAccessToken();
                } else {
                    // No refresh token, need to re-authenticate
                    await this.logout();
                    window.location.href = '/login';
                }
            } catch (error) {
                console.error('Automatic token refresh failed:', error);
                // Redirect to login on refresh failure
                await this.logout();
                window.location.href = '/login';
            }
        });
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated(): boolean {
        return TokenManager.getAccessToken() !== null && SessionManager.isSessionValid();
    }

    /**
     * Get current authentication status
     */
    getAuthStatus(): {
        isAuthenticated: boolean;
        hasValidToken: boolean;
        isTokenExpiringSoon: boolean;
        sessionValid: boolean;
        timeUntilTokenExpiry: number | null;
    } {
        const hasValidToken = TokenManager.getAccessToken() !== null;
        const isTokenExpiringSoon = TokenManager.isTokenExpiringSoon();
        const sessionValid = SessionManager.isSessionValid();

        return {
            isAuthenticated: hasValidToken && sessionValid,
            hasValidToken,
            isTokenExpiringSoon,
            sessionValid,
            timeUntilTokenExpiry: TokenManager.getTimeUntilExpiry(),
        };
    }
}

export default OAuthFlowService.getInstance();
