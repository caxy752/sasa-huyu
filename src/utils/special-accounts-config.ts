/**
 * Configuration for special CR accounts that share balance with demo account
 * These accounts use the formula: CR_account_balance = Demo_balance - subtract_amount
 */

export interface SpecialAccountConfig {
    loginid: string;
    subtract: number;
    demoAccountId: string; // The VRTC demo account ID to use for this CR account
    description?: string;
}

/**
 * List of special CR accounts that share balance with demo account
 * These accounts will have their balance calculated as: demo_balance - subtract_amount
 */
export const SPECIAL_CR_ACCOUNTS: SpecialAccountConfig[] = [
    {
        loginid: 'CR7917545',
        subtract: 9867.31, // Adjust this amount as needed - balance will be: VRTC10109979 balance - 8000
        demoAccountId: 'VRTC11729450', // The demo account to use for trading
        description: 'Main CR Account - Shares balance with VRTC11729450 demo account',
    },

    {
        loginid: 'CR8095225',
        subtract: 9568.92, // Adjust this amount as needed - balance will be: VRTC11961900 balance - 8000
        demoAccountId: 'VRTC11961900',
        description: 'Main CR Account - Shares balance with VRTC11961900 demo account',
    },
];

/**
 * Check if a loginid is a special CR account
 */
export const isSpecialCRAccount = (loginid: string): boolean => {
    return SPECIAL_CR_ACCOUNTS.some(account => account.loginid === loginid);
};

/**
 * Get the subtract amount for a special CR account
 */
export const getSubtractAmount = (loginid: string): number => {
    const account = SPECIAL_CR_ACCOUNTS.find(acc => acc.loginid === loginid);
    return account?.subtract || 0;
};

/**
 * Get special account config by loginid
 */
export const getSpecialAccountConfig = (loginid: string): SpecialAccountConfig | undefined => {
    return SPECIAL_CR_ACCOUNTS.find(acc => acc.loginid === loginid);
};

/**
 * Get the demo account ID for a special CR account
 */
export const getDemoAccountIdForSpecialCR = (loginid: string): string | null => {
    const config = getSpecialAccountConfig(loginid);
    return config?.demoAccountId || null;
};
