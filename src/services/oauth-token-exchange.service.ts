import { clearCodeVerifier, getAuthRedirectUri, getCodeVerifier, getConfiguredClientId, getConfiguredAppId, isProduction } from '@/components/shared/utils/config/config';
import brandConfig from '@/components/shared/brand.config.json';

/**
 * Response from OAuth2 token exchange endpoint
 */
interface TokenExchangeResponse {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
}

interface AuthInfo {
    access_token: string;
    token_type: string;
    expires_in: number;
    expires_at: number; // Timestamp when token expires
    scope?: string;
    refresh_token?: string;
}

/**
 * Simple error logger (since ErrorLogger might not exist)
 */
const ErrorLogger = {
    error: (context: string, message: string, error?: unknown) => {
        console.error(`[${context}] ${message}`, error);
    },
    info: (context: string, message: string, data?: unknown) => {
        console.log(`[${context}] ${message}`, data);
    }
};

export class OAuthTokenExchangeService {
    private static getOAuth2TokenUrl(): string {
        const environment = isProduction() ? 'production' : 'staging';
        const configuredTokenUrl = (brandConfig as any).oauth?.token_url;
        if (typeof configuredTokenUrl === 'string' && configuredTokenUrl.trim()) {
            return configuredTokenUrl;
        }

        const configuredServerBaseUrl = (brandConfig as any).oauth?.server_base_url;
        if (typeof configuredServerBaseUrl === 'string' && configuredServerBaseUrl.trim()) {
            return `${configuredServerBaseUrl.replace(/\/$/, '')}/oauth2/token`;
        }

        return (brandConfig as any).platform?.auth2_url?.[environment] || 'https://auth.deriv.com/oauth2/token';
    }

    static getAuthInfo(): AuthInfo | null {
        try {
            const authInfoStr = sessionStorage.getItem('auth_info');
            if (!authInfoStr) return null;

            const authInfo: AuthInfo = JSON.parse(authInfoStr);
            if (authInfo.expires_at && Date.now() >= authInfo.expires_at) {
                this.clearAuthInfo();
                return null;
            }
            return authInfo;
        } catch (error) {
            ErrorLogger.error('OAuth', 'Error parsing auth_info', error);
            return null;
        }
    }

    /**
     * Store auth info object directly in sessionStorage
     */
    static setAuthInfo(authInfo: AuthInfo): void {
        try {
            sessionStorage.setItem('auth_info', JSON.stringify(authInfo));
        } catch (error) {
            ErrorLogger.error('OAuth', 'Failed to set auth_info', error);
        }
    }

    static clearAuthInfo(): void {
        sessionStorage.removeItem('auth_info');
    }

    static isAuthenticated(): boolean {
        const authInfo = this.getAuthInfo();
        return authInfo !== null && !!authInfo.access_token;
    }

    static getAccessToken(): string | null {
        const authInfo = this.getAuthInfo();
        return authInfo?.access_token || null;
    }

    static async exchangeCodeForToken(code: string): Promise<TokenExchangeResponse> {
        try {
            const tokenEndpoint = this.getOAuth2TokenUrl();

            // Retrieve the PKCE code verifier from session storage
            const codeVerifier = getCodeVerifier();

            if (!codeVerifier) {
                ErrorLogger.error('OAuth', 'PKCE code verifier not found or expired');
                return {
                    error: 'invalid_request',
                    error_description: 'PKCE code verifier not found or expired. Please restart the authentication flow.',
                };
            }

            const clientId = getConfiguredClientId() || String(getConfiguredAppId());
            if (!clientId) {
                ErrorLogger.error('OAuth', 'CLIENT_ID environment variable is not set');
                return {
                    error: 'invalid_client',
                    error_description: 'CLIENT_ID is not configured. Please set the CLIENT_ID environment variable.',
                };
            }

            const redirectUrl = getAuthRedirectUri();

            const requestBody = new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                client_id: clientId,
                redirect_uri: redirectUrl,
                code_verifier: codeVerifier,
            });

            console.log('Fetching URL:', tokenEndpoint);
            const response = await fetch(tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: requestBody.toString(),
            });

            const data: TokenExchangeResponse = await response.json();

            // Check for errors in response
            if (data.error) {
                ErrorLogger.error('OAuth', `Token exchange error: ${data.error}`, {
                    error: data.error,
                    description: data.error_description,
                });
                return {
                    error: data.error,
                    error_description: data.error_description,
                };
            }

            // Success - log token info (without exposing the actual token)
            if (data.access_token) {
                // Clear the code verifier after successful exchange
                clearCodeVerifier();
                // Store authentication info in sessionStorage
                const authInfo: AuthInfo = {
                    access_token: data.access_token,
                    token_type: data.token_type || 'bearer',
                    expires_in: data.expires_in || 3600,
                    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
                    scope: data.scope,
                };

                // Include refresh token if provided
                if (data.refresh_token) {
                    authInfo.refresh_token = data.refresh_token;
                }

                // Store as JSON string
                sessionStorage.setItem('auth_info', JSON.stringify(authInfo));

                // Immediately fetch accounts and initialize WebSocket after token exchange
                try {
                    const { DerivWSAccountsService } = await import('./derivws-accounts.service');

                    // Fetch accounts and store in sessionStorage
                    const accounts = await DerivWSAccountsService.fetchAccountsList(data.access_token);

                    if (accounts && accounts.length > 0) {
                        // Store accounts
                        DerivWSAccountsService.storeAccounts(accounts);

                        const accountsList: Record<string, string> = {};
                        const clientAccounts: Record<
                            string,
                            {
                                loginid: string;
                                token: string;
                                currency: string;
                                account_type?: string;
                                balance?: string;
                            }
                        > = {};

                        accounts.forEach(account => {
                            const loginid = account.account_id || account.loginid;
                            if (!loginid) return;

                            accountsList[loginid] = data.access_token;
                            clientAccounts[loginid] = {
                                loginid,
                                token: data.access_token,
                                currency: account.currency || '',
                                account_type: account.account_type || (account.is_virtual ? 'demo' : 'real'),
                                balance: account.balance ?? '0',
                            };
                        });

                        localStorage.setItem('accountsList', JSON.stringify(accountsList));
                        localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));

                        // Set the first account as active in localStorage
                        const firstAccount = accounts[0];
                        const activeLoginId = firstAccount.account_id || firstAccount.loginid;
                        if (activeLoginId) {
                            localStorage.setItem('active_loginid', activeLoginId);
                            const isDemo =
                                activeLoginId.startsWith('VRT') || activeLoginId.startsWith('VRTC');
                            localStorage.setItem('account_type', isDemo ? 'demo' : 'real');
                        }

                        ErrorLogger.info('OAuth', 'Accounts fetched and stored', {
                            loginid: activeLoginId,
                        });

                        // Trigger WebSocket initialization by reloading or reinitializing api_base
                        // The api_base will pick up the active_loginid and authorize
                        const { api_base } = await import('@/external/bot-skeleton');
                        await api_base.init(true); // Force new connection with the account
                    } else {
                        // No accounts returned - this is an error condition
                        ErrorLogger.error('OAuth', 'No accounts returned after token exchange');
                        // Clear auth info when no accounts are available to prevent invalid state
                        this.clearAuthInfo();
                        return {
                            error: 'no_accounts',
                            error_description: 'No accounts available after successful authentication',
                        };
                    }
                } catch (error) {
                    ErrorLogger.error('OAuth', 'Error fetching accounts after token exchange', error);
                    // Clear stored auth info to prevent user from being stuck in invalid auth state
                    // This allows retry without manual sessionStorage clearing
                    this.clearAuthInfo();
                    // Return error status to caller for UI feedback
                    return {
                        error: 'account_fetch_failed',
                        error_description: error instanceof Error ? error.message : 'Failed to fetch accounts after authentication',
                    };
                }
            }

            return data;
        } catch (error: unknown) {
            ErrorLogger.error('OAuth', 'Token exchange network or parsing error', error);
            return {
                error: 'network_error',
                error_description: error instanceof Error ? error.message : 'Unknown error occurred',
            };
        }
    }

    static async refreshAccessToken(refreshToken: string): Promise<TokenExchangeResponse> {
        try {
            const tokenEndpoint = this.getOAuth2TokenUrl();

            const requestBody = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });

            console.log('Fetching URL:', tokenEndpoint);
            const response = await fetch(tokenEndpoint, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: requestBody.toString(),
            });

            const text = await response.text();
            console.log('Raw API Response (Token Refresh):', text);
            console.log('RESPONSE TYPE:', typeof text);
            console.log('STATUS:', response.status);
            console.log('URL:', response.url);

            if (text.trim().startsWith('<!DOCTYPE html>') || text.trim().startsWith('<html')) {
                console.error('Endpoint returned HTML instead of JSON. Broken route:', tokenEndpoint);
            }

            let data: TokenExchangeResponse;
            try {
                data = text ? JSON.parse(text) : {};
            } catch (err) {
                console.error('JSON Parse Failed for token refresh');
                console.error(text);
                throw err;
            }

            if (data.error) {
                console.error(`OAuth Token refresh error: ${data.error}`, data.error_description);
                return { error: data.error, error_description: data.error_description };
            }

            if (data.access_token) {
                const authInfo: AuthInfo = {
                    access_token: data.access_token,
                    token_type: data.token_type || 'bearer',
                    expires_in: data.expires_in || 3600,
                    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
                    scope: data.scope,
                };

                if (data.refresh_token) authInfo.refresh_token = data.refresh_token;
                else {
                    const existingAuth = this.getAuthInfo();
                    if (existingAuth?.refresh_token) authInfo.refresh_token = existingAuth.refresh_token;
                }

                sessionStorage.setItem('auth_info', JSON.stringify(authInfo));
            }

            return data;
        } catch (error: unknown) {
            console.error('OAuth: Token refresh error', error);
            return { error: 'network_error', error_description: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
}

export default OAuthTokenExchangeService;
