/**
 * Authentication Status Components
 * Real-time OAuth token and session status monitoring
 */

import React, { useEffect, useState } from 'react';
import { Clock, AlertCircle, CheckCircle, RefreshCw, LogOut } from 'lucide-react';
import TokenManager from '@/services/auth/TokenManager';
import SessionManager from '@/services/auth/SessionManager';
import OAuthFlowService from '@/services/auth/OAuthFlowService';

/**
 * Token Status Indicator - Shows token expiry status
 */
export const TokenStatusIndicator: React.FC<{
    showLabel?: boolean;
    compact?: boolean;
}> = ({ showLabel = true, compact = false }) => {
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

        updateStatus();

        // Update every 30 seconds
        const interval = setInterval(updateStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    const formatTimeRemaining = (ms: number): string => {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    };

    if (status.isExpired) {
        return (
            <div className={`flex items-center gap-2 ${compact ? 'text-xs' : ''}`}>
                <AlertCircle className={`${compact ? 'h-3 w-3' : 'h-4 w-4'} text-red-600`} />
                {showLabel && <span className='text-red-600 font-medium'>Token Expired</span>}
            </div>
        );
    }

    if (status.isExpiringSoon && status.timeUntilExpiry) {
        return (
            <div className={`flex items-center gap-2 ${compact ? 'text-xs' : ''}`}>
                <Clock className={`${compact ? 'h-3 w-3' : 'h-4 w-4'} text-yellow-600`} />
                {showLabel && (
                    <span className='text-yellow-600 font-medium'>
                        Expires in {formatTimeRemaining(status.timeUntilExpiry)}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className={`flex items-center gap-2 ${compact ? 'text-xs' : ''}`}>
            <CheckCircle className={`${compact ? 'h-3 w-3' : 'h-4 w-4'} text-green-600`} />
            {showLabel && <span className='text-green-600 font-medium'>Token Valid</span>}
        </div>
    );
};

/**
 * Session Status Badge - Displays current session status
 */
export const SessionStatusBadge: React.FC<{
    variant?: 'compact' | 'full';
}> = ({ variant = 'full' }) => {
    const [sessionMetadata, setSessionMetadata] = useState<any>(null);

    useEffect(() => {
        const updateMetadata = () => {
            const metadata = SessionManager.getSessionMetadata();
            setSessionMetadata(metadata);
        };

        updateMetadata();

        // Update every minute
        const interval = setInterval(updateMetadata, 60000);
        return () => clearInterval(interval);
    }, []);

    if (!sessionMetadata) {
        return null;
    }

    if (variant === 'compact') {
        return (
            <div className='inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800'>
                <div className='h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse' />
                Active Session
            </div>
        );
    }

    const formatDuration = (ms: number): string => {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    };

    return (
        <div className='p-3 bg-blue-50 border border-blue-200 rounded-lg'>
            <p className='text-sm font-medium text-blue-900'>Session Status</p>
            <div className='mt-2 space-y-1 text-xs text-blue-800'>
                <p>Status: {sessionMetadata.isValid ? '✓ Valid' : '✗ Expired'}</p>
                {sessionMetadata.timeUntilExpiry && (
                    <p>Expires in: {formatDuration(sessionMetadata.timeUntilExpiry)}</p>
                )}
                {sessionMetadata.inactivityDuration && (
                    <p>Inactive for: {formatDuration(sessionMetadata.inactivityDuration)}</p>
                )}
            </div>
        </div>
    );
};

/**
 * OAuth State Monitor - Displays OAuth flow status
 */
export const OAuthStateMonitor: React.FC = () => {
    const [authStatus, setAuthStatus] = useState<any>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => {
        const updateStatus = () => {
            const status = OAuthFlowService.getAuthStatus();
            setAuthStatus(status);
        };

        updateStatus();

        // Update every minute
        const interval = setInterval(updateStatus, 60000);
        return () => clearInterval(interval);
    }, []);

    const handleRefreshToken = async () => {
        try {
            setIsRefreshing(true);
            await OAuthFlowService.refreshAccessToken();

            // Update status
            const status = OAuthFlowService.getAuthStatus();
            setAuthStatus(status);
        } catch (error) {
            console.error('Token refresh failed:', error);
        } finally {
            setIsRefreshing(false);
        }
    };

    if (!authStatus) {
        return null;
    }

    return (
        <div className='space-y-2'>
            <div className='flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200'>
                <div className='flex items-center gap-2'>
                    <div
                        className={`h-2 w-2 rounded-full ${authStatus.isAuthenticated ? 'bg-green-500' : 'bg-red-500'}`}
                    />
                    <span className='text-sm font-medium'>
                        {authStatus.isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
                    </span>
                </div>
                {authStatus.isAuthenticated && authStatus.isTokenExpiringSoon && (
                    <button
                        onClick={handleRefreshToken}
                        disabled={isRefreshing}
                        className='inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50'
                    >
                        {isRefreshing ? (
                            <RefreshCw className='h-3 w-3 animate-spin' />
                        ) : (
                            <RefreshCw className='h-3 w-3' />
                        )}
                        Refresh
                    </button>
                )}
            </div>

            {authStatus.hasValidToken && (
                <div className='flex items-center justify-between p-2 bg-blue-50 rounded text-xs'>
                    <span className='text-blue-800'>
                        {authStatus.isTokenExpiringSoon
                            ? `Token expires in ${Math.round((authStatus.timeUntilTokenExpiry || 0) / 60000)}m`
                            : 'Token is valid'}
                    </span>
                    {authStatus.isTokenExpiringSoon && <AlertCircle className='h-3 w-3 text-blue-600' />}
                </div>
            )}
        </div>
    );
};

/**
 * Connection Status Display - Shows WebSocket/API connection status
 */
export const ConnectionStatusDisplay: React.FC<{
    isConnected: boolean;
    isReconnecting?: boolean;
}> = ({ isConnected, isReconnecting = false }) => {
    return (
        <div className='flex items-center gap-2'>
            <div
                className={`h-2 w-2 rounded-full ${
                    isConnected ? 'bg-green-500' : isReconnecting ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
                }`}
            />
            <span className='text-xs font-medium text-gray-600'>
                {isConnected ? 'Connected' : isReconnecting ? 'Reconnecting...' : 'Disconnected'}
            </span>
        </div>
    );
};

/**
 * Session Recovery UI - Offers session recovery options
 */
export const SessionRecoveryUI: React.FC<{
    onRecover: () => Promise<void>;
    onLogout: () => Promise<void>;
}> = ({ onRecover, onLogout }) => {
    const [isRecovering, setIsRecovering] = useState(false);
    const [error, setError] = useState<string>('');

    const handleRecover = async () => {
        try {
            setIsRecovering(true);
            setError('');
            await onRecover();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Recovery failed');
        } finally {
            setIsRecovering(false);
        }
    };

    const handleLogout = async () => {
        try {
            setIsRecovering(true);
            await onLogout();
        } catch (err) {
            console.error('Logout failed:', err);
        }
    };

    return (
        <div className='p-4 bg-yellow-50 border border-yellow-200 rounded-lg space-y-3'>
            <div className='flex items-start gap-3'>
                <AlertCircle className='h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5' />
                <div>
                    <h3 className='font-medium text-yellow-900'>Session Expired</h3>
                    <p className='text-sm text-yellow-800 mt-1'>
                        Your session has expired. Would you like to recover it or log in again?
                    </p>
                </div>
            </div>

            {error && <p className='text-sm text-red-600 bg-red-50 p-2 rounded'>{error}</p>}

            <div className='flex gap-2'>
                <button
                    onClick={handleRecover}
                    disabled={isRecovering}
                    className='flex-1 px-3 py-2 bg-yellow-600 text-white text-sm font-medium rounded hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed'
                >
                    Recover Session
                </button>
                <button
                    onClick={handleLogout}
                    disabled={isRecovering}
                    className='flex-1 px-3 py-2 bg-gray-600 text-white text-sm font-medium rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
                >
                    <LogOut className='h-4 w-4' />
                    Log Out
                </button>
            </div>
        </div>
    );
};

/**
 * Auth Status Dashboard - Complete authentication status overview
 */
export const AuthStatusDashboard: React.FC<{
    compact?: boolean;
}> = ({ compact = false }) => {
    const [tokenMetadata, setTokenMetadata] = useState<any>(null);

    useEffect(() => {
        const updateMetadata = () => {
            setTokenMetadata(TokenManager.getTokenMetadata());
        };

        updateMetadata();

        // Update every 30 seconds
        const interval = setInterval(updateMetadata, 30000);
        return () => clearInterval(interval);
    }, []);

    if (compact) {
        return (
            <div className='flex items-center gap-2'>
                <TokenStatusIndicator compact={true} showLabel={true} />
            </div>
        );
    }

    return (
        <div className='space-y-4 p-4 bg-white rounded-lg border border-gray-200'>
            <h3 className='font-semibold text-gray-900'>Authentication Status</h3>

            <div className='space-y-3'>
                {/* Token Status */}
                <div className='flex items-center justify-between p-2 bg-gray-50 rounded'>
                    <span className='text-sm font-medium text-gray-600'>Token Status</span>
                    <TokenStatusIndicator showLabel={true} />
                </div>

                {/* Session Status */}
                <div className='flex items-center justify-between p-2 bg-gray-50 rounded'>
                    <span className='text-sm font-medium text-gray-600'>Session Status</span>
                    <SessionStatusBadge variant='compact' />
                </div>

                {/* Token Metadata */}
                {tokenMetadata && (
                    <div className='p-2 bg-blue-50 rounded text-xs space-y-1 text-blue-800'>
                        <p>Scope: {tokenMetadata.scope || 'N/A'}</p>
                        <p>
                            Expires in:{' '}
                            {tokenMetadata.timeUntilExpiry
                                ? `${Math.round(tokenMetadata.timeUntilExpiry / 60000)}m`
                                : 'N/A'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default {
    TokenStatusIndicator,
    SessionStatusBadge,
    OAuthStateMonitor,
    ConnectionStatusDisplay,
    SessionRecoveryUI,
    AuthStatusDashboard,
};
