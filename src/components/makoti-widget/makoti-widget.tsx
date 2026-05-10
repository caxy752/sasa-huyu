import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Scanner } from './scanner';
import { MarketKiller } from './market-killer';
import './makoti-widget.scss';

type Tab = 'scanner' | 'market_killer';

const DRAG_BOUNDS = { padding: 8 };

export const MakotiWidget: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<Tab>('scanner');
    const [pos, setPos] = useState<{ x: number; y: number }>(() => ({
        x: window.innerWidth - 100,
        y: window.innerHeight - 120,
    }));
    const [winPos, setWinPos] = useState<{ x: number; y: number }>(() => ({
        x: Math.max(8, window.innerWidth - 420),
        y: Math.max(8, window.innerHeight - 640),
    }));
    const [minimized, setMinimized] = useState(false);

    const draggingBtn = useRef(false);
    const draggingWin = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const winRef = useRef<HTMLDivElement>(null);

    const onBtnMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        draggingBtn.current = true;
        dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    }, [pos]);

    const onWinMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.mw-win-body')) return;
        e.preventDefault();
        draggingWin.current = true;
        dragOffset.current = { x: e.clientX - winPos.x, y: e.clientY - winPos.y };
    }, [winPos]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            const p = DRAG_BOUNDS.padding;
            if (draggingBtn.current) {
                setPos({
                    x: Math.max(p, Math.min(window.innerWidth - 70 - p, e.clientX - dragOffset.current.x)),
                    y: Math.max(p, Math.min(window.innerHeight - 70 - p, e.clientY - dragOffset.current.y)),
                });
            }
            if (draggingWin.current) {
                setWinPos({
                    x: Math.max(p, Math.min(window.innerWidth - 400 - p, e.clientX - dragOffset.current.x)),
                    y: Math.max(p, Math.min(window.innerHeight - 80, e.clientY - dragOffset.current.y)),
                });
            }
        };
        const onUp = () => {
            draggingBtn.current = false;
            draggingWin.current = false;
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, []);

    const handleBtnClick = useCallback((e: React.MouseEvent) => {
        if (draggingBtn.current) return;
        setOpen(o => !o);
    }, []);

    return (
        <>
            <button
                ref={btnRef}
                className={`mw-fab${open ? ' mw-fab--open' : ''}`}
                style={{ left: pos.x, top: pos.y }}
                onMouseDown={onBtnMouseDown}
                onClick={handleBtnClick}
                title='MAKOTI — Scanner & Market Killer'
            >
                <span className='mw-fab__pulse' />
                <span className='mw-fab__label'>MAKOTI</span>
            </button>

            {open && (
                <div
                    ref={winRef}
                    className={`mw-window${minimized ? ' mw-window--min' : ''}`}
                    style={{ left: winPos.x, top: winPos.y }}
                    onMouseDown={onWinMouseDown}
                >
                    <div className='mw-win-header'>
                        <div className='mw-win-title'>
                            <span className='mw-win-logo'>⚔</span>
                            <span>MAKOTI</span>
                        </div>
                        <div className='mw-win-actions'>
                            <button
                                className='mw-win-action'
                                onClick={() => setMinimized(m => !m)}
                                title={minimized ? 'Expand' : 'Minimize'}
                            >
                                {minimized ? '▲' : '▼'}
                            </button>
                            <button
                                className='mw-win-action mw-win-action--close'
                                onClick={() => setOpen(false)}
                                title='Close'
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    {!minimized && (
                        <>
                            <div className='mw-tabs'>
                                <button
                                    className={`mw-tab${tab === 'scanner' ? ' mw-tab--active' : ''}`}
                                    onClick={() => setTab('scanner')}
                                >
                                    Scanner
                                </button>
                                <button
                                    className={`mw-tab${tab === 'market_killer' ? ' mw-tab--active' : ''}`}
                                    onClick={() => setTab('market_killer')}
                                >
                                    Market Killer
                                </button>
                            </div>

                            <div className='mw-win-body'>
                                {tab === 'scanner' ? <Scanner /> : <MarketKiller />}
                            </div>
                        </>
                    )}
                </div>
            )}
        </>
    );
};

export default MakotiWidget;
