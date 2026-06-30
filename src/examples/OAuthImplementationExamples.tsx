/**
 * Complete OAuth Implementation Example
 * Shows how to integrate all auth services into a trading platform
 */

import React, { useEffect } from 'react';
import { useOAuth, useOAuthCallback, useTokenStatus, useSessionStatus } from '@/hooks/useOAuth';
import { OAuthOnboardingWizard } from '@/components/auth/OAuthOnboardingWizard';
import {
    TokenStatusIndicator,
    SessionStatusBadge,
    OAuthStateMonitor,
    SessionRecoveryUI,
    AuthStatusDashboard,
} from '@/components/auth/AuthStatusComponents';

/**
 * Example 1: Login Page
 */
export function LoginPage() {
    const { login, isLoading, error } = useOAuth();

    const handleLogin = async () => {
        try {
            await login({ prompt: 'login' });
        } catch (err) {
            console.error('Login failed:', err);
        }
    };

    return (
        <div className='min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-800'>
            <div className='bg-white rounded-lg shadow-xl p-8 w-full max-w-md'>
                <h1 className='text-3xl font-bold text-gray-900 mb-6'>Trading Platform</h1>

                {error && (
                    <div className='mb-4 p-4 bg-red-50 border border-red-200 rounded-lg'>
                        <p className='text-sm text-red-800'>{error.message}</p>
                    </div>
                )}

                <button
                    onClick={handleLogin}
                    disabled={isLoading}
                    className='w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
                >
                    {isLoading ? 'Signing in...' : 'Sign In with OAuth'}
                </button>

                <p className='text-xs text-gray-500 text-center mt-4'>Secure login powered by OAuth 2.0 with PKCE</p>
            </div>
        </div>
    );
}

/**
 * Example 2: OAuth Callback Handler
 */
export function OAuthCallbackPage() {
    const { isProcessing, error, success } = useOAuthCallback();

    if (isProcessing) {
        return (
            <div className='min-h-screen flex items-center justify-center bg-gray-50'>
                <div className='text-center'>
                    <div className='w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4' />
                    <h2 className='text-lg font-semibold text-gray-900'>Completing sign in...</h2>
                    <p className='text-sm text-gray-600 mt-2'>Please wait while we process your authentication</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className='min-h-screen flex items-center justify-center bg-gray-50'>
                <div className='text-center'>
                    <h2 className='text-lg font-semibold text-red-900 mb-4'>Sign In Failed</h2>
                    <p className='text-sm text-red-600 mb-6'>{error.message}</p>
                    <a href='/login' className='text-blue-600 hover:text-blue-700 font-medium'>
                        Try again
                    </a>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className='min-h-screen flex items-center justify-center bg-gray-50'>
                <div className='text-center'>
                    <div className='w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4'>
                        <svg className='w-6 h-6 text-green-600' fill='currentColor' viewBox='0 0 20 20'>
                            <path
                                fillRule='evenodd'
                                d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                                clipRule='evenodd'
                            />
                        </svg>
                    </div>
                    <h2 className='text-lg font-semibold text-gray-900'>Sign In Successful</h2>
                    <p className='text-sm text-gray-600 mt-2'>Redirecting to dashboard...</p>
                </div>
            </div>
        );
    }

    return null;
}

/**
 * Example 3: Trading Dashboard with Auth Status
 */
export function TradingDashboard() {
    const { isAuthenticated, isLoading, logout, token } = useOAuth();
    const tokenStatus = useTokenStatus();
    const sessionStatus = useSessionStatus();

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            window.location.href = '/login';
        }
    }, [isAuthenticated, isLoading]);

    if (isLoading) {
        return <div>Loading...</div>;
    }

    if (!isAuthenticated) {
        return null;
    }

    return (
        <div className='min-h-screen bg-gray-100'>
            {/* Header */}
            <header className='bg-white shadow'>
                <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center'>
                    <h1 className='text-2xl font-bold text-gray-900'>Trading Dashboard</h1>

                    <div className='flex items-center gap-4'>
                        <TokenStatusIndicator compact={true} />

                        <button
                            onClick={logout}
                            className='px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700'
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
                <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                    {/* Authentication Status Panel */}
                    <div className='md:col-span-1'>
                        <div className='bg-white rounded-lg shadow p-6 space-y-4'>
                            <h2 className='text-lg font-semibold'>Authentication</h2>

                            <div className='space-y-3'>
                                {/* Token Status */}
                                <div className='p-3 bg-gray-50 rounded'>
                                    <p className='text-xs font-medium text-gray-600'>Token Status</p>
                                    <div className='mt-2'>
                                        <TokenStatusIndicator showLabel={true} />
                                    </div>
                                </div>

                                {/* Session Status */}
                                <div className='p-3 bg-gray-50 rounded'>
                                    <p className='text-xs font-medium text-gray-600'>Session</p>
                                    <div className='mt-2'>
                                        <SessionStatusBadge variant='full' />
                                    </div>
                                </div>

                                {/* Token Details */}
                                {tokenStatus && (
                                    <div className='p-3 bg-blue-50 rounded'>
                                        <p className='text-xs font-medium text-blue-900'>Token Details</p>
                                        <div className='mt-2 space-y-1 text-xs text-blue-800'>
                                            <p>
                                                Expires in:{' '}
                                                {tokenStatus.timeUntilExpiry
                                                    ? `${Math.round(tokenStatus.timeUntilExpiry / 60000)}m`
                                                    : 'N/A'}
                                            </p>
                                            <p>Expiring soon: {tokenStatus.isExpiringSoon ? 'Yes' : 'No'}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Trading Content */}
                    <div className='md:col-span-2'>
                        <div className='bg-white rounded-lg shadow p-6'>
                            <h2 className='text-lg font-semibold mb-4'>Markets</h2>
                            <p className='text-gray-600'>Welcome! You are authenticated with OAuth 2.0 PKCE.</p>

                            {/* Sample market data would go here */}
                            <div className='mt-6 space-y-4'>
                                {[1, 2, 3].map(i => (
                                    <div key={i} className='p-4 border border-gray-200 rounded-lg hover:bg-gray-50'>
                                        <div className='flex justify-between items-center'>
                                            <div>
                                                <p className='font-semibold'>Market {i}</p>
                                                <p className='text-sm text-gray-600'>Trading pair example</p>
                                            </div>
                                            <div className='text-right'>
                                                <p className='font-semibold'>$1,234.56</p>
                                                <p className='text-sm text-green-600'>+2.5%</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* OAuth Status Monitor */}
                <div className='mt-8'>
                    <div className='bg-white rounded-lg shadow p-6'>
                        <h2 className='text-lg font-semibold mb-4'>Real-time Status</h2>
                        <OAuthStateMonitor />
                    </div>
                </div>
            </main>
        </div>
    );
}

/**
 * Example 4: Admin Onboarding Wizard Page
 */
export function AdminOnboardingPage() {
    const handleComplete = async () => {
        console.log('OAuth configuration completed');
        // Redirect to dashboard or show success message
    };

    return (
        <div className='min-h-screen bg-gray-50 py-12 px-4'>
            <OAuthOnboardingWizard onComplete={handleComplete} />
        </div>
    );
}

/**
 * Example 5: Session Recovery Dialog
 */
export function SessionRecoveryDialog() {
    const { recoverSession, logout } = useOAuth();
    const [isOpen, setIsOpen] = React.useState(true);

    if (!isOpen) return null;

    return (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
            <div className='bg-white rounded-lg shadow-xl p-6 w-full max-w-md'>
                <SessionRecoveryUI
                    onRecover={async () => {
                        await recoverSession();
                        setIsOpen(false);
                    }}
                    onLogout={async () => {
                        await logout();
                        window.location.href = '/login';
                    }}
                />
            </div>
        </div>
    );
}

/**
 * Example 6: Protected Route Component
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useOAuth();

    if (isLoading) {
        return <div className='flex items-center justify-center h-screen'>Loading...</div>;
    }

    if (!isAuthenticated) {
        return <LoginPage />;
    }

    return <>{children}</>;
}

/**
 * Example 7: App Root with Routes
 */
export function AppRoot() {
    return (
        <div>
            {/* Route definitions would go here */}
            {/* Typically managed by React Router */}

            {/*
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
                <Route path="/admin/onboard" element={<AdminOnboardingPage />} />
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute>
                            <TradingDashboard />
                        </ProtectedRoute>
                    }
                />
            </Routes>
            */}
        </div>
    );
}

export default {
    LoginPage,
    OAuthCallbackPage,
    TradingDashboard,
    AdminOnboardingPage,
    SessionRecoveryDialog,
    ProtectedRoute,
    AppRoot,
};
