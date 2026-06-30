import React, { useEffect, useState } from 'react';
import { handleNewCallback, createNewWebSocket } from '@/auth/NewDerivAuth';

const CallbackPage = () => {
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('Authenticating with Deriv...');
    const [errorDetail, setErrorDetail] = useState('');

    useEffect(() => {
        const run = async () => {
            try {
                // Step 1: Exchange the code for an access token (PKCE)
                setMessage('Exchanging authorization code...');
                const token = await handleNewCallback();

                if (!token) {
                    // Already handled (duplicate call guard)
                    setStatus('success');
                    setMessage('Redirecting...');
                    setTimeout(() => window.location.replace('/'), 300);
                    return;
                }

                // Step 2: Use the token to open the authenticated WebSocket
                setMessage('Connecting to trading server...');
                const ws = await createNewWebSocket();

                if (!ws) {
                    // Non-fatal: token is saved, app will try again on next load
                    console.warn('[Callback] WebSocket init skipped — will retry on home page');
                }

                // Step 3: Redirect to dashboard
                setStatus('success');
                setMessage('Login successful! Redirecting...');
                setTimeout(() => window.location.replace('/'), 400);
            } catch (err: unknown) {
                console.error('[Callback] Error:', err);
                const msg = err instanceof Error ? err.message : String(err);
                setStatus('error');
                setErrorDetail(msg);
            }
        };

        run();
    }, []);

    if (status === 'error') {
        return (
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh',
                    gap: '20px',
                    padding: '24px',
                    textAlign: 'center',
                    background: '#0a1628',
                    color: '#e5e7eb',
                    fontFamily: 'Roboto, sans-serif',
                }}
            >
                <div style={{ fontSize: '40px' }}>🚨</div>
                <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f87171' }}>Authentication Failed</h1>
                <p style={{ maxWidth: '480px', fontSize: '14px', color: '#9ca3af', lineHeight: 1.6 }}>
                    {errorDetail}
                </p>
                <button
                    onClick={() => window.location.replace('/')}
                    style={{
                        marginTop: '8px',
                        padding: '12px 28px',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'linear-gradient(90deg,#22d3ee,#3b82f6)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '14px',
                        cursor: 'pointer',
                    }}
                >
                    ← Back to Login
                </button>
            </div>
        );
    }

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                gap: '20px',
                background: '#0a1628',
                color: '#e5e7eb',
                fontFamily: 'Roboto, sans-serif',
            }}
        >
            <img
                src='/captain-peter-logo.png'
                alt='Captain Peter'
                style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'contain' }}
            />
            <div
                style={{
                    width: '40px',
                    height: '40px',
                    border: '3px solid rgba(34,211,238,0.2)',
                    borderTop: '3px solid #22d3ee',
                    borderRadius: '50%',
                    animation: 'spin 0.9s linear infinite',
                }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ fontSize: '15px', color: '#22d3ee', fontWeight: 600 }}>{message}</p>
            <p style={{ fontSize: '12px', color: '#6b7280' }}>Captain Peter Trading Hub</p>
        </div>
    );
};

export default CallbackPage;
