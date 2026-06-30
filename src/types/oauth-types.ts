/**
 * TypeScript Type Definitions for OAuth 2.0 PKCE Authentication System
 */

/**
 * OAuth Configuration Types
 */
export interface OAuthConfig {
    siteUrl: string;
    clientId: string;
    authorizationUrl: string;
    tokenUrl: string;
    redirectUri: string;
    scopes: string[];
    legacyAppId?: string;
    enableLegacyMode: boolean;
    codeChallengMethod: 'S256' | 'plain';
}

export interface OAuthConfigPayload extends OAuthConfig {
    configVersion: string;
    createdAt: number;
    encryptionKey: string;
}

/**
 * Token Types
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

export interface OAuthToken {
    accessToken: string;
    refreshToken: string | null;
    expiresIn: number;
    tokenType: string;
    scope: string;
}

export interface TokenMetadata {
    scope: string | null;
    expiresAt: number | null;
    timeUntilExpiry: number | null;
    isExpired: boolean;
    isExpiringSoon: boolean;
}

/**
 * PKCE Types
 */
export interface PKCEParameters {
    codeVerifier: string;
    codeChallenge: string;
    state: string;
}

export interface PKCEValidationResult {
    isValid: boolean;
    errors: string[];
}

/**
 * Session Types
 */
export interface SessionData {
    sessionId: string;
    loginId: string;
    accountList: Array<{
        loginid: string;
        token: string;
        currency: string;
    }>;
    activeAccount: string;
    createdAt: number;
    lastActivityAt: number;
    expiresAt: number;
}

export interface SessionMetadata {
    isValid: boolean;
    sessionAge: number | null;
    timeUntilExpiry: number | null;
    inactivityDuration: number | null;
}

/**
 * OAuth Flow Types
 */
export interface OAuthStartOptions {
    scope?: string;
    prompt?: 'login' | 'consent' | 'select_account';
    loginHint?: string;
    redirectUri?: string;
}

export interface OAuthCallbackParams {
    code: string;
    state: string;
    error?: string;
    error_description?: string;
}

export interface AuthStatus {
    isAuthenticated: boolean;
    hasValidToken: boolean;
    isTokenExpiringSoon: boolean;
    sessionValid: boolean;
    timeUntilTokenExpiry: number | null;
}

/**
 * Authentication State Types
 */
export interface AuthState {
    isAuthenticated: boolean;
    isLoading: boolean;
    isRefreshing: boolean;
    error: Error | null;
    token: string | null;
    session: SessionData | null;
    authStatus: AuthStatus;
}

export interface AuthActions {
    login: (options?: OAuthStartOptions) => Promise<void>;
    logout: () => Promise<void>;
    refreshToken: () => Promise<void>;
    getValidAccessToken: () => Promise<string>;
    recoverSession: () => Promise<void>;
}

/**
 * Callback Handler Types
 */
export interface OAuthCallbackState {
    isProcessing: boolean;
    error: Error | null;
    success: boolean;
}

/**
 * Configuration Types
 */
export interface EnvironmentConfig {
    frontend: Record<string, string>;
    backend: Record<string, string>;
    deployment: Record<string, string>;
}

export interface ConfigurationValidation {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Connection Status Types
 */
export interface ConnectionStatus {
    isConnected: boolean;
    isReconnecting: boolean;
    lastConnectedAt?: number;
    lastErrorAt?: number;
    lastError?: string;
}

/**
 * WebSocket Authentication Types
 */
export interface WebSocketAuthPayload {
    token: string;
    userId?: string;
    loginId?: string;
    sessionId?: string;
}

export interface WebSocketAuthError {
    code: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'MISSING_TOKEN' | 'AUTH_FAILED';
    message: string;
}

/**
 * API Response Types
 */
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
    };
    timestamp: number;
}

export interface TokenRefreshResponse extends TokenResponse {
    refresh_token: string;
}

export interface SessionValidationResponse {
    valid: boolean;
    user_id: string;
    login_id: string;
    expires_at: number;
    time_until_expiry: number;
    token_expiring_soon: boolean;
    scopes: string[];
}

export interface HealthCheckResponse {
    status: 'healthy' | 'degraded' | 'unhealthy';
    oauth_provider: 'connected' | 'error' | 'disconnected';
    database: 'connected' | 'error' | 'disconnected';
    cache: 'connected' | 'error' | 'disconnected';
    timestamp: number;
}

/**
 * Error Types
 */
export class OAuthError extends Error {
    constructor(
        public code: string,
        message: string,
        public details?: Record<string, any>
    ) {
        super(message);
        this.name = 'OAuthError';
    }
}

export class TokenExpiredError extends OAuthError {
    constructor(message = 'Token has expired') {
        super('TOKEN_EXPIRED', message);
        this.name = 'TokenExpiredError';
    }
}

export class InvalidStateError extends OAuthError {
    constructor(message = 'Invalid or expired state parameter') {
        super('INVALID_STATE', message);
        this.name = 'InvalidStateError';
    }
}

export class ConfigurationError extends OAuthError {
    constructor(message = 'OAuth configuration is invalid or incomplete') {
        super('CONFIGURATION_ERROR', message);
        this.name = 'ConfigurationError';
    }
}

export class SessionExpiredError extends OAuthError {
    constructor(message = 'Session has expired') {
        super('SESSION_EXPIRED', message);
        this.name = 'SessionExpiredError';
    }
}

/**
 * Analytics Event Types
 */
export type AuthEventType =
    | 'login_started'
    | 'login_completed'
    | 'login_failed'
    | 'logout_completed'
    | 'token_refreshed'
    | 'token_expired'
    | 'session_created'
    | 'session_expired'
    | 'session_recovered'
    | 'oauth_error';

export interface AuthEvent {
    type: AuthEventType;
    timestamp: number;
    duration?: number;
    error?: {
        code: string;
        message: string;
    };
    metadata?: Record<string, any>;
}

/**
 * Listener/Callback Types
 */
export type TokenRefreshListener = (token: TokenResponse) => void;
export type TokenExpiredListener = () => void;
export type SessionExpiredListener = () => void;
export type AuthEventListener = (event: AuthEvent) => void;

/**
 * Feature Flag Types
 */
export interface FeatureFlags {
    enableOAuthRefresh: boolean;
    enableSessionRecovery: boolean;
    enableLegacyMode: boolean;
    enableWebSocketAuth: boolean;
    enableRateLimiting: boolean;
    enableCSRFProtection: boolean;
    enableSecureCookies: boolean;
}

/**
 * Utility Types
 */
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;

export type AsyncFunction<T = any> = () => Promise<T>;
export type SyncFunction<T = any> = () => T;

export type Listener<T> = (data: T) => void;
export type Unsubscribe = () => void;

/**
 * Encryption Types
 */
export interface EncryptionOptions {
    algorithm: 'aes-256-cbc';
    encoding: 'hex';
}

export interface EncryptedData {
    iv: string;
    data: string;
}

/**
 * Rate Limiting Types
 */
export interface RateLimitInfo {
    limit: number;
    remaining: number;
    resetAt: number;
}

export interface RateLimitError extends OAuthError {
    rateLimitInfo: RateLimitInfo;
}

/**
 * Account Types
 */
export interface TradingAccount {
    loginid: string;
    token: string;
    currency: string;
    displayName?: string;
    balance?: number;
}

export interface AccountList {
    [loginid: string]: TradingAccount;
}

/**
 * Middleware Types
 */
export interface AuthMiddlewareContext {
    token: string | null;
    userId: string | null;
    sessionId: string | null;
    scopes: string[];
    isAuthenticated: boolean;
}

export type AuthMiddleware = (context: AuthMiddlewareContext, next: () => Promise<void>) => Promise<void>;

/**
 * Hook Return Types
 */
export interface UseOAuthReturn extends AuthState, AuthActions {}

export interface UseTokenStatusReturn extends TokenMetadata {}

export interface UseSessionStatusReturn extends SessionMetadata {}

export interface UseAuthGuardReturn {
    isAuthorized: boolean;
    isLoading: boolean;
}

export interface UseOAuthAPIReturn {
    fetchAuthenticated: (url: string, options?: RequestInit) => Promise<Response>;
}

// Export all types as namespace
export * from './auth-types-namespace';
