import React from 'react';
import { Localize } from '@deriv-com/translations';
import { getBrandLabel } from '@/components/shared/utils/brand/brand';
import './strategy-viewer.scss';

interface OddStrategyProps {
    onBack?: () => void;
}

const OddStrategy: React.FC<OddStrategyProps> = ({ onBack }) => {
    const brandLabel = getBrandLabel();

    const handleDownload = () => {
        const content = `ODD STRATEGY

CONDITIONS TO CONSIDER:
1. GREEN & BLUE BARS SHOULD BOTH BE ON ODD DIGITS HAVING 11%+

2. RED & YELLOW BARS SHOULD BOTH BE ON EVEN DIGIT, RED BAR %GE 8.6 AND BELOW, YELLOW BAR 9.5<

ENTRY POINT: WAIT FOR THE TICK POINTER TO PICK THE LEAST APPEARING DIGIT AMONG THE R & Y, THEN WAIT FOR CONSECUTIVE 2 ODDS APPEAR WITHIN THE NEXT 5 TICK THEN ENTER IMMEDIATELY.

NB: AFTER 3 TO 7 RUNS MAX ON PROFITS, STOP THE BOT TO CONFIRM THE MARKET CONDITIONS AND WAIT FOR ANOTHER ENTRY TRIGGER.

BARS COLOR KEY:
RED: LEAST APPEARING DIGIT, YELLOW: 2ND LEAST APPEARING, GREEN: MOST APPEARING, BLUE: 2ND MOST APPEARING.

USE ${brandLabel.toUpperCase()} TO TRADE`;

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Odd_Strategy.pdf';
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
                    <h1 className='strategy-viewer__title'>ODD STRATEGY</h1>

                    <section className='strategy-section'>
                        <h2 className='strategy-section__number'>CONDITIONS TO CONSIDER</h2>

                        <div className='strategy-subsection'>
                            <div className='strategy-detail'>
                                <h5 className='strategy-detail__title'>
                                    1. GREEN & BLUE BARS SHOULD BOTH BE ON ODD DIGITS HAVING 11%+
                                </h5>
                                <p className='strategy-text'>
                                    Both the green (most appearing) and blue (2nd most appearing) bars must be
                                    positioned on odd digits (1, 3, 5, 7, 9) and each should have a percentage of 11% or
                                    higher.
                                </p>
                            </div>

                            <div className='strategy-detail'>
                                <h5 className='strategy-detail__title'>
                                    2. RED & YELLOW BARS SHOULD BOTH BE ON EVEN DIGIT
                                </h5>
                                <ul className='strategy-list'>
                                    <li>RED BAR %GE: 8.6 AND BELOW</li>
                                    <li>YELLOW BAR %GE: 9.5 AND BELOW</li>
                                </ul>
                                <p className='strategy-text'>
                                    Both the red (least appearing) and yellow (2nd least appearing) bars must be
                                    positioned on even digits (0, 2, 4, 6, 8).
                                </p>
                            </div>
                        </div>
                    </section>

                    <section className='strategy-section'>
                        <h2 className='strategy-section__number'>ENTRY POINT</h2>
                        <div className='strategy-subsection'>
                            <p className='strategy-text'>
                                <strong>
                                    WAIT FOR THE TICK POINTER TO PICK THE LEAST APPEARING DIGIT AMONG THE R & Y,
                                </strong>{' '}
                                then wait for <strong>CONSECUTIVE 2 ODDS APPEAR WITHIN THE NEXT 5 TICK</strong> then
                                enter immediately.
                            </p>

                            <div className='strategy-note'>
                                <strong>NB:</strong> AFTER 3 TO 7 RUNS MAX ON PROFITS, STOP THE BOT TO CONFIRM THE
                                MARKET CONDITIONS AND WAIT FOR ANOTHER ENTRY TRIGGER.
                            </div>
                        </div>
                    </section>

                    <section className='strategy-section'>
                        <h2 className='strategy-section__number'>BARS COLOR KEY</h2>
                        <div className='strategy-subsection'>
                            <ul className='strategy-list'>
                                <li>
                                    <strong style={{ color: '#ef4444' }}>RED:</strong> LEAST APPEARING DIGIT
                                </li>
                                <li>
                                    <strong style={{ color: '#f59e0b' }}>YELLOW:</strong> 2ND LEAST APPEARING
                                </li>
                                <li>
                                    <strong style={{ color: '#10b981' }}>GREEN:</strong> MOST APPEARING
                                </li>
                                <li>
                                    <strong style={{ color: '#3b82f6' }}>BLUE:</strong> 2ND MOST APPEARING
                                </li>
                            </ul>
                        </div>
                    </section>

                    <div className='strategy-footer'>
                        <p className='strategy-footer__text'>USE {brandLabel.toUpperCase()} TO TRADE</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OddStrategy;
