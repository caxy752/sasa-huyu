import clsx from 'clsx';
import { api_base } from '@/external/bot-skeleton';
import { localize } from '@deriv-com/translations';
import { AccountSwitcher as UIAccountSwitcher } from '@deriv-com/ui';
import AccountSwitcherFooter from './account-swticher-footer';
import { TDemoAccounts } from './types';
import { AccountSwitcherDivider, convertCommaValue } from './utils';

const DemoAccounts = ({
    tabs_labels,
    modifiedVRTCRAccountList,
    switchAccount,
    isVirtual,
    activeLoginId,
    oAuthLogout,
    is_logging_out,
}: TDemoAccounts) => {
    // Check if CR6779123 is currently displayed (show_as_cr flag is set)
    // If so, hide "Reset balance" button and show demo balance instead
    const showAsCR = typeof window !== 'undefined' ? localStorage.getItem('show_as_cr') : null;
    const isCRDisplayed = showAsCR === 'CR6779123';

    const handleResetBalance = async (loginId: string) => {
        if (!api_base?.api) return;

        try {
            console.log('🔄 [RESET BALANCE] Resetting demo balance for:', loginId);
            const { topup_virtual, error } = await api_base.api.send({ topup_virtual: 1 });
            if (error) {
                console.error('❌ [RESET BALANCE] Error resetting balance:', error);
                return;
            }

            console.log('✅ [RESET BALANCE] Balance reset successful, waiting for balance update...');
            // Don't reload - the balance will be updated via the balance subscription
            // The CoreStoreProvider will handle the balance update automatically
        } catch (error) {
            console.error('❌ [RESET BALANCE] Error resetting balance:', error);
        }
    };

    return (
        <>
            <UIAccountSwitcher.AccountsPanel
                isOpen
                title={localize('Deriv account')}
                className='account-switcher-panel'
                key={tabs_labels.demo.toLowerCase()}
            >
                {modifiedVRTCRAccountList &&
                    modifiedVRTCRAccountList.map(account => {
                        // If CR6779123 is displayed on top, hide "Reset balance" button
                        // Show it only when demo account is actually active (not CR6779123)
                        const shouldShowResetButton = account.isVirtual && !isCRDisplayed;

                        return (
                            <span
                                className={clsx('account-switcher__item', {
                                    'account-switcher__item--disabled': account.is_disabled,
                                })}
                                key={account.loginid}
                            >
                                <UIAccountSwitcher.AccountsItem
                                    account={account}
                                    onSelectAccount={() => {
                                        if (!account.is_disabled) switchAccount(account.loginid);
                                    }}
                                    onResetBalance={
                                        shouldShowResetButton ? () => handleResetBalance(account.loginid) : undefined
                                    }
                                />
                            </span>
                        );
                    })}
            </UIAccountSwitcher.AccountsPanel>
            <AccountSwitcherDivider />
            <AccountSwitcherFooter loginid={activeLoginId} oAuthLogout={oAuthLogout} is_logging_out={is_logging_out} />
        </>
    );
};

export default DemoAccounts;
