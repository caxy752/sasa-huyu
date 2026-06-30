import React from 'react';
import { getBrandLabel, getBrandTitle } from '@/components/shared/utils/brand/brand';
import './strategy-viewer.scss';

const TradingHubStrategies: React.FC = () => {
    const brandLabel = getBrandLabel();
    const brandTitle = getBrandTitle();

    const handleDownload = () => {
        // Create PDF content
        const content = `${brandTitle.toUpperCase()} STRATEGIES

1. Even/Odd 

EVEN STRATEGY & ENTRY POINT 

0,2,4,6 & 8 – Even digits   

Conditions: 

Configure your analysis tool to even/odd and look for a volatility which meets conditions below; - The analysis tool should display 55%+ even win rate. - Make sure that even "E" dominates on "last 20 digits pattern". - At least one or more even digits should have the highest percentage, represented by a green icon on the even/odd analysis tool. - At least 2+ even digits should have 11%+ occurrence. 

ENTRY POINT 

Wait for 3+ ODD "O"digits to appear then enter immediately after the first EVEN "E" digit occurs. 

ODD STRATEGY & ENTRY POINT 

1,3,5,7 & 9 – ODD digits   

Recommended volatilities: 10(1s) , 25(1s) & 50 INDEX 

Conditions: 

Configure your analysis tool to even/odd and look for a volatility which meets conditions below; - The analysis tool should display 70%+ win rate. - Make sure that ODDs "O" dominates on "last 20 digits pattern". - At least one or more ODD digits should have the highest percentage, represented by a green icon on the even/odd analysis tool. - At least 2+ ODD digits should have 11%+ occurrence. 

ENTRY POINT 

Wait for 3+ EVEN "E"digits to appear then enter immediately after the first ODD "O" digit occurs. 

2. Over/Under 

OVER STRATEGY & ENTRY POINT 

Over 1,2 & 3 are considered as the less risky digits best for achieving profits consistency. 

Conditions: 

Over Digit 1 conditions - - - 

Digit 0 & 1 should have percentages below 10%, one of them being the least appearing digit 

(represented by a red arc on the over/under analysis tool) 

Digit 2 to 9 should contain the most appearing digit(s), at least three and above 11%s is an 

added advantage. 

The analysis tool configured to over 1 should have at least 90%+ win rate and OVERs "O" should 

dominate the most on "last 20 digits pattern". 

Recommended bots to use: "over 1 with over 3 recovery", "CMV pro", "Hit & run (set your entry 

point to 0)". 

Over Digit 2 conditions - - - 

Digit 0,1 & 2 should have percentages below 10%, one of them being the least appearing digit 

(represented by a red arc on the over/under analysis tool) 

Digit 3 to 9 should contain the most appearing digit(s), at least three and above 11%s is an 

added advantage. 

The analysis tool configured to over 2 should have at least 78%+ win rate and OVERs "O" should 

dominate the most on "last 20 digits pattern". 

Recommended bots to use: "O2R43 pro", "CMV pro", "Hit & run (set your entry point to 0 or 1 )". 

ENTRY POINT FOR OVER 1 & 2 

Wait for a single or more UNDER "U" digits on the analysis tool then enter immediately after the first 

OVER "O" appears. 

NB: For over digit 3 & 4, use the same concept. Maximum number of runs per interval is 3 to 7. 

UNDER STRATEGY & ENTRY POINT 

Under 8,7 & 6 are considered as the less risky digits best for achieving profits consistency. 

Conditions: 

Under Digit 8 conditions - - - 

Digit 9 & 8 should have percentages below 10%, one of them being the least appearing digit 

(represented by a red arc on the over/under analysis tool) 

Digit 0 to 7 should contain the most appearing digit(s), at least three and above 11%s is an 

added advantage. 

The analysis tool configured to under 8 should have at least 90%+ win rate and UNDERs "U" 

should dominate the most on "last 20 digits pattern". 

Recommended bots to use: "under 8 with under 6 recovery", "CMV pro", "Hit & run (set your 

entry point to 9)". 

Under digit 7 conditions - - - 

Digit 9,8 & 7 should have percentages below 10%, one of them being the least appearing digit 

(represented by a red arc on the over/under analysis tool) 

Digit 0 to 6 should contain the most appearing digit(s), at least three and above 11%s is an 

added advantage. 

The analysis tool configured to under 7 should have at least 78%+ win rate and UNDERs "U" 

should dominate the most on "last 20 digits pattern". 

Recommended bots to use: "U7R56 pro", "CMV pro", "Hit & run (set your entry point to 8 or 9)". 

ENTRY POINT FOR UNDER 7 & 8 

Wait for a single or more OVER "O" digits on the analysis tool then enter immediately after the first 

UNDER "U" appears. 

3. MATCHES & DIFFERS  

DIFFERS STRATEGY 

Conditions; - - 

Predicted digit should be less than 9%  

The analysis tool configured to matches/differs should show at least 88%+ as differs win rate. 

Entry point: wait for the predicted digit to be hit the enter immediately with the next appearing digit. 

Recommended bots to use:  "CMV pro", "Hit & run (set your prediction as your entry point)". 

4. RISE & FALL STRATEGY 

FALL STRATEGY 

Conditions: Use Bollinger bands & commodity channel index (CCI).  

Entry Point: Wait for an overbought condition at the upper band, then enter immediately after a strong 

sell confirmation candle.  

Exit point: Middle band 

Risk Management: Place stop-loss orders just above the confirmation candle's low. 

RISE STRATEGY 

Conditions: Use Bollinger bands & commodity channel index (CCI).  

Entry Point: Wait for an oversold condition at the lower band, then enter immediately after a strong buy 

confirmation candle.  

Exit point: Middle band 

Risk Management: Place stop-loss orders just below the confirmation candle's high. 

Recommended bots to use: "CMV pro" & "Dollarmine V1" 

ALL THE BEST, SEE YOU AT THE MOON CHAMP!`;

        // Create blob and download
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${brandTitle.replace(/\s+/g, '_')}_STRATEGIES.pdf`;
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
                    <span className='strategy-viewer__page-info'>2 of 4</span>
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
                <div className='strategy-viewer__document'>
                    <h1 className='strategy-viewer__title'>{brandLabel} Strategies</h1>

                    <section className='strategy-section'>
                        <h2 className='strategy-section__number'>1. Even/Odd</h2>

                        <div className='strategy-subsection'>
                            <h3 className='strategy-subsection__title'>EVEN STRATEGY & ENTRY POINT</h3>
                            <p className='strategy-subsection__digits'>0,2,4,6 & 8 – Even digits</p>

                            <h4 className='strategy-subsection__heading'>Conditions:</h4>
                            <ul className='strategy-list'>
                                <li>
                                    Configure your analysis tool to even/odd and look for a volatility which meets
                                    conditions below;
                                </li>
                                <li>The analysis tool should display 55%+ even win rate.</li>
                                <li>Make sure that even "E" dominates on "last 20 digits pattern".</li>
                                <li>
                                    At least one or more even digits should have the highest percentage, represented by
                                    a green icon on the even/odd analysis tool.
                                </li>
                                <li>At least 2+ even digits should have 11%+ occurrence.</li>
                            </ul>

                            <h4 className='strategy-subsection__heading'>ENTRY POINT</h4>
                            <p className='strategy-text'>
                                Wait for 3+ ODD "O"digits to appear then enter immediately after the first EVEN "E"
                                digit occurs.
                            </p>
                        </div>

                        <div className='strategy-subsection'>
                            <h3 className='strategy-subsection__title'>ODD STRATEGY & ENTRY POINT</h3>
                            <p className='strategy-subsection__digits'>1,3,5,7 & 9 – ODD digits</p>
                            <p className='strategy-subsection__recommended'>
                                Recommended volatilities: 10(1s) , 25(1s) & 50 INDEX
                            </p>

                            <h4 className='strategy-subsection__heading'>Conditions:</h4>
                            <ul className='strategy-list'>
                                <li>
                                    Configure your analysis tool to even/odd and look for a volatility which meets
                                    conditions below;
                                </li>
                                <li>The analysis tool should display 70%+ win rate.</li>
                                <li>Make sure that ODDs "O" dominates on "last 20 digits pattern".</li>
                                <li>
                                    At least one or more ODD digits should have the highest percentage, represented by a
                                    green icon on the even/odd analysis tool.
                                </li>
                                <li>At least 2+ ODD digits should have 11%+ occurrence.</li>
                            </ul>

                            <h4 className='strategy-subsection__heading'>ENTRY POINT</h4>
                            <p className='strategy-text'>
                                Wait for 3+ EVEN "E"digits to appear then enter immediately after the first ODD "O"
                                digit occurs.
                            </p>
                        </div>
                    </section>

                    <section className='strategy-section'>
                        <h2 className='strategy-section__number'>2. Over/Under</h2>

                        <div className='strategy-subsection'>
                            <h3 className='strategy-subsection__title'>OVER STRATEGY & ENTRY POINT</h3>
                            <p className='strategy-text'>
                                Over 1,2 & 3 are considered as the less risky digits best for achieving profits
                                consistency.
                            </p>

                            <h4 className='strategy-subsection__heading'>Conditions:</h4>

                            <div className='strategy-detail'>
                                <h5 className='strategy-detail__title'>Over Digit 1 conditions - - -</h5>
                                <ul className='strategy-list'>
                                    <li>
                                        Digit 0 & 1 should have percentages below 10%, one of them being the least
                                        appearing digit (represented by a red arc on the over/under analysis tool)
                                    </li>
                                    <li>
                                        Digit 2 to 9 should contain the most appearing digit(s), at least three and
                                        above 11%s is an added advantage.
                                    </li>
                                    <li>
                                        The analysis tool configured to over 1 should have at least 90%+ win rate and
                                        OVERs "O" should dominate the most on "last 20 digits pattern".
                                    </li>
                                </ul>
                                <p className='strategy-bots'>
                                    Recommended bots to use: "over 1 with over 3 recovery", "CMV pro", "Hit & run (set
                                    your entry point to 0)".
                                </p>
                            </div>

                            <div className='strategy-detail'>
                                <h5 className='strategy-detail__title'>Over Digit 2 conditions - - -</h5>
                                <ul className='strategy-list'>
                                    <li>
                                        Digit 0,1 & 2 should have percentages below 10%, one of them being the least
                                        appearing digit (represented by a red arc on the over/under analysis tool)
                                    </li>
                                    <li>
                                        Digit 3 to 9 should contain the most appearing digit(s), at least three and
                                        above 11%s is an added advantage.
                                    </li>
                                    <li>
                                        The analysis tool configured to over 2 should have at least 78%+ win rate and
                                        OVERs "O" should dominate the most on "last 20 digits pattern".
                                    </li>
                                </ul>
                                <p className='strategy-bots'>
                                    Recommended bots to use: "O2R43 pro", "CMV pro", "Hit & run (set your entry point to
                                    0 or 1 )".
                                </p>
                            </div>

                            <h4 className='strategy-subsection__heading'>ENTRY POINT FOR OVER 1 & 2</h4>
                            <p className='strategy-text'>
                                Wait for a single or more UNDER "U" digits on the analysis tool then enter immediately
                                after the first OVER "O" appears.
                            </p>
                            <p className='strategy-note'>
                                NB: For over digit 3 & 4, use the same concept. Maximum number of runs per interval is 3
                                to 7.
                            </p>
                        </div>

                        <div className='strategy-subsection'>
                            <h3 className='strategy-subsection__title'>UNDER STRATEGY & ENTRY POINT</h3>
                            <p className='strategy-text'>
                                Under 8,7 & 6 are considered as the less risky digits best for achieving profits
                                consistency.
                            </p>

                            <h4 className='strategy-subsection__heading'>Conditions:</h4>

                            <div className='strategy-detail'>
                                <h5 className='strategy-detail__title'>Under Digit 8 conditions - - -</h5>
                                <ul className='strategy-list'>
                                    <li>
                                        Digit 9 & 8 should have percentages below 10%, one of them being the least
                                        appearing digit (represented by a red arc on the over/under analysis tool)
                                    </li>
                                    <li>
                                        Digit 0 to 7 should contain the most appearing digit(s), at least three and
                                        above 11%s is an added advantage.
                                    </li>
                                    <li>
                                        The analysis tool configured to under 8 should have at least 90%+ win rate and
                                        UNDERs "U" should dominate the most on "last 20 digits pattern".
                                    </li>
                                </ul>
                                <p className='strategy-bots'>
                                    Recommended bots to use: "under 8 with under 6 recovery", "CMV pro", "Hit & run (set
                                    your entry point to 9)".
                                </p>
                            </div>

                            <div className='strategy-detail'>
                                <h5 className='strategy-detail__title'>Under digit 7 conditions - - -</h5>
                                <ul className='strategy-list'>
                                    <li>
                                        Digit 9,8 & 7 should have percentages below 10%, one of them being the least
                                        appearing digit (represented by a red arc on the over/under analysis tool)
                                    </li>
                                    <li>
                                        Digit 0 to 6 should contain the most appearing digit(s), at least three and
                                        above 11%s is an added advantage.
                                    </li>
                                    <li>
                                        The analysis tool configured to under 7 should have at least 78%+ win rate and
                                        UNDERs "U" should dominate the most on "last 20 digits pattern".
                                    </li>
                                </ul>
                                <p className='strategy-bots'>
                                    Recommended bots to use: "U7R56 pro", "CMV pro", "Hit & run (set your entry point to
                                    8 or 9)".
                                </p>
                            </div>

                            <h4 className='strategy-subsection__heading'>ENTRY POINT FOR UNDER 7 & 8</h4>
                            <p className='strategy-text'>
                                Wait for a single or more OVER "O" digits on the analysis tool then enter immediately
                                after the first UNDER "U" appears.
                            </p>
                        </div>
                    </section>

                    <section className='strategy-section'>
                        <h2 className='strategy-section__number'>3. MATCHES & DIFFERS</h2>

                        <div className='strategy-subsection'>
                            <h3 className='strategy-subsection__title'>DIFFERS STRATEGY</h3>
                            <h4 className='strategy-subsection__heading'>Conditions; - -</h4>
                            <ul className='strategy-list'>
                                <li>Predicted digit should be less than 9%</li>
                                <li>
                                    The analysis tool configured to matches/differs should show at least 88%+ as differs
                                    win rate.
                                </li>
                            </ul>
                            <p className='strategy-text'>
                                <strong>Entry point:</strong> wait for the predicted digit to be hit the enter
                                immediately with the next appearing digit.
                            </p>
                            <p className='strategy-bots'>
                                Recommended bots to use: "CMV pro", "Hit & run (set your prediction as your entry
                                point)".
                            </p>
                        </div>
                    </section>

                    <section className='strategy-section'>
                        <h2 className='strategy-section__number'>4. RISE & FALL STRATEGY</h2>

                        <div className='strategy-subsection'>
                            <h3 className='strategy-subsection__title'>FALL STRATEGY</h3>
                            <p className='strategy-text'>
                                <strong>Conditions:</strong> Use Bollinger bands & commodity channel index (CCI).
                            </p>
                            <p className='strategy-text'>
                                <strong>Entry Point:</strong> Wait for an overbought condition at the upper band, then
                                enter immediately after a strong sell confirmation candle.
                            </p>
                            <p className='strategy-text'>
                                <strong>Exit point:</strong> Middle band
                            </p>
                            <p className='strategy-text'>
                                <strong>Risk Management:</strong> Place stop-loss orders just above the confirmation
                                candle's low.
                            </p>
                        </div>

                        <div className='strategy-subsection'>
                            <h3 className='strategy-subsection__title'>RISE STRATEGY</h3>
                            <p className='strategy-text'>
                                <strong>Conditions:</strong> Use Bollinger bands & commodity channel index (CCI).
                            </p>
                            <p className='strategy-text'>
                                <strong>Entry Point:</strong> Wait for an oversold condition at the lower band, then
                                enter immediately after a strong buy confirmation candle.
                            </p>
                            <p className='strategy-text'>
                                <strong>Exit point:</strong> Middle band
                            </p>
                            <p className='strategy-text'>
                                <strong>Risk Management:</strong> Place stop-loss orders just below the confirmation
                                candle's high.
                            </p>
                            <p className='strategy-bots'>Recommended bots to use: "CMV pro" & "Dollarmine V1"</p>
                        </div>
                    </section>

                    <div className='strategy-footer'>
                        <p className='strategy-footer__text'>ALL THE BEST, SEE YOU AT THE MOON CHAMP!</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TradingHubStrategies;
