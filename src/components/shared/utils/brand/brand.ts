import config_data from '../../brand.config.json';

type TLandingCompany = {
    fx: string;
    malta: string;
    maltainvest: string;
    mx: string;
    samoa: string;
    svg: string;
    v: string;
};

type TPlatform = {
    name: string;
    icon: string;
};

type TPlatformAppstore = {
    name: string;
    icon: string;
    availability: string;
};

type TPlatforms = {
    ctrader: TPlatform;
    trader: TPlatform;
    dbot: TPlatform;
    mt5: TPlatform;
    dxtrade: TPlatform;
    smarttrader: TPlatform;
    bbot: TPlatform;
    go: TPlatform;
};

type TPlatformsAppstore = {
    ctrader: TPlatformAppstore;
    trader: TPlatformAppstore;
    dbot: TPlatformAppstore;
    smarttrader: TPlatformAppstore;
    bbot: TPlatformAppstore;
    go: TPlatformAppstore;
};

const isDomainAllowed = (domain_name: string) => {
    // This regex will match any official deriv production and testing domain names.
    // Allowed deriv domains: localhost, binary.sx, binary.com, deriv.com, deriv.be, deriv.me and their subdomains.
    return /^(((.*)\.)?(localhost:8444|pages.dev|binary\.(sx|com)|deriv.(com|me|be|dev)))$/.test(domain_name);
};

export const getLegalEntityName = (landing_company: keyof TLandingCompany) => {
    return config_data.legal_entities[landing_company];
};

export const getBrandWebsiteName = () => {
    return config_data.domain_name;
};

const getHostBaseName = (hostname?: string) => {
    let host = hostname || (typeof window !== 'undefined' ? window.location.hostname : config_data.domain_name);
    if (!host) return config_data.brand_name;

    host = host
        .toLowerCase()
        .split(':')[0]
        .replace(/^www\./, '');
    const parts = host.split('.');
    let base = parts.length > 2 ? parts[parts.length - 2] : parts[0];
    if (base === 'localhost') return 'localhost';

    base = base.replace(/hub$/i, '');
    base = base.replace(/[^a-z0-9]+/g, ' ').trim();
    return base || config_data.brand_name;
};

const formatBrandDisplay = (base: string) =>
    base
        .split(/[^a-z0-9]+/i)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

export const getDomainBrandName = () => {
    return formatBrandDisplay(getHostBaseName());
};

export const getBrandLabel = () => {
    return `${getDomainBrandName()} Trading Hub`;
};

export const getBrandTitle = () => {
    return `${getHostBaseName().replace(/\s+/g, ' ').toUpperCase()} TRADING HUB`;
};

export const getBrandShortName = () => {
    return getDomainBrandName();
};

export const getPlatformSettings = (platform_key: keyof TPlatforms): TPlatform => {
    const allowed_config_data = config_data.platforms[platform_key];

    if (!isDomainAllowed(window.location.host)) {
        // Remove all official platform logos if the app is hosted under unofficial domain
        allowed_config_data.icon = '';
    }

    return allowed_config_data;
};

export const getAppstorePlatforms = () => {
    const platform_data: Record<string, Record<string, string>> = config_data.platforms_appstore;
    return Object.keys(platform_data).map(key => platform_data[key]);
};

export const getPlatformSettingsAppstore = (platform_key: keyof TPlatformsAppstore): TPlatformAppstore => {
    return config_data.platforms_appstore[platform_key];
};
