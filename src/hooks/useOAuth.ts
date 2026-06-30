/**
 * useOAuth Hook - React hook for OAuth authentication
 * Simplifies OAuth flow management in React components
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import OAuthFlowService from '@/services/auth/OAuthFlowService';
import TokenManager from '@/services/auth/TokenManager';
import SessionManager, { SessionData } from '@/services/auth/SessionManager';
import AuthConfigManager from '@/services/auth/AuthConfigManager';

export interface UseOAuthState {
    isAuthenticated: boolean;
    isLoading: boolean;
    isRefreshing: boolean;
    error: Error | null;
    token: string | null;
    session: SessionData | null;
    authStatus: {
        isAuthenticated: boolean;
        hasValidToken: boolean;
        isTokenExpiringSoon: boolean;
        sessionValid: boolean;
        timeUntilTokenExpiry: number | null;
    };
}

export interface UseOAuthActions {
    login: (options?: { prompt?: 'login' | 'consent' | 'select_account' }) => Promise<void>;
    logout: () => Promise<void>;
    refreshToken: () => Promise<void>;
    getValidAccessToken: () => Promise<string>;
    recoverSession: () => Promise<void>;
}

/**
 * useOAuth - Main OAuth hook
 */
export function useOAuth(): UseOAuthState & UseOAuthActions {
    const [state, setState] = useState<UseOAuthState>({
        isAuthenticated: false,
        isLoading: true,
        isRefreshing: false,
        error: null,
        token: null,
        session: null,
        authStatus: {
            isAuthenticated: false,
            hasValidToken: false,
            isTokenExpiringSoon: false,
            sessionValid: false,
            timeUntilTokenExpiry: null,
        },
    });

    const unsubscribeRefs = useRef<(() => void)[]>([]);

    // Initialize authentication state on mount
    useEffect(() => {
        const initializeAuth = async () => {
            try {
                // Initialize configuration
                await AuthConfigManager.initialize();

                // Check current authentication status
                const authStatus = OAuthFlowService.getAuthStatus();
                const token = TokenManager.getAccessToken();
                const session = SessionManager.getSession();

                setState(prev => ({
                    ...prev,
                    isAuthenticated: authStatus.isAuthenticated,
                    isLoading: false,
                    token,
                    session,
                    authStatus,
                }));

                // Setup listeners for token refresh
                const unsubscribeTokenRefresh = TokenManager.onTokenRefresh(() => {
                    const newToken = TokenManager.getAccessToken();
                    setState(prev => ({
                        ...prev,
                        token: newToken,
                        authStatus: OAuthFlowService.getAuthStatus(),
                    }));
                });

                // Setup listeners for token expiry
                const unsubscribeTokenExpiry = TokenManager.onTokenExpired(() => {
                    setState(prev => ({
                        ...prev,
                        authStatus: OAuthFlowService.getAuthStatus(),
                    }));
                });

                // Setup listeners for session expiry
                const unsubscribeSessionExpiry = SessionManager.onSessionExpired(() => {
                    setState(prev => ({
                        ...prev,
                        isAuthenticated: false,
                        session: null,
                        authStatus: OAuthFlowService.getAuthStatus(),
                    }));
                });

                unsubscribeRefs.current = [unsubscribeTokenRefresh, unsubscribeTokenExpiry, unsubscribeSessionExpiry];
            } catch (error) {
                console.error('Failed to initialize authentication:', error);
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: error instanceof Error ? error : new Error('Failed to initialize'),
                }));
            }
        };

        initializeAuth();

        // Cleanup listeners on unmount
        return () => {
            unsubscribeRefs.current.forEach(unsubscribe => unsubscribe?.());
        };
    }, []);

    // Login action
    const login = useCallback(async (options?: { prompt?: 'login' | 'consent' | 'select_account' }) => {
        try {
            setState(prev => ({ ...prev, isLoading: true, error: null }));
            await OAuthFlowService.startAuthorizationFlow(options);
        } catch (error) {
            const err = error instanceof Error ? error : new Error('Login failed');
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: err,
            }));
            throw err;
        }
    }, []);

    // Logout action
    const logout = useCallback(async () => {
        try {
            setState(prev => ({ ...prev, isLoading: true, error: null }));
            await OAuthFlowService.logout();
            setState(prev => ({
                ...prev,
                isAuthenticated: false,
                isLoading: false,
                token: null,
                session: null,
            }));
        } catch (error) {
            const err = error instanceof Error ? error : new Error('Logout failed');
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: err,
            }));
            throw err;
        }
    }, []);

    // Refresh token action
    const refreshToken = useCallback(async () => {
        try {
            setState(prev => ({ ...prev, isRefreshing: true, error: null }));
            await OAuthFlowService.refreshAccessToken();
            const newToken = TokenManager.getAccessToken();
            setState(prev => ({
                ...prev,
                isRefreshing: false,
                token: newToken,
                authStatus: OAuthFlowService.getAuthStatus(),
            }));
        } catch (error) {
            const err = error instanceof Error ? error : new Error('Token refresh failed');
            setState(prev => ({
                ...prev,
                isRefreshing: false,
                error: err,
            }));
            throw err;
        }
    }, []);

    // Get valid access token
    const getValidAccessToken = useCallback(async (): Promise<string> => {
        try {
            return await OAuthFlowService.getValidAccessToken();
        } catch (error) {
            const err = error instanceof Error ? error : new Error('Failed to get access token');
            setState(prev => ({ ...prev, error: err }));
            throw err;
        }
    }, []);

    // Recover session
    const recoverSession = useCallback(async () => {
        try {
            setState(prev => ({ ...prev, isLoading: true, error: null }));

            // Try to refresh token
            await OAuthFlowService.refreshAccessToken();

            // Update state
            const authStatus = OAuthFlowService.getAuthStatus();
            const token = TokenManager.getAccessToken();
            const session = SessionManager.getSession();

            setState(prev => ({
                ...prev,
                isAuthenticated: authStatus.isAuthenticated,
                isLoading: false,
                token,
                session,
                authStatus,
            }));
        } catch (error) {
            const err = error instanceof Error ? error : new Error('Session recovery failed');
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: err,
            }));
            throw err;
        }
    }, []);

    return {
        ...state,
        login,
        logout,
        refreshToken,
        getValidAccessToken,
        recoverSession,
    };
}

/**
 * useOAuthCallback - Handle OAuth callback after redirect
 */
export function useOAuthCallback() {
    const [state, setState] = useState<{
        isProcessing: boolean;
        error: Error | null;
        success: boolean;
    }>({
        isProcessing: true,
        error: null,
        success: false,
    });

    useEffect(() => {
        const handleCallback = async () => {
            try {
                const params = new URLSearchParams(window.location.search);
                const code = params.get('code');
                const state = params.get('state');
                const error = params.get('error');
                const errorDescription = params.get('error_description');

                if (error) {
                    throw new Error(`OAuth error: ${error} - ${errorDescription || ''}`);
                }

                if (!code || !state) {
                    throw new Error('Missing authorization code or state parameter');
                }

                // Handle callback
                await OAuthFlowService.handleCallback({
                    code,
                    state,
                });

                // Create session
                const session = SessionManager.getSession();
                if (!session) {
                    SessionManager.createSession({
                        loginId: 'default', // Extract from token
                        accountList: [],
                        activeAccount: 'default',
                    });
                }

                setState({
                    isProcessing: false,
                    error: null,
                    success: true,
                });

                // Redirect to dashboard
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 1000);
            } catch (error) {
                const err = error instanceof Error ? error : new Error('Callback processing failed');
                setState({
                    isProcessing: false,
                    error: err,
                    success: false,
                });
            }
        };

        handleCallback();
    }, []);

    return state;
}

/**
 * useTokenStatus - Monitor token status in real-time
 */
export function useTokenStatus() {
    const [status, setStatus] = useState<{
        isExpired: boolean;
        isExpiringSoon: boolean;
        timeUntilExpiry: number | null;
        expiresAt: number | null;
    }>({
        isExpired: false,
        isExpiringSoon: false,
        timeUntilExpiry: null,
        expiresAt: null,
    });

    useEffect(() => {
        const updateStatus = () => {
            setStatus({
                isExpired: TokenManager.isTokenExpired(),
                isExpiringSoon: TokenManager.isTokenExpiringSoon(),
                timeUntilExpiry: TokenManager.getTimeUntilExpiry(),
                expiresAt: TokenManager.getTokenExpiry(),
            });
        };

        // Initial update
        updateStatus();

        // Update every 30 seconds
        const interval = setInterval(updateStatus, 30000);

        return () => clearInterval(interval);
    }, []);

    return status;
}

/**
 * useSessionStatus - Monitor session status in real-time
 */
export function useSessionStatus() {
    const [status, setStatus] = useState<{
        isValid: boolean;
        sessionAge: number | null;
        timeUntilExpiry: number | null;
        inactivityDuration: number | null;
    }>({
        isValid: false,
        sessionAge: null,
        timeUntilExpiry: null,
        inactivityDuration: null,
    });

    useEffect(() => {
        const updateStatus = () => {
            setStatus(SessionManager.getSessionMetadata());
        };

        // Initial update
        updateStatus();

        // Update every minute
        const interval = setInterval(updateStatus, 60000);

        // Also update on activity
        const handleActivity = () => {
            SessionManager.recordActivity();
            updateStatus();
        };

        document.addEventListener('mousemove', handleActivity);
        document.addEventListener('keypress', handleActivity);

        return () => {
            clearInterval(interval);
            document.removeEventListener('mousemove', handleActivity);
            document.removeEventListener('keypress', handleActivity);
        };
    }, []);

    return status;
}

/**
 * useAuthGuard - Protect routes that require authentication
 */
export function useAuthGuard() {
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const checkAuthorization = async () => {
            try {
                const authStatus = OAuthFlowService.getAuthStatus();
                setIsAuthorized(authStatus.isAuthenticated);
            } catch (error) {
                console.error('Authorization check failed:', error);
                setIsAuthorized(false);
            } finally {
                setIsLoading(false);
            }
        };

        checkAuthorization();

        // Check every minute
        const interval = setInterval(checkAuthorization, 60000);

        return () => clearInterval(interval);
    }, []);

    return { isAuthorized, isLoading };
}

/**
 * useOAuthAPI - Make authenticated API calls
 */
export function useOAuthAPI() {
    const fetchAuthenticated = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
        try {
            const token = await OAuthFlowService.getValidAccessToken();

            const headers = {
                ...options.headers,
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            return fetch(url, {
                ...options,
                headers,
            });
        } catch (error) {
            console.error('Authenticated API call failed:', error);
            throw error;
        }
    }, []);

    return { fetchAuthenticated };
}

export default {
    useOAuth,
    useOAuthCallback,
    useTokenStatus,
    useSessionStatus,
    useAuthGuard,
    useOAuthAPI,
};
