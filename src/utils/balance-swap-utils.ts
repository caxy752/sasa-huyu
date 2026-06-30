/**
 * Utility functions for handling balance swapping and visual flags
 */

export interface SwapState {
    isSwapped: boolean;
    isMirrorMode: boolean; // New: Mirror mode where real shows demo balance
    demoAccount: {
        loginId: string;
        originalBalance: string;
        swappedBalance: string;
        flag: string;
    };
    realAccount: {
        loginId: string;
        originalBalance: string;
        swappedBalance: string;
        flag: string;
    };
    swapTimestamp: number;
}

/**
 * Get the current balance swap state from localStorage
 */
export const getBalanceSwapState = (): SwapState | null => {
    try {
        const swapState = localStorage.getItem('balanceSwapState');
        return swapState ? JSON.parse(swapState) : null;
    } catch (error) {
        console.error('Error reading balance swap state:', error);
        return null;
    }
};

/**
 * Check if balances are currently swapped
 */
export const isBalanceSwapped = (): boolean => {
    const swapState = getBalanceSwapState();
    return swapState?.isSwapped || false;
};

/**
 * Get the display balance for an account (considering swap state)
 */
export const getDisplayBalance = (loginId: string, originalBalance: string): string => {
    const swapState = getBalanceSwapState();

    if (!swapState?.isSwapped) {
        return originalBalance;
    }

    // Check if this account is involved in the swap
    if (loginId === swapState.demoAccount.loginId) {
        return swapState.demoAccount.swappedBalance;
    } else if (loginId === swapState.realAccount.loginId) {
        return swapState.realAccount.swappedBalance;
    }

    return originalBalance;
};

/**
 * Get the display flag for an account (considering swap state)
 */
export const getDisplayFlag = (loginId: string, originalFlag: string): string => {
    const swapState = getBalanceSwapState();

    if (!swapState?.isSwapped) {
        return originalFlag;
    }

    // Check if this account is involved in the swap
    if (loginId === swapState.demoAccount.loginId) {
        return swapState.demoAccount.flag; // Keep original flag (demo) - flags don't shift
    } else if (loginId === swapState.realAccount.loginId) {
        return swapState.realAccount.flag; // Keep original flag (real) - flags don't shift
    }

    return originalFlag;
};

/**
 * Get account display info with swapped/mirrored values
 * @param loginId - The account login ID
 * @param accountData - The account data object (should include balance)
 * @param allAccountsBalance - Optional: All accounts balance object to get live demo balance for mirroring
 * @param isActiveAccount - Optional: Whether this is the currently active account (affects demo display)
 */
export const getAccountDisplayInfo = (
    loginId: string,
    accountData: any,
    allAccountsBalance?: any,
    isActiveAccount?: boolean
) => {
    const swapState = getBalanceSwapState();

    // Only apply mirror/swap if admin has enabled it
    const adminMirrorModeEnabled =
        typeof window !== 'undefined' && localStorage.getItem('adminMirrorModeEnabled') === 'true';

    // TEMPORARILY DISABLED: Admin mirror mode - showing real balances for now
    // TODO: Re-enable admin mirror mode later
    const ADMIN_MIRROR_MODE_DISABLED = true;

    if (!swapState?.isSwapped || !adminMirrorModeEnabled || ADMIN_MIRROR_MODE_DISABLED) {
        return {
            balance: accountData.balance,
            flag: accountData.is_virtual ? 'demo' : 'real',
            isSwapped: false,
            isMirrorMode: false,
        };
    }

    // Mirror mode: Demo shows reflected balance maintaining stake proportions
    if (swapState.isMirrorMode) {
        if (loginId === swapState.demoAccount.loginId) {
            // Demo account: show reflected balance ONLY when it's the active account on top
            // In account switcher dropdown, show full balance
            if (isActiveAccount) {
                // Active demo: Show reflected balance with proportional changes
                // Store reflected starting point in localStorage for consistency
                let currentDemoBalance = accountData.balance;
                if (allAccountsBalance?.accounts?.[swapState.demoAccount.loginId]?.balance !== undefined) {
                    currentDemoBalance = allAccountsBalance.accounts[swapState.demoAccount.loginId].balance.toString();
                }

                const currentDemoBalanceNum = parseFloat(currentDemoBalance) || 0;
                const storedOriginalBalance = parseFloat(swapState.demoAccount.originalBalance) || 0;

                // Get or set the reflected starting balance (demo balance - shared amount)
                const reflectedStartKey = `reflectedStart_${swapState.demoAccount.loginId}`;
                const sharedAmountKey = `sharedAmount_${swapState.demoAccount.loginId}`;
                let reflectedStartBalance = parseFloat(localStorage.getItem(reflectedStartKey) || '0');
                let sharedAmount = parseFloat(localStorage.getItem(sharedAmountKey) || '0');

                if (!reflectedStartBalance || reflectedStartBalance === 0 || !sharedAmount || sharedAmount === 0) {
                    // First time or reset - calculate shared amount (15% of demo) and reflected balance
                    sharedAmount = storedOriginalBalance * 0.15;
                    reflectedStartBalance = storedOriginalBalance - sharedAmount;
                    localStorage.setItem(sharedAmountKey, sharedAmount.toFixed(2));
                    localStorage.setItem(reflectedStartKey, reflectedStartBalance.toFixed(2));
                    localStorage.setItem(
                        `demoBalanceRef_${swapState.demoAccount.loginId}`,
                        storedOriginalBalance.toString()
                    );
                }

                // Get the reference demo balance (when admin mode started)
                const refDemoBalance = parseFloat(
                    localStorage.getItem(`demoBalanceRef_${swapState.demoAccount.loginId}`) ||
                        storedOriginalBalance.toString()
                );

                // Calculate the change since admin mode started
                const balanceChange = currentDemoBalanceNum - refDemoBalance;

                // Reflected balance = starting reflected + all changes (1:1)
                const reflectedDisplayBalance = (reflectedStartBalance + balanceChange).toFixed(2);

                return {
                    balance: reflectedDisplayBalance, // Demo shows reflected balance with 1:1 changes
                    flag: 'demo',
                    isSwapped: true,
                    isMirrorMode: true,
                    originalBalance: swapState.demoAccount.originalBalance,
                    isVirtual: true,
                };
            } else {
                // In dropdown: show full demo balance
                return {
                    balance: accountData.balance, // Demo shows full balance in dropdown
                    flag: 'demo',
                    isSwapped: false,
                    isMirrorMode: true,
                    originalBalance: swapState.demoAccount.originalBalance,
                    isVirtual: true,
                };
            }
        } else if (loginId === swapState.realAccount.loginId) {
            // Real account ALWAYS shows shared amount (15% of demo balance)
            // Get LIVE demo balance from allAccountsBalance if available, otherwise use stored
            let demoBalance = swapState.demoAccount.originalBalance || accountData.balance;
            if (allAccountsBalance?.accounts?.[swapState.demoAccount.loginId]?.balance !== undefined) {
                // Use live demo balance from all_accounts_balance
                demoBalance = allAccountsBalance.accounts[swapState.demoAccount.loginId].balance.toString();
            } else if (swapState.demoAccount.swappedBalance) {
                // Use stored demo balance from swap state
                demoBalance = swapState.demoAccount.swappedBalance;
            }

            const demoBalanceNum = parseFloat(demoBalance) || 0;

            // Get shared amount from localStorage (15% of demo balance)
            const sharedAmountKey = `sharedAmount_${swapState.demoAccount.loginId}`;
            let sharedAmount = parseFloat(localStorage.getItem(sharedAmountKey) || '0');

            // If shared amount not found, calculate it (15% of current demo balance)
            if (!sharedAmount || sharedAmount === 0) {
                sharedAmount = demoBalanceNum * 0.15;
                localStorage.setItem(sharedAmountKey, sharedAmount.toFixed(2));
            }

            const mirroredDisplayBalance = sharedAmount.toFixed(2);
            return {
                balance: mirroredDisplayBalance, // Real shows shared amount (15% of demo balance)
                flag: 'real',
                isSwapped: true,
                isMirrorMode: true,
                originalBalance: swapState.realAccount.originalBalance,
                isVirtual: false,
            };
        } else {
            // Check if this is demo account being used as real account (admin mode)
            const adminRealAccountUsingDemo =
                typeof window !== 'undefined' && localStorage.getItem('adminRealAccountUsingDemo') === 'true';
            const adminRealAccountDisplayLoginId =
                typeof window !== 'undefined' ? localStorage.getItem('adminRealAccountDisplayLoginId') : null;

            if (
                adminRealAccountUsingDemo &&
                loginId === swapState.demoAccount.loginId &&
                adminRealAccountDisplayLoginId === swapState.realAccount.loginId
            ) {
                // Demo account is being used but displayed as real account - show shared amount
                let demoBalance = accountData.balance;
                if (allAccountsBalance?.accounts?.[loginId]?.balance !== undefined) {
                    demoBalance = allAccountsBalance.accounts[loginId].balance.toString();
                }

                const demoBalanceNum = parseFloat(demoBalance) || 0;
                const sharedAmountKey = `sharedAmount_${loginId}`;
                let sharedAmount = parseFloat(localStorage.getItem(sharedAmountKey) || '0');

                if (!sharedAmount || sharedAmount === 0) {
                    sharedAmount = demoBalanceNum * 0.15;
                    localStorage.setItem(sharedAmountKey, sharedAmount.toFixed(2));
                }

                return {
                    balance: sharedAmount.toFixed(2), // Show shared amount (15% of demo)
                    flag: 'real', // Show real flag
                    isSwapped: true,
                    isMirrorMode: true,
                    originalBalance: demoBalance,
                    isVirtual: false, // Display as real
                };
            }
        }
    }

    // Legacy swap mode (for backward compatibility)
    if (loginId === swapState.demoAccount.loginId) {
        return {
            balance: swapState.demoAccount.swappedBalance,
            flag: 'demo',
            isSwapped: true,
            isMirrorMode: false,
            originalBalance: swapState.demoAccount.originalBalance,
            isVirtual: true,
        };
    } else if (loginId === swapState.realAccount.loginId) {
        return {
            balance: swapState.realAccount.swappedBalance,
            flag: 'real',
            isSwapped: true,
            isMirrorMode: false,
            originalBalance: swapState.realAccount.originalBalance,
            isVirtual: false,
        };
    }

    return {
        balance: accountData.balance,
        flag: accountData.is_virtual ? 'demo' : 'real',
        isSwapped: false,
        isMirrorMode: false,
    };
};

/**
 * Reset balance swap state
 */
export const resetBalanceSwap = () => {
    try {
        const swapState = getBalanceSwapState();

        localStorage.removeItem('balanceSwapState');
        localStorage.removeItem('adminMirrorModeEnabled');

        // Clean up reflected balance references
        if (swapState?.demoAccount?.loginId) {
            localStorage.removeItem(`reflectedStart_${swapState.demoAccount.loginId}`);
            localStorage.removeItem(`demoBalanceRef_${swapState.demoAccount.loginId}`);
            localStorage.removeItem(`sharedAmount_${swapState.demoAccount.loginId}`);
        }

        // Reset client accounts to original state
        const clientAccounts = JSON.parse(localStorage.getItem('clientAccounts') || '{}');
        const resetAccounts = { ...clientAccounts };

        // Remove swap metadata
        Object.keys(resetAccounts).forEach(loginId => {
            if (resetAccounts[loginId]._is_swapped) {
                delete resetAccounts[loginId]._swapped_balance;
                delete resetAccounts[loginId]._original_flag;
                delete resetAccounts[loginId]._display_flag;
                delete resetAccounts[loginId]._is_swapped;
            }
        });

        localStorage.setItem('clientAccounts', JSON.stringify(resetAccounts));
        console.log('Balance swap state reset');
    } catch (error) {
        console.error('Error resetting balance swap:', error);
    }
};

/**
 * Transform transaction ID for special CR account (CR6779123)
 * Transaction IDs should start with 144 (first 3 digits) AND end with 1
 * Example: 5123456 → 1443451 (preserves length: 144 + middle + 1)
 * This is ONLY for CR6779123, not other accounts
 * @param transactionId - The transaction ID to transform
 * @returns Transformed transaction ID
 */
export const transformTransactionIdForSpecialCR = (transactionId: number | string | undefined): number | undefined => {
    if (!transactionId) return undefined;

    const idStr = transactionId.toString();
    const originalLength = idStr.length;

    // If ID is too short, pad it to at least 7 digits first
    if (originalLength < 7) {
        const paddedId = idStr.padStart(7, '0');
        return transformTransactionIdForSpecialCR(parseInt(paddedId));
    }

    // Calculate how many middle digits we need
    // Format: 144 (3 digits) + middle (N digits) + 1 (1 digit) = originalLength
    // So: middle length = originalLength - 4
    const middleLength = originalLength - 4;

    // Extract middle digits from original (skip first digit, take middleLength digits)
    // For 5123456 (7 digits): skip "5", take next 3 digits "123"
    const middleDigits = idStr.substring(1, 1 + middleLength);

    // If we need more digits, pad with zeros from the remaining original digits
    // For 5123456: we have "123", need 3, so we're good
    // If original was shorter, pad with zeros
    const paddedMiddle = middleDigits.padEnd(middleLength, '0');

    // Build: 144 + middle + 1
    const transformedId = '144' + paddedMiddle + '1';

    return parseInt(transformedId);
};

/**
 * Transform transaction ID for admin mirror mode
 * Demo transaction IDs start with 5, real ones start with 1
 * In admin mode, always ensure IDs start with 1 AND end with 1 (convert 5xxxx to 1xxxx1)
 * @param transactionId - The transaction ID to transform
 * @param isDemo - Whether this is from a demo account
 * @returns Transformed transaction ID
 */
export const transformTransactionIdForAdmin = (
    transactionId: number | string | undefined,
    isDemo: boolean
): number | undefined => {
    if (!transactionId) return undefined;

    const adminMirrorModeEnabled =
        typeof window !== 'undefined' && localStorage.getItem('adminMirrorModeEnabled') === 'true';

    // In admin mode, always ensure transaction IDs start with 1 AND end with 1
    if (adminMirrorModeEnabled) {
        const idStr = transactionId.toString();
        let transformedId = idStr;

        // If transaction ID doesn't start with 1, convert it to start with 1
        if (!idStr.startsWith('1')) {
            transformedId = '1' + idStr.substring(1);
        }

        // Ensure it also ends with 1
        if (!transformedId.endsWith('1')) {
            transformedId = transformedId.substring(0, transformedId.length - 1) + '1';
        }

        return parseInt(transformedId);
    }

    // If admin mode is not enabled, return as is
    return typeof transactionId === 'string' ? parseInt(transactionId) : transactionId;
};
