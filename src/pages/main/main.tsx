import React, { lazy, Suspense, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useLocation, useNavigate } from 'react-router-dom';
import ChunkLoader from '@/components/loader/chunk-loader';
import DesktopWrapper from '@/components/shared_ui/desktop-wrapper';
import MobileWrapper from '@/components/shared_ui/mobile-wrapper';
import Tabs from '@/components/shared_ui/tabs/tabs';
import TradingViewModal from '@/components/trading-view-chart/trading-view-modal';
import { DBOT_TABS } from '@/constants/bot-contents';
import { api_base } from '@/external/bot-skeleton';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import useTMB from '@/hooks/useTMB';
import {
    LabelPairedChartLineCaptionRegularIcon,
    LabelPairedObjectsColumnCaptionRegularIcon,
    LabelPairedPuzzlePieceTwoCaptionBoldIcon,
    LabelPairedPlayCaptionBoldIcon,
} from '@deriv/quill-icons/LabelPaired';
import { LegacyChartsIcon, LegacyIndicatorsIcon } from '@deriv/quill-icons/Legacy';
import { Localize, localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import RunPanel from '../../components/run-panel';
import SpeedBotFloatingStop from '../../components/speedbot-floating-stop';
import ChartModal from '../chart/chart-modal';
import Dashboard from '../dashboard';
import RunStrategy from '../dashboard/run-strategy';
import OverUnder from '../OverUnder';
import MakotiMagic from '../MakotiMagic';
import MakotiMagicStore from '@/stores/makoti-magic-store';
import './main.scss';

const ChartWrapper = lazy(() => import('../chart/chart-wrapper'));
const TradingView = lazy(() => import('../tradingview'));
const AnalysisTools = lazy(() => import('../analysis-tool'));
const CopyTrading = lazy(() => import('../copy-trading'));
const Strategies = lazy(() => import('../free-bots/strategies'));
const Dtrader = lazy(() => import('../dtrader'));
const Overlord = lazy(() => import('../customizations/SignalTools/Overlord'));
const ElitePrimeAI = lazy(() => import('../customizations/SignalTools/ElitePremium'));
const SignalZone = lazy(() => import('../customizations/SignalTools/CustomDash'));
const SmartTrader = lazy(() => import('../customizations/standalones/SmartTrader'));

import TradingBots from '../free-bots/trading-bots';
import { MakotiWidget } from '@/components/makoti-widget/makoti-widget';
import BlocklyIOSPrompt from '@/components/blockly-ios-prompt/blockly-ios-prompt';

const FULL_PAGE_TABS = [
    'strategies', 'makoti_magic', 'trading_bots', 'dtrader',
    'copy_trading', 'tradingview', 'overlord_2026', 'elite_prime_ai',
    'signal_zone', 'smart_trader',
];

const AppWrapper = observer(() => {
    const { connectionStatus } = useApiBase();
    const { dashboard, run_panel, quick_strategy, summary_card } = useStore();
    const {
        active_tab,
        active_tour,
        setActiveTab,
        setWebSocketState,
        setTourDialogVisibility,
        setPendingFreeBot,
    } = dashboard;
    const { stopBot } = run_panel;
    const { is_open } = quick_strategy;
    const { clear } = summary_card;
    const { DASHBOARD } = DBOT_TABS;
    const init_render = React.useRef(true);
    const pendingXmlRef = useRef<string | null>(null);

    const hash = [
        'dashboard',      // 0
        'bot_builder',    // 1
        'chart',          // 2
        'trading_bots',   // 3
        'over_under',     // 4
        'makoti_magic',   // 5
        'analysis_tool',  // 6
        'strategies',     // 7
        'copy_trading',   // 8
        'dtrader',        // 9
        'tradingview',    // 10
        'overlord_2026',  // 11
        'elite_prime_ai', // 12
        'signal_zone',    // 13
        'smart_trader',   // 14
    ];

    const { isDesktop } = useDevice();
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        MakotiMagicStore.setBotLoadCallback((xmlContent: string) => {
            setPendingFreeBot({ name: 'Makoti Magic Bot', xml: xmlContent });
        });
    }, [setPendingFreeBot]);

    const GetHashedValue = (tab: number) => {
        const tab_val = location.hash?.split('#')[1];
        if (!tab_val) return tab;
        return Number(hash.indexOf(String(tab_val)));
    };
    const active_hash_tab = GetHashedValue(active_tab);
    const { onRenderTMBCheck, isTmbEnabled } = useTMB();

    useEffect(() => {
        if (connectionStatus !== CONNECTION_STATUS.OPENED) {
            const is_bot_running = document.getElementById('db-animation__stop-button') !== null;
            if (is_bot_running) {
                clear();
                stopBot();
                api_base.setIsRunning(false);
                setWebSocketState(false);
            }
        }
    }, [clear, connectionStatus, setWebSocketState, stopBot]);

    useEffect(() => {
        if (is_open) setTourDialogVisibility(false);

        if (init_render.current) {
            const tabToSet = location.hash ? Number(active_hash_tab) : 1;
            setActiveTab(tabToSet);
            init_render.current = false;
        } else {
            navigate(`#${hash[active_tab] || 'bot_builder'}`);
        }
    }, [active_tab]);

    const handleTabChange = (tab_index: number) => {
        setActiveTab(tab_index);
    };

    const currentHash = hash[active_tab] || '';
    const isFullPageTab = FULL_PAGE_TABS.includes(currentHash);

    return (
        <React.Fragment>
            <div className='main' data-active-tab={currentHash}>
                <div className={classNames('main__container', { 'main__container--active': active_tour && active_tab === DASHBOARD && !isDesktop })}>
                    <Tabs active_index={active_tab} className='main__tabs' onTabItemClick={handleTabChange} top is_scrollable>
                        {/* 0 – Dashboard */}
                        <div label={<><LabelPairedObjectsColumnCaptionRegularIcon height='24px' width='24px' /><Localize i18n_default_text='Dashboard' /></>} id='id-dbot-dashboard'>
                            <Dashboard handleTabChange={handleTabChange} />
                        </div>
                        {/* 1 – Bot Builder */}
                        <div label={<><LabelPairedPuzzlePieceTwoCaptionBoldIcon height='24px' width='24px' /><Localize i18n_default_text='Bot Builder' /></>} id='id-bot-builder' />
                        {/* 2 – Charts */}
                        <div label={<><LabelPairedChartLineCaptionRegularIcon height='24px' width='24px' /><Localize i18n_default_text='Charts' /></>} id='id-charts'>
                            <Suspense fallback={<ChunkLoader message={localize('Please wait, loading chart...')} />}><ChartWrapper show_digits_stats={false} /></Suspense>
                        </div>
                        {/* 3 – Trading Bots */}
                        <div label={<><LabelPairedPuzzlePieceTwoCaptionBoldIcon height='24px' width='24px' /><Localize i18n_default_text='Trading Bots' /></>} id='id-trading-bots'>
                            <TradingBots />
                        </div>
                        {/* 4 – Over/Under */}
                        <div label={<><LabelPairedPlayCaptionBoldIcon height='24px' width='24px' /><Localize i18n_default_text='Over/Under' /></>} id='over_under'>
                            <OverUnder />
                        </div>
                        {/* 5 – Makoti Magic */}
                        <div label={<><LabelPairedPlayCaptionBoldIcon height='24px' width='24px' /><Localize i18n_default_text='Makoti Magic' /></>} id='makoti_magic'>
                            <MakotiMagic />
                        </div>
                        {/* 6 – Analysis Tool */}
                        <div label={<><LegacyIndicatorsIcon height='16px' width='16px' /><Localize i18n_default_text='Analysis Tool' /></>} id='id-analysis-tool'>
                            <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Analysis Tool...')} />}><AnalysisTools /></Suspense>
                        </div>
                        {/* 7 – Strategies */}
                        <div label={<><LabelPairedPuzzlePieceTwoCaptionBoldIcon height='24px' width='24px' /><Localize i18n_default_text='Strategies' /></>} id='id-strategies'>
                            <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Strategies...')} />}><Strategies /></Suspense>
                        </div>
                        {/* 8 – Copy Trading */}
                        <div label={<><LabelPairedObjectsColumnCaptionRegularIcon height='24px' width='24px' /><Localize i18n_default_text='Copy Trading' /></>} id='id-copy-trading'>
                            <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Copy Trading...')} />}><CopyTrading /></Suspense>
                        </div>
                        {/* 9 – DTrader */}
                        <div label={<><LabelPairedChartLineCaptionRegularIcon height='24px' width='24px' /><Localize i18n_default_text='DTrader' /></>} id='id-dtrader'>
                            <Suspense fallback={<ChunkLoader message={localize('Please wait, loading DTrader...')} />}><Dtrader /></Suspense>
                        </div>
                        {/* 10 – TradingView */}
                        <div label={<><LegacyChartsIcon height='16px' width='16px' /><Localize i18n_default_text='TradingView' /></>} id='id-tradingview'>
                            <Suspense fallback={<ChunkLoader message={localize('Please wait, loading TradingView...')} />}><TradingView /></Suspense>
                        </div>
                        {/* 11 – Overlord-2026 */}
                        <div label={<><span style={{ fontSize: '16px', lineHeight: 1 }}>⚔️</span><Localize i18n_default_text='Overlord-2026' /></>} id='id-overlord'>
                            <Suspense fallback={<ChunkLoader message={localize('Loading Overlord-2026...')} />}><Overlord /></Suspense>
                        </div>
                        {/* 12 – Elite Prime AI */}
                        <div label={<><span style={{ fontSize: '16px', lineHeight: 1 }}>🤖</span><Localize i18n_default_text='Elite Prime AI' /></>} id='id-elite-prime-ai'>
                            <Suspense fallback={<ChunkLoader message={localize('Loading Elite Prime AI...')} />}><ElitePrimeAI /></Suspense>
                        </div>
                        {/* 13 – Signal Zone */}
                        <div label={<><span style={{ fontSize: '16px', lineHeight: 1 }}>📡</span><Localize i18n_default_text='Signal Zone' /></>} id='id-signal-zone'>
                            <Suspense fallback={<ChunkLoader message={localize('Loading Signal Zone...')} />}><SignalZone /></Suspense>
                        </div>
                        {/* 14 – Smart Trader */}
                        <div label={<><span style={{ fontSize: '16px', lineHeight: 1 }}>💹</span><Localize i18n_default_text='Smart Trader' /></>} id='id-smart-trader'>
                            <Suspense fallback={<ChunkLoader message={localize('Loading Smart Trader...')} />}><SmartTrader /></Suspense>
                        </div>
                    </Tabs>
                </div>
            </div>
            <DesktopWrapper>
                {!isFullPageTab && (
                    <div className='main__run-strategy-wrapper'>
                        {currentHash !== 'over_under' && <RunStrategy />}
                        <RunPanel />
                    </div>
                )}
                <ChartModal /><TradingViewModal />
            </DesktopWrapper>
            <MobileWrapper>{!is_open && !isFullPageTab && <RunPanel />}</MobileWrapper>
            <SpeedBotFloatingStop />
            {currentHash === 'bot_builder' && <MakotiWidget />}
            <BlocklyIOSPrompt />
        </React.Fragment>
    );
});

export default AppWrapper;
