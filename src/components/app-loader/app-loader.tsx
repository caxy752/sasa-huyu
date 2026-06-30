import React, { useEffect, useState } from 'react';
import { getBrandLabel, getBrandTitle } from '@/components/shared/utils/brand/brand';
import './app-loader.scss';

interface AppLoaderProps {
    onLoadingComplete: () => void;
    duration?: number; // Duration in milliseconds, default 12000ms (12 seconds)
}

const AppLoader: React.FC<AppLoaderProps> = ({ onLoadingComplete, duration = 12000 }) => {
    const [isVisible, setIsVisible] = useState(true);
    const [progress, setProgress] = useState(0);
    const [messageIndex, setMessageIndex] = useState(0);
    const brandLabel = getBrandLabel();
    const brandTitle = getBrandTitle();

    const messages = [
        { title: 'Initializing' },
        { title: 'Connecting to trading server...' },
        { title: 'Loading charts' },
        { title: 'Loading Blocky' },
        { title: 'Preparing dashboard' },
    ];

    const steps = ['Connection', 'Market Data', 'AI Engine', 'Trading Bots', 'Final Setup'] as const;
    const stepIndex = Math.min(steps.length - 1, Math.max(0, messageIndex));

    // Initialize loading timer
    // Total loader duration fixed at 6 seconds
    const effectiveDuration = 6000;

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsVisible(false);
            setTimeout(onLoadingComplete, 300); // Wait for fade out animation
        }, effectiveDuration);

        return () => clearTimeout(timer);
    }, [onLoadingComplete, effectiveDuration]);

    // Progress bar and message advancement
    useEffect(() => {
        if (!isVisible) return;

        setProgress(0);
        // Evenly split the 6s across all messages
        const totalPerMessageMs = Math.max(200, Math.floor(effectiveDuration / messages.length));
        const stepMs = totalPerMessageMs / 100;
        let current = 0;

        const interval = setInterval(
            () => {
                current += 1;
                if (current > 100) {
                    clearInterval(interval);
                    // move to next message if any, and restart
                    setMessageIndex(prev => {
                        const next = prev + 1;
                        if (next < messages.length) {
                            // trigger next cycle
                            setProgress(0);
                            return next;
                        }
                        return prev;
                    });
                    return;
                }
                setProgress(current);
            },
            Math.max(4, stepMs)
        );

        return () => clearInterval(interval);
    }, [isVisible, messageIndex, duration]);

    if (!isVisible) return null;

    return (
        <div className='georgetown-loader'>
            <div className='smart-loader-bg' />

            <div className='smart-loader__wrap'>
                <div className='smart-loader__card'>
                    <div className='smart-loader__header'>
                        <div className='smart-loader__brand'>
                            <div className='smart-loader__brand-mark' aria-hidden='true'>
                                <img
                                    src='/captain-peter-logo.png'
                                    alt='Captain Peter'
                                    className='smart-loader__brand-logo'
                                />
                            </div>
                            <div className='smart-loader__brand-text'>
                                <div className='smart-loader__brand-title'>{brandTitle}</div>
                                <div className='smart-loader__brand-subtitle'>LOADING</div>
                            </div>
                        </div>

                        <div className='smart-loader__welcome'>
                            <div className='smart-loader__welcome-line'>
                                Welcome to <span className='smart-loader__welcome-accent'>{brandLabel}</span>
                            </div>
                            <div className='smart-loader__welcome-sub'>Automated Precision Trading System</div>
                        </div>
                    </div>

                    <div className='smart-loader__steps'>
                        {steps.map((label, idx) => {
                            const is_done = idx < stepIndex;
                            const is_active = idx === stepIndex;
                            return (
                                <div
                                    key={label}
                                    className={[
                                        'smart-loader__step',
                                        is_done ? 'smart-loader__step--done' : '',
                                        is_active ? 'smart-loader__step--active' : '',
                                    ]
                                        .filter(Boolean)
                                        .join(' ')}
                                >
                                    <div className='smart-loader__step-dot' aria-hidden='true'>
                                        {is_done ? '✓' : idx + 1}
                                    </div>
                                    <div className='smart-loader__step-label'>{label}</div>
                                </div>
                            );
                        })}
                    </div>

                    <div className='smart-loader__tiles'>
                        {[
                            { label: 'Free Bots', icon: '🤖' },
                            { label: 'AI Bots', icon: '🧠' },
                            { label: 'Analysis Tool', icon: '📊' },
                            { label: 'Smart Analysis', icon: '✨' },
                            { label: 'Copy Trading', icon: '📄' },
                            { label: 'Signals', icon: '📡' },
                        ].map(t => (
                            <div key={t.label} className='smart-loader__tile' aria-hidden='true'>
                                <div className='smart-loader__tile-icon'>{t.icon}</div>
                                <div className='smart-loader__tile-label'>{t.label}</div>
                            </div>
                        ))}
                    </div>

                    <div className='smart-loader__status'>
                        <div className='smart-loader__status-line'>Establishing secure connection...</div>
                        <div className='smart-loader__status-sub'>
                            {messages[messageIndex]?.title || 'Connecting...'}
                        </div>
                    </div>

                    <div className='progress-wrapper'>
                        <div className='progress-track'>
                            <div className='loading-bar-glow' style={{ width: `${progress}%` }} />
                            <div className='loading-bar-pulse' />
                        </div>
                        <div className='progress-counter'>{progress}%</div>
                    </div>

                    <div className='smart-loader__footer'>
                        © 2025 {brandLabel}. Powered by Deriv. All rights reserved.
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AppLoader;
