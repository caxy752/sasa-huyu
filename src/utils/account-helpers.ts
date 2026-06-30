export const isDemoAccount = (loginid?: string): boolean => {
    return !!loginid?.startsWith('VR');
};

export const getAccountType = (loginid?: string): 'demo' | 'real' => {
    return isDemoAccount(loginid) ? 'demo' : 'real';
};

export const getAccountId = (): string | null => {
    return localStorage.getItem('active_loginid') || null;
};

export const removeUrlParameter = (param: string): void => {
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete(param);
        window.history.replaceState({}, '', url.toString());
    } catch {
        // ignore
    }
};
