/**
 * OAuth2 Error Handling Utility
 * Standardized error handling for OAuth2 PKCE flow
 * Handles all error scenarios with proper recovery strategies
 */

export interface OAuthError {
    error: string;
    error_description: string;
    error_uri?: string;
    error_code?: number;
    recoverable: boolean;
    action?: string;
}

/**
 * OAuth2 Standard Errors
 * Reference: https://tools.ietf.org/html/rfc6749#section-4.1.2.1
 */
export const OAUTH_ERRORS = {
    INVALID_REQUEST: {
        error: 'invalid_request',
        description: 'The request is missing required parameters or is malformed',
        recoverable: false,
        action: 'contact_support',
    },
    UNAUTHORIZED_CLIENT: {
        error: 'unauthorized_client',
        description: 'The client is not authorized to use this authorization method',
        recoverable: false,
        action: 'contact_support',
    },
    ACCESS_DENIED: {
        error: 'access_denied',
        description: 'The user denied access',
        recoverable: true,
        action: 'retry_login',
    },
    UNSUPPORTED_RESPONSE_TYPE: {
        error: 'unsupported_response_type',
        description: 'The authorization server does not support the response type',
        recoverable: false,
        action: 'contact_support',
    },
    INVALID_SCOPE: {
        error: 'invalid_scope',
        description: 'The requested scope is invalid or exceeds the granted scope',
        recoverable: true,
        action: 'check_configuration',
    },
    SERVER_ERROR: {
        error: 'server_error',
        description: 'The authorization server encountered an error',
        recoverable: true,
        action: 'retry_login',
    },
    TEMPORARILY_UNAVAILABLE: {
        error: 'temporarily_unavailable',
        description: 'The authorization server is temporarily unavailable',
        recoverable: true,
        action: 'retry_login',
    },
    INVALID_GRANT: {
        error: 'invalid_grant',
        description: 'The authorization code is invalid, expired, or already used',
        recoverable: true,
        action: 'retry_login',
    },
    INVALID_CLIENT: {
        error: 'invalid_client',
        description: 'Client authentication failed',
        recoverable: false,
        action: 'contact_support',
    },
    UNSUPPORTED_GRANT_TYPE: {
        error: 'unsupported_grant_type',
        description: 'The authorization server does not support this grant type',
        recoverable: false,
        action: 'contact_support',
    },
    REDIRECT_URI_MISMATCH: {
        error: 'redirect_uri_mismatch',
        description: 'The redirect_uri does not match the registered value',
        recoverable: false,
        action: 'contact_support',
    },
    STATE_MISMATCH: {
        error: 'state_mismatch',
        description: 'The state parameter does not match (CSRF attack detected)',
        recoverable: true,
        action: 'retry_login',
    },
    TOKEN_EXPIRED: {
        error: 'token_expired',
        description: 'The access token has expired',
        recoverable: true,
        action: 'refresh_token',
    },
    REFRESH_TOKEN_EXPIRED: {
        error: 'refresh_token_expired',
        description: 'The refresh token has expired',
        recoverable: true,
        action: 'retry_login',
    },
};

/**
 * Parse OAuth error from various sources
 */
export function parseOAuthError(
    error: any,
    defaultAction: string = 'retry_login'
): OAuthError {
    // Handle error object
    if (typeof error === 'object' && error !== null) {
        const errorKey = error.error?.toUpperCase().replace(/-/g, '_') || error.code?.toUpperCase();
        const knownError = errorKey ? OAUTH_ERRORS[errorKey as keyof typeof OAUTH_ERRORS] : null;

        if (knownError) {
            return {
                error: error.error,
                error_description: error.error_description || knownError.description,
                error_uri: error.error_uri,
                error_code: error.code,
                recoverable: knownError.recoverable,
                action: knownError.action || defaultAction,
            };
        }

        return {
            error: error.error || 'unknown_error',
            error_description: error.error_description || error.message || 'An unknown error occurred',
            recoverable: false,
            action: defaultAction,
        };
    }

    // Handle string error
    if (typeof error === 'string') {
        const errorKey = error.toUpperCase().replace(/-/g, '_');
        const knownError = OAUTH_ERRORS[errorKey as keyof typeof OAUTH_ERRORS];

        if (knownError) {
            return {
                error: error,
                error_description: knownError.description,
                recoverable: knownError.recoverable,
                action: knownError.action || defaultAction,
            };
        }

        return {
            error: 'unknown_error',
            error_description: error,
            recoverable: false,
            action: defaultAction,
        };
    }

    // Fallback
    return {
        error: 'unknown_error',
        error_description: 'An unexpected error occurred',
        recoverable: false,
        action: defaultAction,
    };
}

/**
 * Handle OAuth error and return recommended action
 */
export function handleOAuthError(error: any, context: string = 'oauth'): OAuthError {
    const oauthError = parseOAuthError(error);
    console.error(`[OAuth ${context}] ${oauthError.error}:`, oauthError.error_description);
    return oauthError;
}

/**
 * Check if error is recoverable
 */
export function isRecoverableError(error: any): boolean {
    const oauthError = parseOAuthError(error);
    return oauthError.recoverable;
}

/**
 * Get user-friendly error message
 */
export function getOAuthErrorMessage(error: any): string {
    const oauthError = parseOAuthError(error);

    switch (oauthError.error) {
        case 'access_denied':
            return 'You denied access. Please try again to authorize.';
        case 'invalid_grant':
            return 'Your login session expired. Please login again.';
        case 'redirect_uri_mismatch':
            return 'Configuration error. Please contact support.';
        case 'state_mismatch':
            return 'Security validation failed. Please try again.';
        case 'invalid_scope':
            return 'Invalid permissions requested. Please contact support.';
        case 'server_error':
        case 'temporarily_unavailable':
            return 'Deriv server error. Please try again later.';
        default:
            return oauthError.error_description || 'Authentication failed. Please try again.';
    }
}

/**
 * Validate OAuth response parameters
 */
export function validateOAuthResponse(params: Record<string, string>): {
    valid: boolean;
    error?: OAuthError;
} {
    // Check for error
    if (params.error) {
        return {
            valid: false,
            error: parseOAuthError({
                error: params.error,
                error_description: params.error_description,
            }),
        };
    }

    // Check required parameters
    if (!params.code || !params.state) {
        return {
            valid: false,
            error: parseOAuthError({
                error: 'invalid_response',
                error_description: 'Missing code or state parameter',
            }),
        };
    }

    return { valid: true };
}

/**
 * Validate PKCE parameters
 */
export function validatePKCEParameters(verifier: string, challenge: string): {
    valid: boolean;
    error?: string;
} {
    if (!verifier || !challenge) {
        return {
            valid: false,
            error: 'Missing PKCE parameters',
        };
    }

    if (verifier.length < 43 || verifier.length > 128) {
        return {
            valid: false,
            error: 'Code verifier must be between 43 and 128 characters',
        };
    }

    // Note: Full validation would require recomputing SHA256(verifier) and comparing to challenge
    // This is done on the server side for security

    return { valid: true };
}
