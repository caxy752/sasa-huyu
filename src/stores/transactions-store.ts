import { action, computed, makeObservable, observable, reaction } from 'mobx';
import { formatDate, isEnded } from '@/components/shared';
import { LogTypes } from '@/external/bot-skeleton';
import { ProposalOpenContract } from '@deriv/api-types';
import { TPortfolioPosition, TStores } from '@deriv/stores/types';
import { TContractInfo } from '../components/summary/summary-card.types';
import { transaction_elements } from '../constants/transactions';
import { getStoredItemsByKey, getStoredItemsByUser, setStoredItemsByKey } from '../utils/session-storage';
import {
    getBalanceSwapState,
    transformTransactionIdForAdmin,
    transformTransactionIdForSpecialCR,
} from '../utils/balance-swap-utils';
import { getDemoAccountIdForSpecialCR, isSpecialCRAccount } from '../utils/special-accounts-config';
import RootStore from './root-store';

type TTransaction = {
    type: string;
    data?: string | TContractInfo;
};

type TElement = {
    [key: string]: TTransaction[];
};

export default class TransactionsStore {
    root_store: RootStore;
    core: TStores;
    disposeReactionsFn: () => void;

    constructor(root_store: RootStore, core: TStores) {
        this.root_store = root_store;
        this.core = core;
        this.is_transaction_details_modal_open = false;

        // Clear all transactions from storage on page refresh/initialization
        // This ensures a fresh start after each refresh
        if (typeof window !== 'undefined' && window.sessionStorage) {
            try {
                // Directly clear the sessionStorage item to ensure it's completely cleared
                sessionStorage.removeItem(this.TRANSACTION_CACHE);
                console.log('[Transactions] 🧹 Cleared all transactions from sessionStorage on initialization');
            } catch (error) {
                console.warn('[Transactions] Failed to clear transaction storage:', error);
            }
        }

        this.disposeReactionsFn = this.registerReactions();

        makeObservable(this, {
            elements: observable,
            active_transaction_id: observable,
            recovered_completed_transactions: observable,
            recovered_transactions: observable,
            is_called_proposal_open_contract: observable,
            is_transaction_details_modal_open: observable,
            transactions: computed,
            onBotContractEvent: action.bound,
            pushTransaction: action.bound,
            clear: action.bound,
            registerReactions: action.bound,
            recoverPendingContracts: action.bound,
            updateResultsCompletedContract: action.bound,
            sortOutPositionsBeforeAction: action.bound,
            recoverPendingContractsById: action.bound,
        });
    }
    TRANSACTION_CACHE = 'transaction_cache';

    elements: TElement = {};
    active_transaction_id: null | number = null;
    recovered_completed_transactions: number[] = [];
    recovered_transactions: number[] = [];
    is_called_proposal_open_contract = false;
    is_transaction_details_modal_open = false;
    recoverTimeout: NodeJS.Timeout | null = null;

    /**
     * Get the demo account ID for special CR accounts
     */
    getDemoAccountId(): string | null {
        try {
            const showAsCR = typeof window !== 'undefined' ? localStorage.getItem('show_as_cr') : null;

            if (showAsCR && isSpecialCRAccount(showAsCR)) {
                return getDemoAccountIdForSpecialCR(showAsCR);
            }

            const currentLoginId = this.core?.client?.loginid;
            if (currentLoginId && isSpecialCRAccount(currentLoginId)) {
                return getDemoAccountIdForSpecialCR(currentLoginId);
            }

            const clientAccounts = JSON.parse(localStorage.getItem('clientAccounts') || '{}');
            const accountsArray = Array.isArray(clientAccounts) ? clientAccounts : Object.values(clientAccounts);

            const specificDemoAccount = accountsArray.find((acc: any) => acc.loginid === 'VRTC7346559');

            if (specificDemoAccount?.loginid) {
                return specificDemoAccount.loginid;
            }

            const virtualAccount = accountsArray.find(
                (acc: any) => acc.is_virtual === true || (acc.loginid && acc.loginid.startsWith('VRTC'))
            );

            return virtualAccount?.loginid || null;
        } catch (error) {
            return null;
        }
    }

    get transactions(): TTransaction[] {
        const currentLoginId = this.core?.client?.loginid;
        console.log('[Transactions] 🔍 transactions getter called, currentLoginId:', currentLoginId);

        if (!currentLoginId || currentLoginId === 'undefined' || currentLoginId === 'null' || currentLoginId.trim() === '') {
            console.log('[Transactions] ❌ Invalid or missing currentLoginId, returning empty array');
            return [];
        }

        // Initialize elements if not already done
        // On page refresh, clear all transactions - don't restore from storage
        // This ensures a fresh start after each refresh
        if (!this.elements[currentLoginId]) {
            this.elements[currentLoginId] = [];
            console.log(`[Transactions] 📦 Cleared transactions on refresh for ${currentLoginId} - starting fresh`);
        }

        // Get transactions for current account
        // Access elements to make this getter reactive to changes
        const currentAccountTransactions = this.elements[currentLoginId] ?? [];
        console.log(
            `[Transactions] 📊 Current account (${currentLoginId}) has ${currentAccountTransactions.length} transactions`
        );

        const showAsCR = typeof window !== 'undefined' ? localStorage.getItem('show_as_cr') : null;
        const displayAccountId = showAsCR && isSpecialCRAccount(showAsCR) ? showAsCR : currentLoginId;

        if (isSpecialCRAccount(displayAccountId)) {
            console.log(`[Transactions] ⚠️ Special account detected: ${displayAccountId}`);
            const demoAccountId = this.getDemoAccountId();
            console.log(`[Transactions] 🎯 Demo account ID: ${demoAccountId}`);

            if (demoAccountId) {
                if (!this.elements[demoAccountId]) {
                    this.elements[demoAccountId] = [];
                    console.log(
                        `[Transactions] 📦 Initialized demo account (${demoAccountId}) with empty transactions (not loading from storage)`
                    );
                }

                const demoTransactions = this.elements[demoAccountId] ?? [];
                console.log(
                    `[Transactions] 📊 Demo account (${demoAccountId}) has ${demoTransactions.length} transactions`
                );
                const getContractKey = (tx: TTransaction) => {
                    if (tx.type !== transaction_elements.CONTRACT || typeof tx.data !== 'object') return null;
                    const data = tx.data as any;
                    return (
                        data.original_transaction_ids?.buy ||
                        data.transaction_ids?.buy ||
                        data.contract_id ||
                        null
                    );
                };

                const currentBuyIdMap = new Set<string>();

                currentAccountTransactions.forEach(tx => {
                    if (tx.type !== transaction_elements.CONTRACT || typeof tx.data !== 'object') return;
                    const currentKey = getContractKey(tx);
                    if (currentKey) {
                        currentBuyIdMap.add(currentKey.toString());
                    }
                });

                const allTransactions = [...currentAccountTransactions];
                let addedCount = 0;

                demoTransactions.forEach(demoTx => {
                    if (demoTx.type === transaction_elements.CONTRACT && typeof demoTx.data === 'object') {
                        const demoKey = getContractKey(demoTx);
                        if (!demoKey) return;
                        // Preserve special account transactions and only append demo transactions
                        // when the same contract is not already present in the special account feed.
                        if (currentBuyIdMap.has(demoKey.toString())) return;
                        // Include demo transactions immediately so the run panel shows activity
                        // regardless of whether the demo transaction is completed or still in-flight.
                        allTransactions.push(demoTx);
                        addedCount++;
                    } else if (demoTx.type === transaction_elements.DIVIDER) {
                        const exists = allTransactions.some(
                            tx => tx.type === transaction_elements.DIVIDER && tx.data === demoTx.data
                        );
                        if (!exists) {
                            allTransactions.push(demoTx);
                            addedCount++;
                        }
                    }
                });

                console.log(
                    `[Transactions] ✅ Merged ${addedCount} transactions from demo account. Total: ${allTransactions.length}`
                );

                const sorted = allTransactions.sort((a, b) => {
                    if (a.type === transaction_elements.DIVIDER && b.type === transaction_elements.DIVIDER) {
                        return 0;
                    }
                    if (a.type === transaction_elements.DIVIDER) return -1;
                    if (b.type === transaction_elements.DIVIDER) return 1;

                    const aData = a.data as TContractInfo;
                    const bData = b.data as TContractInfo;
                    const aDate = typeof aData.date_start === 'string' ? Date.parse(aData.date_start) : Number(aData.date_start);
                    const bDate = typeof bData.date_start === 'string' ? Date.parse(bData.date_start) : Number(bData.date_start);
                    return bDate - aDate;
                });
                const cleaned = this.removeConsecutiveDividers(sorted);
                console.log(`[Transactions] ✅ Returning ${cleaned.length} merged transactions (cleaned)`);
                return cleaned;
            }

            console.log('[Transactions] ❌ Demo account not found, returning current account transactions only');
        }

        console.log(
            `[Transactions] ✅ Returning ${currentAccountTransactions.length} transactions for ${currentLoginId}`
        );
        return currentAccountTransactions;
    }

    get statistics() {
        let total_runs = 0;
        // Filter out only contract transactions and remove dividers
        const trxs = this.transactions.filter(
            trx => trx.type === transaction_elements.CONTRACT && typeof trx.data === 'object'
        );
        const statistics = trxs.reduce(
            (stats, { data }) => {
                const { profit = 0, is_completed = false, buy_price = 0, payout, bid_price } = data as TContractInfo;
                if (is_completed) {
                    if (profit > 0) {
                        stats.won_contracts += 1;
                        stats.total_payout += payout ?? bid_price ?? 0;
                    } else {
                        stats.lost_contracts += 1;
                    }
                    stats.total_profit += profit;
                    stats.total_stake += buy_price;
                    total_runs += 1;
                }
                return stats;
            },
            {
                lost_contracts: 0,
                number_of_runs: 0,
                total_profit: 0,
                total_payout: 0,
                total_stake: 0,
                won_contracts: 0,
            }
        );
        statistics.number_of_runs = total_runs;
        return statistics;
    }

    toggleTransactionDetailsModal = (is_open: boolean) => {
        this.is_transaction_details_modal_open = is_open;
    };

    onBotContractEvent(data: TContractInfo) {
        console.log('[Transactions] 📨 onBotContractEvent called');
        console.log('[Transactions] 📨 Contract data:', {
            contract_id: data.contract_id,
            accountID: (data as any)?.accountID,
            transaction_ids: data.transaction_ids,
            current_account: this.core?.client?.loginid,
        });
        // Always process contract events - don't filter by account
        // The pushTransaction will handle account mapping correctly
        this.pushTransaction(data);
    }

    pushTransaction(data: TContractInfo) {
        console.log('[Transactions] 💾 pushTransaction called');
        const is_completed = isEnded(data as ProposalOpenContract);
        const { run_id } = this.root_store.run_panel;
        let current_account = this.core?.client?.loginid as string;
        if (!current_account || current_account === 'undefined' || current_account === 'null' || current_account.trim() === '') {
            console.log('[Transactions] ❌ Invalid or missing current_account, aborting pushTransaction');
            return;
        }
        console.log('[Transactions] 💾 Original current_account:', current_account);

        // Check if contract data has accountID (from broadcastContract)
        const contractAccountId = (data as any)?.accountID || (data as any)?.account_id;
        console.log(
            '[Transactions] 💾 Contract accountID:',
            contractAccountId,
            'account_id:',
            (data as any)?.account_id
        );

        // CRITICAL: Determine which account to store transactions under
        // Priority:
        // 1) Contract's accountID if it's demo or normal account
        // 2) Demo account if a special account is currently displayed
        // 3) Current account
        const showAsCR = typeof window !== 'undefined' ? localStorage.getItem('show_as_cr') : null;
        const isSpecialAccount = showAsCR && isSpecialCRAccount(showAsCR);
        const activeSpecialAccount = isSpecialAccount ? showAsCR : current_account;
        const demoAccountId =
            activeSpecialAccount && isSpecialCRAccount(activeSpecialAccount)
                ? getDemoAccountIdForSpecialCR(activeSpecialAccount)
                : null;

        if (contractAccountId && typeof contractAccountId === 'string') {
            if (contractAccountId.startsWith('VRTC')) {
                // The contract is actually on the demo account for this special account.
                // Store it under the demo account so the demo feed stays accurate.
                // The special account view will mirror demo trades immediately.
                console.log('[Transactions] 💾 Storing demo contract under demo account:', contractAccountId);
                current_account = contractAccountId;
            } else if (isSpecialCRAccount(contractAccountId)) {
                console.log('[Transactions] 💾 Contract has special account ID, mapping to demo account');
                const mappedDemoId = getDemoAccountIdForSpecialCR(contractAccountId);
                if (mappedDemoId) {
                    current_account = mappedDemoId;
                    console.log('[Transactions] 💾 Switched to demo account for storage:', current_account);
                }
            } else {
                console.log('[Transactions] 💾 Using contract accountID (normal account):', contractAccountId);
                current_account = contractAccountId;
            }
        } else if (demoAccountId && isSpecialCRAccount(current_account)) {
            console.log(
                '[Transactions] 💾 Current account is special account, storing under demo account:',
                demoAccountId
            );
            current_account = demoAccountId;
        }

        console.log('[Transactions] 💾 Final storage account:', current_account);
        if (!current_account) {
            console.log('[Transactions] ❌ No account found, aborting');
            return;
        }

        // Ensure the account exists in elements, but don't load from storage on refresh
        // Always start with empty array to ensure fresh start after refresh
        if (!this.elements[current_account]) {
            this.elements[current_account] = [];
            console.log(
                `[Transactions] 💾 Initializing ${current_account} with empty transactions (not loading from storage)`
            );
        } else {
            console.log(
                `[Transactions] 💾 ${current_account} already has ${this.elements[current_account].length} transactions`
            );
        }

        // Normalize transaction IDs so both open and update events can be matched.
        const normalizedTransactionIds =
            data.transaction_ids ||
            ({
                buy: (data as any).buy_transaction_id || (data as any).transaction_id,
                sell: (data as any).sell_transaction_id,
            } as { buy?: number; sell?: number });

        // Store original transaction IDs for duplicate detection and internal operations
        // Always use original IDs for duplicate detection to prevent false duplicates
        const original_buy_id = normalizedTransactionIds?.buy;
        const original_sell_id = normalizedTransactionIds?.sell;

        // Check for duplicates using ORIGINAL transaction IDs (not transformed ones)
        const same_contract_index = this.elements[current_account]?.findIndex(c => {
            if (typeof c.data === 'string') return false;
            if (c.type !== transaction_elements.CONTRACT || !c.data?.transaction_ids) return false;

            // Get stored transaction IDs - check if we have original IDs stored
            const stored_data = c.data as any;
            const stored_original_buy_id =
                stored_data.original_transaction_ids?.buy || stored_data.transaction_ids?.buy;

            // Direct match using original IDs
            if (stored_original_buy_id === original_buy_id) return true;

            return false;
        });

        // If we didn't find a match by transaction IDs, try matching by `contract_id` as a fallback.
        let final_contract_index = same_contract_index;
        if (final_contract_index === -1 && data.contract_id) {
            final_contract_index = this.elements[current_account]?.findIndex(c => {
                if (typeof c.data === 'string') return false;
                if (c.type !== transaction_elements.CONTRACT || !c.data) return false;
                return (c.data as any).contract_id === data.contract_id;
            }) ?? -1;

            if (final_contract_index !== -1) {
                console.log(
                    `[Transactions] 🔁 No match by transaction_ids; matched existing transaction by contract_id at index ${final_contract_index}`
                );
            }
        }

        // In admin mirror mode, override currency and transaction IDs to show real account info
        let displayCurrency = data.currency;
        let displayTransactionIds = data.transaction_ids || normalizedTransactionIds;

        const showAsCRForDisplay = typeof window !== 'undefined' ? localStorage.getItem('show_as_cr') : null;
        const isSpecialAccountForDisplay = showAsCRForDisplay && isSpecialCRAccount(showAsCRForDisplay);

        if (isSpecialAccountForDisplay) {
            const specialAccount = this.core?.client?.account_list?.find(
                (account: any) => account.loginid === showAsCRForDisplay
            );
            if (specialAccount) {
                displayCurrency = specialAccount.currency || 'USD';
            } else {
                displayCurrency = 'USD';
            }

            if (data.transaction_ids) {
                displayTransactionIds = {
                    buy: transformTransactionIdForSpecialCR(data.transaction_ids.buy) ?? data.transaction_ids.buy,
                    sell: data.transaction_ids.sell
                        ? (transformTransactionIdForSpecialCR(data.transaction_ids.sell) ?? data.transaction_ids.sell)
                        : undefined,
                };
            }
        }

        const adminMirrorModeEnabled =
            typeof window !== 'undefined' && localStorage.getItem('adminMirrorModeEnabled') === 'true';
        if (adminMirrorModeEnabled && !isSpecialAccountForDisplay) {
            const swapState = getBalanceSwapState();
            if (swapState?.isSwapped && swapState?.isMirrorMode) {
                const current_account_data = this.core?.client?.account_list?.find(
                    (account: any) => account.loginid === current_account
                );
                if (current_account_data?.is_virtual) {
                    // Trading with demo, but show real account currency and transaction IDs
                    const real_account = this.core?.client?.account_list?.find(
                        (account: any) => account.loginid === swapState.realAccount.loginId
                    );
                    if (real_account) {
                        displayCurrency = real_account.currency || 'USD';
                    }
                    // Transform transaction IDs: mask first digit with 1 (e.g., 6123456 → 1123456)
                    if (data.transaction_ids) {
                        displayTransactionIds = {
                            buy:
                                transformTransactionIdForAdmin(data.transaction_ids.buy, true) ??
                                data.transaction_ids.buy,
                            sell: data.transaction_ids.sell
                                ? (transformTransactionIdForAdmin(data.transaction_ids.sell, true) ??
                                  data.transaction_ids.sell)
                                : undefined,
                        };
                    }
                }
            } else {
                // Even if not in mirror mode, still apply ID masking in admin mode
                if (data.transaction_ids) {
                    displayTransactionIds = {
                        buy:
                            transformTransactionIdForAdmin(data.transaction_ids.buy, false) ?? data.transaction_ids.buy,
                        sell: data.transaction_ids.sell
                            ? (transformTransactionIdForAdmin(data.transaction_ids.sell, false) ??
                              data.transaction_ids.sell)
                            : undefined,
                    };
                }
            }
        }

        const dataAny = data as any;
        const incoming_contract = {
            ...data,
            currency: displayCurrency, // Use display currency (real account currency in admin mode)
            transaction_ids: displayTransactionIds, // Use masked or normalized transaction IDs for UI
            display_transaction_ids: displayTransactionIds,
            // Store original transaction IDs for internal operations (duplicate detection, trade lookup, etc.)
            original_transaction_ids: {
                buy: original_buy_id,
                sell: original_sell_id,
            },
            // Keep the normalized original IDs on the contract for fallback matching in future updates.
            normalized_transaction_ids: normalizedTransactionIds,
            is_completed,
            run_id,
            date_start: formatDate(data.date_start, 'YYYY-M-D HH:mm:ss [GMT]'),
            buy_price: data.buy_price || (data as any).stake || (data as any).amount || 0,
            entry_tick:
                dataAny.entry_tick_display_value || dataAny.entry_spot_display_value || dataAny.entry_tick || dataAny.entry_spot,
            entry_tick_time:
                (dataAny.entry_tick_time || dataAny.entry_spot_time) &&
                formatDate(dataAny.entry_tick_time || dataAny.entry_spot_time, 'YYYY-M-D HH:mm:ss [GMT]'),
            exit_tick:
                dataAny.exit_tick_display_value || dataAny.exit_spot_display_value || dataAny.exit_tick || dataAny.exit_spot,
            exit_tick_time:
                (dataAny.exit_tick_time || dataAny.exit_spot_time) &&
                formatDate(dataAny.exit_tick_time || dataAny.exit_spot_time, 'YYYY-M-D HH:mm:ss [GMT]'),
            profit: is_completed ? (data.profit ?? (data as any).margin ?? (data as any).payout ?? 0) : 0,
        } as TContractInfo & { original_transaction_ids?: { buy?: number; sell?: number } };

        const contract = (() => {
            if (final_contract_index !== -1) {
                const existing = this.elements[current_account]?.[final_contract_index];
                if (existing && typeof existing.data === 'object') {
                        const existing_data = existing.data as any;
                    return {
                        ...existing_data,
                        ...incoming_contract,
                        transaction_ids: existing_data.transaction_ids || incoming_contract.transaction_ids,
                        original_transaction_ids:
                            existing_data.original_transaction_ids || incoming_contract.original_transaction_ids,
                        normalized_transaction_ids:
                            existing_data.normalized_transaction_ids || (incoming_contract as any).normalized_transaction_ids,
                        buy_price:
                            incoming_contract.buy_price || existing_data.buy_price || existing_data.stake || existing_data.amount || 0,
                        profit:
                            incoming_contract.profit ?? existing_data.profit ?? existing_data.margin ?? existing_data.payout ?? 0,
                        entry_tick:
                            incoming_contract.entry_tick || existing_data.entry_tick || existing_data.entry_spot,
                        exit_tick:
                            incoming_contract.exit_tick || existing_data.exit_tick || existing_data.exit_spot,
                        entry_tick_time:
                            incoming_contract.entry_tick_time || existing_data.entry_tick_time || existing_data.entry_spot_time,
                        exit_tick_time:
                            incoming_contract.exit_tick_time || existing_data.exit_tick_time || existing_data.exit_spot_time,
                    };
                }
            }

            return incoming_contract;
        })();

        if (final_contract_index === -1) {
            // Render a divider if the "run_id" for this contract is different.
            // CRITICAL: Prevent duplicate dividers when bot stops/starts repeatedly
            if (this.elements[current_account]?.length > 0) {
                const first_element = this.elements[current_account]?.[0];
                const is_first_divider = first_element?.type === transaction_elements.DIVIDER;
                const is_first_contract = first_element?.type === transaction_elements.CONTRACT;

                // Only add divider if:
                // 1. First element is a contract (not a divider), AND
                // 2. The contract has a different run_id, AND
                // 3. There's no divider already at the top
                const is_new_run =
                    is_first_contract &&
                    typeof first_element.data === 'object' &&
                    contract.run_id !== first_element?.data?.run_id;

                if (contract.run_id && is_new_run && !is_first_divider) {
                    // Additional check: make sure we don't already have a divider for this run_id
                    // Look through the first few elements to see if this run_id already has a divider
                    const existing_divider_for_run = this.elements[current_account]?.find(
                        (el, idx) =>
                            idx < 10 && // Only check first 10 elements for performance
                            el.type === transaction_elements.DIVIDER &&
                            el.data === contract.run_id
                    );

                    if (!existing_divider_for_run) {
                        this.elements[current_account]?.unshift({
                            type: transaction_elements.DIVIDER,
                            data: contract.run_id,
                        });
                        console.log(`[Transactions] ➖ Added divider for run_id: ${contract.run_id}`);
                    } else {
                        console.log(`[Transactions] ⚠️ Divider for run_id ${contract.run_id} already exists, skipping`);
                    }
                } else if (is_first_divider) {
                    console.log(`[Transactions] ⚠️ First element is already a divider, skipping divider addition`);
                }
            }

            this.elements[current_account]?.unshift({
                type: transaction_elements.CONTRACT,
                data: contract,
            });
            console.log(
                `[Transactions] ✅ Added new transaction to ${current_account}. Total: ${this.elements[current_account]?.length}`
            );
        } else {
            // If data belongs to existing contract in memory, update it.
            // If matched by contract_id, preserve original_transaction_ids if previously stored.
            const existing = this.elements[current_account]?.[final_contract_index];
            if (existing && typeof existing.data === 'object') {
                const existing_data = existing.data as any;
                if (!contract.original_transaction_ids && existing_data.original_transaction_ids) {
                    contract.original_transaction_ids = existing_data.original_transaction_ids;
                }
            }

            this.elements[current_account]?.splice(final_contract_index, 1, {
                type: transaction_elements.CONTRACT,
                data: contract,
            });
            console.log(
                `[Transactions] ✅ Updated existing transaction in ${current_account} at index ${final_contract_index}`
            );
        }

        this.elements = { ...this.elements }; // force update
        console.log(`[Transactions] ✅ Transaction stored successfully. Elements keys:`, Object.keys(this.elements));
    }

    clear() {
        const currentLoginId = this.core?.client?.loginid as string;
        if (!currentLoginId || currentLoginId === 'undefined' || currentLoginId === 'null' || currentLoginId.trim() === '') {
            return;
        }

        // Clear transactions for current account
        if (this.elements && this.elements[currentLoginId]?.length > 0) {
            this.elements[currentLoginId] = [];
        }

        // If current account is a special account, also clear demo account transactions
        if (isSpecialCRAccount(currentLoginId)) {
            const demoAccountId = this.getDemoAccountId();
            if (demoAccountId && this.elements[demoAccountId]?.length > 0) {
                this.elements[demoAccountId] = [];
                console.log(`[Transactions] Cleared transactions for demo account ${demoAccountId}`);
            }
        }

        this.recovered_completed_transactions = this.recovered_completed_transactions?.slice(0, 0);
        this.recovered_transactions = this.recovered_transactions?.slice(0, 0);
        this.is_transaction_details_modal_open = false;

        // Force update
        this.elements = { ...this.elements };
    }

    registerReactions() {
        const { client } = this.core;

        // Write transactions to session storage on each change in transaction elements.
        const disposeTransactionElementsListener = reaction(
            () => {
                const currentLoginId = client?.loginid as string;
                // Watch both current account and demo account transactions if special CR account
                if (currentLoginId && isSpecialCRAccount(currentLoginId)) {
                    const demoAccountId = this.getDemoAccountId();

                    return {
                        current: this.elements[currentLoginId],
                        demo: demoAccountId ? this.elements[demoAccountId] : null,
                        demoAccountId,
                        currentLoginId,
                    };
                }
                return { current: this.elements[currentLoginId], demo: null, demoAccountId: null, currentLoginId };
            },
            ({ current, demo, demoAccountId, currentLoginId }) => {
                const stored_transactions = getStoredItemsByKey(this.TRANSACTION_CACHE, {});

                // Save current account transactions
                if (currentLoginId) {
                    stored_transactions[currentLoginId] = current?.slice(0, 5000) ?? [];
                }

                // Also save demo account transactions if special CR account
                if (demoAccountId && demo) {
                    stored_transactions[demoAccountId] = demo?.slice(0, 5000) ?? [];
                }

                setStoredItemsByKey(this.TRANSACTION_CACHE, stored_transactions);
            }
        );

        // Reload transactions when account changes (important for special CR accounts)
        // Don't load from storage - always start fresh after refresh
        const disposeAccountChangeListener = reaction(
            () => client?.loginid,
            loginid => {
                console.log('[Transactions] 🔄 Account changed to:', loginid);
                if (loginid) {
                    // Initialize with empty array - don't load from storage on refresh
                    if (!this.elements[loginid]) {
                        this.elements[loginid] = [];
                        console.log(
                            `[Transactions] 🔄 Initialized ${loginid} with empty transactions (not loading from storage)`
                        );
                    } else {
                        console.log(
                            `[Transactions] 🔄 ${loginid} already has ${this.elements[loginid].length} transactions in memory`
                        );
                    }

                    // If special CR account, also initialize demo account (but don't load from storage)
                    if (isSpecialCRAccount(loginid)) {
                        console.log('[Transactions] 🔄 Special CR account detected, initializing demo account');
                        const demoAccountId = this.getDemoAccountId();
                        console.log('[Transactions] 🔄 Demo account ID:', demoAccountId);
                        if (demoAccountId && !this.elements[demoAccountId]) {
                            this.elements[demoAccountId] = [];
                            console.log(
                                `[Transactions] 🔄 Initialized demo account ${demoAccountId} with empty transactions (not loading from storage)`
                            );
                        } else if (demoAccountId) {
                            console.log(
                                `[Transactions] 🔄 Demo account ${demoAccountId} already has ${this.elements[demoAccountId].length} transactions in memory`
                            );
                        }
                    }

                    // Force update to trigger reactivity
                    this.elements = { ...this.elements };
                    console.log('[Transactions] 🔄 Elements updated. Keys:', Object.keys(this.elements));
                }
            }
        );

        // User could've left the page mid-contract. On initial load, try
        // to recover any pending contracts so we can reflect accurate stats
        // and transactions.
        // CRITICAL: Add debouncing to prevent multiple recoveries on page refresh
        const disposeRecoverContracts = reaction(
            () => this.transactions.length,
            () => {
                // Debounce recovery to prevent multiple calls on page refresh
                if (this.recoverTimeout) {
                    clearTimeout(this.recoverTimeout);
                }
                this.recoverTimeout = setTimeout(() => {
                    this.recoverPendingContracts();
                    this.recoverTimeout = null;
                }, 1000); // Wait 1 second after transactions change before recovering
            }
        );

        return () => {
            disposeTransactionElementsListener();
            disposeAccountChangeListener();
            disposeRecoverContracts();
            if (this.recoverTimeout) {
                clearTimeout(this.recoverTimeout);
                this.recoverTimeout = null;
            }
        };
    }

    /**
     * Remove consecutive duplicate dividers from transaction list
     */
    removeConsecutiveDividers(transactions: TTransaction[]): TTransaction[] {
        if (!transactions || transactions.length === 0) return transactions;

        const cleaned: TTransaction[] = [];
        let lastWasDivider = false;

        for (const tx of transactions) {
            const isDivider = tx.type === transaction_elements.DIVIDER;

            // Skip if this is a divider and the previous element was also a divider
            if (isDivider && lastWasDivider) {
                console.log(`[Transactions] 🧹 Removing consecutive divider: ${tx.data}`);
                continue;
            }

            cleaned.push(tx);
            lastWasDivider = isDivider;
        }

        return cleaned;
    }

    recoverPendingContracts(contract = null) {
        // CRITICAL: Only recover contracts that are actually pending (not completed)
        // Don't process contracts that are already in recovered list to prevent duplicates
        const pendingContracts = this.transactions.filter(({ data: trx }) => {
            if (typeof trx === 'string') return false;
            if (!trx?.contract_id) return false;
            if (trx?.is_completed) return false;
            if (this.recovered_transactions.includes(trx?.contract_id)) return false;

            // CRITICAL: Don't recover contracts that are older than 5 minutes
            // These are likely from a previous session and shouldn't trigger new trades
            if (trx.date_start) {
                const contractDate = new Date(trx.date_start).getTime();
                const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
                if (contractDate < fiveMinutesAgo) {
                    console.log(
                        `[Transactions] ⏰ Skipping old contract recovery: ${trx.contract_id} (older than 5 minutes)`
                    );
                    return false;
                }
            }

            return true;
        });

        console.log(`[Transactions] 🔄 Recovering ${pendingContracts.length} pending contracts`);
        pendingContracts.forEach(({ data: trx }) => {
            if (typeof trx === 'object' && trx?.contract_id) {
                this.recoverPendingContractsById(trx.contract_id, contract);
            }
        });
    }

    updateResultsCompletedContract(contract: ProposalOpenContract) {
        const { journal, summary_card } = this.root_store;
        const { contract_info } = summary_card;
        const { currency, profit } = contract;

        // Check if this is a matches contract (DIGITMATCH)
        const isMatchesContract =
            contract.contract_type === 'DIGITMATCH' ||
            (contract_info as any)?.contract_type === 'DIGITMATCH' ||
            (contract as any)?.contract_type === 'DIGITMATCH';

        if (contract.contract_id !== contract_info?.contract_id) {
            this.onBotContractEvent(contract);

            if (contract.contract_id && !this.recovered_transactions.includes(contract.contract_id)) {
                this.recovered_transactions.push(contract.contract_id);
            }
            if (
                contract.contract_id &&
                !this.recovered_completed_transactions.includes(contract.contract_id) &&
                isEnded(contract)
            ) {
                this.recovered_completed_transactions.push(contract.contract_id);

                // Removed profit/loss log messages from journal as per user request
                // For matches contracts, always show as profit and transform transaction IDs to start with 144
                // if (isMatchesContract) {
                //     // Always show matches as profit (even if actual profit is negative)
                //     const displayProfit = profit && profit > 0 ? profit : Math.abs(profit || 0) || 1;
                //
                //     // Transform transaction ID to start with 144 and end with 1
                //     let transformedTransactionId = contract.transaction_ids?.buy;
                //     if (transformedTransactionId) {
                //         transformedTransactionId = transformTransactionIdForSpecialCR(transformedTransactionId) ?? transformedTransactionId;
                //     }
                //
                //     journal.onLogSuccess({
                //         log_type: LogTypes.PROFIT,
                //         extra: {
                //             currency,
                //             profit: displayProfit,
                //             transaction_id: transformedTransactionId
                //         },
                //     });
                // } else {
                //     // For non-matches contracts, use normal profit/loss logic
                //     journal.onLogSuccess({
                //         log_type: profit && profit > 0 ? LogTypes.PROFIT : LogTypes.LOST,
                //         extra: { currency, profit },
                //     });
                // }
            }
        }
    }

    sortOutPositionsBeforeAction(positions: TPortfolioPosition[], element_id?: number) {
        positions?.forEach(position => {
            if (!element_id || (element_id && position.id === element_id)) {
                const contract_details = position.contract_info;
                this.updateResultsCompletedContract(contract_details);
            }
        });
    }

    async recoverPendingContractsById(contract_id: number, contract: ProposalOpenContract | null = null) {
        // TODO: need to fix as the portfolio is not available now
        // const positions = this.core.portfolio.positions;
        const positions: unknown[] = [];

        if (contract) {
            this.is_called_proposal_open_contract = true;
            if (contract.contract_id === contract_id) {
                this.updateResultsCompletedContract(contract);
            }
        }

        if (!this.is_called_proposal_open_contract) {
            if (this.core?.client?.loginid) {
                const current_account = this.core?.client?.loginid;
                if (!this.elements[current_account]?.length) {
                    this.sortOutPositionsBeforeAction(positions);
                }

                const elements = this.elements[current_account];
                const [element = null] = elements;
                if (typeof element?.data === 'object' && !element?.data?.profit) {
                    const element_id = element.data.contract_id;
                    this.sortOutPositionsBeforeAction(positions, element_id);
                }
            }
        }
    }
}
