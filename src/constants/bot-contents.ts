type TTabsTitle = {
    [key: string]: string | number;
};

type TDashboardTabIndex = {
    [key: string]: number;
};

export const tabs_title: TTabsTitle = Object.freeze({
    WORKSPACE: 'Workspace',
    CHART: 'Chart',
});

export const DBOT_TABS: TDashboardTabIndex = Object.freeze({
    DASHBOARD: 0,
    MATCHES: 1,
    BOT_BUILDER: 2,
    CHART: 3,
    TRADING_BOTS: 4,
    ANALYSIS_TOOL: 5,
    STRATEGIES: 6,
    COPY_TRADING: 7,
    DTRADER: 8,
    TRADINGVIEW: 9,
    MANUAL_TRADING: 10,
    SPEEDBOT: 12,
    // SCANNER shares the ANALYSIS_TOOL index so scanner.tsx visibility check passes
    // when embedded as the Signals sub-tab inside Analysis Tool.
    SCANNER: 5,
    // Keep TUTORIAL as a non-active sentinel to avoid index mismatches in legacy checks
    TUTORIAL: 999,
    // Legacy tabs - kept for backward compatibility but redirect to TRADING_BOTS
    HYBRID_BOTS: 4,
    FREE_BOTS: 4,
    HYPERBOT: 4,
    DIFFBOT: 4,
    DCIRCLES: 5,
    DP_TOOLS: 5,
    // Legacy SMART_TRADER redirects to STRATEGIES
    SMART_TRADER: 6,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-dbot-dashboard',
    'id-matches',
    'id-bot-builder',
    'id-charts',
    'id-trading-bots',
    'id-analysis-tool',
    'id-strategies',
    'id-copy-trading',
    'id-dtrader',
    'id-tradingview',
    'id-manual-trading',
    'id-speedbot',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
