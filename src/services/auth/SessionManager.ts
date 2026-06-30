/**
 * SessionManager - Secure Session Management and Recovery
 * Handles session persistence, encryption, and recovery
 */

import CryptoJS from 'crypto-js';

export interface SessionData {
    sessionId: string;
    loginId: string;
    accountList: Array<{
        loginid: string;
        token: string;
        currency: string;
    }>;
    activeAccount: string;
    createdAt: number;
    lastActivityAt: number;
    expiresAt: number;
}

const SESSION_KEY = 'trading_session';
const SESSION_ENCRYPTION_KEY = 'session_encryption_key';
const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

class SessionManager {
    private static instance: SessionManager;
    private currentSession: SessionData | null = null;
    private inactivityTimer: NodeJS.Timeout | null = null;
    private onSessionExpiredListeners: (() => void)[] = [];

    private constructor() {
        this.loadSession();
        this.setupInactivityTimer();
    }

    static getInstance(): SessionManager {
        if (!SessionManager.instance) {
            SessionManager.instance = new SessionManager();
        }
        return SessionManager.instance;
    }

    /**
     * Create and store new session
     */
    createSession(
        sessionData: Omit<SessionData, 'sessionId' | 'createdAt' | 'lastActivityAt' | 'expiresAt'>
    ): SessionData {
        const now = Date.now();
        const session: SessionData = {
            sessionId: this.generateSessionId(),
            loginId: sessionData.loginId,
            accountList: sessionData.accountList,
            activeAccount: sessionData.activeAccount,
            createdAt: now,
            lastActivityAt: now,
            expiresAt: now + SESSION_TIMEOUT_MS,
        };

        this.storeSession(session);
        this.currentSession = session;
        this.setupInactivityTimer();

        return session;
    }

    /**
     * Get current session
     */
    getSession(): SessionData | null {
        this.recordActivity();
        return this.currentSession;
    }

    /**
     * Validate session is still valid
     */
    isSessionValid(): boolean {
        if (!this.currentSession) {
            return false;
        }

        const now = Date.now();

        // Check if session has expired
        if (now >= this.currentSession.expiresAt) {
            this.clearSession();
            return false;
        }

        // Check if session is inactive
        const inactivityDuration = now - this.currentSession.lastActivityAt;
        if (inactivityDuration > SESSION_INACTIVITY_TIMEOUT_MS) {
            this.clearSession();
            return false;
        }

        return true;
    }

    /**
     * Record activity and reset inactivity timer
     */
    recordActivity(): void {
        if (this.currentSession) {
            this.currentSession.lastActivityAt = Date.now();
            this.storeSession(this.currentSession);
            this.setupInactivityTimer();
        }
    }

    /**
     * Update active account
     */
    updateActiveAccount(loginId: string): void {
        if (this.currentSession) {
            this.currentSession.activeAccount = loginId;
            this.storeSession(this.currentSession);
        }
    }

    /**
     * Get session metadata
     */
    getSessionMetadata(): {
        isValid: boolean;
        sessionAge: number | null;
        timeUntilExpiry: number | null;
        inactivityDuration: number | null;
    } {
        if (!this.currentSession) {
            return {
                isValid: false,
                sessionAge: null,
                timeUntilExpiry: null,
                inactivityDuration: null,
            };
        }

        const now = Date.now();
        const sessionAge = now - this.currentSession.createdAt;
        const timeUntilExpiry = Math.max(0, this.currentSession.expiresAt - now);
        const inactivityDuration = now - this.currentSession.lastActivityAt;

        return {
            isValid: this.isSessionValid(),
            sessionAge,
            timeUntilExpiry,
            inactivityDuration,
        };
    }

    /**
     * Refresh session expiry
     */
    refreshSession(): void {
        if (this.currentSession) {
            this.currentSession.lastActivityAt = Date.now();
            this.currentSession.expiresAt = Date.now() + SESSION_TIMEOUT_MS;
            this.storeSession(this.currentSession);
            this.setupInactivityTimer();
        }
    }

    /**
     * Clear session
     */
    clearSession(): void {
        try {
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(SESSION_ENCRYPTION_KEY);
            this.currentSession = null;
            this.clearInactivityTimer();

            // Notify listeners
            this.onSessionExpiredListeners.forEach(listener => listener());
        } catch (error) {
            console.error('Failed to clear session:', error);
        }
    }

    /**
     * Setup inactivity timeout
     */
    private setupInactivityTimer(): void {
        this.clearInactivityTimer();

        const timeout = Math.max(0, SESSION_INACTIVITY_TIMEOUT_MS);

        this.inactivityTimer = setTimeout(() => {
            this.clearSession();
        }, timeout);
    }

    /**
     * Clear inactivity timer
     */
    private clearInactivityTimer(): void {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }
    }

    /**
     * Load session from storage
     */
    private loadSession(): void {
        try {
            const encrypted = localStorage.getItem(SESSION_KEY);
            const encryptionKey = localStorage.getItem(SESSION_ENCRYPTION_KEY);

            if (!encrypted || !encryptionKey) {
                return;
            }

            const decrypted = CryptoJS.AES.decrypt(encrypted, encryptionKey).toString(CryptoJS.enc.Utf8);
            const session = JSON.parse(decrypted) as SessionData;

            // Validate session before loading
            if (this.validateSessionIntegrity(session)) {
                this.currentSession = session;
            } else {
                this.clearSession();
            }
        } catch (error) {
            console.error('Failed to load session:', error);
            this.clearSession();
        }
    }

    /**
     * Store session in localStorage (encrypted)
     */
    private storeSession(session: SessionData): void {
        try {
            const encryptionKey = this.getOrCreateEncryptionKey();
            const payload = JSON.stringify(session);
            const encrypted = CryptoJS.AES.encrypt(payload, encryptionKey).toString();

            localStorage.setItem(SESSION_KEY, encrypted);
            localStorage.setItem(SESSION_ENCRYPTION_KEY, encryptionKey);
        } catch (error) {
            console.error('Failed to store session:', error);
        }
    }

    /**
     * Get or create encryption key
     */
    private getOrCreateEncryptionKey(): string {
        let key = localStorage.getItem(SESSION_ENCRYPTION_KEY);

        if (!key) {
            key = CryptoJS.lib.WordArray.random(16).toString();
        }

        return key;
    }

    /**
     * Validate session integrity
     */
    private validateSessionIntegrity(session: any): boolean {
        // Check required fields
        if (!session.sessionId || !session.loginId || !session.accountList || !session.activeAccount) {
            return false;
        }

        // Check if session has expired
        if (Date.now() >= session.expiresAt) {
            return false;
        }

        // Check if session is too old
        if (session.createdAt && Date.now() - session.createdAt > SESSION_TIMEOUT_MS) {
            return false;
        }

        return true;
    }

    /**
     * Generate session ID
     */
    private generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Register session expired listener
     */
    onSessionExpired(listener: () => void): () => void {
        this.onSessionExpiredListeners.push(listener);

        // Return unsubscribe function
        return () => {
            this.onSessionExpiredListeners = this.onSessionExpiredListeners.filter(l => l !== listener);
        };
    }

    /**
     * Recover session from backup
     */
    recoverSession(backupData: SessionData): boolean {
        try {
            if (this.validateSessionIntegrity(backupData)) {
                this.storeSession(backupData);
                this.currentSession = backupData;
                this.setupInactivityTimer();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to recover session:', error);
            return false;
        }
    }

    /**
     * Export session for backup
     */
    exportSession(): SessionData | null {
        return this.currentSession ? { ...this.currentSession } : null;
    }
}

export default SessionManager.getInstance();
