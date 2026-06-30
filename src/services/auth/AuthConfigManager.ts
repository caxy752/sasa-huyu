/**
 * AuthConfigManager - Secure OAuth 2.0 Configuration Management
 * Handles dynamic configuration loading, validation, and encryption
 */

import CryptoJS from 'crypto-js';

export interface OAuthConfig {
    siteUrl: string;
    clientId: string;
    authorizationUrl: string;
    tokenUrl: string;
    redirectUri: string;
    scopes: string[];
    legacyAppId?: string;
    enableLegacyMode: boolean;
    codeChallengMethod: 'S256' | 'plain';
}

export interface AuthConfigPayload extends OAuthConfig {
    configVersion: string;
    createdAt: number;
    encryptionKey: string;
}

const CONFIG_STORAGE_KEY = 'oauth_config_v1';
const ENCRYPTION_KEY_STORAGE = 'oauth_encryption_key';
const CONFIG_VALIDATION_KEY = 'config_validated';

class AuthConfigManager {
    private static instance: AuthConfigManager;
    private config: OAuthConfig | null = null;
    private encryptionKey: string = '';
    private isInitialized: boolean = false;

    private constructor() {
        this.loadStoredConfig();
    }

    static getInstance(): AuthConfigManager {
        if (!AuthConfigManager.instance) {
            AuthConfigManager.instance = new AuthConfigManager();
        }
        return AuthConfigManager.instance;
    }

    /**
     * Initialize configuration from environment or storage
     */
    async initialize(config?: Partial<OAuthConfig>): Promise<void> {
        if (this.isInitialized && !config) {
            return;
        }

        if (config) {
            await this.setConfig(config);
        } else {
            this.loadStoredConfig();
        }

        this.isInitialized = true;
    }

    /**
     * Load configuration from localStorage
     */
    private loadStoredConfig(): void {
        try {
            const storedConfig = localStorage.getItem(CONFIG_STORAGE_KEY);
            this.encryptionKey = localStorage.getItem(ENCRYPTION_KEY_STORAGE) || this.generateEncryptionKey();

            if (storedConfig) {
                const decrypted = this.decryptConfig(storedConfig);
                this.config = decrypted;
                localStorage.setItem(ENCRYPTION_KEY_STORAGE, this.encryptionKey);
            } else {
                // Load from environment variables
                this.loadFromEnvironment();
            }
        } catch (error) {
            console.error('Failed to load stored config:', error);
            this.loadFromEnvironment();
        }
    }

    /**
     * Load configuration from environment variables
     */
    private loadFromEnvironment(): void {
        const siteUrl = process.env.REACT_APP_SITE_URL || process.env.VITE_SITE_URL || '';
        const clientId = process.env.REACT_APP_OAUTH_CLIENT_ID || process.env.VITE_OAUTH_CLIENT_ID || '';
        const authorizationUrl =
            process.env.REACT_APP_OAUTH_AUTHORIZATION_URL || process.env.VITE_OAUTH_AUTHORIZATION_URL || '';
        const tokenUrl = process.env.REACT_APP_OAUTH_TOKEN_URL || process.env.VITE_OAUTH_TOKEN_URL || '';
        const redirectUri = process.env.REACT_APP_OAUTH_REDIRECT_URI || process.env.VITE_OAUTH_REDIRECT_URI || '';
        const scopes = (
            process.env.REACT_APP_OAUTH_SCOPES ||
            process.env.VITE_OAUTH_SCOPES ||
            'read,trade,payments'
        ).split(',');
        const legacyAppId = process.env.REACT_APP_LEGACY_APP_ID || process.env.VITE_LEGACY_APP_ID;
        const enableLegacyMode =
            (process.env.REACT_APP_ENABLE_LEGACY_MODE || process.env.VITE_ENABLE_LEGACY_MODE) === 'true';

        if (siteUrl && clientId && authorizationUrl && tokenUrl && redirectUri) {
            this.config = {
                siteUrl,
                clientId,
                authorizationUrl,
                tokenUrl,
                redirectUri,
                scopes,
                legacyAppId,
                enableLegacyMode,
                codeChallengMethod: 'S256',
            };
        }
    }

    /**
     * Set and validate configuration
     */
    async setConfig(config: Partial<OAuthConfig>): Promise<void> {
        const validatedConfig = await this.validateConfig(config);
        this.config = {
            siteUrl: validatedConfig.siteUrl || this.config?.siteUrl || '',
            clientId: validatedConfig.clientId || this.config?.clientId || '',
            authorizationUrl: validatedConfig.authorizationUrl || this.config?.authorizationUrl || '',
            tokenUrl: validatedConfig.tokenUrl || this.config?.tokenUrl || '',
            redirectUri: validatedConfig.redirectUri || this.config?.redirectUri || '',
            scopes: validatedConfig.scopes || this.config?.scopes || [],
            legacyAppId: validatedConfig.legacyAppId || this.config?.legacyAppId,
            enableLegacyMode: validatedConfig.enableLegacyMode ?? this.config?.enableLegacyMode ?? false,
            codeChallengMethod: 'S256',
        };

        this.saveConfig(this.config);
    }

    /**
     * Validate OAuth configuration
     */
    private async validateConfig(config: Partial<OAuthConfig>): Promise<Partial<OAuthConfig>> {
        const errors: string[] = [];

        if (config.siteUrl && !this.isValidUrl(config.siteUrl)) {
            errors.push('Invalid Site URL format');
        }

        if (config.authorizationUrl && !this.isValidUrl(config.authorizationUrl)) {
            errors.push('Invalid Authorization URL format');
        }

        if (config.tokenUrl && !this.isValidUrl(config.tokenUrl)) {
            errors.push('Invalid Token URL format');
        }

        if (config.redirectUri && !this.isValidUrl(config.redirectUri)) {
            errors.push('Invalid Redirect URI format');
        }

        if (config.clientId && config.clientId.trim().length === 0) {
            errors.push('Client ID cannot be empty');
        }

        if (errors.length > 0) {
            throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
        }

        return config;
    }

    /**
     * Test connection to endpoints
     */
    async testConnections(): Promise<{
        authEndpointValid: boolean;
        tokenEndpointValid: boolean;
        redirectUriValid: boolean;
        errors: string[];
    }> {
        if (!this.config) {
            throw new Error('Configuration not initialized');
        }

        const errors: string[] = [];
        let authEndpointValid = false;
        let tokenEndpointValid = false;
        let redirectUriValid = false;

        // Test authorization endpoint
        try {
            const authResponse = await fetch(this.config.authorizationUrl, { method: 'HEAD' });
            authEndpointValid = authResponse.ok || authResponse.status === 405; // 405 is expected for HEAD
        } catch (error) {
            errors.push(`Authorization endpoint unreachable: ${error}`);
        }

        // Test token endpoint
        try {
            const tokenResponse = await fetch(this.config.tokenUrl, { method: 'HEAD' });
            tokenEndpointValid = tokenResponse.ok || tokenResponse.status === 405;
        } catch (error) {
            errors.push(`Token endpoint unreachable: ${error}`);
        }

        // Validate redirect URI format
        redirectUriValid = this.isValidUrl(this.config.redirectUri);

        return {
            authEndpointValid,
            tokenEndpointValid,
            redirectUriValid,
            errors,
        };
    }

    /**
     * Get current configuration (non-sensitive fields)
     */
    getConfig(): Partial<OAuthConfig> {
        if (!this.config) {
            return {};
        }

        return {
            siteUrl: this.config.siteUrl,
            redirectUri: this.config.redirectUri,
            scopes: this.config.scopes,
            enableLegacyMode: this.config.enableLegacyMode,
            codeChallengMethod: this.config.codeChallengMethod,
        };
    }

    /**
     * Get sensitive configuration (use with caution)
     */
    getSensitiveConfig(): OAuthConfig | null {
        return this.config;
    }

    /**
     * Get OAuth URLs and parameters
     */
    getOAuthUrls(): {
        authorizationUrl: string;
        tokenUrl: string;
        clientId: string;
        redirectUri: string;
    } {
        if (!this.config) {
            throw new Error('Configuration not initialized');
        }

        return {
            authorizationUrl: this.config.authorizationUrl,
            tokenUrl: this.config.tokenUrl,
            clientId: this.config.clientId,
            redirectUri: this.config.redirectUri,
        };
    }

    /**
     * Save configuration to localStorage (encrypted)
     */
    private saveConfig(config: OAuthConfig): void {
        try {
            const encrypted = this.encryptConfig(config);
            localStorage.setItem(CONFIG_STORAGE_KEY, encrypted);
            localStorage.setItem(ENCRYPTION_KEY_STORAGE, this.encryptionKey);
            localStorage.setItem(CONFIG_VALIDATION_KEY, new Date().toISOString());
        } catch (error) {
            console.error('Failed to save config:', error);
            throw error;
        }
    }

    /**
     * Encrypt configuration
     */
    private encryptConfig(config: OAuthConfig): string {
        const payload = JSON.stringify({
            ...config,
            timestamp: Date.now(),
        });

        return CryptoJS.AES.encrypt(payload, this.encryptionKey).toString();
    }

    /**
     * Decrypt configuration
     */
    private decryptConfig(encrypted: string): OAuthConfig {
        const decrypted = CryptoJS.AES.decrypt(encrypted, this.encryptionKey).toString(CryptoJS.enc.Utf8);
        return JSON.parse(decrypted);
    }

    /**
     * Generate encryption key
     */
    private generateEncryptionKey(): string {
        return CryptoJS.lib.WordArray.random(16).toString();
    }

    /**
     * Validate URL format
     */
    private isValidUrl(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Clear stored configuration
     */
    clearConfig(): void {
        localStorage.removeItem(CONFIG_STORAGE_KEY);
        localStorage.removeItem(ENCRYPTION_KEY_STORAGE);
        localStorage.removeItem(CONFIG_VALIDATION_KEY);
        this.config = null;
        this.isInitialized = false;
    }

    /**
     * Export configuration for deployment
     */
    exportConfiguration(): Record<string, string> {
        if (!this.config) {
            throw new Error('Configuration not initialized');
        }

        return {
            REACT_APP_SITE_URL: this.config.siteUrl,
            REACT_APP_OAUTH_CLIENT_ID: this.config.clientId,
            REACT_APP_OAUTH_AUTHORIZATION_URL: this.config.authorizationUrl,
            REACT_APP_OAUTH_TOKEN_URL: this.config.tokenUrl,
            REACT_APP_OAUTH_REDIRECT_URI: this.config.redirectUri,
            REACT_APP_OAUTH_SCOPES: this.config.scopes.join(','),
            REACT_APP_LEGACY_APP_ID: this.config.legacyAppId || '',
            REACT_APP_ENABLE_LEGACY_MODE: this.config.enableLegacyMode ? 'true' : 'false',
        };
    }
}

export default AuthConfigManager.getInstance();
