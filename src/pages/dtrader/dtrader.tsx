import React from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';

const DTRADER_BASE = 'https://deriv-dtrader.vercel.app/';

const Dtrader = observer(() => {
    return <IframeWrapper src={DTRADER_BASE} title='DTrader' className='dtrader-container' />;
});

export default Dtrader;
