import { isProduction } from '@/components/shared';
import brandConfig from '@/components/shared/brand.config.json';

export interface DerivAccount {
    account_id: string;
    balance: string;
    currency: string;
    group: string;
    status: string;
    account_type: 'demo' | 'real';
}

interface AccountsResponse {
    data: DerivAccount[];
}

interface OTPResponseData {
    url: string;
}

interface OTPResponse {
    data: OTPResponseData;
}

export class DerivWSAccountsService {
    private static accountsFetchPromise: Promise<DerivAccount[]> | null = null;
    private static otpFetchPromises: Map<string, Promise<string>> = new Map();

    private static getDerivWSBaseURL(): string {
        const environment = isProduction() ? 'production' : 'staging';
        const FALLBACK_URLS: Record<string, string> = {
            production: 'https://api.derivws.com/trading/v1/options/',
            staging: 'https://staging-api.derivws.com/trading/v1/options/',
        };
        const configuredUrl = (brandConfig as any).platform?.derivws?.url?.[environment];
        const resolvedUrl = (configuredUrl && configuredUrl.trim()) ? configuredUrl : FALLBACK_URLS[environment];
        return resolvedUrl;
    }

    static clearCache(): void {
        this.accountsFetchPromise = null;
        this.otpFetchPromises.clear();
    }

    static storeAccounts(accounts: DerivAccount[]): void {
        sessionStorage.setItem('deriv_accounts', JSON.stringify(accounts));
    }

    static getStoredAccounts(): DerivAccount[] | null {
        try {
            const accountsStr = sessionStorage.getItem('deriv_accounts');
            if (!accountsStr) return null;
            return JSON.parse(accountsStr) as DerivAccount[];
        } catch (error) {
            console.error('[DerivWS] Error parsing stored accounts:', error);
            return null;
        }
    }

    static getDefaultAccount(): DerivAccount | null {
        const accounts = this.getStoredAccounts();
        if (!accounts || accounts.length === 0) return null;
        return accounts[0];
    }

    static clearStoredAccounts(): void {
        sessionStorage.removeItem('deriv_accounts');
    }

    static async fetchAccountsList(accessToken: string): Promise<DerivAccount[]> {
        if (this.accountsFetchPromise) return this.accountsFetchPromise;

        this.accountsFetchPromise = (async () => {
            try {
                const baseURL = this.getDerivWSBaseURL();
                const OptionsDir = (brandConfig as any).platform?.derivws?.directories?.options || '';
                const endpoint = `${baseURL}${OptionsDir}accounts`;
                console.log('[DerivWS] fetchAccountsList endpoint:', endpoint);
                console.log('Fetching URL:', endpoint);

                const response = await fetch(endpoint, {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Deriv-App-ID': (brandConfig as any).oauth?.client_id || process.env.CLIENT_ID || '33xD5lqNn16dXdKNver3',
                    },
                });

                const text = await response.text();
                console.log('Raw API Response (Fetch Accounts List):', text);
                console.log('RESPONSE TYPE:', typeof text);
                console.log('STATUS:', response.status);
                console.log('URL:', response.url);

                if (text.trim().startsWith('<!DOCTYPE html>') || text.trim().startsWith('<html')) {
                    console.error('Endpoint returned HTML instead of JSON. Broken route:', endpoint);
                }

                if (!response.ok) {
                    throw new Error(`Failed to fetch accounts: ${response.status} ${response.statusText}`);
                }

                let data: AccountsResponse;
                try {
                    data = text ? JSON.parse(text) : {};
                } catch (err) {
                    console.error('JSON Parse Failed for fetchAccountsList');
                    console.error(text);
                    throw err;
                }
                const accounts = data?.data || [];

                if (accounts.length === 0) console.warn('[DerivWS] No accounts found in response');

                this.storeAccounts(accounts);
                return accounts;
            } catch (error) {
                console.error('[DerivWS] Error fetching accounts:', error);
                this.accountsFetchPromise = null;
                throw error;
            } finally {
                setTimeout(() => {
                    this.accountsFetchPromise = null;
                }, 100);
            }
        })();

        return this.accountsFetchPromise;
    }

    static async fetchOTPWebSocketURL(accessToken: string, accountId: string): Promise<string> {
        const cacheKey = `${accountId}`;
        if (this.otpFetchPromises.has(cacheKey)) return this.otpFetchPromises.get(cacheKey)!;

        const otpPromise = (async () => {
            try {
                const baseURL = this.getDerivWSBaseURL();
                const optionsDir = (brandConfig as any).platform?.derivws?.directories?.options || '';
                const endpoint = `${baseURL}${optionsDir}accounts/${accountId}/otp`;
                console.log('[DerivWS] fetchOTPWebSocketURL endpoint:', endpoint);
                console.log('Fetching URL:', endpoint);

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Deriv-App-ID': (brandConfig as any).oauth?.client_id || process.env.CLIENT_ID || '33xD5lqNn16dXdKNver3',
                    },
                });

                const text = await response.text();
                console.log('Raw API Response (Fetch OTP):', text);
                console.log('RESPONSE TYPE:', typeof text);
                console.log('STATUS:', response.status);
                console.log('URL:', response.url);

                if (text.trim().startsWith('<!DOCTYPE html>') || text.trim().startsWith('<html')) {
                    console.error('Endpoint returned HTML instead of JSON. Broken route:', endpoint);
                }

                if (!response.ok) throw new Error(`Failed to fetch OTP: ${response.status} ${response.statusText}`);

                let otpResponse: OTPResponse;
                try {
                    otpResponse = text ? JSON.parse(text) : {};
                } catch (err) {
                    console.error('JSON Parse Failed for fetchOTPWebSocketURL');
                    console.error(text);
                    throw err;
                }
                const websocketURL = otpResponse.data?.url;
                if (!websocketURL) throw new Error('WebSocket URL not found in OTP response');
                return websocketURL;
            } catch (error) {
                console.error('[DerivWS] Error fetching OTP:', error);
                this.otpFetchPromises.delete(cacheKey);
                throw error;
            } finally {
                setTimeout(() => {
                    this.otpFetchPromises.delete(cacheKey);
                }, 100);
            }
        })();

        this.otpFetchPromises.set(cacheKey, otpPromise);
        return otpPromise;
    }

    static async getAuthenticatedWebSocketURL(accessToken: string): Promise<string> {
        try {
            let accounts: DerivAccount[] | null = null;
            const storedAccounts = this.getStoredAccounts();
            if (storedAccounts && storedAccounts.length > 0) accounts = storedAccounts;
            else accounts = await this.fetchAccountsList(accessToken);

            if (!accounts || accounts.length === 0) throw new Error('No accounts available');

            const activeLoginId = localStorage.getItem('active_loginid');
            const targetAccount = (activeLoginId && accounts.find(a => a.account_id === activeLoginId)) || accounts[0];

            const websocketURL = await this.fetchOTPWebSocketURL(accessToken, targetAccount.account_id);
            return websocketURL;
        } catch (error) {
            console.error('[DerivWS] Error in authenticated WebSocket URL flow:', error);
            throw error;
        }
    }
}

export default DerivWSAccountsService;
