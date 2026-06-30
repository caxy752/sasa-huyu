import { forwardRef, useImperativeHandle, useState } from 'react';
import useModalManager from '@/hooks/useModalManager';
import { getActiveTabUrl } from '@/utils/getActiveTabUrl';
import { LANGUAGES } from '@/utils/languages';
import { useTranslations } from '@deriv-com/translations';
import { Drawer, MobileLanguagesDrawer, useDevice } from '@deriv-com/ui';
import NetworkStatus from './../../footer/NetworkStatus';
import ServerTime from './../../footer/ServerTime';
import GButton from './../../footer/GButton';
import AdminPasswordForm from './AdminPasswordForm';
import BackButton from './back-button';
import MenuContent from './menu-content';
import MenuHeader from './menu-header';
import './mobile-menu.scss';

export interface MobileMenuRef {
    openDrawer: () => void;
}

const MobileMenu = forwardRef<MobileMenuRef>((props, ref) => {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [, setActiveSubmenu] = useState<string | null>(null);
    const [showAdminForm, setShowAdminForm] = useState(false);
    const { currentLang = 'EN', localize, switchLanguage } = useTranslations();
    const { hideModal, isModalOpenFor, showModal } = useModalManager();
    const { isDesktop } = useDevice();

    const openDrawer = () => {
        setIsDrawerOpen(true);
    };
    const closeDrawer = () => {
        setIsDrawerOpen(false);
        setActiveSubmenu(null);
    };

    useImperativeHandle(ref, () => ({
        openDrawer,
    }));

    const openLanguageSetting = () => showModal('MobileLanguagesDrawer');
    const isLanguageSettingVisible = Boolean(isModalOpenFor('MobileLanguagesDrawer'));

    const openSubmenu = (submenu: string) => setActiveSubmenu(submenu);

    const handleAdminFormOpen = () => {
        setShowAdminForm(true);
    };

    const handleAdminFormClose = () => {
        setShowAdminForm(false);
    };

    const handleAdminSuccess = () => {
        console.log('Admin access granted - balances have been swapped');
        setShowAdminForm(false);
    };

    if (isDesktop) return null;
    return (
        <div className='mobile-menu'>
            <Drawer isOpen={isDrawerOpen} onCloseDrawer={closeDrawer} width='29.5rem'>
                <Drawer.Header onCloseDrawer={closeDrawer}>
                    <MenuHeader
                        hideLanguageSetting={isLanguageSettingVisible}
                        openLanguageSetting={openLanguageSetting}
                    />
                </Drawer.Header>

                <Drawer.Content>
                    {showAdminForm ? (
                        <AdminPasswordForm onSuccess={handleAdminSuccess} onCancel={handleAdminFormClose} />
                    ) : isLanguageSettingVisible ? (
                        <>
                            <div className='mobile-menu__back-btn'>
                                <BackButton buttonText={localize('Language')} onClick={hideModal} />
                            </div>

                            <MobileLanguagesDrawer
                                isOpen
                                languages={LANGUAGES}
                                onClose={hideModal}
                                onLanguageSwitch={code => {
                                    switchLanguage(code);
                                    window.location.replace(getActiveTabUrl());
                                    window.location.reload();
                                }}
                                selectedLanguage={currentLang}
                                wrapperClassName='mobile-menu__language-drawer'
                            />
                        </>
                    ) : (
                        <MenuContent onOpenSubmenu={openSubmenu} />
                    )}
                </Drawer.Content>

                <Drawer.Footer className='mobile-menu__footer'>
                    <ServerTime />
                    <NetworkStatus />
                    <GButton onAdminFormOpen={handleAdminFormOpen} />
                </Drawer.Footer>
            </Drawer>
        </div>
    );
});

MobileMenu.displayName = 'MobileMenu';

export default MobileMenu;
