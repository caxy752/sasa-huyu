import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import Button from '@/components/shared_ui/button';
import Text from '@/components/shared_ui/text';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { getXmlUploadsManifest, fetchXmlWithCache } from '@/utils/freebots-cache';
import './free-bots.scss';

interface BotData {
    name: string;
    description: string;
    difficulty: string;
    strategy: string;
    features: string[];
    xml: string;
}

interface ManifestItem {
    name: string;
    file: string;
    basePath?: string;
}

const DEFAULT_FEATURES = ['Automated Trading', 'Risk Management', 'Profit Optimization'];

const FreeBots = observer(() => {
    const { dashboard, app } = useStore();
    const { active_tab, setActiveTab, setPendingFreeBot } = dashboard;
    const [defaultBots, setDefaultBots] = useState<BotData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Bot descriptions mapping
    const getBotDescription = (botName: string): string => {
        const descriptions: { [key: string]: string } = {
            'OVER DESTROYER':
                'Professional Over trading bot with R32 recovery strategy. Optimized for high win rates with intelligent recovery mechanisms and risk management.',
            'OVER DESTRYER 2 PRO BOT':
                'Advanced Over bot featuring R43 recovery system. Designed for consistent profits with sophisticated entry points and recovery strategies.',
            'EVEN ODD SPEEDY':
                'Premium Even Odd Speedy trading bot with multi-strategy approach. Combines technical analysis with automated execution for maximum profitability.',
            'OVER UNDER PRO BOT':
                'High-performance Over Under trading bot with blast strategy. Optimized for rapid execution and high-probability trades in Under markets.',
            'UNDER DESTROYER PRO BOT':
                'Professional Under Destroyer Pro trading bot with R56 recovery mechanism. Features intelligent risk management and recovery strategies for consistent returns.',
            'UNDER DESTROYER':
                'Advanced Under Destroyer trading bot with R67 recovery system. Designed for optimal performance with sophisticated pattern recognition and recovery.',
        };

        // Try exact match first
        if (descriptions[botName]) {
            return descriptions[botName];
        }

        // Try partial matches
        for (const key in descriptions) {
            if (botName.includes(key) || key.includes(botName)) {
                return descriptions[key];
            }
        }

        return `Advanced trading bot: ${botName}. Features automated trading, risk management, and profit optimization.`;
    };

    // Show selected bots from public/xml (explicit curated list)
    const getXmlFiles = () => {
        return [
            'EVEN ODD SPEEDY.xml',
            'OVER UNDER PRO BOT.xml',
            'OVER DESTROYER.xml',
            'OVER DESTRYER 2 PRO BOT.xml',
            'UNDER DESTROYER.xml',
            'UNDER DESTROYER PRO BOT.xml',
        ];
    };

    const visibleBots = defaultBots;

    // Wait for workspace to be available
    const waitForWorkspace = (maxAttempts = 10, delay = 500) => {
        return new Promise((resolve, reject) => {
            let attempts = 0;

            const checkWorkspace = () => {
                attempts++;
                if (window.Blockly?.derivWorkspace) {
                    console.log('Workspace is ready!');
                    resolve(window.Blockly.derivWorkspace);
                } else if (attempts >= maxAttempts) {
                    reject(new Error('Workspace not available after maximum attempts'));
                } else {
                    console.log(`Waiting for workspace... attempt ${attempts}/${maxAttempts}`);
                    setTimeout(checkWorkspace, delay);
                }
            };

            checkWorkspace();
        });
    };

    // Load bot into builder
    const loadBotIntoBuilder = async (bot: BotData) => {
        try {
            if (bot.xml) {
                console.log('Loading bot:', bot.name);
                console.log('Blockly workspace available:', !!window.Blockly?.derivWorkspace);

                // Flag the selected bot for the Bot Builder to load after navigation
                setPendingFreeBot({ name: bot.name, xml: bot.xml });

                // Navigate to Bot Builder; loading will be handled when workspace is ready
                setActiveTab(DBOT_TABS.BOT_BUILDER);

                console.log('Navigating to Bot Builder to load bot:', bot.name);
            }
        } catch (error) {
            console.error('Error loading bot:', error);
        }
    };

    // Load bots with instant UI and progressive loading (no blocking spinner)
    useEffect(() => {
        const loadBots = async () => {
            setError(null);

            const curatedManifest: ManifestItem[] = getXmlFiles().map(file => ({
                name: file.replace('.xml', ''),
                file,
                basePath: '/xml/',
            }));

            const xmlUploadsManifest = (await getXmlUploadsManifest()) || [];
            const combinedManifest: ManifestItem[] = [...curatedManifest, ...xmlUploadsManifest];

            // Immediately render skeleton cards for the current manifest
            const initialSkeleton: BotData[] = combinedManifest.map(item => {
                const botName = (item.name || item.file.replace('.xml', '')).replace(/[_-]/g, ' ');
                return {
                    name: botName,
                    description: getBotDescription(botName),
                    difficulty: 'Intermediate',
                    strategy: 'Multi-Strategy',
                    features: DEFAULT_FEATURES,
                    xml: '',
                };
            });
            setDefaultBots(initialSkeleton);
            setIsLoading(false); // hide "Loading free bots..." right away

            try {
                const skeletonBots = initialSkeleton;
                const loadedBots: BotData[] = [];

                for (let i = 0; i < combinedManifest.length; i++) {
                    const item = combinedManifest[i];
                    try {
                        const xml = await fetchXmlWithCache(item.file, item.basePath);
                        if (xml) {
                            const botName = (item.name || item.file.replace('.xml', '')).replace(/[_-]/g, ' ');
                            loadedBots.push({
                                name: botName,
                                description: getBotDescription(botName),
                                difficulty: 'Intermediate',
                                strategy: 'Multi-Strategy',
                                features: DEFAULT_FEATURES,
                                xml,
                            });
                            setDefaultBots([...loadedBots, ...skeletonBots.slice(loadedBots.length)]);
                        }
                    } catch (err) {
                        console.warn(`Failed to load ${item.file}:`, err);
                    }
                }
            } catch (error) {
                console.error('Error loading bots:', error);
                setError('Failed to load bots. Please try again.');
            }
        };

        loadBots();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className='free-bots'>
            <div className='free-bots__container'>
                {isLoading ? (
                    <div className='free-bots__loading'>
                        <Text size='s' color='general'>
                            {localize('Loading free bots...')}
                        </Text>
                    </div>
                ) : error ? (
                    <div className='free-bots__error'>
                        <Text size='s' color='general'>
                            {error}
                        </Text>
                        <div style={{ marginTop: '20px' }}>
                            <Button onClick={() => window.location.reload()}>{localize('Retry')}</Button>
                        </div>
                    </div>
                ) : visibleBots.length === 0 ? (
                    <div className='free-bots__empty'>
                        <Text size='s' color='general'>
                            {localize('No bots available at the moment.')}
                        </Text>
                    </div>
                ) : (
                    <div className='free-bots__grid'>
                        {visibleBots.map((bot, index) => (
                            <div key={index} className='free-bot-card'>
                                <div className='free-bot-card__header'>
                                    <Text size='s' weight='bold' className='free-bot-card__title'>
                                        {bot.name}
                                    </Text>

                                    {/* Star Rating */}
                                    <div className='free-bot-card__rating'>
                                        <span className='star'>★</span>
                                        <span className='star'>★</span>
                                        <span className='star'>★</span>
                                        <span className='star'>★</span>
                                        <span className='star'>★</span>
                                    </div>

                                    {/* Bot Description */}
                                    <Text size='xs' className='free-bot-card__description'>
                                        {bot.description?.length > 68
                                            ? `${bot.description.slice(0, 65).trim()}...`
                                            : bot.description}
                                    </Text>
                                </div>

                                <Button
                                    className='free-bot-card__load-btn'
                                    onClick={() => loadBotIntoBuilder(bot)}
                                    primary
                                    has_effect
                                    type='button'
                                    disabled={!bot.xml} // Disable if XML not loaded yet
                                >
                                    {bot.xml ? 'LOAD PREMIUM BOT' : 'LOADING...'}
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
});

export default FreeBots;
