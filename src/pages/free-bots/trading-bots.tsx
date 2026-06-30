import React, { useState } from 'react';
import FreeBots from './free-bots';
import HybridBots from '../hybrid-bots';
import RiskCalculator from './risk-calculator';
import Strategies from './strategies';
import { Localize } from '@deriv-com/translations';
import { LabelPairedPuzzlePieceTwoCaptionBoldIcon } from '@deriv/quill-icons/LabelPaired';
import './trading-bots.scss';

type TradingBotSubTab = 'free-bots' | 'speedbots' | 'calculator' | 'strategies';

const TradingBots: React.FC = () => {
    const [active_tool, setActiveTool] = useState<TradingBotSubTab>('free-bots');

    const handleCardClick = (tool: TradingBotSubTab) => {
        setActiveTool(tool);
    };

    const renderContent = () => {
        if (!active_tool) return null;

        switch (active_tool) {
            case 'free-bots':
                return <FreeBots />;
            case 'speedbots':
                return <HybridBots />;
            case 'calculator':
                return <RiskCalculator />;
            case 'strategies':
                return <Strategies />;
            default:
                return null;
        }
    };

    return (
        <div className='trading-bots'>
            <div className='trading-bots__cards-container'>
                <div
                    className={`trading-bots__card trading-bots__card--light ${active_tool === 'free-bots' ? 'trading-bots__card--active' : ''}`}
                    onClick={() => handleCardClick('free-bots')}
                >
                    <div className='trading-bots__card-content'>
                        <LabelPairedPuzzlePieceTwoCaptionBoldIcon
                            height='16px'
                            width='16px'
                            fill={active_tool === 'free-bots' ? '#3b82f6' : '#1e3a8a'}
                        />
                        <span className='trading-bots__card-label'>
                            <Localize i18n_default_text='Free Bots' />
                        </span>
                    </div>
                </div>
                <div
                    className={`trading-bots__card trading-bots__card--light ${active_tool === 'speedbots' ? 'trading-bots__card--active' : ''}`}
                    onClick={() => handleCardClick('speedbots')}
                >
                    <div className='trading-bots__card-content'>
                        <LabelPairedPuzzlePieceTwoCaptionBoldIcon
                            height='16px'
                            width='16px'
                            fill={active_tool === 'speedbots' ? '#3b82f6' : '#1e3a8a'}
                        />
                        <span className='trading-bots__card-label'>
                            <Localize i18n_default_text='SpeedBots' />
                        </span>
                        <span className='nav-speedbots-rocket' aria-hidden='true'>
                            🚀
                        </span>
                    </div>
                </div>
                <div
                    className={`trading-bots__card trading-bots__card--light ${active_tool === 'calculator' ? 'trading-bots__card--active' : ''}`}
                    onClick={() => handleCardClick('calculator')}
                >
                    <div className='trading-bots__card-content'>
                        <LabelPairedPuzzlePieceTwoCaptionBoldIcon
                            height='16px'
                            width='16px'
                            fill={active_tool === 'calculator' ? '#3b82f6' : '#1e3a8a'}
                        />
                        <span className='trading-bots__card-label'>
                            <Localize i18n_default_text='Calculator' />
                        </span>
                    </div>
                </div>
                <div
                    className={`trading-bots__card trading-bots__card--light ${active_tool === 'strategies' ? 'trading-bots__card--active' : ''}`}
                    onClick={() => handleCardClick('strategies')}
                >
                    <div className='trading-bots__card-content'>
                        <LabelPairedPuzzlePieceTwoCaptionBoldIcon
                            height='16px'
                            width='16px'
                            fill={active_tool === 'strategies' ? '#3b82f6' : '#1e3a8a'}
                        />
                        <span className='trading-bots__card-label'>
                            <Localize i18n_default_text='Strategies' />
                        </span>
                    </div>
                </div>
            </div>
            {active_tool && <div className='trading-bots__content'>{renderContent()}</div>}
        </div>
    );
};

export default TradingBots;
