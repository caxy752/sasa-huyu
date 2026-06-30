import localforage from 'localforage';
import LZString from 'lz-string';

export type TBotsManifestItem = {
    name: string;
    file: string; // xml filename relative to its source base path
    description?: string;
    difficulty?: string;
    strategy?: string;
    features?: string[];
    basePath?: string; // optional base path for non-/xml sources such as /xml-uploads/
};

const XML_CACHE_PREFIX = 'freebots:xml:';

// In-memory cache for faster access
const memoryCache = new Map<string, string>();

// Domain-aware XML base path: defaults to /xml/, but can switch to /xml/<domain>/ after manifest resolution
let XML_BASE = '/xml/';
export const getXmlBase = () => XML_BASE;
const setXmlBase = (base: string) => {
    XML_BASE = base.endsWith('/') ? base : `${base}/`;
};

const decompress = (data: string | null) => (data ? LZString.decompressFromUTF16(data) : null);
const compress = (data: string) => LZString.compressToUTF16(data);

export const getCachedXml = async (file: string): Promise<string | null> => {
    try {
        const key = `${XML_CACHE_PREFIX}${file}`;
        const cached = (await localforage.getItem<string>(key)) || null;
        return decompress(cached);
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('freebots-cache:getCachedXml error', e);
        return null;
    }
};

export const setCachedXml = async (file: string, xml: string) => {
    try {
        const key = `${XML_CACHE_PREFIX}${file}`;
        await localforage.setItem(key, compress(xml));
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('freebots-cache:setCachedXml error', e);
    }
};

export const fetchXmlWithCache = async (file: string, basePath?: string): Promise<string | null> => {
    const cacheKey = basePath ? `${basePath}${file}` : file;

    // Check memory cache first
    if (memoryCache.has(cacheKey)) {
        return memoryCache.get(cacheKey)!;
    }

    // Check persistent cache
    const cached = await getCachedXml(cacheKey);
    if (cached) {
        memoryCache.set(cacheKey, cached); // Store in memory for faster access
        return cached;
    }

    try {
        const resolveUrl = (sourceFile: string, base: string) => {
            if (sourceFile.startsWith('/') || sourceFile.startsWith('http')) {
                return sourceFile;
            }
            const normalizedBase = base.endsWith('/') ? base : `${base}/`;
            return `${normalizedBase}${sourceFile.split('/').map(encodeURIComponent).join('/')}`;
        };

        const primaryUrl = basePath ? resolveUrl(file, basePath) : resolveUrl(file, getXmlBase());
        let res = await fetch(primaryUrl);

        // 2) Fallback: try default /xml/ if the primary fails and it isn't already the /xml/ base
        if (!res.ok && (!basePath || basePath !== '/xml/')) {
            const fallbackUrl = resolveUrl(file, '/xml/');
            res = await fetch(fallbackUrl);
        }

        if (!res.ok) {
            // Silently handle 404s for missing files (don't spam console)
            if (res.status === 404) {
                return null;
            }
            throw new Error(`Failed to fetch ${file}: ${res.status}`);
        }
        const xml = await res.text();

        // Store in both caches
        memoryCache.set(cacheKey, xml);
        await setCachedXml(cacheKey, xml);
        return xml;
    } catch (e: any) {
        // Only log non-404 errors to reduce console noise
        if (e?.message && !e.message.includes('404')) {
            // eslint-disable-next-line no-console
            console.warn('freebots-cache:fetchXmlWithCache error', e);
        }
        return null;
    }
};

export const prefetchAllXmlInBackground = async (files: string[]) => {
    // Fire-and-forget prefetch with throttling to avoid overwhelming the browser
    const batchSize = 3; // Load 3 files at a time
    for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        await Promise.allSettled(batch.map(file => fetchXmlWithCache(file)));
        // Small delay between batches to prevent blocking
        if (i + batchSize < files.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
};

export const getBotsManifest = async (): Promise<TBotsManifestItem[] | null> => {
    try {
        const hostname = window.location.hostname.toLowerCase();
        const urlParams = new URLSearchParams(window.location.search);
        const override = (urlParams.get('bots_domain') || '').toLowerCase().replace(/^www\./, '');
        const domain = (override || hostname).replace(/^www\./, '');

        // Try domain-specific manifest first
        let res = await fetch(`/xml/${encodeURIComponent(domain)}/bots.json`, { cache: 'force-cache' });
        if (!res.ok) {
            // Fallback to default manifest when generic /xml/bots.json is not available
            res = await fetch('/xml/default/bots.json', { cache: 'force-cache' });
        }
        if (!res.ok) return null;

        const data = (await res.json()) as TBotsManifestItem[];

        // If we loaded a domain-specific file, set base for XML fetches
        if (res.url.includes(`/${domain}/bots.json`)) {
            setXmlBase(`/xml/${domain}/`);
        } else {
            setXmlBase('/xml/default/');
        }

        return data;
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('freebots-cache:getBotsManifest error', e);
        return null;
    }
};

export const getXmlUploadsManifest = async (): Promise<TBotsManifestItem[] | null> => {
    try {
        const res = await fetch('/xml-uploads/bots.json', { cache: 'force-cache' });
        if (!res.ok) return null;
        const data = (await res.json()) as TBotsManifestItem[];
        return data.map(item => ({ ...item, basePath: '/xml-uploads/' }));
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('freebots-cache:getXmlUploadsManifest error', e);
        return null;
    }
};
