import React from 'react';
import IframeWrapper from '@/components/iframe-wrapper';

const Signals: React.FC = () => {
    return (
        <IframeWrapper
            src='https://tracktool.netlify.app/signals.html'
            title='Deriv Signal Scanner'
            className='signals-container'
        />
    );
};

export default Signals;
