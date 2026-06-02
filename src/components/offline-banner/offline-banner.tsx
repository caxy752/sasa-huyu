import useNetworkStatus from '@/hooks/useNetworkStatus';
import './offline-banner.scss';

const OfflineBanner = () => {
    const status = useNetworkStatus();
    const isOffline = status === 'offline';

    if (!isOffline) return null;

    return (
        <div className='offline-banner'>
            <span className='offline-banner__icon'>📡</span>
            <span className='offline-banner__text'>You are offline — some features are unavailable</span>
        </div>
    );
};

export default OfflineBanner;
