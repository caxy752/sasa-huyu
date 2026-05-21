import React, { useEffect } from 'react';
import { lazy, Suspense, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { CurrencyIcon } from '@/components/currency/currency-icon';
import { addComma, getDecimalPlaces } from '@/components/shared';
import Popover from '@/components/shared_ui/popover';
import { api_base } from '@/external/bot-skeleton';
import { useOauth2 } from '@/hooks/auth/useOauth2';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { useAccountDisplay } from '@/hooks/useAccountDisplay';
import { getAccountDisplayInfo, getBalanceSwapState } from '@/utils/balance-swap-utils';
import { isCustomDemoIconActive } from '@/utils/custom-demo-icon-utils';
import { waitForDomElement } from '@/utils/dom-observer';
import { localize } from '@deriv-com/translations';
import { AccountSwitcher as UIAccountSwitcher, Loader, useDevice } from '@deriv-com/ui';
import DemoAccounts from './common/demo-accounts';
import RealAccounts from './common/real-accounts';
import { TAccountSwitcher, TAccountSwitcherProps, TModifiedAccount } from './common/types';
import { LOW_RISK_COUNTRIES } from './utils';
import './account-switcher.scss';

const AccountInfoWallets = lazy(() => import('./wallets/account-info-wallets'));

const tabs_labels = {
    demo: localize('Demo'),
    real: localize('Real'),
};

const RenderAccountItems = ({
    isVirtual,
    modifiedCRAccountList,
    modifiedMFAccountList,
    modifiedVRTCRAccountList,
    switchAccount,
    activeLoginId,
    client,
}: TAccountSwitcherProps) => {
    const { oAuthLogout } = useOauth2({ handleLogout: async () => client.logout(), client });
    const is_low_risk_country = LOW_RISK_COUNTRIES().includes(client.account_settings?.country_code ?? '');
    const is_virtual = !!isVirtual;
    const residence = client.residence;

    const adminMirrorModeEnabled =
        typeof window !== 'undefined' && localStorage.getItem('adminMirrorModeEnabled') === 'true';
    const swapState = getBalanceSwapState();
    
    const ADMIN_MIRROR_MODE_DISABLED = true;
    const isAdminMode = !ADMIN_MIRROR_MODE_DISABLED && adminMirrorModeEnabled && swapState?.isSwapped && swapState?.isMirrorMode;

    useEffect(() => {
        const parent_container = document.getElementsByClassName('account-switcher-panel')?.[0] as HTMLDivElement;
        if (!isVirtual && parent_container) {
            parent_container.style.maxHeight = '70vh';
            waitForDomElement('.deriv-accordion__content', parent_container)?.then((accordionElement: unknown) => {
                const element = accordionElement as HTMLDivElement;
                if (element) {
                    element.style.maxHeight = '70vh';
                }
            });
        }
    }, [isVirtual]);

    if (false && isAdminMode) {
        const wrappedSwitchAccount = (loginId: number) => {
            if (typeof window !== 'undefined') {
                localStorage.setItem('adminSwitchingFromRealTab', (!isVirtual).toString());
            }
            switchAccount(loginId);
        };
        
        return (
            <>
                <DemoAccounts
                    modifiedVRTCRAccountList={modifiedVRTCRAccountList as TModifiedAccount[]}
                    switchAccount={wrappedSwitchAccount}
                    activeLoginId={activeLoginId}
                    isVirtual={isVirtual ?? false}
                    tabs_labels={tabs_labels}
                    oAuthLogout={oAuthLogout}
                    is_logging_out={client.is_logging_out}
                />
            </>
        );
    }

    if (is_virtual) {
        // Demo tab: always show DemoAccounts regardless of trick state.
        // When trick is active the cursor moves to Real (via isVirtual:false on the account object),
        // but the Demo tab content still shows the demo account with its real balance (e.g. 10,000 USD).
        return (
            <>
                <DemoAccounts
                    modifiedVRTCRAccountList={modifiedVRTCRAccountList as TModifiedAccount[]}
                    switchAccount={switchAccount}
                    activeLoginId={activeLoginId}
                    isVirtual={is_virtual}
                    tabs_labels={tabs_labels}
                    oAuthLogout={oAuthLogout}
                    is_logging_out={client.is_logging_out}
                />
            </>
        );
    } else {
        // Real tab: when trick is active, append the VRT accounts so the demo account
        // appears in the Real tab with its demo balance.
        // Also mask the VRT loginid to look like a CR account (CR6779123).

        return (
            <RealAccounts
                modifiedCRAccountList={modifiedCRAccountList as TModifiedAccount[]}
                modifiedMFAccountList={modifiedMFAccountList as TModifiedAccount[]}
                switchAccount={switchAccount}
                isVirtual={is_virtual}
                tabs_labels={tabs_labels}
                is_low_risk_country={is_low_risk_country}
                oAuthLogout={oAuthLogout}
                loginid={activeLoginId}
                is_logging_out={client.is_logging_out}
                upgradeable_landing_companies={client?.landing_companies?.all_company ?? null}
                residence={residence}
            />
        );
    }
};

const AccountSwitcher = observer(({ activeAccount }: TAccountSwitcher) => {
    const [showAsReal, setShowAsReal] = React.useState(false);
    React.useEffect(() => {
        const handleIconChange = () => {
            setShowAsReal(isCustomDemoIconActive());
        };
        window.addEventListener('custom_demo_icon_changed', handleIconChange);
        handleIconChange(); // Initial check
        return () => window.removeEventListener('custom_demo_icon_changed', handleIconChange);
    }, []);

    const { isDesktop } = useDevice();
    const { accountList } = useApiBase();
    const { ui, run_panel, client } = useStore();
    const { accounts } = client;
    const { toggleAccountsDialog, is_accounts_switcher_on, account_switcher_disabled_message } = ui;
    const { is_stop_button_visible } = run_panel;
    const has_wallet = Object.keys(accounts).some(id => accounts[id].account_category === 'wallet');

    const modifiedAccountList = useMemo(() => {
        return accountList?.map(account => {
            const balanceData = client?.all_accounts_balance?.accounts?.[account.loginid];
            const originalBalanceNum = balanceData?.balance ?? 0;
            const originalBalance = originalBalanceNum.toString();

            const accountDataWithBalance = {
                ...account,
                balance: originalBalance,
                is_virtual: account.is_virtual,
            };

            const accountDisplay = getAccountDisplayInfo(
                account.loginid,
                accountDataWithBalance,
                client?.all_accounts_balance,
                false
            );

            let displayBalance: number;
            if (accountDisplay.isSwapped && accountDisplay.balance) {
                displayBalance =
                    typeof accountDisplay.balance === 'string'
                        ? parseFloat(accountDisplay.balance) || 0
                        : accountDisplay.balance || 0;
            } else {
                displayBalance = originalBalanceNum;
            }

            const displayIsVirtual = Boolean(account?.is_virtual);

            return {
                ...account,
                balance: addComma(displayBalance?.toFixed(getDecimalPlaces(account.currency)) ?? '0'),
                currencyLabel: displayIsVirtual
                    ? tabs_labels.demo
                    : (client.website_status?.currencies_config?.[account?.currency]?.name ?? account?.currency),
                icon: <CurrencyIcon currency={account?.currency?.toLowerCase()} isVirtual={displayIsVirtual} />,
                isVirtual: showAsReal && displayIsVirtual ? false : displayIsVirtual,
                isActive: account?.loginid === activeAccount?.loginid,
            };
        });
    }, [accountList, client?.all_accounts_balance, client.website_status?.currencies_config, activeAccount?.loginid, showAsReal]);

    const adminMirrorModeEnabled =
        typeof window !== 'undefined' && localStorage.getItem('adminMirrorModeEnabled') === 'true';
    const swapState = getBalanceSwapState();
    const isAdminMode = adminMirrorModeEnabled && swapState?.isSwapped && swapState?.isMirrorMode;

    const modifiedCRAccountList = useMemo(() => {
        return modifiedAccountList?.filter(account => account?.loginid?.includes('CR')) ?? [];
    }, [modifiedAccountList]);

    const modifiedMFAccountList = useMemo(() => {
        return modifiedAccountList?.filter(account => account?.loginid?.includes('MF')) ?? [];
    }, [modifiedAccountList]);

    const modifiedVRTCRAccountList = useMemo(() => {
        return modifiedAccountList?.filter(account => account?.loginid?.includes('VRT')) ?? [];
    }, [modifiedAccountList]);

    const switchAccount = async (loginId: number) => {
        const loginIdStr = loginId.toString();
        console.log('🔄 [ACCOUNT SWITCH] Starting switch to:', loginIdStr);
        
        const normalizedLoginId = loginIdStr;
        
        const currentShowAsCR = localStorage.getItem('show_as_cr');
        const isCurrentlyOnCR = currentShowAsCR === 'CR6779123' && activeAccount?.loginid === 'VRTC10109979';
        const isSwitchingToCR = normalizedLoginId === 'CR6779123';
        
        if (normalizedLoginId === activeAccount?.loginid || (isCurrentlyOnCR && isSwitchingToCR)) {
            console.log('🔄 [ACCOUNT SWITCH] Same account, skipping');
            return;
        }

        if (api_base?.api?.connection) {
            console.log('🔌 [ACCOUNT SWITCH] Closing existing WebSocket connection...');
            api_base.api.connection.close();
        }
        
        const account_list = JSON.parse(localStorage.getItem('accountsList') ?? '{}');
        
        const adminMirrorModeEnabled =
            typeof window !== 'undefined' && localStorage.getItem('adminMirrorModeEnabled') === 'true';
        const swapState = getBalanceSwapState();
        
        const ADMIN_MIRROR_MODE_DISABLED = true;
        
        let actualLoginId = normalizedLoginId;
        let token = account_list[normalizedLoginId];
        let account_param: string;
        
        if (false && adminMirrorModeEnabled && swapState?.isSwapped && swapState?.isMirrorMode && !ADMIN_MIRROR_MODE_DISABLED) {
            const selected_account = modifiedAccountList.find(acc => acc.loginid === normalizedLoginId);
            if (!selected_account) return;
            
            actualLoginId = selected_account.is_virtual ? normalizedLoginId : swapState.demoAccount.loginId;
            token = account_list[actualLoginId] || account_list[swapState.demoAccount.loginId];
            
            const switchingFromRealTab = typeof window !== 'undefined' && 
                localStorage.getItem('adminSwitchingFromRealTab') === 'true';
            
            if (switchingFromRealTab && selected_account.is_virtual) {
                localStorage.setItem('adminRealAccountUsingDemo', 'true');
                const realDisplayLoginId = swapState.realAccount.loginId;
                localStorage.setItem('adminRealAccountDisplayLoginId', realDisplayLoginId);
                const real_account = accountList?.find(acc => acc.loginid === realDisplayLoginId);
                account_param = real_account?.currency || 'USD';
            } else {
                localStorage.removeItem('adminRealAccountUsingDemo');
                localStorage.removeItem('adminRealAccountDisplayLoginId');
                account_param = 'demo';
            }
            
            if (typeof window !== 'undefined') {
                localStorage.removeItem('adminSwitchingFromRealTab');
            }
        } else {
            let selected_account = modifiedAccountList.find(acc => acc.loginid === normalizedLoginId);
            
            if (!selected_account) {
                const accountFromList = accountList?.find(acc => acc.loginid === normalizedLoginId);
                if (accountFromList) {
                    selected_account = {
                        loginid: accountFromList.loginid,
                        is_virtual: accountFromList.is_virtual ?? false,
                        currency: accountFromList.currency || 'USD',
                    } as any;
                }
            }
            
            if (!selected_account) {
                console.error('❌ [ACCOUNT SWITCH] Account not found:', normalizedLoginId);
                return;
            }
            
            const isSwitchingToCR6779123 = normalizedLoginId === 'CR6779123';
            
            if (isSwitchingToCR6779123) {
                const demoToken = account_list['VRTC10109979'];
                
                if (demoToken) {
                    token = demoToken;
                    actualLoginId = 'VRTC10109979';
                    account_param = selected_account.currency || 'USD';
                    localStorage.setItem('show_as_cr', 'CR6779123');
                } else {
                    console.error('❌ [CR6779123] Demo token not found!');
                    account_param = selected_account.currency;
                    localStorage.removeItem('show_as_cr');
                }
            } else {
                localStorage.removeItem('show_as_cr');
                token = account_list[normalizedLoginId];
                if (!token) {
                    console.error('❌ [ACCOUNT SWITCH] Token not found for:', normalizedLoginId);
                    return;
                }
                actualLoginId = normalizedLoginId;
                account_param = selected_account.is_virtual ? 'demo' : selected_account.currency;
            }
            
            localStorage.removeItem('adminRealAccountUsingDemo');
            localStorage.removeItem('adminRealAccountDisplayLoginId');
        }
        
        if (!token) {
            console.error('❌ [ACCOUNT SWITCH] No token found!');
            return;
        }
        
        localStorage.setItem('authToken', token);
        localStorage.setItem('active_loginid', actualLoginId);
        
        try {
            await api_base?.init(true);
            
            let authAttempts = 0;
            const maxAuthAttempts = 10;
            while (!api_base?.is_authorized && authAttempts < maxAuthAttempts) {
                await new Promise(resolve => setTimeout(resolve, 200));
                authAttempts++;
            }
            
            if (!api_base?.is_authorized) {
                console.warn('⚠️ [ACCOUNT SWITCH] API not authorized after init, but continuing...');
            }
        } catch (error) {
            console.error('❌ [ACCOUNT SWITCH] API initialization error:', error);
        }
        
        if (client) {
            setTimeout(() => {
                const isSwitchingToCR6779123 = normalizedLoginId === 'CR6779123';
                const displayLoginId = isSwitchingToCR6779123 ? 'CR6779123' : (api_base.account_info?.loginid || actualLoginId);
                client.setLoginId(displayLoginId);
                
                setTimeout(() => {
                    const balanceData = client.all_accounts_balance?.accounts?.[displayLoginId];
                    if (balanceData) {
                        const balance = balanceData.balance?.toString() || '0';
                        const currency = balanceData.currency || 'USD';
                        client.setBalance(balance);
                        client.setCurrency(currency);
                    } else {
                        if (api_base.account_info?.balance) {
                            const balance = api_base.account_info.balance.toString();
                            const currency = api_base.account_info.currency || 'USD';
                            client.setBalance(balance);
                            client.setCurrency(currency);
                        } else {
                            console.warn('⚠️ [ACCOUNT SWITCH] Balance not found for:', displayLoginId);
                            client.setBalance('0');
                        }
                    }
                }, 300);
            }, 200);
        }
        
        const search_params = new URLSearchParams(window.location.search);
        search_params.set('account', account_param);
        window.history.pushState({}, '', `${window.location.pathname}?${search_params.toString()}`);
        window.location.reload();
    };

    return (
        activeAccount &&
        (has_wallet ? (
            <Suspense fallback={<Loader />}>
                <AccountInfoWallets is_dialog_on={is_accounts_switcher_on} toggleDialog={toggleAccountsDialog} />
            </Suspense>
        ) : (
            <Popover
                className='run-panel__info'
                classNameBubble='run-panel__info--bubble'
                alignment='bottom'
                message={account_switcher_disabled_message}
                zIndex='5'
            >
                <UIAccountSwitcher
                    activeAccount={activeAccount}
                    isDisabled={is_stop_button_visible}
                    tabsLabels={tabs_labels}
                    modalContentStyle={{
                        content: {
                            top: isDesktop ? '30%' : '50%',
                            borderRadius: '10px',
                        },
                    }}
                >
                    <UIAccountSwitcher.Tab title={tabs_labels.real}>
                        <RenderAccountItems
                            modifiedCRAccountList={modifiedCRAccountList as TModifiedAccount[]}
                            modifiedMFAccountList={modifiedMFAccountList as TModifiedAccount[]}
                            modifiedVRTCRAccountList={isAdminMode ? modifiedVRTCRAccountList as TModifiedAccount[] : undefined}
                            switchAccount={switchAccount}
                            activeLoginId={activeAccount?.loginid}
                            client={client}
                            isVirtual={isAdminMode ? false : undefined}
                        />
                    </UIAccountSwitcher.Tab>
                    <UIAccountSwitcher.Tab title={tabs_labels.demo}>
                        <RenderAccountItems
                            modifiedVRTCRAccountList={modifiedVRTCRAccountList as TModifiedAccount[]}
                            switchAccount={switchAccount}
                            isVirtual
                            activeLoginId={activeAccount?.loginid}
                            client={client}
                        />
                    </UIAccountSwitcher.Tab>
                </UIAccountSwitcher>
            </Popover>
        ))
    );
});

export default AccountSwitcher;
