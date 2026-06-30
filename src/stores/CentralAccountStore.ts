import { makeAutoObservable } from 'mobx';
import { DerivAccount } from '@/services/derivws-accounts.service';
import { AccountService } from '@/services/account-service';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';

export class CentralAccountStore {
    accessToken: string | null = null;
    accounts: DerivAccount[] = [];
    activeAccount: DerivAccount | null = null;

    constructor() {
        makeAutoObservable(this);
        this.loadFromStorage();
    }

    loadFromStorage() {
        this.accessToken = OAuthTokenExchangeService.getAccessToken();
        this.accounts = AccountService.getAccounts();
        this.activeAccount = AccountService.getActiveAccount();
    }

    get activeAccountId(): string | null {
        return this.activeAccount?.account_id || null;
    }

    get activeLoginId(): string | null {
        return this.activeAccount?.account_id || this.activeAccount?.loginid || null;
    }

    setActiveAccount(loginId: string) {
        AccountService.setActiveAccount(loginId);
        this.activeAccount = AccountService.getActiveAccount();
    }

    updateAccounts(accounts: DerivAccount[]) {
        this.accounts = accounts;
        this.activeAccount = AccountService.getActiveAccount();
    }

    setAccessToken(token: string | null) {
        this.accessToken = token;
    }

    clear() {
        this.accessToken = null;
        this.accounts = [];
        this.activeAccount = null;
    }
}

export const centralAccountStore = new CentralAccountStore();
export default centralAccountStore;
