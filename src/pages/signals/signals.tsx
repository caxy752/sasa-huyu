import React from 'react';
import IframeWrapper from '@/components/iframe-wrapper';

const Signals: React.FC = () => {
    return (
        <IframeWrapper
            src='https://signals-scanner-vercel-app.vercel.app/'
            title='Trading Signals'
            className='signals-container'
        />
    );
};

export default Signals;
