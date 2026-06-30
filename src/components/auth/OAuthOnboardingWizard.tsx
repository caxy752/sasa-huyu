/**
 * OAuth Onboarding Wizard - Multi-step configuration UI
 * React component for admin to configure OAuth 2.0 credentials
 */

import React, { useState, useCallback } from 'react';
import clsx from 'clsx';
import AuthConfigManager, { OAuthConfig } from '@/services/auth/AuthConfigManager';
import { ChevronRight, ChevronLeft, Check, AlertCircle, Loader } from 'lucide-react';

interface OnboardingStep {
    id: string;
    title: string;
    description: string;
    component: React.ComponentType<StepProps>;
}

interface StepProps {
    config: Partial<OAuthConfig>;
    onNext: (config: Partial<OAuthConfig>) => void;
    onPrev: () => void;
    isLoading?: boolean;
}

interface ValidationError {
    field: string;
    message: string;
}

// Step 1: Site URL Configuration
const SiteUrlStep: React.FC<StepProps> = ({ config, onNext, isLoading }) => {
    const [siteUrl, setSiteUrl] = useState(config.siteUrl || '');
    const [error, setError] = useState<string>('');

    const validateAndNext = () => {
        try {
            if (!siteUrl.trim()) {
                setError('Site URL is required');
                return;
            }

            if (!isValidUrl(siteUrl)) {
                setError('Please enter a valid URL (e.g., https://your-site.com)');
                return;
            }

            setError('');
            onNext({ ...config, siteUrl });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        }
    };

    return (
        <div className='space-y-4'>
            <div>
                <label className='block text-sm font-medium mb-2'>Trading Platform URL</label>
                <input
                    type='url'
                    value={siteUrl}
                    onChange={e => setSiteUrl(e.target.value)}
                    placeholder='https://your-trading-platform.com'
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                    disabled={isLoading}
                />
                <p className='text-xs text-gray-500 mt-1'>
                    This is the base URL of your trading platform where OAuth will redirect
                </p>
            </div>

            {error && (
                <div className='flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg'>
                    <AlertCircle className='h-5 w-5 text-red-600 flex-shrink-0 mt-0.5' />
                    <p className='text-sm text-red-800'>{error}</p>
                </div>
            )}

            <button
                onClick={validateAndNext}
                disabled={isLoading}
                className='w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
            >
                {isLoading ? <Loader className='h-4 w-4 animate-spin' /> : null}
                Continue
                <ChevronRight className='h-4 w-4' />
            </button>
        </div>
    );
};

// Step 2: OAuth Client Credentials
const ClientCredentialsStep: React.FC<StepProps> = ({ config, onNext, onPrev, isLoading }) => {
    const [clientId, setClientId] = useState(config.clientId || '');
    const [error, setError] = useState<string>('');

    const validateAndNext = () => {
        try {
            if (!clientId.trim()) {
                setError('Client ID is required');
                return;
            }

            if (clientId.trim().length < 3) {
                setError('Client ID must be at least 3 characters');
                return;
            }

            setError('');
            onNext({ ...config, clientId });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        }
    };

    return (
        <div className='space-y-4'>
            <div>
                <label className='block text-sm font-medium mb-2'>OAuth Client ID</label>
                <input
                    type='text'
                    value={clientId}
                    onChange={e => setClientId(e.target.value)}
                    placeholder='Your OAuth client ID from the developer portal'
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm'
                    disabled={isLoading}
                />
                <p className='text-xs text-gray-500 mt-1'>Get this from your OAuth provider's developer portal</p>
            </div>

            {error && (
                <div className='flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg'>
                    <AlertCircle className='h-5 w-5 text-red-600 flex-shrink-0 mt-0.5' />
                    <p className='text-sm text-red-800'>{error}</p>
                </div>
            )}

            <div className='flex gap-3'>
                <button
                    onClick={onPrev}
                    disabled={isLoading}
                    className='flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2'
                >
                    <ChevronLeft className='h-4 w-4' />
                    Back
                </button>
                <button
                    onClick={validateAndNext}
                    disabled={isLoading}
                    className='flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
                >
                    {isLoading ? <Loader className='h-4 w-4 animate-spin' /> : null}
                    Continue
                    <ChevronRight className='h-4 w-4' />
                </button>
            </div>
        </div>
    );
};

// Step 3: OAuth Endpoints
const OAuthEndpointsStep: React.FC<StepProps> = ({ config, onNext, onPrev, isLoading }) => {
    const [authUrl, setAuthUrl] = useState(config.authorizationUrl || '');
    const [tokenUrl, setTokenUrl] = useState(config.tokenUrl || '');
    const [errors, setErrors] = useState<ValidationError[]>([]);

    const validateAndNext = () => {
        const newErrors: ValidationError[] = [];

        if (!authUrl.trim()) {
            newErrors.push({ field: 'authUrl', message: 'Authorization URL is required' });
        } else if (!isValidUrl(authUrl)) {
            newErrors.push({ field: 'authUrl', message: 'Invalid URL format' });
        }

        if (!tokenUrl.trim()) {
            newErrors.push({ field: 'tokenUrl', message: 'Token URL is required' });
        } else if (!isValidUrl(tokenUrl)) {
            newErrors.push({ field: 'tokenUrl', message: 'Invalid URL format' });
        }

        if (newErrors.length > 0) {
            setErrors(newErrors);
            return;
        }

        setErrors([]);
        onNext({ ...config, authorizationUrl: authUrl, tokenUrl });
    };

    return (
        <div className='space-y-4'>
            <div>
                <label className='block text-sm font-medium mb-2'>Authorization Endpoint URL</label>
                <input
                    type='url'
                    value={authUrl}
                    onChange={e => setAuthUrl(e.target.value)}
                    placeholder='https://auth.example.com/oauth2/authorize'
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm'
                    disabled={isLoading}
                />
                {errors.find(e => e.field === 'authUrl') && (
                    <p className='text-xs text-red-600 mt-1'>{errors.find(e => e.field === 'authUrl')?.message}</p>
                )}
            </div>

            <div>
                <label className='block text-sm font-medium mb-2'>Token Exchange Endpoint URL</label>
                <input
                    type='url'
                    value={tokenUrl}
                    onChange={e => setTokenUrl(e.target.value)}
                    placeholder='https://auth.example.com/oauth2/token'
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm'
                    disabled={isLoading}
                />
                {errors.find(e => e.field === 'tokenUrl') && (
                    <p className='text-xs text-red-600 mt-1'>{errors.find(e => e.field === 'tokenUrl')?.message}</p>
                )}
            </div>

            <div className='flex gap-3'>
                <button
                    onClick={onPrev}
                    disabled={isLoading}
                    className='flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2'
                >
                    <ChevronLeft className='h-4 w-4' />
                    Back
                </button>
                <button
                    onClick={validateAndNext}
                    disabled={isLoading}
                    className='flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
                >
                    {isLoading ? <Loader className='h-4 w-4 animate-spin' /> : null}
                    Continue
                    <ChevronRight className='h-4 w-4' />
                </button>
            </div>
        </div>
    );
};

// Step 4: Redirect URI Configuration
const RedirectUriStep: React.FC<StepProps> = ({ config, onNext, onPrev, isLoading }) => {
    const [redirectUri, setRedirectUri] = useState(config.redirectUri || '');
    const [error, setError] = useState<string>('');

    const validateAndNext = () => {
        try {
            if (!redirectUri.trim()) {
                setError('Redirect URI is required');
                return;
            }

            if (!isValidUrl(redirectUri)) {
                setError('Please enter a valid URL');
                return;
            }

            setError('');
            onNext({ ...config, redirectUri });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        }
    };

    return (
        <div className='space-y-4'>
            <div>
                <label className='block text-sm font-medium mb-2'>OAuth Redirect URI</label>
                <input
                    type='url'
                    value={redirectUri}
                    onChange={e => setRedirectUri(e.target.value)}
                    placeholder='https://your-site.com/api/oauth/callback'
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm'
                    disabled={isLoading}
                />
                <p className='text-xs text-gray-500 mt-1'>
                    Must match exactly what you configured in your OAuth provider's console
                </p>
            </div>

            <div className='p-3 bg-blue-50 border border-blue-200 rounded-lg'>
                <p className='text-xs text-blue-800'>
                    <strong>Important:</strong> This URL must be registered in your OAuth provider's application
                    settings
                </p>
            </div>

            {error && (
                <div className='flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg'>
                    <AlertCircle className='h-5 w-5 text-red-600 flex-shrink-0 mt-0.5' />
                    <p className='text-sm text-red-800'>{error}</p>
                </div>
            )}

            <div className='flex gap-3'>
                <button
                    onClick={onPrev}
                    disabled={isLoading}
                    className='flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2'
                >
                    <ChevronLeft className='h-4 w-4' />
                    Back
                </button>
                <button
                    onClick={validateAndNext}
                    disabled={isLoading}
                    className='flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
                >
                    {isLoading ? <Loader className='h-4 w-4 animate-spin' /> : null}
                    Continue
                    <ChevronRight className='h-4 w-4' />
                </button>
            </div>
        </div>
    );
};

// Step 5: OAuth Scopes
const ScopesStep: React.FC<StepProps> = ({ config, onNext, onPrev, isLoading }) => {
    const availableScopes = [
        { id: 'read', label: 'Read', description: 'Read account information' },
        { id: 'trade', label: 'Trade', description: 'Execute trades' },
        { id: 'payments', label: 'Payments', description: 'Process payments' },
        { id: 'trading_information', label: 'Trading Info', description: 'Access trading data' },
        { id: 'admin', label: 'Admin', description: 'Administrative access' },
    ];

    const [selectedScopes, setSelectedScopes] = useState<string[]>(config.scopes || ['read', 'trade']);
    const [error, setError] = useState<string>('');

    const toggleScope = (scopeId: string) => {
        setSelectedScopes(prev => (prev.includes(scopeId) ? prev.filter(s => s !== scopeId) : [...prev, scopeId]));
    };

    const validateAndNext = () => {
        if (selectedScopes.length === 0) {
            setError('Please select at least one scope');
            return;
        }

        setError('');
        onNext({ ...config, scopes: selectedScopes });
    };

    return (
        <div className='space-y-4'>
            <div>
                <label className='block text-sm font-medium mb-3'>Select Trading Scopes</label>
                <div className='space-y-2'>
                    {availableScopes.map(scope => (
                        <label
                            key={scope.id}
                            className='flex items-start p-2 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer'
                        >
                            <input
                                type='checkbox'
                                checked={selectedScopes.includes(scope.id)}
                                onChange={() => toggleScope(scope.id)}
                                disabled={isLoading}
                                className='h-4 w-4 mt-1 text-blue-600 rounded'
                            />
                            <div className='ml-3 flex-1'>
                                <p className='text-sm font-medium'>{scope.label}</p>
                                <p className='text-xs text-gray-500'>{scope.description}</p>
                            </div>
                        </label>
                    ))}
                </div>
            </div>

            {error && (
                <div className='flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg'>
                    <AlertCircle className='h-5 w-5 text-red-600 flex-shrink-0 mt-0.5' />
                    <p className='text-sm text-red-800'>{error}</p>
                </div>
            )}

            <div className='flex gap-3'>
                <button
                    onClick={onPrev}
                    disabled={isLoading}
                    className='flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2'
                >
                    <ChevronLeft className='h-4 w-4' />
                    Back
                </button>
                <button
                    onClick={validateAndNext}
                    disabled={isLoading}
                    className='flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
                >
                    {isLoading ? <Loader className='h-4 w-4 animate-spin' /> : null}
                    Continue
                    <ChevronRight className='h-4 w-4' />
                </button>
            </div>
        </div>
    );
};

// Step 6: Legacy App ID (Optional)
const LegacyAppIdStep: React.FC<StepProps> = ({ config, onNext, onPrev, isLoading }) => {
    const [legacyAppId, setLegacyAppId] = useState(config.legacyAppId || '');
    const [enableLegacy, setEnableLegacy] = useState(config.enableLegacyMode || false);
    const [error, setError] = useState<string>('');

    const validateAndNext = () => {
        try {
            if (enableLegacy && !legacyAppId.trim()) {
                setError('Please enter a Legacy App ID or disable legacy mode');
                return;
            }

            if (enableLegacy && legacyAppId.trim() && isNaN(Number(legacyAppId))) {
                setError('Legacy App ID must be a number');
                return;
            }

            setError('');
            onNext({
                ...config,
                legacyAppId: enableLegacy ? legacyAppId : undefined,
                enableLegacyMode: enableLegacy,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        }
    };

    return (
        <div className='space-y-4'>
            <div>
                <label className='flex items-center gap-2 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50'>
                    <input
                        type='checkbox'
                        checked={enableLegacy}
                        onChange={e => setEnableLegacy(e.target.checked)}
                        disabled={isLoading}
                        className='h-4 w-4 text-blue-600 rounded'
                    />
                    <span className='font-medium'>Enable Legacy App ID Support</span>
                </label>
                <p className='text-xs text-gray-500 mt-2'>For backward compatibility with older integrations</p>
            </div>

            {enableLegacy && (
                <div>
                    <label className='block text-sm font-medium mb-2'>Legacy App ID</label>
                    <input
                        type='text'
                        value={legacyAppId}
                        onChange={e => setLegacyAppId(e.target.value)}
                        placeholder='e.g., 12345'
                        className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm'
                        disabled={isLoading}
                    />
                    <p className='text-xs text-gray-500 mt-1'>
                        Numeric ID from legacy platform for backward compatibility
                    </p>
                </div>
            )}

            {error && (
                <div className='flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg'>
                    <AlertCircle className='h-5 w-5 text-red-600 flex-shrink-0 mt-0.5' />
                    <p className='text-sm text-red-800'>{error}</p>
                </div>
            )}

            <div className='flex gap-3'>
                <button
                    onClick={onPrev}
                    disabled={isLoading}
                    className='flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2'
                >
                    <ChevronLeft className='h-4 w-4' />
                    Back
                </button>
                <button
                    onClick={validateAndNext}
                    disabled={isLoading}
                    className='flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
                >
                    {isLoading ? <Loader className='h-4 w-4 animate-spin' /> : null}
                    Continue
                    <ChevronRight className='h-4 w-4' />
                </button>
            </div>
        </div>
    );
};

// Step 7: Review & Complete
const ReviewStep: React.FC<StepProps & { onComplete: () => Promise<void> }> = ({
    config,
    onPrev,
    onComplete,
    isLoading,
}) => {
    const [completing, setCompleting] = useState(false);
    const [error, setError] = useState<string>('');
    const [success, setSuccess] = useState(false);

    const handleComplete = async () => {
        try {
            setCompleting(true);
            setError('');

            // Save configuration
            await AuthConfigManager.setConfig(config as OAuthConfig);

            // Call completion handler
            await onComplete();

            setSuccess(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setCompleting(false);
        }
    };

    if (success) {
        return (
            <div className='text-center space-y-4'>
                <div className='flex justify-center'>
                    <div className='h-12 w-12 bg-green-100 rounded-full flex items-center justify-center'>
                        <Check className='h-6 w-6 text-green-600' />
                    </div>
                </div>
                <h3 className='text-lg font-semibold'>Configuration Complete!</h3>
                <p className='text-sm text-gray-600'>Your OAuth configuration has been saved successfully.</p>
            </div>
        );
    }

    return (
        <div className='space-y-4'>
            <div className='space-y-3'>
                <div className='p-3 bg-gray-50 rounded-lg'>
                    <p className='text-xs font-medium text-gray-600'>Site URL</p>
                    <p className='text-sm font-mono'>{config.siteUrl}</p>
                </div>

                <div className='p-3 bg-gray-50 rounded-lg'>
                    <p className='text-xs font-medium text-gray-600'>Client ID</p>
                    <p className='text-sm font-mono'>{config.clientId?.substring(0, 10)}***</p>
                </div>

                <div className='p-3 bg-gray-50 rounded-lg'>
                    <p className='text-xs font-medium text-gray-600'>Scopes</p>
                    <p className='text-sm'>{config.scopes?.join(', ')}</p>
                </div>

                {config.enableLegacyMode && (
                    <div className='p-3 bg-yellow-50 border border-yellow-200 rounded-lg'>
                        <p className='text-xs font-medium text-yellow-800'>Legacy Mode Enabled</p>
                        <p className='text-sm text-yellow-700'>App ID: {config.legacyAppId}</p>
                    </div>
                )}
            </div>

            {error && (
                <div className='flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg'>
                    <AlertCircle className='h-5 w-5 text-red-600 flex-shrink-0 mt-0.5' />
                    <p className='text-sm text-red-800'>{error}</p>
                </div>
            )}

            <div className='flex gap-3'>
                <button
                    onClick={onPrev}
                    disabled={completing || isLoading}
                    className='flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2'
                >
                    <ChevronLeft className='h-4 w-4' />
                    Back
                </button>
                <button
                    onClick={handleComplete}
                    disabled={completing || isLoading}
                    className='flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
                >
                    {completing ? <Loader className='h-4 w-4 animate-spin' /> : <Check className='h-4 w-4' />}
                    Save & Complete
                </button>
            </div>
        </div>
    );
};

// Helper function to validate URL
function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

// Main Wizard Component
interface OAuthOnboardingWizardProps {
    onComplete?: () => Promise<void>;
    initialConfig?: Partial<OAuthConfig>;
}

export const OAuthOnboardingWizard: React.FC<OAuthOnboardingWizardProps> = ({
    onComplete = async () => {},
    initialConfig = {},
}) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [config, setConfig] = useState<Partial<OAuthConfig>>(initialConfig);
    const [isLoading, setIsLoading] = useState(false);

    const steps: OnboardingStep[] = [
        {
            id: 'site-url',
            title: 'Site URL',
            description: 'Enter your trading platform URL',
            component: SiteUrlStep,
        },
        {
            id: 'credentials',
            title: 'OAuth Credentials',
            description: 'Enter your OAuth Client ID',
            component: ClientCredentialsStep,
        },
        {
            id: 'endpoints',
            title: 'OAuth Endpoints',
            description: 'Specify authorization and token endpoints',
            component: OAuthEndpointsStep,
        },
        {
            id: 'redirect-uri',
            title: 'Redirect URI',
            description: 'Configure OAuth callback URL',
            component: RedirectUriStep,
        },
        {
            id: 'scopes',
            title: 'Scopes',
            description: 'Select trading permission scopes',
            component: ScopesStep,
        },
        {
            id: 'legacy',
            title: 'Legacy Support',
            description: 'Optional legacy App ID configuration',
            component: LegacyAppIdStep,
        },
        {
            id: 'review',
            title: 'Review',
            description: 'Review and complete setup',
            component: (props: StepProps) => <ReviewStep {...props} onComplete={onComplete} />,
        },
    ];

    const CurrentStep = steps[currentStep].component;

    const handleNext = (updatedConfig: Partial<OAuthConfig>) => {
        setConfig(prev => ({ ...prev, ...updatedConfig }));
        if (currentStep < steps.length - 1) {
            setCurrentStep(prev => prev + 1);
        }
    };

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    };

    return (
        <div className='w-full max-w-2xl mx-auto p-6'>
            {/* Header */}
            <div className='mb-8'>
                <h1 className='text-2xl font-bold mb-2'>OAuth Configuration Wizard</h1>
                <p className='text-gray-600'>
                    Step {currentStep + 1} of {steps.length}
                </p>
            </div>

            {/* Progress Bar */}
            <div className='mb-8'>
                <div className='flex items-center justify-between mb-2'>
                    {steps.map((step, index) => (
                        <div key={step.id} className='flex items-center flex-1'>
                            <div
                                className={clsx(
                                    'h-10 w-10 rounded-full flex items-center justify-center font-medium text-sm',
                                    index < currentStep
                                        ? 'bg-green-500 text-white'
                                        : index === currentStep
                                          ? 'bg-blue-500 text-white'
                                          : 'bg-gray-200 text-gray-600'
                                )}
                            >
                                {index < currentStep ? <Check className='h-5 w-5' /> : index + 1}
                            </div>
                            {index < steps.length - 1 && (
                                <div
                                    className={clsx(
                                        'flex-1 h-1 mx-2',
                                        index < currentStep ? 'bg-green-500' : 'bg-gray-200'
                                    )}
                                />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Step Content */}
            <div className='bg-white rounded-lg shadow-md p-6 mb-6'>
                <h2 className='text-lg font-semibold mb-2'>{steps[currentStep].title}</h2>
                <p className='text-sm text-gray-600 mb-6'>{steps[currentStep].description}</p>

                <CurrentStep config={config} onNext={handleNext} onPrev={handlePrev} isLoading={isLoading} />
            </div>
        </div>
    );
};

export default OAuthOnboardingWizard;
