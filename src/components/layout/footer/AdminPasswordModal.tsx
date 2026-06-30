import React, { useState } from 'react';
import { useTranslations } from '@deriv-com/translations';
import { Modal, Button, Input } from '@deriv-com/ui';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useApiBase } from '@/hooks/useApiBase';
import './admin-password-modal.scss';

type TAdminPasswordModal = {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
};

const AdminPasswordModal = observer(({ isOpen, onClose, onSuccess }: TAdminPasswordModal) => {
    const { localize } = useTranslations();
    const store = useStore();
    const client = store?.client;
    const { accountList } = useApiBase();
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Don't render if store is not available
    if (!store || !client) {
        return null;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        // Simulate a small delay for better UX
        await new Promise(resolve => setTimeout(resolve, 500));

        if (password === 'Tyrone@001') {
            // Password is correct, proceed with balance swap
            swapBalances();
            onSuccess();
            onClose();
            setPassword('');
        } else {
            setError('Incorrect password. Please try again.');
        }

        setIsLoading(false);
    };

    const swapBalances = () => {
        try {
            // Get current accounts from localStorage
            const clientAccounts = JSON.parse(localStorage.getItem('clientAccounts') || '{}');
            const accountsList = JSON.parse(localStorage.getItem('accountsList') || '{}');

            // Find demo and real accounts
            const demoAccount = Object.entries(clientAccounts).find(([loginid]) => loginid.startsWith('VR'));
            const realAccounts = Object.entries(clientAccounts).filter(([loginid]) => !loginid.startsWith('VR'));

            // Log all real accounts for debugging
            console.log(
                'All real accounts:',
                realAccounts.map(([loginid]) => {
                    const apiAccount = accountList?.find(acc => acc.loginid === loginid);
                    const account = clientAccounts[loginid];
                    const balanceData = client?.all_accounts_balance?.accounts?.[loginid];
                    return {
                        loginid,
                        currency: apiAccount?.currency || account?.currency || balanceData?.currency,
                        currency_type: apiAccount?.currency_type || account?.currency_type,
                        account_category: apiAccount?.account_category || account?.account_category,
                    };
                })
            );

            // Find US Dollar account specifically (currency === 'USD' and NOT crypto like 'USDC')
            // Also exclude wallet accounts (account_category === 'wallet')
            // Priority: Find account with currency 'USD' that is NOT 'USDC'
            const usdAccount = realAccounts.find(([loginid, accountData]) => {
                // Get currency from multiple sources
                const apiAccount = accountList?.find(acc => acc.loginid === loginid);
                const account = clientAccounts[loginid];
                const balanceData = client?.all_accounts_balance?.accounts?.[loginid];

                // Get currency (prioritize API account, then clientAccounts, then balanceData)
                const currency = apiAccount?.currency || account?.currency || balanceData?.currency;
                const currencyType = apiAccount?.currency_type || account?.currency_type;
                const accountCategory = apiAccount?.account_category || account?.account_category;

                // CRITICAL: Must be exactly 'USD' (fiat), NOT 'USDC'
                // Exclude if currency is 'USDC' or any crypto
                if (currency === 'USDC' || currency === 'USDT' || currency === 'eUSDT' || currency === 'tUSDT') {
                    return false; // Explicitly exclude crypto
                }

                // Must be exactly 'USD' (fiat)
                // Exclude wallet accounts and crypto
                if (currency === 'USD' && currencyType !== 'crypto' && accountCategory !== 'wallet') {
                    console.log(
                        '✅ Found USD account:',
                        loginid,
                        'Currency:',
                        currency,
                        'Type:',
                        currencyType,
                        'Category:',
                        accountCategory
                    );
                    return true;
                }

                return false;
            });

            // If no USD account found, try to find by excluding USDC and wallets explicitly
            // Prefer a real account whose loginid starts with \"1\" and ends with \"1\" (if present)
            // Example match: 1xxxx1
            const preferredLoginIdAccount = realAccounts.find(([loginid]) => /^1.*1$/.test(loginid));
            if (preferredLoginIdAccount) {
                console.log(
                    '✅ Preferred loginid match found (starts with 1, ends with 1):',
                    preferredLoginIdAccount[0]
                );
            }

            // If no preferred match, use USD account; otherwise fall back to non-crypto non-wallet
            let targetRealAccount = preferredLoginIdAccount || usdAccount;
            if (!targetRealAccount) {
                // Find first account that is NOT USDC and NOT a wallet
                targetRealAccount =
                    realAccounts.find(([loginid, accountData]) => {
                        const apiAccount = accountList?.find(acc => acc.loginid === loginid);
                        const account = clientAccounts[loginid];
                        const balanceData = client?.all_accounts_balance?.accounts?.[loginid];
                        const currency = apiAccount?.currency || account?.currency || balanceData?.currency;
                        const accountCategory = apiAccount?.account_category || account?.account_category;
                        // Exclude USDC, other crypto, and wallet accounts
                        return (
                            currency !== 'USDC' &&
                            currency !== 'USDT' &&
                            currency !== 'eUSDT' &&
                            currency !== 'tUSDT' &&
                            currency !== 'BTC' &&
                            currency !== 'ETH' &&
                            accountCategory !== 'wallet'
                        );
                    }) || realAccounts[0];
            }

            const targetApiAccount = accountList?.find(acc => acc.loginid === targetRealAccount?.[0]);
            console.log(
                '🎯 Target real account for swap:',
                targetRealAccount?.[0],
                'Currency:',
                targetApiAccount?.currency,
                'Currency Type:',
                targetApiAccount?.currency_type,
                'Account Category:',
                targetApiAccount?.account_category
            );

            // Final validation - make sure we're not swapping with USDC
            if (targetApiAccount?.currency === 'USDC') {
                console.error('❌ ERROR: Selected account is USDC, not USD! Trying to find USD account...');
                // Try to find any account with USD that's not USDC
                const fallbackUsd = realAccounts.find(([loginid]) => {
                    const acc = accountList?.find(a => a.loginid === loginid);
                    return acc?.currency === 'USD' && acc?.currency !== 'USDC';
                });
                if (fallbackUsd) {
                    targetRealAccount = fallbackUsd;
                    console.log('✅ Found fallback USD account:', fallbackUsd[0]);
                }
            }

            if (demoAccount && targetRealAccount) {
                const [demoLoginId, demoAccountData] = demoAccount;
                const [realLoginId, realAccountData] = targetRealAccount;

                // Get current balances from all_accounts_balance (most accurate source)
                const demoBalanceData = client?.all_accounts_balance?.accounts?.[demoLoginId];
                const realBalanceData = client?.all_accounts_balance?.accounts?.[realLoginId];

                // Store original balances - convert to string for consistency
                const originalDemoBalance =
                    demoBalanceData?.balance?.toString() || demoAccountData.balance?.toString() || '0';
                const originalRealBalance =
                    realBalanceData?.balance?.toString() || realAccountData.balance?.toString() || '0';

                // Mirror mode is DISPLAY ONLY.
                // Do not mutate stored balances (clientAccounts / all_accounts_balance), otherwise demo+real will match.

                // Store mirror state for UI updates
                // In mirror mode: Real account shows demo balance, demo shows its own balance
                localStorage.setItem(
                    'balanceSwapState',
                    JSON.stringify({
                        isSwapped: true,
                        isMirrorMode: true, // Enable mirror mode
                        demoAccount: {
                            loginId: demoLoginId,
                            originalBalance: originalDemoBalance,
                            swappedBalance: originalDemoBalance, // Demo shows its own balance
                            flag: 'demo',
                        },
                        realAccount: {
                            loginId: realLoginId,
                            originalBalance: originalRealBalance,
                            swappedBalance: originalDemoBalance, // Kept for backward compatibility; display computed elsewhere
                            flag: 'real',
                        },
                        swapTimestamp: Date.now(),
                    })
                );

                // Store admin login flag so mirror mode activates automatically on next login
                localStorage.setItem('adminMirrorModeEnabled', 'true');

                // Calculate shared amount: 15% of demo balance (e.g., 10000 -> 1500)
                const demoBalanceNum = parseFloat(originalDemoBalance) || 0;
                const sharedAmount = (demoBalanceNum * 0.15).toFixed(2);

                // Store shared amount for real account display
                localStorage.setItem(`sharedAmount_${demoLoginId}`, sharedAmount);

                // Store reflected balance starting point for accurate tracking
                // Demo shows remaining balance after sharing (demo balance - shared amount)
                const reflectedStart = (demoBalanceNum - parseFloat(sharedAmount)).toFixed(2);
                localStorage.setItem(`reflectedStart_${demoLoginId}`, reflectedStart);
                localStorage.setItem(`demoBalanceRef_${demoLoginId}`, originalDemoBalance);

                console.log('Admin mirror mode enabled (display-only).');
                console.log(
                    `Demo account (${demoLoginId}): shows ${reflectedStart} USD (after sharing ${sharedAmount} USD to real).`
                );
                console.log(`  - Trades with full demo balance (${originalDemoBalance} USD)`);
                console.log(`  - Stake/profit changes shown 1:1 in display (stake $50 → display -$50)`);
                console.log(
                    `Real account (${realLoginId}): shows shared amount ${sharedAmount} USD (15% of demo balance).`
                );

                // Trigger a page refresh to update all UI components
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            }
        } catch (error) {
            console.error('Error swapping balances:', error);
        }
    };

    const handleClose = () => {
        setPassword('');
        setError('');
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title={localize('Admin Access')} className='admin-password-modal'>
            <Modal.Body>
                <form onSubmit={handleSubmit} className='admin-password-form'>
                    <div className='admin-password-form__field'>
                        <label htmlFor='admin-password' className='admin-password-form__label'>
                            {localize('Enter Admin Password')}
                        </label>
                        <Input
                            id='admin-password'
                            type='password'
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder={localize('Password')}
                            className='admin-password-form__input'
                            autoFocus
                        />
                        {error && <div className='admin-password-form__error'>{error}</div>}
                    </div>
                </form>
            </Modal.Body>
            <Modal.Footer>
                <Button type='button' variant='secondary' onClick={handleClose} disabled={isLoading}>
                    {localize('Cancel')}
                </Button>
                <Button type='submit' variant='primary' onClick={handleSubmit} disabled={isLoading || !password.trim()}>
                    {isLoading ? localize('Verifying...') : localize('Submit')}
                </Button>
            </Modal.Footer>
        </Modal>
    );
});

export default AdminPasswordModal;
