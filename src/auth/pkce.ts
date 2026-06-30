/**
 * PKCE Utility - Handles OAuth 2.0 PKCE challenge generation and login redirect
 */
import { generateOAuthURL } from '@/components/shared/utils/config/config';

export async function loginWithDeriv(prompt?: string) {
    try {
        const loginUrl = await generateOAuthURL(prompt);
        console.log('[PKCE] OAuth Started. Redirecting to:', loginUrl);
        window.location.href = loginUrl;
    } catch (error) {
        console.error('[PKCE] Failed to initiate Deriv login:', error);
        throw error;
    }
}
