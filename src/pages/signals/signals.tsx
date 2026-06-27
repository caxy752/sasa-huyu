import React from 'react';
import IframeWrapper from '@/components/iframe-wrapper';

const Signals: React.FC = () => {
    return (
        <IframeWrapper
            src='/signals/index.html'
            title='Trading Signals'
            className='signals-container'
        />
    );
};

export default Signals;
