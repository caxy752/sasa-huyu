import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './community-modal.scss';

const CommunityModal: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Don't show modal on page refresh - only show on first visit
        // Check if this is a page refresh by checking if we have session data
        const hasSessionData = sessionStorage.getItem('has_visited') === 'true';

        if (!hasSessionData) {
            // First visit - show modal and mark as visited
            sessionStorage.setItem('has_visited', 'true');
            const timer = setTimeout(() => {
                setIsVisible(true);
                document.body.classList.add('community-modal-open');
            }, 1000); // 1 second after page load

            return () => {
                clearTimeout(timer);
                document.body.classList.remove('community-modal-open');
            };
        } else {
            // Page refresh - don't show modal
            setIsVisible(false);
        }
    }, []);

    useEffect(() => {
        // Update body class when modal visibility changes
        if (isVisible) {
            document.body.classList.add('community-modal-open');
        } else {
            document.body.classList.remove('community-modal-open');
        }

        return () => {
            document.body.classList.remove('community-modal-open');
        };
    }, [isVisible]);

    const handleClose = () => {
        setIsVisible(false);
        document.body.classList.remove('community-modal-open');
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            handleClose();
        }
    };

    const handleNoThanks = () => {
        setIsVisible(false);
        document.body.classList.remove('community-modal-open');
    };

    const handleMaybeLater = () => {
        setIsVisible(false);
        document.body.classList.remove('community-modal-open');
    };

    if (!isVisible) return null;

    const modalContent = (
        <div className='community-modal-overlay' onClick={handleBackdropClick}>
            <div className='community-modal' onClick={e => e.stopPropagation()}>
                <button className='community-modal__close' onClick={handleClose} aria-label='Close'>
                    <svg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
                        <path
                            d='M18 6L6 18M6 6L18 18'
                            stroke='currentColor'
                            strokeWidth='2'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                        />
                    </svg>
                </button>

                <div className='community-modal__header'>
                    <div className='community-modal__icon rocket-icon'>
                        <svg width='32' height='32' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
                            <path
                                d='M4.5 16.5C4.5 16.5 6 18 7.5 18C9 18 10.5 16.5 10.5 16.5M4.5 16.5C4.5 16.5 3 15 3 13.5C3 12 4.5 10.5 4.5 10.5M4.5 16.5L2 19M10.5 16.5C10.5 16.5 12 18 13.5 18C15 18 16.5 16.5 16.5 16.5M10.5 16.5L13 19M16.5 16.5C16.5 16.5 18 15 18 13.5C18 12 16.5 10.5 16.5 10.5M16.5 16.5L19 19M10.5 7.5L12 4.5L13.5 7.5'
                                stroke='#ef4444'
                                strokeWidth='2'
                                strokeLinecap='round'
                                strokeLinejoin='round'
                            />
                        </svg>
                    </div>
                    <h2 className='community-modal__title'>Join Our Trading Community</h2>
                    <p className='community-modal__subtitle'>Connect & Grow Together</p>
                </div>

                <div className='community-modal__content'>
                    <div className='community-modal__message'>
                        <div className='community-modal__icon speech-icon'>
                            <svg
                                width='20'
                                height='20'
                                viewBox='0 0 24 24'
                                fill='none'
                                xmlns='http://www.w3.org/2000/svg'
                            >
                                <path
                                    d='M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z'
                                    stroke='currentColor'
                                    strokeWidth='2'
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                />
                            </svg>
                        </div>
                        <p>
                            Connect with fellow traders! Share your trading experiences, strategies, and get the latest
                            updates on new features and classes.
                        </p>
                    </div>

                    <div className='community-modal__actions'>
                        <button
                            type='button'
                            disabled
                            className='community-modal__button community-modal__button--whatsapp'
                            aria-label='WhatsApp channel disabled'
                        >
                            Join WhatsApp Channel
                        </button>
                        <button
                            type='button'
                            disabled
                            className='community-modal__button community-modal__button--telegram'
                            aria-label='Telegram channel disabled'
                        >
                            Join Telegram
                        </button>
                        <button
                            type='button'
                            disabled
                            className='community-modal__button community-modal__button--youtube'
                            aria-label='YouTube channel disabled'
                        >
                            Subscribe YouTube
                        </button>
                    </div>

                    <div className='community-modal__info'>
                        <p>Get access to strategies, bots and guides sent earlier on our channels</p>
                        <div className='community-modal__links'>
                            <span className='community-modal__link' aria-disabled='true'>
                                WhatsApp Channel
                            </span>
                            <span className='community-modal__link' aria-disabled='true'>
                                Telegram Channel
                            </span>
                            <span className='community-modal__link' aria-disabled='true'>
                                YouTube Channel
                            </span>
                        </div>
                    </div>

                    <div className='community-modal__footer'>
                        <button
                            className='community-modal__button community-modal__button--no-thanks'
                            onClick={handleNoThanks}
                        >
                            NO THANKS
                        </button>
                        <button
                            className='community-modal__button community-modal__button--maybe-later'
                            onClick={handleMaybeLater}
                        >
                            MAYBE LATER
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    // Render modal outside #root using portal to avoid blur inheritance
    return ReactDOM.createPortal(modalContent, document.body);
};

export default CommunityModal;
