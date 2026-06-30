import { useMemo } from 'react';
import { CurrencyIcon } from '@/components/currency/currency-icon';
import { addComma, getDecimalPlaces } from '@/components/shared';
import { useApiBase } from '@/hooks/useApiBase';
import { getAccountDisplayInfo, getBalanceSwapState } from '@/utils/balance-swap-utils';
import { Balance } from '@deriv/api-types';
import { localize } from '@deriv-com/translations';

/** A custom hook that returns the account object for the current active account. */
const useActiveAccount = ({ allBalanceData }: { allBalanceData: Balance | null }) => {
    const { accountList, activeLoginid } = useApiBase();

    // Check if show_as_cr flag is set - if so, we want to display CR6779123 instead of demo
    const showAsCR = typeof window !== 'undefined' ? localStorage.getItem('show_as_cr') : null;

    // Determine which loginid to use for finding the active account
    // If show_as_cr is set, use CR6779123 for display, otherwise use activeLoginid from API
    const displayLoginId = showAsCR || activeLoginid;

    const activeAccount = useMemo(() => {
        // If show_as_cr is set, find CR6779123 account, otherwise find by activeLoginid
        if (showAsCR) {
            const crAccount = accountList?.find(account => account.loginid === showAsCR);
            if (crAccount) {
                console.log('[useActiveAccount] 🎯 Using CR account for display:', showAsCR);
                return crAccount;
            }
        }
        return accountList?.find(account => account.loginid === activeLoginid);
    }, [activeLoginid, accountList, showAsCR]);

    // For balance lookup, use CR6779123 if show_as_cr is set, otherwise use activeAccount loginid
    // Note: The balance for CR6779123 should already be calculated in setAllAccountsBalance
    const activeAccountLoginId = activeAccount?.loginid || activeAccount?.account_id;
    const balanceLookupLoginId = showAsCR || activeAccountLoginId;
    const isValidLoginId = !!(
        balanceLookupLoginId &&
        balanceLookupLoginId !== 'undefined' &&
        balanceLookupLoginId !== 'null' &&
        balanceLookupLoginId.trim() !== ''
    );
    const currentBalanceData = (allBalanceData && isValidLoginId) ? allBalanceData.accounts?.[balanceLookupLoginId] : undefined;

    console.log('[useActiveAccount] Balance lookup diagnostics:', {
        showAsCR,
        balanceLookupLoginId,
        activeAccountLoginId,
        isValidLoginId,
        hasAllBalanceData: !!allBalanceData,
        hasBalanceData: !!currentBalanceData,
        balance: currentBalanceData?.balance,
    });

    const modifiedAccount = useMemo(() => {
        if (!activeAccount) return undefined;

        // Get balance from allBalanceData (most accurate source)
        const originalBalanceNum = currentBalanceData?.balance ?? 0;
        const originalBalance = originalBalanceNum.toString();

        // Create account data object with balance for getAccountDisplayInfo
        const accountDataWithBalance = {
            ...activeAccount,
            balance: originalBalance,
            is_virtual: activeAccount.is_virtual,
        };

        // Get swapped/mirrored balance if swap is active
        // Pass allBalanceData to get live demo balance for mirroring
        // Pass true for isActiveAccount since this is the active account
        const accountDisplay = getAccountDisplayInfo(
            activeAccount.loginid,
            accountDataWithBalance,
            allBalanceData,
            true
        );

        // Get the display balance - if swapped, use swapped balance, otherwise use original
        let displayBalance: number;
        if (accountDisplay.isSwapped && accountDisplay.balance) {
            // Balance is swapped - convert from string to number
            displayBalance =
                typeof accountDisplay.balance === 'string'
                    ? parseFloat(accountDisplay.balance) || 0
                    : accountDisplay.balance || 0;
        } else {
            // No swap - use original balance from allBalanceData
            displayBalance = originalBalanceNum;
        }

        // Check if we're using demo account but displaying as real account (admin mode)
        const adminRealAccountUsingDemo =
            typeof window !== 'undefined' && localStorage.getItem('adminRealAccountUsingDemo') === 'true';
        const adminRealAccountDisplayLoginId =
            typeof window !== 'undefined' ? localStorage.getItem('adminRealAccountDisplayLoginId') : null;

        // Check if mirror mode is active - if so, show real account flag when using demo
        const adminMirrorModeEnabled =
            typeof window !== 'undefined' && localStorage.getItem('adminMirrorModeEnabled') === 'true';
        const swapState = getBalanceSwapState();

        // TEMPORARILY DISABLED: Admin mirror mode - showing real flags for now
        // TODO: Re-enable admin mirror mode later
        const ADMIN_MIRROR_MODE_DISABLED = true;

        const isMirrorModeActive =
            adminMirrorModeEnabled && swapState?.isSwapped && swapState?.isMirrorMode && !ADMIN_MIRROR_MODE_DISABLED;
        const isViewingDemo = Boolean(activeAccount?.is_virtual);

        // If using demo account but displaying as real account, show real flag
        const displayIsVirtual =
            !ADMIN_MIRROR_MODE_DISABLED && adminRealAccountUsingDemo
                ? false // Show real flag when using demo but displaying as real
                : !ADMIN_MIRROR_MODE_DISABLED && isMirrorModeActive && isViewingDemo
                  ? false // Show real flag (US flag) even when viewing demo in mirror mode
                  : Boolean(activeAccount?.is_virtual);

        // Get the real account currency for the flag if displaying as real
        let displayCurrency = activeAccount?.currency?.toLowerCase();
        let displayCurrencyLabel = displayIsVirtual ? localize('Demo') : activeAccount?.currency;

        if (adminRealAccountUsingDemo && adminRealAccountDisplayLoginId) {
            // Find the real account we're displaying as
            const realAccount = accountList?.find(acc => acc.loginid === adminRealAccountDisplayLoginId);
            if (realAccount) {
                displayCurrency = realAccount.currency?.toLowerCase();
                displayCurrencyLabel = realAccount.currency; // Show real currency (e.g., USD)
            }
        } else if (isMirrorModeActive && isViewingDemo && swapState?.realAccount?.loginId) {
            // Find the real account to get its currency for the flag and label
            const realAccount = accountList?.find(acc => acc.loginid === swapState.realAccount.loginId);
            if (realAccount) {
                displayCurrency = realAccount.currency?.toLowerCase();
                displayCurrencyLabel = realAccount.currency; // Show real currency (e.g., USD) instead of "Demo"
            }
        }

        // For isActive check, if show_as_cr is set, consider it active if the account matches
        const isActive = showAsCR ? activeAccount?.loginid === showAsCR : activeAccount?.loginid === activeLoginid;

        return {
            ...activeAccount,
            balance: addComma(displayBalance?.toFixed(getDecimalPlaces(currentBalanceData?.currency || 'USD'))) ?? '0',
            currencyLabel: displayCurrencyLabel,
            icon: <CurrencyIcon currency={displayCurrency} isVirtual={displayIsVirtual} />,
            isVirtual: displayIsVirtual,
            isActive: isActive,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeAccount, activeLoginid, allBalanceData, accountList]);

    return {
        /** User's current active account. */
        data: modifiedAccount,
    };
};

export default useActiveAccount;
