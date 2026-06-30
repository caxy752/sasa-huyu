import React, { useState } from 'react';
import Hyperbot from '../hyperbot';
import Diffbot from '../diffbot';
import SpeedBot from '../speedbot';
import { Localize } from '@deriv-com/translations';
import { LabelPairedPuzzlePieceTwoCaptionBoldIcon } from '@deriv/quill-icons/LabelPaired';
import './hybrid-bots.scss';

type HybridBotSubTab = 'diffbot' | 'hyperbot' | 'speedbot';

const HybridBots: React.FC = () => {
    const [active_tool, setActiveTool] = useState<HybridBotSubTab>('diffbot');

    const handleCardClick = (tool: HybridBotSubTab) => {
        setActiveTool(tool);
    };

    const renderContent = () => {
        if (!active_tool) return null;

        switch (active_tool) {
            case 'diffbot':
                return <Diffbot />;
            case 'hyperbot':
                return <Hyperbot />;
            case 'speedbot':
                return <SpeedBot />;
            default:
                return null;
        }
    };

    return (
        <div className='hybrid-bots'>
            <div className='hybrid-bots__cards-container'>
                <div
                    className={`hybrid-bots__card hybrid-bots__card--light ${active_tool === 'diffbot' ? 'hybrid-bots__card--active' : ''}`}
                    onClick={() => handleCardClick('diffbot')}
                >
                    <div className='hybrid-bots__card-content'>
                        <LabelPairedPuzzlePieceTwoCaptionBoldIcon
                            height='16px'
                            width='16px'
                            fill={active_tool === 'diffbot' ? '#3b82f6' : '#1e3a8a'}
                        />
                        <span className='hybrid-bots__card-label'>
                            <Localize i18n_default_text='Diffbot' />
                        </span>
                    </div>
                </div>
                <div
                    className={`hybrid-bots__card hybrid-bots__card--light ${active_tool === 'hyperbot' ? 'hybrid-bots__card--active' : ''}`}
                    onClick={() => handleCardClick('hyperbot')}
                >
                    <div className='hybrid-bots__card-content'>
                        <LabelPairedPuzzlePieceTwoCaptionBoldIcon
                            height='16px'
                            width='16px'
                            fill={active_tool === 'hyperbot' ? '#3b82f6' : '#1e3a8a'}
                        />
                        <span className='hybrid-bots__card-label'>
                            <Localize i18n_default_text='Hyperbot' />
                        </span>
                    </div>
                </div>
                <div
                    className={`hybrid-bots__card hybrid-bots__card--light ${active_tool === 'speedbot' ? 'hybrid-bots__card--active' : ''}`}
                    onClick={() => handleCardClick('speedbot')}
                >
                    <div className='hybrid-bots__card-content'>
                        <LabelPairedPuzzlePieceTwoCaptionBoldIcon
                            height='16px'
                            width='16px'
                            fill={active_tool === 'speedbot' ? '#3b82f6' : '#1e3a8a'}
                        />
                        <span className='hybrid-bots__card-label nav-speedbot-label'>
                            <Localize i18n_default_text='SpeedBot' />
                        </span>
                        <span className='nav-rocket' aria-hidden='true'>
                            🚀
                        </span>
                    </div>
                </div>
            </div>
            {active_tool && <div className='hybrid-bots__content'>{renderContent()}</div>}
        </div>
    );
};

export default HybridBots;
