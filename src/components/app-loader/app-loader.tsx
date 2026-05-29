
import React, { useState, useEffect, useRef } from 'react';
import './app-loader.scss';

// Module-level flag: stays true once user clicks play, survives component remount
let _audioUnlocked = false;
export function isAudioUnlocked() { return _audioUnlocked; }

interface AppLoaderProps {
    onLoadingComplete: () => void;
}

function playSiren(ctx: AudioContext, dst: AudioNode) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(dst);
    osc.start();

    // Siren: alternate between 800Hz and 1200Hz every 300ms
    let low = true;
    const freqInterval = setInterval(() => {
        osc.frequency.value = low ? 800 : 1200;
        low = !low;
    }, 300);

    // Fade out helper
    const fadeOut = (cb: () => void) => {
        clearInterval(freqInterval);
        let vol = 0.08;
        const fade = setInterval(() => {
            vol -= 0.008;
            if (vol <= 0) {
                gain.gain.value = 0;
                clearInterval(fade);
                osc.stop();
                cb();
            } else {
                gain.gain.value = vol;
            }
        }, 80);
    };

    return { fadeOut };
}

function playClang(ctx: AudioContext, dst: AudioNode) {
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'square';
    osc1.frequency.value = 1800;
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc1.connect(gain1);
    gain1.connect(dst);
    osc1.start(now);
    osc1.stop(now + 1.2);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = 1200;
    gain2.gain.setValueAtTime(0.1, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc2.connect(gain2);
    gain2.connect(dst);
    osc2.start(now);
    osc2.stop(now + 0.8);
}

const AppLoader: React.FC<AppLoaderProps> = ({ onLoadingComplete }) => {
    const [show, setShow] = useState(true);
    const [soundStarted, setSoundStarted] = useState(_audioUnlocked);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const sirenFadeRef = useRef<(() => void) | null>(null);
    const logoText = "MAKOTI TRADERS";

    useEffect(() => {
        if (_audioUnlocked) {
            // Auto-start if previously unlocked
            startSiren();
        }

        const sequenceTimer = setTimeout(() => {
            setShow(false);
            // Fade out siren
            if (sirenFadeRef.current) {
                sirenFadeRef.current();
                sirenFadeRef.current = null;
            } else if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
                audioCtxRef.current.close().catch(() => {});
            }
            onLoadingComplete();
        }, 4000);

        return () => {
            clearTimeout(sequenceTimer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onLoadingComplete]);

    function startSiren() {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = ctx;
        playClang(ctx, ctx.destination);
        const siren = playSiren(ctx, ctx.destination);
        sirenFadeRef.current = siren.fadeOut;
    }

    const handlePlaySound = () => {
        if (_audioUnlocked) return;
        _audioUnlocked = true;
        setSoundStarted(true);
        startSiren();
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
