import React from 'react';
import { Localize } from '@deriv-com/translations';
import { getBrandLabel } from '@/components/shared/utils/brand/brand';
import './strategy-viewer.scss';

interface OverUnderStrategyProps {
    onBack?: () => void;
}

const OverUnderStrategy: React.FC<OverUnderStrategyProps> = ({ onBack }) => {
    const brandLabel = getBrandLabel();

    const handleDownload = () => {
        const content = `OVER/UNDER STRATEGIES

1. OVER 1,2,3 STRATEGY

CONDITIONS FOR OVER PREDICTION:
- Digit 0,1,2 & 3 should have percentages below 10% (decreasing) and a red or yellow bar should be among them. (These conditions are for over prediction 3. If only 0,1 & 2 are having %ges below 10, you can opt to trade over prediction 0,1 or 2)
- Digit 4 to 9 should have at least two, 11% and above. The blue & green bar should be within the same range.

ENTRY POINT: Wait for the tick pointer to pick the least appearing among digit 1,2 & 3, if within the next 1 tick the pointer picks any digit from 4 to 9, enter immediately.

USE ${brandLabel.toUpperCase()} TO TRADE

2. UNDER 8,7,6 STRATEGY

CONDITIONS FOR UNDER PREDICTION:
- Digit 9,8,7 & 6 should have percentages below 10% (decreasing) and a red or yellow bar should be among them. (These conditions are for under prediction 6. If only 9,8 &7 are having %ges below 10, you can opt to trade under prediction 9,8 or 7)
- Digit 0 to 5 should have at least two, 11% and above. The blue & green bar should be within the same range.

ENTRY POINT: Wait for the tick pointer to pick the least appearing among digit 8,7 & 6. If within the next 1 tick the pointer picks any digit from 0 to 4, enter immediately.

"The strategy gives you direction, but discipline gives you results. Practice patiently, execute cleanly, and trust the process."

Proverbs 21:5
"The plans of the diligent lead surely to abundance, but everyone who is hasty comes only to poverty."

USE ${brandLabel.toUpperCase()} TO TRADE`;

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Over_Under_Strategies.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className='strategy-viewer'>
            <div className='strategy-viewer__toolbar'>
                <div className='strategy-viewer__toolbar-left'>
                    <button className='strategy-viewer__toolbar-btn' title='List View'>
                        <svg width='16' height='16' viewBox='0 0 24 24' fill='currentColor'>
                            <path d='M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z' />
                        </svg>
                    </button>
                    <button className='strategy-viewer__toolbar-btn' onClick={handleDownload} title='Download'>
                        <svg width='16' height='16' viewBox='0 0 24 24' fill='currentColor'>
                            <path d='M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z' />
                        </svg>
                    </button>
                </div>
                <div className='strategy-viewer__toolbar-center'>
                    <span className='strategy-viewer__page-info'>1 of 1</span>
                </div>
                <div className='strategy-viewer__toolbar-right'>
                    <button className='strategy-viewer__toolbar-btn' title='Drawing Tools'>
                        <svg width='16' height='16' viewBox='0 0 24 24' fill='currentColor'>
                            <path d='M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z' />
                        </svg>
                    </button>
                    <button className='strategy-viewer__toolbar-btn' title='Text'>
                        <svg width='16' height='16' viewBox='0 0 24 24' fill='currentColor'>
                            <path d='M2.5 4v3h5v12h3V7h5V4h-13zm19 5h-9v3h3v7h3v-7h3V9z' />
                        </svg>
                    </button>
                    <button className='strategy-viewer__toolbar-btn' title='Audio'>
                        <svg width='16' height='16' viewBox='0 0 24 24' fill='currentColor'>
                            <path d='M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z' />
                        </svg>
                    </button>
                </div>
            </div>
            <div className='strategy-viewer__content'>
                {onBack && (
                    <button className='strategy-viewer__back-button' onClick={onBack}>
                        <svg width='16' height='16' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
                            <path
                                d='M19 12H5M5 12L12 19M5 12L12 5'
                                stroke='currentColor'
                                strokeWidth='2'
                                strokeLinecap='round'
                                strokeLinejoin='round'
                            />
                        </svg>
                        <Localize i18n_default_text='Back to Strategies' />
                    </button>
                )}
                <div className='strategy-viewer__document'>
                    <h1 className='strategy-viewer__title'>OVER/UNDER STRATEGIES</h1>

                    <section className='strategy-section'>
                        <h2 className='strategy-section__number'>1. OVER 1,2,3 STRATEGY</h2>

                        <div className='strategy-subsection'>
                            <h4 className='strategy-subsection__heading'>CONDITIONS FOR OVER PREDICTION:</h4>
                            <ul className='strategy-list'>
                                <li>
                                    Digit 0,1,2 & 3 should have percentages below 10% (decreasing) and a red or yellow
                                    bar should be among them. (These conditions are for over prediction 3. If only 0,1 &
                                    2 are having %ges below 10, you can opt to trade over prediction 0,1 or 2)
                                </li>
                                <li>
                                    Digit 4 to 9 should have at least two, 11% and above. The blue & green bar should be
                                    within the same range.
                                </li>
                            </ul>

                            <div className='strategy-detail'>
                                <h5 className='strategy-detail__title'>ENTRY POINT:</h5>
                                <p className='strategy-text'>
                                    Wait for the tick pointer to pick the least appearing among digit 1,2 & 3, if within
                                    the next 1 tick the pointer picks any digit from 4 to 9, enter immediately.
                                </p>
                            </div>

                            <p className='strategy-bots'>USE {brandLabel.toUpperCase()} TO TRADE</p>
                        </div>
                    </section>

                    <section className='strategy-section'>
                        <h2 className='strategy-section__number'>2. UNDER 8,7,6 STRATEGY</h2>

                        <div className='strategy-subsection'>
                            <h4 className='strategy-subsection__heading'>CONDITIONS FOR UNDER PREDICTION:</h4>
                            <ul className='strategy-list'>
                                <li>
                                    Digit 9,8,7 & 6 should have percentages below 10% (decreasing) and a red or yellow
                                    bar should be among them. (These conditions are for under prediction 6. If only 9,8
                                    &7 are having %ges below 10, you can opt to trade under prediction 9,8 or 7)
                                </li>
                                <li>
                                    Digit 0 to 5 should have at least two, 11% and above. The blue & green bar should be
                                    within the same range.
                                </li>
                            </ul>

                            <div className='strategy-detail'>
                                <h5 className='strategy-detail__title'>ENTRY POINT:</h5>
                                <p className='strategy-text'>
                                    Wait for the tick pointer to pick the least appearing among digit 8,7 & 6. If within
                                    the next 1 tick the pointer picks any digit from 0 to 4, enter immediately.
                                </p>
                            </div>

                            <p className='strategy-bots'>USE {brandLabel.toUpperCase()} TO TRADE</p>
                        </div>
                    </section>

                    <div className='strategy-footer'>
                        <p className='strategy-text' style={{ color: '#ffffff', margin: '0.5rem 0' }}>
                            "The strategy gives you direction, but discipline gives you results. Practice patiently,
                            execute cleanly, and trust the process."
                        </p>
                        <p
                            className='strategy-text'
                            style={{ color: '#ffffff', margin: '0.5rem 0', fontStyle: 'italic' }}
                        >
                            Proverbs 21:5
                        </p>
                        <p className='strategy-text' style={{ color: '#ffffff', margin: '0.5rem 0' }}>
                            "The plans of the diligent lead surely to abundance, but everyone who is hasty comes only to
                            poverty."
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OverUnderStrategy;
