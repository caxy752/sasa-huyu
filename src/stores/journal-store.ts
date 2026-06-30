import { action, computed, makeObservable, observable, reaction, when } from 'mobx';
import { v4 as uuidv4 } from 'uuid';
import { formatDate } from '@/components/shared';
import { LogTypes, MessageTypes } from '@/external/bot-skeleton';
import { config } from '@/external/bot-skeleton/constants/config';
import { localize } from '@deriv-com/translations';
import { isCustomJournalMessage } from '../utils/journal-notifications';
import { getStoredItemsByKey, getStoredItemsByUser, setStoredItemsByKey } from '../utils/session-storage';
import { getSetting, storeSetting } from '../utils/settings';
import {
    getBalanceSwapState,
    transformTransactionIdForAdmin,
    transformTransactionIdForSpecialCR,
} from '../utils/balance-swap-utils';
import { isSpecialCRAccount } from '../utils/special-accounts-config';
import { TAccountList } from './client-store';
import RootStore from './root-store';

type TExtra = {
    current_currency?: string;
    currency?: string;
    profit?: number;
    transaction_id?: number;
    longcode?: string;
};

type TlogSuccess = {
    log_type: string;
    extra: TExtra;
};

type TMessage = {
    message: string | Error;
    message_type: string;
    className?: string;
};

type TMessageItem = {
    date?: string;
    time?: string;
    unique_id: string;
    extra: TExtra;
} & TMessage;

type TNotifyData = {
    sound: string;
    block_id?: string;
    variable_name?: string;
} & TMessage;

export interface IJournalStore {
    is_filter_dialog_visible: boolean;
    journal_filters: string[];
    filters: { id: string; label: string }[];
    unfiltered_messages: TMessageItem[];
    toggleFilterDialog: () => void;
    onLogSuccess: (message: TlogSuccess) => void;
    onError: (message: Error | string) => void;
    onNotify: (data: TNotifyData) => void;
    pushMessage: (message: string, message_type: string, className: string, extra?: TExtra) => void;
    filtered_messages: TMessageItem[];
    getServerTime: () => Date;
    playAudio: (sound: string) => void;
    checked_filters: string[];
    filterMessage: (checked: boolean, item_id: string) => void;
    clear: () => void;
    registerReactions: () => void;
    restoreStoredJournals: () => void;
}

export default class JournalStore {
    root_store: RootStore;
    core: RootStore['core'];
    disposeReactionsFn: () => void;
    constructor(root_store: RootStore, core: RootStore['core']) {
        makeObservable(this, {
            is_filter_dialog_visible: observable,
            journal_filters: observable.shallow,
            filters: observable.shallow,
            unfiltered_messages: observable.shallow,
            toggleFilterDialog: action.bound,
            onLogSuccess: action.bound,
            onError: action.bound,
            onNotify: action.bound,
            pushMessage: action.bound,
            filtered_messages: computed,
            getServerTime: action.bound,
            playAudio: action.bound,
            checked_filters: computed,
            filterMessage: action.bound,
            clear: action.bound,
            registerReactions: action.bound,
            restoreStoredJournals: action.bound,
        });

        this.root_store = root_store;
        this.core = core;
        this.disposeReactionsFn = this.registerReactions();
        this.restoreStoredJournals();
    }

    JOURNAL_CACHE = 'journal_cache';

    is_filter_dialog_visible = false;

    filters = [
        { id: MessageTypes.ERROR, label: localize('Errors') },
        { id: MessageTypes.NOTIFY, label: localize('Notifications') },
        { id: MessageTypes.SUCCESS, label: localize('System') },
    ];
    journal_filters: string[] = [];
    unfiltered_messages: TMessageItem[] = [];

    getDemoAccountId(): string | null {
        try {
            const clientAccounts = JSON.parse(localStorage.getItem('clientAccounts') || '{}');

            // clientAccounts can be either an object with loginid keys or an array
            const accountsArray = Array.isArray(clientAccounts) ? clientAccounts : Object.values(clientAccounts);

            // Check if CR6779123 is active - use VRTC10109979 demo account
            const showAsCR = typeof window !== 'undefined' ? localStorage.getItem('show_as_cr') : null;
            if (showAsCR === 'CR6779123') {
                const crDemoAccount = accountsArray.find((acc: any) => acc.loginid === 'VRTC10109979');
                if (crDemoAccount?.loginid) {
                    return crDemoAccount.loginid;
                }
            }

            // Try to find VRTC7346559 specifically first (for other accounts)
            const specificDemoAccount = accountsArray.find((acc: any) => acc.loginid === 'VRTC7346559');

            if (specificDemoAccount?.loginid) {
                return specificDemoAccount.loginid;
            }

            // Fallback: find any virtual account
            const virtualAccount = accountsArray.find(
                (acc: any) => acc.is_virtual === true || (acc.loginid && acc.loginid.startsWith('VRTC'))
            );

            return virtualAccount?.loginid || null;
        } catch (error) {
            return null;
        }
    }

    restoreStoredJournals() {
        console.log('[Journal] 🔍 restoreStoredJournals called');
        const client = this.core.client as RootStore['client'];
        const { loginid } = client;
        console.log('[Journal] 🔍 Current loginid:', loginid);
        this.journal_filters = getSetting('journal_filter') ?? this.filters.map(filter => filter.id);

        // On page refresh, clear all journal messages - don't restore from storage
        // This ensures a fresh start after each refresh
        this.unfiltered_messages = [];
        console.log(`[Journal] ✅ Cleared journal messages on refresh - starting fresh`);
    }

    getServerTime() {
        return this.core?.common.server_time.get();
    }

    playAudio = (sound: string) => {
        if (sound !== config().lists.NOTIFICATION_SOUND[0][1]) {
            const audio = document.getElementById(sound) as HTMLAudioElement;
            // Check if audio element exists before trying to play
            if (audio && typeof audio.play === 'function') {
                audio.play().catch(error => {
                    // Silently handle audio play errors (e.g., user interaction required, audio not loaded)
                    console.warn('[Journal] Audio play failed:', error);
                });
            } else {
                console.warn('[Journal] Audio element not found or play method not available:', sound);
            }
        }
    };

    toggleFilterDialog() {
        this.is_filter_dialog_visible = !this.is_filter_dialog_visible;
    }

    onLogSuccess(message: TlogSuccess) {
        const { log_type, extra } = message;
        this.pushMessage(log_type, MessageTypes.SUCCESS, '', extra);
    }

    onError(message: Error | string) {
        this.pushMessage(message, MessageTypes.ERROR);
    }

    onNotify(data: TNotifyData) {
        const { run_panel, dbot } = this.root_store;
        const { message, className, message_type, sound, block_id, variable_name } = data;

        if (
            isCustomJournalMessage(
                { message, block_id, variable_name },
                run_panel.showErrorMessage,
                () => dbot.centerAndHighlightBlock(block_id as string, true),
                (parsed_message: string) =>
                    this.pushMessage(parsed_message, message_type || MessageTypes.NOTIFY, className)
            )
        ) {
            this.playAudio(sound);
            return;
        }
        this.pushMessage(message, message_type || MessageTypes.NOTIFY, className);
        this.playAudio(sound);
    }

    pushMessage(
        message: Error | string,
        message_type: string,
        className?: string,
        extra: {
            current_currency?: string;
            currency?: string;
            transaction_id?: number;
            longcode?: string;
            profit?: number;
        } = {}
    ) {
        console.log('[Journal] 💾 pushMessage called:', { message, message_type });
        const { client } = this.core;
        let { loginid, account_list } = client as RootStore['client'];
        console.log('[Journal] 💾 Original loginid:', loginid);

        // CRITICAL: Determine storage and display loginids separately
        // For display: use the account being displayed (special CR if show_as_cr is set, otherwise actual loginid)
        // For storage: use the account where message should be stored (special CR for CR messages, demo for demo messages)
        const showAsCR = typeof window !== 'undefined' ? localStorage.getItem('show_as_cr') : null;
        const isSpecialCR = showAsCR === 'CR6779123';

        // Display loginid: what the user sees (special CR if active, otherwise actual loginid)
        const displayLoginId = isSpecialCR && showAsCR ? showAsCR : loginid;

        // Storage loginid: where to store the message
        // For special CR: store under special CR account (independent from demo)
        // For demo: store under demo loginid
        // For trades: they execute on demo, but we want to show them under special CR if CR is displayed
        let storageLoginId = loginid;
        if (isSpecialCR && showAsCR) {
            // If special CR is displayed, store messages under special CR account (not demo)
            // This keeps messages independent between demo and special CR account
            storageLoginId = showAsCR;
            console.log('[Journal] 💾 Special CR displayed - storing under CR6779123 for independence');
        }

        console.log('[Journal] 💾 Storage loginid:', storageLoginId, 'Display loginid:', displayLoginId);
        if (storageLoginId) {
            // Use displayLoginId to find account for display purposes (currency, etc.)
            // This ensures we show the correct account info (CR6779123 or demo) based on what's displayed
            const current_account = account_list?.find(
                account => account?.loginid === displayLoginId || account?.loginid === storageLoginId
            );
            const adminMirrorModeEnabled =
                typeof window !== 'undefined' && localStorage.getItem('adminMirrorModeEnabled') === 'true';

            if (adminMirrorModeEnabled && current_account?.is_virtual) {
                // In admin mirror mode, show real account info instead of "Demo"
                const swapState = getBalanceSwapState();
                if (swapState?.isSwapped && swapState?.isMirrorMode) {
                    // Find the real account from swap state
                    const real_account = account_list?.find(
                        account => account?.loginid === swapState.realAccount.loginId
                    );
                    if (real_account) {
                        extra.current_currency = real_account.currency || 'USD';
                        // Use real account currency for profit/loss messages too
                        if (message === LogTypes.PROFIT || message === LogTypes.LOST) {
                            extra.currency = real_account.currency || 'USD';
                        }
                        // Transform transaction ID for PURCHASE messages: convert demo IDs (5xxxx) to real IDs (1xxxx)
                        if (message === LogTypes.PURCHASE && extra.transaction_id) {
                            extra.transaction_id =
                                transformTransactionIdForAdmin(extra.transaction_id, true) ?? extra.transaction_id;
                        }
                    } else {
                        extra.current_currency = 'USD'; // Fallback to USD
                        if (message === LogTypes.PROFIT || message === LogTypes.LOST) {
                            extra.currency = 'USD';
                        }
                        // Transform transaction ID even if real account not found
                        if (message === LogTypes.PURCHASE && extra.transaction_id) {
                            extra.transaction_id =
                                transformTransactionIdForAdmin(extra.transaction_id, true) ?? extra.transaction_id;
                        }
                    }
                } else {
                    extra.current_currency = current_account?.is_virtual ? 'Demo' : current_account?.currency;
                }
            } else {
                // For special CR accounts, show USD account info instead of Demo
                // This ensures journal shows "You are using your USD account" when special CR is displayed
                if (isSpecialCR && showAsCR) {
                    // Find the special CR account to get its currency
                    const crAccount = account_list?.find(account => account?.loginid === showAsCR);
                    if (crAccount) {
                        extra.current_currency = crAccount.currency || 'USD';
                        if (message === LogTypes.PROFIT || message === LogTypes.LOST) {
                            extra.currency = crAccount.currency || 'USD';
                        }
                    } else {
                        // Fallback to USD if account not found
                        extra.current_currency = 'USD';
                        if (message === LogTypes.PROFIT || message === LogTypes.LOST) {
                            extra.currency = 'USD';
                        }
                    }
                } else {
                    extra.current_currency = current_account?.is_virtual ? 'Demo' : current_account?.currency;
                }

                // For special CR account, transform transaction IDs to start with 144 AND end with 1
                if (isSpecialCR && showAsCR && message === LogTypes.PURCHASE && extra.transaction_id) {
                    // Store original ID before transformation
                    const original_transaction_id = extra.transaction_id;
                    // Transform to masked display ID (starts with 144 AND ends with 1) for UI
                    extra.transaction_id =
                        transformTransactionIdForSpecialCR(extra.transaction_id) ?? extra.transaction_id;
                    // Store original ID in extra for potential internal use
                    (extra as any).original_transaction_id = original_transaction_id;
                } else if (adminMirrorModeEnabled && message === LogTypes.PURCHASE && extra.transaction_id) {
                    // In admin mode, mask transaction ID first digit with 1 (e.g., 6123456 → 1123456) for journal display
                    // The original transaction ID is still used internally for trade lookup and operations
                    const original_transaction_id = extra.transaction_id;
                    // Transform to masked display ID (first digit = 1) for UI
                    extra.transaction_id =
                        transformTransactionIdForAdmin(extra.transaction_id, current_account?.is_virtual ?? false) ??
                        extra.transaction_id;
                    // Store original ID in extra for potential internal use (though journal mainly uses display)
                    (extra as any).original_transaction_id = original_transaction_id;
                }
            }
        } else {
            // When loginid is not set, still check if we're on matches tab for WELCOME message
            if (message === LogTypes.WELCOME) {
                const { dashboard } = this.root_store;
                const isOnMatchesTab = dashboard?.active_tab === 3; // DBOT_TABS.TRADING_BOTS = 3 (includes MATCHES)
                if (isOnMatchesTab) {
                    extra.current_currency = 'USD';
                }
            } else {
                return;
            }
        }

        const date = formatDate(this.getServerTime());
        const time = formatDate(this.getServerTime(), 'HH:mm:ss [GMT]');
        const unique_id = uuidv4();

        // Add message to unfiltered_messages (will be saved to storage by reaction)
        // Messages are stored independently for demo and CR6779123
        this.unfiltered_messages.unshift({ date, time, message, message_type, className, unique_id, extra });
        this.unfiltered_messages = this.unfiltered_messages.slice(); // force array update
        console.log(
            `[Journal] ✅ Message added. Storage: ${storageLoginId}, Display: ${displayLoginId}, Total messages: ${this.unfiltered_messages.length}`
        );
    }

    get filtered_messages() {
        return (
            this.unfiltered_messages
                // filter messages based on filtered-checkbox
                .filter(
                    message =>
                        this.journal_filters.length &&
                        this.journal_filters.some(filter => message.message_type === filter)
                )
        );
    }

    get checked_filters() {
        return this.journal_filters.filter(filter => filter != null);
    }

    filterMessage(checked: boolean, item_id: string) {
        if (checked) {
            this.journal_filters.push(item_id);
        } else {
            this.journal_filters.splice(this.journal_filters.indexOf(item_id), 1);
        }

        storeSetting('journal_filter', this.journal_filters);
    }

    clear() {
        const client = this.core.client as RootStore['client'];
        const { loginid } = client;

        // Clear messages for current account
        this.unfiltered_messages = [];

        // If current account is a special CR account, also clear demo account messages from storage
        if (isSpecialCRAccount(loginid)) {
            const demoAccountId = this.getDemoAccountId();
            if (demoAccountId) {
                const stored_journals = getStoredItemsByKey(this.JOURNAL_CACHE, {});
                stored_journals[demoAccountId] = [];
                setStoredItemsByKey(this.JOURNAL_CACHE, stored_journals);
            }
        }
    }

    registerReactions() {
        const client = this.core.client as RootStore['client'];

        // Write journal messages to session storage on each change in unfiltered messages.
        const disposeWriteJournalMessageListener = reaction(
            () => this.unfiltered_messages,
            unfiltered_messages => {
                console.log('[Journal] 💾 Saving journals to storage. Messages count:', unfiltered_messages.length);
                const stored_journals = getStoredItemsByKey(this.JOURNAL_CACHE, {});
                const currentLoginId = client?.loginid as string;
                console.log('[Journal] 💾 Current loginid:', currentLoginId);

                // CRITICAL: Determine which account to save under based on what's displayed
                // If show_as_cr is set, save under CR6779123 (independent from demo)
                // Otherwise, save under the actual loginid
                const showAsCR = typeof window !== 'undefined' ? localStorage.getItem('show_as_cr') : null;
                const isSpecialCR = showAsCR === 'CR6779123';

                let saveAccountId = currentLoginId;
                if (isSpecialCR && showAsCR) {
                    // If special CR is displayed, save messages under CR6779123 (independent from demo)
                    saveAccountId = showAsCR;
                    console.log('[Journal] 💾 Special CR displayed - saving under CR6779123 for independence');
                } else if (currentLoginId && isSpecialCRAccount(currentLoginId)) {
                    // If loginid is CR6779123 directly, save under it
                    saveAccountId = currentLoginId;
                    console.log('[Journal] 💾 Saving under CR6779123');
                } else {
                    // Normal account - save under actual loginid
                    saveAccountId = currentLoginId;
                    console.log('[Journal] 💾 Saving under normal account:', saveAccountId);
                }

                // Save messages under the correct account
                if (saveAccountId) {
                    stored_journals[saveAccountId] = unfiltered_messages?.slice(0, 5000) ?? [];
                    console.log(
                        `[Journal] ✅ Saved ${stored_journals[saveAccountId].length} messages under ${saveAccountId}`
                    );
                } else {
                    console.log('[Journal] ❌ No saveAccountId, not saving');
                }

                setStoredItemsByKey(this.JOURNAL_CACHE, stored_journals);
            }
        );

        // Attempt to load cached journal messages on client loginid change.
        const disposeJournalMessageListener = reaction(
            () => client?.loginid,
            async loginid => {
                console.log('[Journal] 🔄 Account changed to:', loginid);
                await when(() => {
                    const has_account = client.account_list?.find(
                        (account: TAccountList[number]) => account.loginid === loginid
                    );
                    return !!has_account;
                });

                console.log('[Journal] 🔄 Account ready, restoring journals');
                // CRITICAL: Determine which account's journals to restore
                // If show_as_cr is set, we're displaying CR6779123 but should load its own journals (not demo)
                const showAsCR = typeof window !== 'undefined' ? localStorage.getItem('show_as_cr') : null;
                const isSpecialCR = showAsCR === 'CR6779123';

                // For special CR, temporarily set loginid to CR6779123 to load its journals
                // Then restore it back for storage purposes
                const originalLoginId = client.loginid;
                if (isSpecialCR && showAsCR) {
                    // Temporarily set to CR6779123 to load its journals
                    (client as any).loginid = showAsCR;
                }

                // Restore journals for the account we're displaying
                this.restoreStoredJournals();

                // Restore original loginid for storage
                if (isSpecialCR && showAsCR) {
                    (client as any).loginid = originalLoginId;
                }

                if (this.unfiltered_messages.length === 0) {
                    console.log('[Journal] 🔄 No messages, showing welcome');
                    this.pushMessage(LogTypes.WELCOME, MessageTypes.SUCCESS, 'journal__text');
                } else if (this.unfiltered_messages.length > 0) {
                    console.log('[Journal] 🔄 Messages found, showing welcome back');
                    this.pushMessage(LogTypes.WELCOME_BACK, MessageTypes.SUCCESS, 'journal__text');
                }
            },
            { fireImmediately: true } // For initial welcome message
        );

        return () => {
            disposeWriteJournalMessageListener();
            disposeJournalMessageListener();
        };
    }
}
