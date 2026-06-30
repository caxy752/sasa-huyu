import { generateOAuthURL } from '../config/config';
import { CookieStorage, isStorageSupported, LocalStore } from '../storage/storage';
import { getStaticUrl, urlForCurrentDomain } from '../url';

export const redirectToLogin = async (
    is_logged_in: boolean,
    language: string,
    has_params = true,
    redirect_delay = 0
) => {
    if (!is_logged_in && isStorageSupported(sessionStorage)) {
        const l = window.location;
        const redirect_url = has_params ? window.location.href : `${l.protocol}//${l.host}${l.pathname}`;
        sessionStorage.setItem('redirect_url', redirect_url);
        setTimeout(async () => {
            const new_href = await loginUrl({ language });
            window.location.href = new_href;
        }, redirect_delay);
    }
};

export const redirectToSignUp = async () => {
    window.location.replace(await generateOAuthURL('registration'));
};

type TLoginUrl = {
    language: string;
};

export const loginUrl = async ({ language }: TLoginUrl) => {
    const server_url = LocalStore.get('config.server_url');
    const signup_device_cookie = new (CookieStorage as any)('signup_device');
    const signup_device = signup_device_cookie.get('signup_device');
    const date_first_contact_cookie = new (CookieStorage as any)('date_first_contact');
    const date_first_contact = date_first_contact_cookie.get('date_first_contact');
    const oauth_url = new URL(await generateOAuthURL());

    oauth_url.searchParams.set('l', language);

    if (signup_device) {
        oauth_url.searchParams.set('signup_device', signup_device);
    }

    if (date_first_contact) {
        oauth_url.searchParams.set('date_first_contact', date_first_contact);
    }

    if (server_url && /qa/.test(server_url)) {
        oauth_url.hostname = server_url;
    }

    return urlForCurrentDomain(oauth_url.toString()) || oauth_url.toString();
};
