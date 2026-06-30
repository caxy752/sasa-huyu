import React, { useEffect } from 'react';

/**
 * Security Protection Component
 * Currently disabled - DevTools, right-click, and keyboard shortcuts are allowed for debugging
 */
const SecurityProtection: React.FC = () => {
    useEffect(() => {
        // All security restrictions disabled for development
        // DevTools access is enabled via F12, Ctrl+Shift+I/J/C
        // Right-click context menu is enabled
        // View source (Ctrl+U) is enabled
        // No restrictions are applied
    }, []);

    return null;
};

export default SecurityProtection;
