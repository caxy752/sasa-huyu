import { DerivWSAccountsService, DerivAccount } from './derivws-accounts.service';
import { OAuthTokenExchangeService } from './oauth-token-exchange.service';

export class AccountService {
    static getAccounts(): DerivAccount[] {
        return DerivWSAccountsService.getStoredAccounts() || [];
    }

    static getActiveAccount(): DerivAccount | null {
        const accounts = this.getAccounts();
        if (accounts.length === 0) return null;
        const activeLoginId = localStorage.getItem('active_loginid');
        return accounts.find(acc => acc.account_id === activeLoginId || acc.loginid === activeLoginId) || accounts[0];
    }

    static setActiveAccount(loginId: string): void {
        localStorage.setItem('active_loginid', loginId);
        const accounts = this.getAccounts();
        const account = accounts.find(acc => acc.account_id === loginId || acc.loginid === loginId);
        if (account) {
            const isDemo = loginId.startsWith('VRT') || loginId.startsWith('VRTC');
            localStorage.setItem('account_type', isDemo ? 'demo' : 'real');
        }
    }
}

export default AccountService;
