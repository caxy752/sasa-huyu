
import React, { useState, useEffect, useRef } from 'react';
import './app-loader.scss';

// Module-level flag: stays true once user clicks play, survives component remount
let _audioUnlocked = false;
export function isAudioUnlocked() { return _audioUnlocked; }

interface AppLoaderProps {
    onLoadingComplete: () => void;
}

const AppLoader: React.FC<AppLoaderProps> = ({ onLoadingComplete }) => {
    const [show, setShow] = useState(true);
    const [soundStarted, setSoundStarted] = useState(_audioUnlocked);
    const clangSoundRef = useRef<HTMLAudioElement | null>(null);
    const sirenSoundRef = useRef<HTMLAudioElement | null>(null);
    const logoText = "MAKOTI TRADERS";

    useEffect(() => {
        // --- SOUND INITIALIZATION ---
        try {
            sirenSoundRef.current = new Audio('/assets/media/siren.mp3');
            sirenSoundRef.current.loop = true;
            sirenSoundRef.current.volume = 0.2;
        } catch (e) { 
            console.error('Siren sound not found. Place it in /public/assets/media/siren.mp3');
        }

        try {
            clangSoundRef.current = new Audio('/assets/media/clang.mp3');
            clangSoundRef.current.volume = 0.6;
        } catch (e) {
            console.error('Clang sound not found. Place it in /public/assets/media/clang.mp3');
        }

        // If audio was already unlocked from a previous play click, auto-start
        if (_audioUnlocked) {
            clangSoundRef.current?.play().catch(() => {});
            sirenSoundRef.current?.play().catch(() => {});
        }

        // --- SEQUENCE COMPLETION ---
        const sequenceTimer = setTimeout(() => {
            setShow(false);
            // Fade out siren sound
            if (sirenSoundRef.current) {
                let vol = sirenSoundRef.current.volume;
                const fadeOut = setInterval(() => {
                    if (vol > 0.05) {
                        vol -= 0.05;
                        sirenSoundRef.current!.volume = vol;
                    } else {
                        sirenSoundRef.current?.pause();
                        clearInterval(fadeOut);
                    }
                }, 100);
            }
            onLoadingComplete();
        }, 4000);

        return () => {
            clearTimeout(sequenceTimer);
            // Don't pause siren if it's still looping — let it fade out naturally
        };
    }, [onLoadingComplete]);

    const handlePlaySound = () => {
        if (_audioUnlocked) return;
        _audioUnlocked = true;
        setSoundStarted(true);
        // Play both sounds immediately (user gesture = allowed)
        clangSoundRef.current?.play().catch(() => {});
        sirenSoundRef.current?.play().catch(() => {});
    };

    if (!show) return null;

    return (
        <div className='gta-loader'>
            <div className='scene'>
                <div className='siren-light red'></div>
                <div className='siren-light blue'></div>
                <div className='wet-ground'></div>
            </div>

            <div className='logo-container'>
                <h1 className='logo-text'>{logoText}</h1>
            </div>

            <p className='subtitle subtitle-1'>&gt; Initializing Trading Matrix...</p>
            <p className='subtitle subtitle-2'>&gt; Loading Strategies: Martingale, D'Alembert, Oscar's Grind...</p>
            <p className='subtitle subtitle-3'>&gt; Activating AI Core: Version 2.0</p>
            <p className='subtitle subtitle-4'>&gt; Real-time Analytics & Reporting</p>
            <p className='subtitle subtitle-5'>&gt; Welcome, Trader.</p>

            {!soundStarted && (
                <button className='sound-unlock-btn' onClick={handlePlaySound}>
                    🔊 PLAY SIREN
                </button>
            )}

            <div className='film-grain'></div>
            <div className='vignette'></div>
            <div className='scanlines'></div>
        </div>
    );
};

export default AppLoader;
