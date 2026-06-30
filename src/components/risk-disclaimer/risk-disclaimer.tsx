import React, { useEffect, useRef, useState } from 'react';
import Button from '@/components/shared_ui/button';
import Modal from '@/components/shared_ui/modal';
import Text from '@/components/shared_ui/text';
import { localize } from '@deriv-com/translations';
import './risk-disclaimer.scss';

const SESSION_STORAGE_KEY = 'riskDisclaimerHidden';

const RiskDisclaimer = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isHidden, setIsHidden] = useState(false);
    const [position, setPosition] = useState({ left: 20, top: window?.innerHeight ? window.innerHeight - 80 : 20 });
    const isDragging = useRef(false);
    const dragMoved = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const startPosition = useRef({ left: 20, top: 20 });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const hidden = sessionStorage.getItem(SESSION_STORAGE_KEY) === 'true';
            setIsHidden(hidden);
            startPosition.current = { left: 20, top: window.innerHeight - 80 };
            setPosition(startPosition.current);
        }
    }, []);

    const handleOpenModal = () => {
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const handleUnderstand = () => {
        setIsModalOpen(false);
    };

    const handleDontShowAgain = () => {
        if (typeof window !== 'undefined') {
            sessionStorage.setItem(SESSION_STORAGE_KEY, 'true');
        }
        setIsHidden(true);
        setIsModalOpen(false);
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        isDragging.current = true;
        dragMoved.current = false;
        dragStart.current = { x: event.clientX, y: event.clientY };
        startPosition.current = { ...position };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging.current) return;

        const deltaX = event.clientX - dragStart.current.x;
        const deltaY = event.clientY - dragStart.current.y;
        const movement = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (movement > 5) {
            dragMoved.current = true;
        }

        const nextLeft = Math.max(0, Math.min(window.innerWidth - 180, startPosition.current.left + deltaX));
        const nextTop = Math.max(0, Math.min(window.innerHeight - 60, startPosition.current.top + deltaY));

        setPosition({ left: nextLeft, top: nextTop });
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging.current) return;
        isDragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
    };

    const handleWrapperClick = () => {
        if (!dragMoved.current) {
            handleOpenModal();
        }
    };

    if (isHidden) {
        return null;
    }

    return (
        <>
            {/* Floating Risk Disclaimer Button */}
            <div
                className='risk-disclaimer-button'
                style={{ left: position.left, top: position.top }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onClick={handleWrapperClick}
            >
                <Button className='risk-disclaimer-button__btn' onClick={handleOpenModal} secondary small>
                    {localize('Risk Disclaimer')}
                </Button>
            </div>

            {/* Risk Disclaimer Modal */}
            <Modal
                is_open={isModalOpen}
                title={localize('Risk Disclaimer')}
                onClose={handleCloseModal}
                width='520px'
                className='risk-disclaimer-modal'
            >
                <div className='risk-disclaimer-modal__content'>
                    <Text size='s' color='prominent' weight='bold' className='risk-disclaimer-modal__title'>
                        {localize('Important Risk Warning')}
                    </Text>

                    <Text size='xs' color='general' className='risk-disclaimer-modal__text'>
                        {localize(
                            'Deriv offers complex derivatives, such as options and contracts for difference ("CFDs"). These products are complex and may not be suitable for all clients. Trading them carries risk, and you should understand the risks before trading.'
                        )}
                    </Text>

                    <div className='risk-disclaimer-modal__points'>
                        <div className='risk-disclaimer-modal__point'>
                            <span>•</span>
                            <Text size='xs' color='general'>
                                {localize('You may lose some or all of the money you invest in a trade.')}
                            </Text>
                        </div>
                        <div className='risk-disclaimer-modal__point'>
                            <span>•</span>
                            <Text size='xs' color='general'>
                                {localize('If your trade involves currency conversion, exchange rates will affect your profit and loss.')}
                            </Text>
                        </div>
                        <div className='risk-disclaimer-modal__point'>
                            <span>•</span>
                            <Text size='xs' color='general'>
                                {localize('You should never trade with borrowed money or with funds you cannot afford to lose.')}
                            </Text>
                        </div>
                    </div>

                    <Text size='xs' color='general' className='risk-disclaimer-modal__footer'>
                        {localize('Always trade responsibly and only with money that you can afford to lose.')}
                    </Text>

                    <div className='risk-disclaimer-modal__actions'>
                        <Button className='risk-disclaimer-modal__understand-btn' onClick={handleUnderstand} primary>
                            {localize('I Understand')}
                        </Button>
                        <Button
                            className='risk-disclaimer-modal__dont-show-btn'
                            onClick={handleDontShowAgain}
                            secondary
                        >
                            {localize("Don't Show Again")}
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    );
};

export default RiskDisclaimer;
