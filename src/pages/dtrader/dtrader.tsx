import React, { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';

const DTRADER_BASE = 'https://deriv-dtrader.vercel.app/';

function buildDtraderUrl(): string {
    try {
        const accountsList: Record<string, string> = JSON.parse(localStorage.getItem('accountsList') ?? '{}');
        const clientAccounts: Record<string, any> = JSON.parse(localStorage.getItem('clientAccounts') ?? '{}');

        const loginIds = Object.keys(accountsList);
        if (loginIds.length === 0) return DTRADER_BASE;

        const params = new URLSearchParams();
        loginIds.forEach((loginId, index) => {
            const n = index + 1;
            const token = accountsList[loginId];
            const currency = clientAccounts[loginId]?.currency ?? '';
            params.set(`acct${n}`, loginId);
            params.set(`token${n}`, token);
            if (currency) params.set(`cur${n}`, currency);
        });

        return `${DTRADER_BASE}?${params.toString()}`;
    } catch {
        return DTRADER_BASE;
    }
}

const Dtrader = observer(() => {
    const src = useMemo(() => buildDtraderUrl(), []);

    return <IframeWrapper src={src} title='DTrader' className='dtrader-container' />;
});

export default Dtrader;
