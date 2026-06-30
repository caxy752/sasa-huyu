/**
 * Environment Configuration Generator
 * Generates environment variables for deployment
 */

import AuthConfigManager, { OAuthConfig } from './AuthConfigManager';

export interface EnvironmentConfig {
    frontend: Record<string, string>;
    backend: Record<string, string>;
    deployment: Record<string, string>;
}

class ConfigurationGenerator {
    private static instance: ConfigurationGenerator;

    private constructor() {}

    static getInstance(): ConfigurationGenerator {
        if (!ConfigurationGenerator.instance) {
            ConfigurationGenerator.instance = new ConfigurationGenerator();
        }
        return ConfigurationGenerator.instance;
    }

    /**
     * Generate complete environment configuration
     */
    generateEnvironmentConfig(config: OAuthConfig): EnvironmentConfig {
        return {
            frontend: this.generateFrontendConfig(config),
            backend: this.generateBackendConfig(config),
            deployment: this.generateDeploymentConfig(config),
        };
    }

    /**
     * Generate frontend environment variables
     */
    private generateFrontendConfig(config: OAuthConfig): Record<string, string> {
        return {
            // OAuth Configuration
            REACT_APP_SITE_URL: config.siteUrl,
            REACT_APP_OAUTH_CLIENT_ID: config.clientId,
            REACT_APP_OAUTH_AUTHORIZATION_URL: config.authorizationUrl,
            REACT_APP_OAUTH_TOKEN_URL: config.tokenUrl,
            REACT_APP_OAUTH_REDIRECT_URI: config.redirectUri,
            REACT_APP_OAUTH_SCOPES: config.scopes.join(','),

            // Legacy Support
            REACT_APP_LEGACY_APP_ID: config.legacyAppId || '',
            REACT_APP_ENABLE_LEGACY_MODE: config.enableLegacyMode ? 'true' : 'false',

            // Feature Flags
            REACT_APP_ENABLE_OAUTH_REFRESH: 'true',
            REACT_APP_ENABLE_SESSION_RECOVERY: 'true',
            REACT_APP_TOKEN_REFRESH_THRESHOLD_MS: '300000', // 5 minutes

            // Security
            REACT_APP_SECURE_COOKIES: 'true',
            REACT_APP_CSRF_PROTECTION: 'true',

            // Analytics
            REACT_APP_TRACK_AUTH_EVENTS: 'true',

            // API Endpoints
            REACT_APP_API_BASE_URL: config.siteUrl,
            REACT_APP_AUTH_API_ENDPOINT: `${config.siteUrl}/api/auth`,
        };
    }

    /**
     * Generate backend environment variables
     */
    private generateBackendConfig(config: OAuthConfig): Record<string, string> {
        return {
            // OAuth Configuration
            OAUTH_CLIENT_ID: config.clientId,
            OAUTH_AUTHORIZATION_URL: config.authorizationUrl,
            OAUTH_TOKEN_URL: config.tokenUrl,
            OAUTH_REDIRECT_URI: config.redirectUri,

            // Legacy Support
            LEGACY_APP_ID: config.legacyAppId || '',
            ENABLE_LEGACY_MODE: config.enableLegacyMode ? 'true' : 'false',

            // Security
            SECURE_COOKIES: 'true',
            CSRF_PROTECTION: 'true',
            CSP_ENABLED: 'true',
            RATE_LIMITING_ENABLED: 'true',
            RATE_LIMIT_WINDOW_MS: '60000', // 1 minute
            RATE_LIMIT_MAX_REQUESTS: '100',

            // Session Configuration
            SESSION_TIMEOUT_MS: '86400000', // 24 hours
            SESSION_INACTIVITY_TIMEOUT_MS: '1800000', // 30 minutes

            // Token Configuration
            TOKEN_REFRESH_THRESHOLD_MS: '300000', // 5 minutes
            TOKEN_ENCRYPTION_ENABLED: 'true',

            // Logging
            LOG_LEVEL: 'info',
            LOG_AUTH_EVENTS: 'true',

            // Health Checks
            HEALTH_CHECK_INTERVAL_MS: '30000', // 30 seconds
        };
    }

    /**
     * Generate deployment configuration
     */
    private generateDeploymentConfig(config: OAuthConfig): Record<string, string> {
        return {
            // General
            NODE_ENV: 'production',
            PORT: '3000',
            HOST: '0.0.0.0',

            // Database (customize as needed)
            DATABASE_URL: 'postgresql://user:password@localhost:5432/trading_db',

            // Cache (Redis)
            REDIS_URL: 'redis://localhost:6379',

            // CORS Configuration
            CORS_ORIGINS: config.siteUrl,
            CORS_CREDENTIALS: 'true',

            // SSL/TLS
            HTTPS_ENABLED: 'true',
            SSL_CERT_PATH: '/etc/ssl/certs/cert.pem',
            SSL_KEY_PATH: '/etc/ssl/private/key.pem',

            // HSTS Configuration
            HSTS_MAX_AGE: '31536000',
            HSTS_INCLUDE_SUBDOMAINS: 'true',
            HSTS_PRELOAD: 'true',

            // Monitoring
            SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0',
            DATADOG_ENABLED: 'false',

            // Deployment Info
            DEPLOYMENT_ENVIRONMENT: 'production',
            VERSION: '1.0.0',
            BUILD_TIMESTAMP: new Date().toISOString(),
        };
    }

    /**
     * Export configuration as .env file format
     */
    exportAsEnvFile(config: OAuthConfig): string {
        const envConfig = this.generateEnvironmentConfig(config);
        let content = '';

        // Add sections with comments
        content += this.sectionHeader('Frontend OAuth Configuration');
        content += this.formatEnvVariables(envConfig.frontend);

        content += '\n' + this.sectionHeader('Backend OAuth Configuration');
        content += this.formatEnvVariables(envConfig.backend);

        content += '\n' + this.sectionHeader('Deployment Configuration');
        content += this.formatEnvVariables(envConfig.deployment);

        content += '\n' + this.sectionHeader('Sensitive Data (KEEP SECURE)');
        content += '# DO NOT COMMIT THESE VALUES TO VERSION CONTROL\n';
        content += 'OAUTH_CLIENT_SECRET=<REPLACE_WITH_SECRET>\n';
        content += 'TOKEN_ENCRYPTION_KEY=<REPLACE_WITH_KEY>\n';
        content += 'DATABASE_PASSWORD=<REPLACE_WITH_PASSWORD>\n';
        content += 'REDIS_PASSWORD=<REPLACE_WITH_PASSWORD>\n';

        return content;
    }

    /**
     * Export configuration as JSON
     */
    exportAsJSON(config: OAuthConfig): string {
        const envConfig = this.generateEnvironmentConfig(config);
        return JSON.stringify(
            {
                frontend: envConfig.frontend,
                backend: envConfig.backend,
                deployment: envConfig.deployment,
            },
            null,
            2
        );
    }

    /**
     * Export configuration as Docker .env file
     */
    exportAsDockerEnv(config: OAuthConfig): string {
        const envConfig = this.generateEnvironmentConfig(config);
        let content = '# Docker Environment Configuration\n';
        content += `# Generated: ${new Date().toISOString()}\n\n`;

        // Combine all configs for Docker
        const combined = {
            ...envConfig.frontend,
            ...envConfig.backend,
            ...envConfig.deployment,
        };

        return content + this.formatEnvVariables(combined);
    }

    /**
     * Export configuration for GitHub Secrets (CI/CD)
     */
    exportForGitHubSecrets(config: OAuthConfig): string {
        const envConfig = this.generateEnvironmentConfig(config);

        return `# Add these as GitHub Secrets (Settings > Secrets > New repository secret)

# Frontend Secrets
REACT_APP_OAUTH_CLIENT_ID=${config.clientId}
REACT_APP_OAUTH_AUTHORIZATION_URL=${config.authorizationUrl}
REACT_APP_OAUTH_TOKEN_URL=${config.tokenUrl}
REACT_APP_OAUTH_REDIRECT_URI=${config.redirectUri}

# Backend Secrets  
OAUTH_CLIENT_ID=${config.clientId}
OAUTH_TOKEN_URL=${config.tokenUrl}
OAUTH_REDIRECT_URI=${config.redirectUri}
OAUTH_CLIENT_SECRET=<REPLACE_WITH_SECRET>

# Security Keys
TOKEN_ENCRYPTION_KEY=<REPLACE_WITH_KEY>

# Other Secrets
DATABASE_URL=<REPLACE_WITH_URL>
REDIS_URL=<REPLACE_WITH_URL>
`;
    }

    /**
     * Export configuration for Vercel deployment
     */
    exportForVercel(config: OAuthConfig): string {
        const envConfig = this.generateEnvironmentConfig(config);

        return `{
  "env": {
    ${this.formatVercelEnv(envConfig.frontend)},
    ${this.formatVercelEnv(envConfig.backend)}
  }
}`;
    }

    /**
     * Export configuration for AWS Lambda/ECS
     */
    exportForAWS(config: OAuthConfig): string {
        const envConfig = this.generateEnvironmentConfig(config);

        return JSON.stringify(
            {
                taskDefinition: {
                    containerDefinitions: [
                        {
                            name: 'trading-app',
                            environment: Object.entries({ ...envConfig.frontend, ...envConfig.backend }).map(
                                ([name, value]) => ({ name, value })
                            ),
                            secrets: [
                                { name: 'OAUTH_CLIENT_SECRET', valueFrom: 'arn:aws:secretsmanager:...' },
                                { name: 'TOKEN_ENCRYPTION_KEY', valueFrom: 'arn:aws:secretsmanager:...' },
                            ],
                        },
                    ],
                },
            },
            null,
            2
        );
    }

    /**
     * Validate configuration completeness
     */
    validateConfiguration(config: OAuthConfig): {
        isValid: boolean;
        errors: string[];
        warnings: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Required fields
        if (!config.siteUrl) errors.push('Site URL is required');
        if (!config.clientId) errors.push('OAuth Client ID is required');
        if (!config.authorizationUrl) errors.push('Authorization URL is required');
        if (!config.tokenUrl) errors.push('Token URL is required');
        if (!config.redirectUri) errors.push('Redirect URI is required');
        if (!config.scopes || config.scopes.length === 0) errors.push('At least one scope is required');

        // Validation checks
        if (!this.isValidUrl(config.siteUrl)) {
            errors.push('Site URL must be a valid URL');
        }
        if (!this.isValidUrl(config.authorizationUrl)) {
            errors.push('Authorization URL must be a valid URL');
        }
        if (!this.isValidUrl(config.tokenUrl)) {
            errors.push('Token URL must be a valid URL');
        }
        if (!this.isValidUrl(config.redirectUri)) {
            errors.push('Redirect URI must be a valid URL');
        }

        // Warnings
        if (config.enableLegacyMode && !config.legacyAppId) {
            warnings.push('Legacy mode enabled but no Legacy App ID provided');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
        };
    }

    /**
     * Generate configuration checklist
     */
    generateChecklist(config: OAuthConfig): string {
        const validation = this.validateConfiguration(config);

        let checklist = '# OAuth Configuration Checklist\n\n';

        checklist += '## Required Setup\n';
        checklist += `- [${config.siteUrl ? 'x' : ' '}] Site URL configured\n`;
        checklist += `- [${config.clientId ? 'x' : ' '}] OAuth Client ID configured\n`;
        checklist += `- [${config.authorizationUrl ? 'x' : ' '}] Authorization URL configured\n`;
        checklist += `- [${config.tokenUrl ? 'x' : ' '}] Token URL configured\n`;
        checklist += `- [${config.redirectUri ? 'x' : ' '}] Redirect URI configured\n`;

        checklist += '\n## Security Configuration\n';
        checklist += `- [${config.codeChallengMethod === 'S256' ? 'x' : ' '}] PKCE S256 enabled\n`;
        checklist += `- [ ] HTTPS configured on production\n`;
        checklist += `- [ ] Secure cookies enabled\n`;
        checklist += `- [ ] CSRF protection enabled\n`;

        checklist += '\n## Trading Scopes\n';
        config.scopes.forEach(scope => {
            checklist += `- [x] ${scope}\n`;
        });

        if (config.enableLegacyMode) {
            checklist += '\n## Legacy Support\n';
            checklist += `- [${config.legacyAppId ? 'x' : ' '}] Legacy App ID: ${config.legacyAppId || 'Not set'}\n`;
        }

        checklist += '\n## Deployment Steps\n';
        checklist += '- [ ] Generate .env file\n';
        checklist += '- [ ] Test OAuth endpoints\n';
        checklist += '- [ ] Configure GitHub Secrets\n';
        checklist += '- [ ] Deploy to staging\n';
        checklist += '- [ ] Test complete OAuth flow\n';
        checklist += '- [ ] Deploy to production\n';

        return checklist;
    }

    /**
     * Helper: Format environment variables
     */
    private formatEnvVariables(variables: Record<string, string>): string {
        return (
            Object.entries(variables)
                .map(([key, value]) => `${key}=${value}`)
                .join('\n') + '\n'
        );
    }

    /**
     * Helper: Format section header
     */
    private sectionHeader(title: string): string {
        return `\n# ${title}\n${'='.repeat(title.length + 2)}\n`;
    }

    /**
     * Helper: Validate URL
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
     * Helper: Format Vercel env
     */
    private formatVercelEnv(variables: Record<string, string>): string {
        return Object.entries(variables)
            .map(([key, value]) => `"${key}": "${value}"`)
            .join(',\n    ');
    }
}

export default ConfigurationGenerator.getInstance();
