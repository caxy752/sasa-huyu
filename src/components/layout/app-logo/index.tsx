import { useDevice } from '@deriv-com/ui';
import { useState, useEffect, useRef } from 'react';

import { LegacyMenuHamburger1pxIcon } from '@deriv/quill-icons/Legacy';
// Custom icons to match uploaded images exactly
import './app-logo.scss';

// Menu Icon for mobile/tablet
const MenuIcon = ({ onClick }: { onClick: () => void }) => (
    <button className='app-header__menu-icon-button' onClick={onClick} type='button' aria-label='Open menu'>
        <LegacyMenuHamburger1pxIcon iconSize='sm' fill='var(--text-general)' />
    </button>
);

// Logo asset served from public folder
const LOGO_SRC = '/assets/images/dinsider.jpg';

// WhatsApp Icon Component
const WhatsAppIcon = () => (
    <svg width='20' height='20' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
        <path
            d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488'
            fill='#25D366'
        />
    </svg>
);

// Telegram Icon Component
const TelegramIcon = () => (
    <svg width='20' height='20' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
        <path
            d='M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z'
            fill='#0088cc'
        />
    </svg>
);

// Small message icon + dropdown
const MessageMenu = () => {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('click', onDocClick);
        return () => document.removeEventListener('click', onDocClick);
    }, []);

    const onWhatsApp = () => window.open('https://whatsapp.com/channel/0029Vb6AXb58PgsEp9eSdP3R', '_blank');
    const onTelegram = () => window.open('https://t.me/Derivinsiders', '_blank');

    return (
        <div className='brand-message' ref={menuRef}>
            <button
                className='brand-message__btn brand-message__btn--phone'
                type='button'
                aria-label='Contact menu'
                onClick={() => setOpen(v => !v)}
            >
                <svg width='18' height='18' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'>
                    <path
                        d='M22 16.92V19.92C22.0011 20.1985 21.9441 20.4742 21.8325 20.7293C21.7209 20.9844 21.5573 21.2136 21.3521 21.4019C21.1468 21.5901 20.9046 21.7335 20.6407 21.8227C20.3769 21.9119 20.0974 21.9451 19.82 21.92C16.7428 21.5856 13.787 20.5341 11.19 18.85C8.77382 17.3147 6.72533 15.2662 5.18999 12.85C3.49997 10.2412 2.44824 7.27099 2.11999 4.18C2.095 3.90347 2.12787 3.62476 2.21649 3.36162C2.30512 3.09849 2.44756 2.85669 2.63476 2.65162C2.82196 2.44655 3.0498 2.28271 3.30379 2.17052C3.55777 2.05833 3.83233 2.00026 4.10999 2H7.10999C7.59531 1.99522 8.06679 2.16708 8.43376 2.48353C8.80073 2.79999 9.04207 3.23945 9.11999 3.72C9.28562 4.68007 9.56683 5.62273 9.95999 6.53C10.0676 6.79792 10.1118 7.08784 10.0894 7.37682C10.067 7.6658 9.97842 7.94674 9.82999 8.2L8.82999 9.8C9.90742 11.9882 11.6117 13.6925 13.8 14.77L15.4 13.17C15.6532 13.0216 15.9342 12.933 16.2232 12.9106C16.5122 12.8882 16.8021 12.9324 17.07 13.04C17.9773 13.4332 18.9199 13.7144 19.88 13.88C20.3696 13.9585 20.8148 14.2032 21.1315 14.5715C21.4482 14.9399 21.6158 15.4081 21.61 15.89L22 16.92Z'
                        fill='#ef4444'
                    />
                </svg>
            </button>
            {open && (
                <div className='brand-message__menu'>
                    <div className='brand-message__item' onClick={onWhatsApp}>
                        <WhatsAppIcon />
                        <span>WhatsApp</span>
                    </div>
                    <div className='brand-message__item' onClick={onTelegram}>
                        <TelegramIcon />
                        <span>Telegram</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export const AppLogo = ({ onMenuClick }: { onMenuClick?: () => void }) => {
    const { isDesktop } = useDevice();

    return (
        <div className='app-header__logo-container'>
        </div>
    );
};
