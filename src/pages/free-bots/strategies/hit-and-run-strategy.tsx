import React from 'react';
import { Localize } from '@deriv-com/translations';
import './strategy-viewer.scss';

interface HitAndRunStrategyProps {
    onBack?: () => void;
}

const HitAndRunStrategy: React.FC<HitAndRunStrategyProps> = ({ onBack }) => {
    const handleDownload = () => {
        const content = `Over/Under Hit and Run Strategy & Tick synchronization 

Recommended bots:  CMV pro, Hit & Run & Dollarmine. 

Introduction 

The Hit and Run Strategy is a structured approach to trading in the Over/Under market on Deriv. This strategy 

leverages statistical analysis of digit occurrences to determine high-probability entry points.  

The goal is to execute trades quickly based on specific conditions, ensuring minimal exposure while maximizing 

accuracy. 

Strategy Overview 

The strategy focuses on two key trade types: 

1. Trading Over 1 

2. Trading Under 8 

Each trade type has well-defined conditions based on digit occurrence probabilities, trend confirmation, and a 

validation process using a 3-tick sequence (tick synchronization). 

Prediction: Over 1 

Entry Digits: 5 or 9 

Validation: If either digit appears, check the next 3-tick sequence to determine if it would be a win. 

Execution: If the 3-tick sequence confirms a win, pick the number as your entry and wait for the next trading 

confirmation before executing the trade. 

Conditions: 

1. Follow the Trend: - Ensure the market is in an uptrend. - Look for green (bullish) candlesticks that are increasing in size, indicating strong buying 

momentum. 

2. Digit Occurrence Filter: - Digits 0 and 1 must have a percentage occurrence rate of less than 10% before entering the trade. 

Prediction: Under 8 

Entry Digits: 0, 4, or 9 

Validation: If any of these digits appear, check the next 3-tick sequence to determine if it would be a win. 

Execution: If the 3-tick sequence confirms a win, pick the number as your entry and wait for the next trading 

signal before executing the trade. 

Conditions: 

1. Follow the Trend: - Ensure the market is in a downtrend. - Look for red (bearish) candlesticks that are increasing in size, indicating strong selling momentum. 

2. Digit Occurrence Filter: - Digits 9 and 8 must have a percentage occurrence rate of less than 10% before entering the trade. 

Trading Rule: Hit and Run, Increase Stake - Execute the trade as per the validated entry criteria. 

- Once a trade is executed and won, exit the market and wait for the next valid confirmation. - Increase the stake progressively to maximize profitability while maintaining risk control. 

Risk Management - Stake Allocation: Use a controlled staking plan to prevent excessive losses. - Max Consecutive Trades: Limit to 3 trades per interval to minimize risk. - Stop Loss: Set a predefined stop loss to preserve capital. - Take Profit: Exit once a target profit threshold is reached. 

Conclusion 

The Hit and Run Strategy is designed for traders looking for quick and precise entries in Deriv's Over/Under 

market.  

By following the digit occurrence criteria, validating entries using a 3-tick sequence, and executing trades based 

on data-driven signals, traders can enhance their success rate while maintaining discipline and risk control.  

The key rule is to hit and run while increasing stake strategically to optimize returns.`;

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Hit_and_Run_Strategy.pdf';
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
                    <h1 className='strategy-viewer__title'>Over/Under Hit and Run Strategy & Tick synchronization</h1>

                    <div className='strategy-subsection'>
                        <p className='strategy-bots'>Recommended bots: CMV pro, Hit & Run & Dollarmine.</p>
                    </div>

                    <section className='strategy-section'>
                        <h2 className='strategy-section__number'>Introduction</h2>
                        <p className='strategy-text'>
                            The Hit and Run Strategy is a structured approach to trading in the Over/Under market on
                            Deriv. This strategy leverages statistical analysis of digit occurrences to determine
                            high-probability entry points.
                        </p>
                        <p className='strategy-text'>
                            The goal is to execute trades quickly based on specific conditions, ensuring minimal
                            exposure while maximizing accuracy.
                        </p>
                    </section>

                    <section className='strategy-section'>
                        <h2 className='strategy-section__number'>Strategy Overview</h2>
                        <p className='strategy-text'>The strategy focuses on two key trade types:</p>
                        <ol className='strategy-list-numbered'>
                            <li>Trading Over 1</li>
                            <li>Trading Under 8</li>
                        </ol>
                        <p className='strategy-text'>
                            Each trade type has well-defined conditions based on digit occurrence probabilities, trend
                            confirmation, and a validation process using a 3-tick sequence (tick synchronization).
                        </p>
                    </section>

                    <section className='strategy-section'>
                        <h2 className='strategy-section__number'>Prediction: Over 1</h2>

                        <div className='strategy-subsection'>
                            <p className='strategy-text'>
                                <strong>Entry Digits:</strong> 5 or 9
                            </p>
                            <p className='strategy-text'>
                                <strong>Validation:</strong> If either digit appears, check the next 3-tick sequence to
                                determine if it would be a win.
                            </p>
                            <p className='strategy-text'>
                                <strong>Execution:</strong> If the 3-tick sequence confirms a win, pick the number as
                                your entry and wait for the next trading confirmation before executing the trade.
                            </p>

                            <h4 className='strategy-subsection__heading'>Conditions:</h4>

                            <div className='strategy-detail'>
                                <h5 className='strategy-detail__title'>1. Follow the Trend:</h5>
                                <ul className='strategy-list'>
                                    <li>Ensure the market is in an uptrend.</li>
                                    <li>
                                        Look for green (bullish) candlesticks that are increasing in size, indicating
                                        strong buying momentum.
                                    </li>
                                </ul>
                            </div>

                            <div className='strategy-detail'>
                                <h5 className='strategy-detail__title'>2. Digit Occurrence Filter:</h5>
                                <ul className='strategy-list'>
                                    <li>
                                        Digits 0 and 1 must have a percentage occurrence rate of less than 10% before
                                        entering the trade.
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    <section className='strategy-section'>
                        <h2 className='strategy-section__number'>Prediction: Under 8</h2>

                        <div className='strategy-subsection'>
                            <p className='strategy-text'>
                                <strong>Entry Digits:</strong> 0, 4, or 9
                            </p>
                            <p className='strategy-text'>
                                <strong>Validation:</strong> If any of these digits appear, check the next 3-tick
                                sequence to determine if it would be a win.
                            </p>
                            <p className='strategy-text'>
                                <strong>Execution:</strong> If the 3-tick sequence confirms a win, pick the number as
                                your entry and wait for the next trading signal before executing the trade.
                            </p>

                            <h4 className='strategy-subsection__heading'>Conditions:</h4>

                            <div className='strategy-detail'>
                                <h5 className='strategy-detail__title'>1. Follow the Trend:</h5>
                                <ul className='strategy-list'>
                                    <li>Ensure the market is in a downtrend.</li>
                                    <li>
                                        Look for red (bearish) candlesticks that are increasing in size, indicating
                                        strong selling momentum.
                                    </li>
                                </ul>
                            </div>

                            <div className='strategy-detail'>
                                <h5 className='strategy-detail__title'>2. Digit Occurrence Filter:</h5>
                                <ul className='strategy-list'>
                                    <li>
                                        Digits 9 and 8 must have a percentage occurrence rate of less than 10% before
                                        entering the trade.
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    <section className='strategy-section'>
                        <h2 className='strategy-section__number'>Trading Rule: Hit and Run, Increase Stake</h2>
                        <ul className='strategy-list'>
                            <li>Execute the trade as per the validated entry criteria.</li>
                            <li>
                                Once a trade is executed and won, exit the market and wait for the next valid
                                confirmation.
                            </li>
                            <li>
                                Increase the stake progressively to maximize profitability while maintaining risk
                                control.
                            </li>
                        </ul>
                    </section>

                    <section className='strategy-section'>
                        <h2 className='strategy-section__number'>Risk Management</h2>
                        <ul className='strategy-list'>
                            <li>
                                <strong>Stake Allocation:</strong> Use a controlled staking plan to prevent excessive
                                losses.
                            </li>
                            <li>
                                <strong>Max Consecutive Trades:</strong> Limit to 3 trades per interval to minimize
                                risk.
                            </li>
                            <li>
                                <strong>Stop Loss:</strong> Set a predefined stop loss to preserve capital.
                            </li>
                            <li>
                                <strong>Take Profit:</strong> Exit once a target profit threshold is reached.
                            </li>
                        </ul>
                    </section>

                    <section className='strategy-section'>
                        <h2 className='strategy-section__number'>Conclusion</h2>
                        <p className='strategy-text'>
                            The Hit and Run Strategy is designed for traders looking for quick and precise entries in
                            Deriv's Over/Under market.
                        </p>
                        <p className='strategy-text'>
                            By following the digit occurrence criteria, validating entries using a 3-tick sequence, and
                            executing trades based on data-driven signals, traders can enhance their success rate while
                            maintaining discipline and risk control.
                        </p>
                        <p className='strategy-text'>
                            The key rule is to hit and run while increasing stake strategically to optimize returns.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default HitAndRunStrategy;
