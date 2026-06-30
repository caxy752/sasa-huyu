import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';
import { Button } from '@deriv-com/ui';
import { localize } from '@deriv-com/translations';
import { validateCSRFToken, clearCSRFToken } from '@/components/shared';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { centralAccountStore } from '@/stores/CentralAccountStore';
import ChunkLoader from '@/components/loader/chunk-loader';

export const AuthCallbackPage = () => {
    const navigate = useNavigate();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [errorMessage, setErrorMessage] = useState<string>('');

    useEffect(() => {
        const handleCallback = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');
            const state = urlParams.get('state');
            const error = urlParams.get('error');
            const error_description = urlParams.get('error_description');

            console.log('[AuthCallback] Processing callback parameters:', {
                hasCode: !!code,
                state,
                error,
                error_description,
            });

            if (error) {
                console.error('[AuthCallback] OAuth error parameter present:', error, error_description);
                setStatus('error');
                setErrorMessage(error_description || error);
                return;
            }

            if (!state) {
                console.error('[AuthCallback] Missing state parameter in callback URL');
                setStatus('error');
                setErrorMessage(localize('Missing state parameter.'));
                return;
            }

            if (!validateCSRFToken(state)) {
                console.error('[AuthCallback] CSRF state validation failed');
                console.warn('[AuthCallback] State from URL:', state);
                console.warn('[AuthCallback] State in sessionStorage:', sessionStorage.getItem('oauth_csrf_token'));
                setStatus('error');
                setErrorMessage(localize('State validation failed. The authentication request may have expired.'));
                return;
            }

            // Clear CSRF state once validation succeeds
            clearCSRFToken();

            if (!code) {
                console.error('[AuthCallback] Missing authorization code in callback URL');
                setStatus('error');
                setErrorMessage(localize('Missing authorization code.'));
                return;
            }

            try {
                console.log('[AuthCallback] Exchanging authorization code for token...');
                const response = await OAuthTokenExchangeService.exchangeCodeForToken(code);

                if (response.access_token) {
                    console.log('[AuthCallback] Token exchange successful, initializing store...');
                    
                    // Set logged_state cookie
                    Cookies.set('logged_state', 'true', {
                        domain: window.location.hostname,
                        expires: 30,
                        path: '/',
                        secure: window.location.protocol === 'https:',
                    });

                    // Update central store
                    centralAccountStore.loadFromStorage();

                    setStatus('success');
                    
                    // Determine preferred account currency/currency query param
                    const preferredCurrency =
                        new URLSearchParams(window.location.search).get('account') ||
                        sessionStorage.getItem('query_param_currency') ||
                        '';
                    
                    const redirectUrl = preferredCurrency
                        ? `/?account=${preferredCurrency}`
                        : '/';

                    console.log('[AuthCallback] Redirecting to home:', redirectUrl);
                    
                    // Small timeout to ensure all storage updates settle
                    setTimeout(() => {
                        window.location.replace(window.location.origin + redirectUrl);
                    }, 150);
                } else {
                    console.error('[AuthCallback] Token exchange did not return access_token:', response);
                    setStatus('error');
                    setErrorMessage(response.error_description || response.error || localize('Failed to exchange authorization code.'));
                }
            } catch (err) {
                console.error('[AuthCallback] Exception during token exchange:', err);
                setStatus('error');
                setErrorMessage(err instanceof Error ? err.message : localize('An unexpected error occurred during authentication.'));
            }
        };

        handleCallback();
    }, [navigate]);

    if (status === 'loading') {
        return <ChunkLoader message={localize('Authenticating with Deriv...')} />;
    }

    if (status === 'error') {
        return (
            <div className='app-root' style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '20px', padding: '20px', textAlign: 'center' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#ff4444' }}>🚨 {localize('Authentication Failed')}</h1>
                <p style={{ maxWidth: '500px', fontSize: '16px', color: '#666' }}>{errorMessage}</p>
                <Button
                    onClick={() => {
                        window.location.replace(window.location.origin + '/');
                    }}
                >
                    {localize('Return to Bot')}
                </Button>
            </div>
        );
    }

    return <ChunkLoader message={localize('Redirecting...')} />;
};

export default AuthCallbackPage;
