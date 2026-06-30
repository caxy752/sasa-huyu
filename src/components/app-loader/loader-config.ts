// App Loader Configuration
// Customize your loader settings here

export const LOADER_CONFIG = {
    // Duration in milliseconds (6000 = 6 seconds)
    DURATION: 6000,

    // Whether to show the loader (useful for development vs production)
    ENABLED: true,

    // App branding
    BRANDING: {
        title: 'KingsTrader',
        subtitle: 'Trading Bot Platform',
        // You can replace this with your own SVG icon
        icon: `
            <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
                <circle cx="30" cy="30" r="25" stroke="currentColor" strokeWidth="2" fill="none" />
                <path d="M20 30L27 37L40 24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        `,
    },

    // Environment-specific settings
    ENVIRONMENT: {
        // Show loader only in production
        PRODUCTION_ONLY: false,

        // Different durations for different environments
        DEVELOPMENT_DURATION: 3000, // 3 seconds in development
        PRODUCTION_DURATION: 6000, // 6 seconds in production
    },

    // Animation settings
    ANIMATION: {
        FADE_IN_DURATION: 500, // ms
        FADE_OUT_DURATION: 300, // ms
        PROGRESS_UPDATE_INTERVAL: 100, // ms
    },
};

// Helper function to get duration based on environment
export const getLoaderDuration = (): number => {
    if (LOADER_CONFIG.ENVIRONMENT.PRODUCTION_ONLY && process.env.NODE_ENV !== 'production') {
        return 0; // Skip loader in development
    }

    if (process.env.NODE_ENV === 'development') {
        return LOADER_CONFIG.ENVIRONMENT.DEVELOPMENT_DURATION;
    }

    return LOADER_CONFIG.ENVIRONMENT.PRODUCTION_DURATION;
};

// Helper function to check if loader should be enabled
export const isLoaderEnabled = (): boolean => {
    if (LOADER_CONFIG.ENVIRONMENT.PRODUCTION_ONLY && process.env.NODE_ENV !== 'production') {
        return false;
    }

    return LOADER_CONFIG.ENABLED;
};
