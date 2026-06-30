import React, { useState, useEffect, useRef } from 'react';
import Button from '@/components/shared_ui/button';
import Modal from '@/components/shared_ui/modal';
import { localize } from '@deriv-com/translations';
import { useStore } from '@/hooks/useStore';
import { DBOT_TABS } from '@/constants/bot-contents';
import './risk-calculator-button.scss';

const RiskCalculatorButton = () => {
    const { dashboard } = useStore();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [stakePercentage, setStakePercentage] = useState<number>(2.5); // Default 2.5%
    const capitalInputRef = useRef<HTMLInputElement>(null);
    const stakeDisplayRef = useRef<HTMLSpanElement>(null);
    const takeProfitDisplayRef = useRef<HTMLSpanElement>(null);
    const stopLossDisplayRef = useRef<HTMLSpanElement>(null);

    const active_tab = dashboard?.active_tab;
    const isBotBuilderActive = active_tab === DBOT_TABS.BOT_BUILDER || active_tab === 1; // BOT_BUILDER = 1

    // Close modal when switching away from bot builder
    useEffect(() => {
        if (!isBotBuilderActive && isModalOpen) {
            setIsModalOpen(false);
            setStakePercentage(2.5); // Reset to default
        }
    }, [isBotBuilderActive, isModalOpen]);

    useEffect(() => {
        if (!isModalOpen) return;

        const capitalInput = capitalInputRef.current;
        const stakeDisplay = stakeDisplayRef.current;
        const takeProfitDisplay = takeProfitDisplayRef.current;
        const stopLossDisplay = stopLossDisplayRef.current;

        if (!capitalInput || !stakeDisplay || !takeProfitDisplay || !stopLossDisplay) {
            return;
        }

        const calculateResults = () => {
            const capital = parseFloat(capitalInput.value) || 0;
            if (capital < 0) {
                capitalInput.value = '0';
                updateDisplays('0.00', '0.00', '0.00');
                return;
            }

            const stakePercent = stakePercentage / 100;
            const initialStake = (capital * stakePercent).toFixed(2);
            const takeProfit = (parseFloat(initialStake) * 2.5).toFixed(2); // Changed to 2.5x

            // Martingale stop loss: sum of stakes for 4 losses (double each time)
            let stopLoss = 0;
            let currentStake = parseFloat(initialStake);
            for (let i = 0; i < 4; i++) {
                stopLoss += currentStake;
                currentStake = currentStake * 2;
            }

            updateDisplays(initialStake, takeProfit, stopLoss.toFixed(2));
        };

        const updateDisplays = (stake: string, takeProfit: string, stopLoss: string) => {
            stakeDisplay.textContent = stake;
            takeProfitDisplay.textContent = takeProfit;
            stopLossDisplay.textContent = stopLoss;
        };

        capitalInput.addEventListener('input', calculateResults);
        capitalInput.addEventListener('touchend', calculateResults);

        // Initialize with default value
        calculateResults();

        return () => {
            capitalInput.removeEventListener('input', calculateResults);
            capitalInput.removeEventListener('touchend', calculateResults);
        };
    }, [isModalOpen, stakePercentage]);

    const handleOpenModal = () => {
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        // Reset to default when closing
        setStakePercentage(2.5);
    };

    const handleStakePercentageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setStakePercentage(parseFloat(e.target.value));
    };

    // Only show button in bot builder section - return null if not in bot builder
    if (!isBotBuilderActive) {
        // Also close modal if it's open when switching tabs
        if (isModalOpen) {
            setIsModalOpen(false);
            setStakePercentage(2.5);
        }
        return null;
    }

    return (
        <>
            {/* Risk Calculator Button - Top Right on Mobile - Only visible in Bot Builder */}
            <div className='risk-calculator-button'>
                <Button className='risk-calculator-button__btn' onClick={handleOpenModal} secondary small>
                    {localize('Risk Calculator')}
                </Button>
            </div>

            {/* Risk Calculator Modal */}
            <Modal
                is_open={isModalOpen}
                title={localize('Risk Calculator')}
                toggleModal={handleCloseModal}
                width='500px'
                className='risk-calculator-modal'
            >
                <div className='risk-calculator-modal__content'>
                    <div className='risk-calculator-container'>
                        <h2 className='risk-calculator-modal__title'>Martingale Calculator</h2>
                        <div className='input-group'>
                            <label htmlFor='capital'>Initial Capital (₹):</label>
                            <input
                                ref={capitalInputRef}
                                type='number'
                                id='capital'
                                min='0'
                                step='0.01'
                                placeholder='Enter capital'
                                required
                            />
                        </div>
                        <div className='input-group'>
                            <label htmlFor='stakePercentage'>Stake Percentage:</label>
                            <select
                                id='stakePercentage'
                                value={stakePercentage}
                                onChange={handleStakePercentageChange}
                                className='stake-percentage-select'
                            >
                                <option value='2.5'>2.5%</option>
                                <option value='5'>5%</option>
                                <option value='10'>10%</option>
                            </select>
                        </div>
                        <div className='results'>
                            <div className='result-item'>
                                <span>Stake ({stakePercentage}% of Capital):</span>
                                <span ref={stakeDisplayRef} id='stake'>
                                    0.00
                                </span>
                            </div>
                            <div className='result-item'>
                                <span>Take Profit (2.5x Stake):</span>
                                <span ref={takeProfitDisplayRef} id='takeProfit'>
                                    0.00
                                </span>
                            </div>
                            <div className='result-item'>
                                <span>Stop Loss (4 Losses Sum):</span>
                                <span ref={stopLossDisplayRef} id='stopLoss'>
                                    0.00
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </Modal>
        </>
    );
};

export default RiskCalculatorButton;
