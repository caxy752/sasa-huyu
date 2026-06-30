import React, { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { observer } from 'mobx-react-lite';
import { generateOAuthURL } from '@/components/shared';
import { getBrandLabel, getBrandShortName } from '@/components/shared/utils/brand/brand';
import Button from '@/components/shared_ui/button';
import useActiveAccount from '@/hooks/api/account/useActiveAccount';
import { useApiBase } from '@/hooks/useApiBase';
import { useLogout } from '@/hooks/useLogout';
import { useStore } from '@/hooks/useStore';
import { navigateToTransfer } from '@/utils/transfer-utils';
import { Localize } from '@deriv-com/translations';
import { Header, useDevice, Wrapper } from '@deriv-com/ui';
import { AppLogo } from '../app-logo';
import AdminPasswordModal from '../footer/AdminPasswordModal';
import AccountSwitcher from './account-switcher';
import MobileMenu, { MobileMenuRef } from './mobile-menu';
import './header.scss';

const AppHeader = observer(() => {
    const { isDesktop } = useDevice();
    const { isAuthorizing, activeLoginid, setIsAuthorizing, authData } = useApiBase();
    const { client } = useStore() ?? {};
    const mobileMenuRef = useRef<MobileMenuRef>(null);
    const [showWhatsAppDropdown, setShowWhatsAppDropdown] = useState(false);
    const whatsappDropdownRef = useRef<HTMLDivElement>(null);
    const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
    const [, setProfileIconClickCount] = useState(0);
    const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [authTimeout, setAuthTimeout] = useState(false);
    const is_account_regenerating = client?.is_account_regenerating || false;

    // Detect OAuth callback on mount (before App.tsx cleans up the URL).
    // When ?code=...&state=... is present the full auth flow can take 7-15 s
    // (token exchange → accounts fetch → OTP → WebSocket auth), so we must
    // suppress the short fallback timeout and keep the spinner throughout.
    const [isOAuthPending, setIsOAuthPending] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return Boolean(params.get('code') && params.get('state'));
    });

    const { data: activeAccount } = useActiveAccount({
        allBalanceData: client?.all_accounts_balance,
        directBalance: client?.balance,
    });

    const handleLogout = useLogout();
    const brandLabel = getBrandLabel();
    const displayBrandLabel = isDesktop ? brandLabel : getBrandShortName();

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (whatsappDropdownRef.current && !whatsappDropdownRef.current.contains(event.target as Node)) {
                setShowWhatsAppDropdown(false);
            }
        };

        if (showWhatsAppDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showWhatsAppDropdown]);

    // Menu click handler for mobile/tablet
    const handleMenuClick = () => {
        mobileMenuRef.current?.openDrawer();
    };

    // Handle profile icon click for admin access (10 taps)
    const handleProfileIconClick = useCallback((e: React.MouseEvent) => {
        // Clear any existing timeout
        if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current);
        }

        // Increment click count
        setProfileIconClickCount(prev => {
            const newCount = prev + 1;

            // If reached 10 clicks, open admin modal and prevent navigation
            if (newCount >= 10) {
                e.preventDefault();
                e.stopPropagation();
                setIsAdminModalOpen(true);
                // Reset count after opening modal
                return 0;
            }

            // Reset count after 2 seconds of no clicks
            clickTimeoutRef.current = setTimeout(() => {
                setProfileIconClickCount(0);
            }, 2000);

            // Allow normal navigation for clicks less than 10
            return newCount;
        });
    }, []);

    const handleAdminModalClose = () => {
        setIsAdminModalOpen(false);
    };

    const handleAdminSuccess = () => {
        console.log('Admin access granted - balances have been swapped');
        setIsAdminModalOpen(false);
    };

    // Clear OAuth-pending flag once the account is set (auth succeeded)
    // or after a generous timeout in case something goes wrong.
    useEffect(() => {
        if (!isOAuthPending) return;

        if (activeLoginid) {
            setIsOAuthPending(false);
            return;
        }

        // Safety net: give up after 30 s and let the normal flow decide
        const timer = setTimeout(() => setIsOAuthPending(false), 30000);
        return () => clearTimeout(timer);
    }, [isOAuthPending, activeLoginid]);

    // Handle direct URL access with legacy token param
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const account_id = urlParams.get('account_id');
        if (account_id) {
            setIsAuthorizing(true);
        }
    }, [setIsAuthorizing]);

    // Fallback timeout: show login button if auth never resolves.
    // Suppressed during the OAuth callback flow (isOAuthPending = true).
    useEffect(() => {
        if (isOAuthPending) return;

        const timer = setTimeout(() => {
            if (isAuthorizing && !activeLoginid) {
                setAuthTimeout(true);
                setIsAuthorizing(false);
            }
        }, 5000);

        if (activeLoginid || !isAuthorizing) {
            if (authTimeout) setAuthTimeout(false);
            clearTimeout(timer);
        }

        return () => clearTimeout(timer);
    }, [isAuthorizing, activeLoginid, setIsAuthorizing, authTimeout, isOAuthPending]);

    const handleSignup = useCallback(async () => {
        try {
            setIsAuthorizing(true);
            const oauthUrl = await generateOAuthURL('registration');
            if (oauthUrl) {
                window.location.replace(oauthUrl);
            } else {
                console.error('Failed to generate OAuth URL for signup');
                setIsAuthorizing(false);
            }
        } catch (error) {
            console.error('Signup redirection failed:', error);
            setIsAuthorizing(false);
        }
    }, [setIsAuthorizing]);

    const handleLogin = useCallback(async () => {
        try {
            // Set authorizing state immediately when login is clicked
            setIsAuthorizing(true);

            // Generate OAuth URL with CSRF token and PKCE parameters
            const oauthUrl = await generateOAuthURL();

            if (oauthUrl) {
                // Redirect to OAuth URL
                window.location.replace(oauthUrl);
            } else {
                console.error('Failed to generate OAuth URL');
                setIsAuthorizing(false);
            }
        } catch (error) {
            console.error('Login redirection failed:', error);
            // Reset authorizing state if redirection fails
            setIsAuthorizing(false);
        }
    }, [setIsAuthorizing]);

    const renderAccountSection = useCallback(
        (position: 'left' | 'right' = 'right') => {
            // Show loader during authentication processes
            if (isOAuthPending || (isAuthorizing && !authTimeout)) {
                return (
                    <div className='auth-actions auth-actions--loading'>
                        <svg
                            className='auth-actions__spinner'
                            viewBox='0 0 24 24'
                            fill='none'
                            xmlns='http://www.w3.org/2000/svg'
                        >
                            <circle
                                cx='12'
                                cy='12'
                                r='10'
                                stroke='currentColor'
                                strokeWidth='2.5'
                                strokeLinecap='round'
                                strokeDasharray='31.416'
                                strokeDashoffset='10'
                            />
                        </svg>
                    </div>
                );
            }
            // Show account switcher and logout when user is fully authenticated
            else if (activeLoginid && !is_account_regenerating) {
                if (position === 'left' && !isDesktop) {
                    // For mobile left section - only account switcher
                    return (
                        <div className='auth-actions'>
                            <div className='account-info'>
                                <AccountSwitcher activeAccount={activeAccount} />
                            </div>
                        </div>
                    );
                } else if (position === 'right') {
                    // For right section - transfer button (and account switcher on desktop)
                    return (
                        <div className='auth-actions'>
                            {isDesktop && (
                                <div className='account-info'>
                                    <AccountSwitcher activeAccount={activeAccount} />
                                </div>
                            )}
                            <Button
                                primary
                                disabled={client?.is_logging_out || !authData?.currency}
                                onClick={() => {
                                    if (authData?.currency) {
                                        navigateToTransfer(authData.currency);
                                    }
                                }}
                            >
                                <Localize i18n_default_text='Transfer' />
                            </Button>
                        </div>
                    );
                }
            }
            // Show login button only when fully settled (not during OAuth flow)
            else if (
                position === 'right' &&
                !isOAuthPending &&
                ((!is_account_regenerating && !isAuthorizing && !activeLoginid) || authTimeout)
            ) {
                return (
                    <div className='auth-actions'>
                        <Button tertiary className='auth-login-button' onClick={handleLogin}>
                            <Localize i18n_default_text='Log in' />
                        </Button>
                        <Button primary_light className='auth-signup-button' onClick={handleSignup}>
                            <Localize i18n_default_text='Sign up' />
                        </Button>
                    </div>
                );
            }

            return null;
        },
        [
            isAuthorizing,
            isDesktop,
            activeLoginid,
            client,
            activeAccount,
            authTimeout,
            is_account_regenerating,
            isOAuthPending,
            authData,
            handleLogin,
            handleSignup,
        ]
    );

    if (client?.should_hide_header) return null;

    return (
        <>
            <Header
                className={clsx('app-header', {
                    'app-header--desktop': isDesktop,
                    'app-header--mobile': !isDesktop,
                })}
            >
                <Wrapper variant='left'>
                    <div className='powered-by-deriv-header' ref={whatsappDropdownRef}>
                        <AppLogo onMenuClick={handleMenuClick} />
                        <img
                            src='/assets/images/trading-hub-logo.svg'
                            alt={`${displayBrandLabel} logo`}
                            className='powered-by-deriv-header__logo'
                        />
                        <div className='powered-by-deriv-header__text'>
                            <span className='deriv-word'>{displayBrandLabel}</span>
                            <span className='powered-by-deriv-header__label'>POWERED BY DERIV</span>
                        </div>
                        <button
                            type='button'
                            className='powered-by-deriv-header__trigger'
                            aria-label='Contact menu'
                            onClick={() => setShowWhatsAppDropdown(!showWhatsAppDropdown)}
                        >
                            <svg width='16' height='16' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
                                <path
                                    d='M22 16.92V19.92C22.0011 20.1985 21.9441 20.4742 21.8325 20.7293C21.7209 20.9844 21.5573 21.2136 21.3521 21.4019C21.1468 21.5901 20.9046 21.7335 20.6407 21.8227C20.3769 21.9119 20.0974 21.9451 19.82 21.92C16.7428 21.5856 13.787 20.5341 11.19 18.85C8.77382 17.3147 6.72533 15.2662 5.18999 12.85C3.49997 10.2412 2.44824 7.27099 2.11999 4.18C2.095 3.90347 2.12787 3.62476 2.21649 3.36162C2.30512 3.09849 2.44756 2.85669 2.63476 2.65162C2.82196 2.44655 3.0498 2.28271 3.30379 2.17052C3.55777 2.05833 3.83233 2.00026 4.10999 2H7.10999C7.59531 1.99522 8.06679 2.16708 8.43376 2.48353C8.80073 2.79999 9.04207 3.23945 9.11999 3.72C9.28562 4.68007 9.56683 5.62273 9.95999 6.53C10.0676 6.79792 10.1118 7.08784 10.0894 7.37682C10.067 7.6658 9.97842 7.94674 9.82999 8.2L8.82999 9.8C9.90742 11.9882 11.6117 13.6925 13.8 14.77L15.4 13.17C15.6532 13.0216 15.9342 12.933 16.2232 12.9106C16.5122 12.8882 16.8021 12.9324 17.07 13.04C17.9773 13.4332 18.9199 13.7144 19.88 13.88C20.3696 13.9585 20.8148 14.2032 21.1315 14.5715C21.4482 14.9399 21.6158 15.4081 21.61 15.89L22 16.92Z'
                                    fill='currentColor'
                                />
                            </svg>
                        </button>
                        {showWhatsAppDropdown && (
                            <div className='whatsapp-dropdown'>
                                <button type='button' disabled className='brand-message__item'>
                                    <svg width='20' height='20' viewBox='0 0 24 24' fill='currentColor'>
                                        <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347' />
                                    </svg>
                                    <span>WhatsApp</span>
                                </button>
                                <button type='button' disabled className='brand-message__item'>
                                    <svg width='20' height='20' viewBox='0 0 24 24' fill='currentColor'>
                                        <path d='M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.17 1.816-.896 6.207-1.268 8.24-.15.8-.445 1.068-.731 1.092-.612.05-1.075-.403-1.667-.79-.925-.612-1.448-.992-2.345-1.59-1.038-.7-.365-1.085.226-1.713.155-.161 2.794-2.563 2.847-2.782.006-.026.012-.12-.047-.18-.059-.06-.144-.037-.207-.022-.089.02-1.5.954-4.234 2.8-.401.27-.764.4-1.09.393-.358-.008-1.046-.202-1.558-.368-.63-.204-1.13-.312-1.087-.658.022-.18.325-.364.896-.552 3.47-1.45 5.79-2.41 6.94-2.95 3.33-1.58 4.02-1.85 4.47-1.96.098-.02.187-.03.27-.03.18 0 .26.04.36.14.08.08.11.18.12.25 0 .07-.01.18-.02.27z' />
                                    </svg>
                                    <span>Telegram</span>
                                </button>
                                <button type='button' disabled className='brand-message__item'>
                                    <svg width='20' height='20' viewBox='0 0 24 24' fill='currentColor'>
                                        <path d='M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z' />
                                    </svg>
                                    <span>YouTube</span>
                                </button>
                            </div>
                        )}
                    </div>
                    <MobileMenu ref={mobileMenuRef} onLogout={handleLogout} />
                    {isDesktop ? null : renderAccountSection('left')}
                </Wrapper>
                <Wrapper variant='right'>{renderAccountSection('right')}</Wrapper>
                <AdminPasswordModal
                    isOpen={isAdminModalOpen}
                    onClose={handleAdminModalClose}
                    onSuccess={handleAdminSuccess}
                />
            </Header>
        </>
    );
});

export default AppHeader;
