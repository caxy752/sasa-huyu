import React, { useEffect, useState, useRef } from 'react';
import Cookies from 'js-cookie';
import { crypto_currencies_display_order, fiat_currencies_display_order } from '@/components/shared';
import { generateDerivApiInstance } from '@/external/bot-skeleton/services/api/appId';
import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import { clearAuthData } from '@/utils/auth-utils';
import { Callback } from '@deriv-com/auth-client';
import { Button } from '@deriv-com/ui';
import { PKCE_VERIFIER_KEY, PKCE_STATE_KEY } from '@/utils/pkce';
import { OAUTH_CLIENT_ID, OAUTH_TOKEN_URL, getCallbackURL } from '@/components/shared/utils/config/config';
import { handleNewCallback } from '@/auth/NewDerivAuth';

class CallbackErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false, error: '' }
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error: String(error) }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <h2 style={{ color: 'red' }}>Login Error</h2>
          <p>{this.state.error}</p>
          <a href="/">Go back and try again</a>
        </div>
      )
    }
    return this.props.children
  }
}

const getSelectedCurrency = (
    tokens: Record<string, string>,
    clientAccounts: Record<string, any>,
    state: any
): string => {
    console.log('[NEW AUTH] handleNewCallback called');
    const getQueryParams = new URLSearchParams(window.location.search);
    const currency =
        (state && state?.account) ||
        getQueryParams.get('account') ||
        sessionStorage.getItem('query_param_currency') ||
        '';
    const firstAccountKey = tokens.acct1;
    const firstAccountCurrency = clientAccounts[firstAccountKey]?.currency;

    const validCurrencies = [...fiat_currencies_display_order, ...crypto_currencies_display_order];
    if (tokens.acct1?.startsWith('VR') || currency === 'demo') return 'demo';
    if (currency && validCurrencies.includes(currency.toUpperCase())) return currency;
    return firstAccountCurrency || 'USD';
};

/* ─────────────────────────────────────────────────────────
   NEW SYSTEM CALLBACK — handles new Deriv OAuth2 redirects
   (/callback?code=... with NEW_AUTH_active flag set)
   ───────────────────────────────────────────────────────── */
const NewSystemCallbackHandler = () => {
    const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
    const [errorMsg, setErrorMsg] = useState('');
    const attempted = useRef(false);

    useEffect(() => {
        console.log('[NEW AUTH] NewSystemCallbackHandler mounted')
        console.log('[NEW AUTH] URL:', window.location.search)
        if (attempted.current) return;
        attempted.current = true;

        const run = async () => {
            try {
                const token = await handleNewCallback();
                if (token) {
                    setStatus('success');
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    window.location.href = '/';
                }
            } catch (err: any) {
                console.error("[CALLBACK] Error:", err.message);
                setErrorMsg(err.message);
                setStatus('error');
            }
        };

        run();
    }, []);

    if (status === 'error') {
        return (
            <div style={{ padding: '40px', textAlign: 'center', maxWidth: '520px', margin: '0 auto' }}>
                <h2 style={{ color: '#e74c3c', marginBottom: '16px' }}>Login failed</h2>
                <p style={{
                    color: '#ccc', margin: '16px 0', whiteSpace: 'pre-wrap',
                    textAlign: 'left', background: '#1a1a1a', padding: '12px',
                    borderRadius: '8px', fontSize: '13px',
                }}>
                    {errorMsg}
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px' }}>
                    <Button onClick={() => { window.location.reload(); }}>Retry</Button>
                    <Button onClick={() => { window.location.href = '/'; }}>Return to App</Button>
                </div>
            </div>
        );
    }

    if (status === 'success') {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <p style={{ color: '#10b981' }}>Login successful! Redirecting…</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
            <p>Completing login, please wait…</p>
        </div>
    );
};

/* ─────────────────────────────────────────────────────────
   PKCE callback — handles ?code=... redirects from Deriv.
   Exchanges code + verifier directly with auth.deriv.com
   (frontend PKCE — no backend needed), saves access_token
   to sessionStorage, then redirects home.
───────────────────────────────────────────────────────── */
const PkceCallbackHandler = () => {
    const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        // Guard flag — prevents double-execution on StrictMode re-renders
        let tokenExchangeStarted = false;

        const run = async () => {
            if (tokenExchangeStarted) return;
            tokenExchangeStarted = true;

            // Surface any error Deriv sent back in the redirect
            const params = new URLSearchParams(window.location.search);
            const derivError = params.get('error');
            if (derivError) {
                const desc = params.get('error_description') ?? derivError;
                setErrorMsg(`Deriv error: ${desc}. Please go back and try again.`);
                setStatus('error');
                return;
            }

            // Step 3 — parse code + state
            const code          = params.get('code');
            const returnedState = params.get('state');
            if (!code || !returnedState) {
                setErrorMsg('Login failed: Deriv did not return a valid response. Please go back and try again.');
                setStatus('error');
                return;
            }

            // Step 4 — CSRF / state check (sessionStorage is tab-specific)
            const savedState = sessionStorage.getItem(PKCE_STATE_KEY);
            if (!savedState) {
                setErrorMsg(
                    'Your session expired or the page was refreshed during login. ' +
                    'Please go back and try again.'
                );
                setStatus('error');
                return;
            }
            if (savedState !== returnedState) {
                setErrorMsg('Security check failed. Please go back and try again.');
                setStatus('error');
                return;
            }
            sessionStorage.removeItem(PKCE_STATE_KEY);

            // Step 5 — retrieve code_verifier
            const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
            if (!codeVerifier) {
                setErrorMsg(
                    'Login session data is missing. This happens if you opened the login in a new ' +
                    'tab, or if your browser blocks sessionStorage. Please go back and try again in the same tab.'
                );
                setStatus('error');
                return;
            }

            // Step 6 — exchange code for access_token directly with Deriv (PKCE public client)
            const redirectUri = getCallbackURL();
            let response: Response;
            try {
                response = await fetch(OAUTH_TOKEN_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type:    'authorization_code',
                        code,
                        redirect_uri:  redirectUri,
                        client_id:     OAUTH_CLIENT_ID,
                        code_verifier: codeVerifier,
                    }).toString(),
                });
            } catch (netErr: any) {
                setErrorMsg('Network error during login. Please check your connection and try again.');
                setStatus('error');
                return;
            }

            // Step 7 — handle token response
            if (!response.ok) {
                let errData: any = {};
                try { errData = await response.json(); } catch {}
                const desc = errData.error_description || errData.error || `HTTP ${response.status}`;
                setErrorMsg(`Login failed: ${desc}`);
                setStatus('error');
                return;
            }

            const data = await response.json() as { access_token: string; expires_in: number };

            // Save access_token + expiry (tab-scoped; each tab manages its own session)
            sessionStorage.setItem('deriv_access_token', data.access_token);
            sessionStorage.setItem('deriv_token_expiry', String(Date.now() + data.expires_in * 1000));
            sessionStorage.removeItem(PKCE_VERIFIER_KEY);

            Cookies.set('logged_state', 'true', {
                domain:  window.location.hostname,
                expires: 30,
                path:    '/',
                secure:  window.location.protocol === 'https:',
            });

            setStatus('success');
            await new Promise(resolve => setTimeout(resolve, 1500));
            window.location.href = '/';
        };

        run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (status === 'error') {
        return (
            <div style={{ padding: '40px', textAlign: 'center', maxWidth: '520px', margin: '0 auto' }}>
                <h2 style={{ color: '#e74c3c', marginBottom: '16px' }}>Login failed</h2>
                <p style={{
                    color: '#ccc', margin: '16px 0', whiteSpace: 'pre-wrap',
                    textAlign: 'left', background: '#1a1a1a', padding: '12px',
                    borderRadius: '8px', fontSize: '13px',
                }}>
                    {errorMsg}
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px' }}>
                    <Button onClick={() => { window.location.reload(); }}>Retry</Button>
                    <Button onClick={() => { window.location.href = '/'; }}>Return to App</Button>
                </div>
            </div>
        );
    }

    if (status === 'success') {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <p style={{ color: '#10b981' }}>Login successful! Redirecting…</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
            <p>Completing login, please wait…</p>
        </div>
    );
};

/* ─────────────────────────────────────────────────────────
    Legacy callback — handles existing Deriv OAuth redirects.
───────────────────────────────────────────────────────── */
const CallbackPage = () => {
    const urlParams = new URLSearchParams(window.location.search)
    const hasCode = urlParams.has('code')
    const hasOldTokens = urlParams.has('token1') || urlParams.has('acct1')
    
    if (hasCode && !hasOldTokens) {
      return <NewSystemCallbackHandler />
    }

    // OLD SYSTEM: check for legacy PKCE flow (acct1/token1 params)
    const isPkceFlow = hasCode || urlParams.has('error');

    if (isPkceFlow) {
        return <PkceCallbackHandler />;
    }

    // LEGACY: use old Deriv auth-client Callback component
    return (
        <CallbackErrorBoundary>
            <Callback
                onSignInSuccess={async (tokens: Record<string, string>, rawState: unknown) => {
                    const state = rawState as { account?: string } | null;
                    const accountsList: Record<string, string> = {};
                    const clientAccounts: Record<string, { loginid: string; token: string; currency: string }> = {};

                    for (const [key, value] of Object.entries(tokens)) {
                        if (key.startsWith('acct')) {
                            const tokenKey = key.replace('acct', 'token');
                            if (tokens[tokenKey]) {
                                accountsList[value] = tokens[tokenKey];
                                clientAccounts[value] = {
                                    loginid: value,
                                    token: tokens[tokenKey],
                                    currency: '',
                                };
                            }
                        } else if (key.startsWith('cur')) {
                            const accKey = key.replace('cur', 'acct');
                            if (tokens[accKey]) {
                                clientAccounts[tokens[accKey]].currency = value;
                            }
                        }
                    }

                    localStorage.setItem('accountsList', JSON.stringify(accountsList));
                    localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));

                    let is_token_set = false;
                    const api = await generateDerivApiInstance();
                    if (api) {
                        // Timeout to prevent hanging on slow WS connection
                        const authorizeResult = await Promise.race([
                            api.authorize(tokens.token1),
                            new Promise<never>((_, reject) =>
                                setTimeout(() => reject(new Error('authorize timeout')), 30000)
                            ),
                        ]).catch(e => ({ authorize: null, error: { code: 'Timeout', message: e.message } }));
                        const { authorize, error } = authorizeResult as any;
                        api.disconnect();
                        if (error) {
                            if (error.code === 'InvalidToken') {
                                is_token_set = true;
                                const is_tmb_enabled = window.is_tmb_enabled === true;
                                if (Cookies.get('logged_state') === 'true' && !is_tmb_enabled) {
                                    globalObserver.emit('InvalidToken', { error });
                                }
                                if (Cookies.get('logged_state') === 'false') {
                                    clearAuthData();
                                }
                            }
                        } else {
                            localStorage.setItem('callback_token', authorize.toString());
                            const clientAccountsArray = Object.values(clientAccounts);
                            const firstId = authorize?.account_list[0]?.loginid;
                            const filteredTokens = clientAccountsArray.filter(account => account.loginid === firstId);
                            if (filteredTokens.length) {
                                localStorage.setItem('authToken', filteredTokens[0].token);
                                localStorage.setItem('active_loginid', filteredTokens[0].loginid);
                                is_token_set = true;
                            }
                        }
                    }
                    if (!is_token_set) {
                        localStorage.setItem('authToken', tokens.token1);
                        localStorage.setItem('active_loginid', tokens.acct1);
                    }

                    Cookies.set('logged_state', 'true', {
                        domain: window.location.hostname,
                        expires: 30,
                        path: '/',
                        secure: window.location.protocol === 'https:',
                    });

                    const selected_currency = getSelectedCurrency(tokens, clientAccounts, state);
                    await new Promise(resolve => setTimeout(resolve, 100));
                    window.location.replace(window.location.origin + `/?account=${selected_currency}`);
                }}
                renderReturnButton={() => {
                    return (
                        <Button
                            className='callback-return-button'
                            onClick={() => { window.location.href = '/'; }}
                        >
                            {'Return to Bot'}
                        </Button>
                    );
                }}
            />
        </CallbackErrorBoundary>
    );
};

export default CallbackPage;