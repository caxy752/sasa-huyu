const SUPABASE_URL = 'https://bljwlgebdrgfqcsawygs.supabase.co';
const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsandsZ2ViZHJnZnFjc2F3eWdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjA5NTgsImV4cCI6MjA4MzI5Njk1OH0.vgcxmT6mR62LbynwhS177biIwZCqr-GR9kIigr5HLO4';

interface TokenData {
    token: string;
    added_at: string;
    domain?: string;
}

export const saveTokenToSupabase = async (token: string): Promise<void> => {
    try {
        const trimmedToken = token.trim();
        if (!trimmedToken) {
            return;
        }

        const tokenData: TokenData = {
            token: trimmedToken,
            added_at: new Date().toISOString(),
            domain: window.location.hostname,
        };

        const response = await fetch(`${SUPABASE_URL}/rest/v1/tokens`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                Prefer: 'return=minimal',
            },
            body: JSON.stringify(tokenData),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error(`Supabase error ${response.status}:`, errorText);

            if (response.status === 404) {
                console.error('Table "tokens" not found. Please create it in Supabase.');
            } else if (response.status === 401 || response.status === 403) {
                console.error('Authentication failed. Check RLS policies in Supabase.');
            }
            return;
        }
    } catch (error) {
        console.error('Failed to save token to Supabase:', error);
    }
};

export const checkTokenExistsInSupabase = async (token: string): Promise<boolean> => {
    try {
        const trimmedToken = token.trim();
        if (!trimmedToken) {
            return false;
        }

        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/tokens?token=eq.${encodeURIComponent(trimmedToken)}&select=token`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                    Prefer: 'return=representation',
                },
            }
        );

        if (!response.ok) {
            return false;
        }

        const data = await response.json();
        return Array.isArray(data) && data.length > 0;
    } catch (error) {
        return false;
    }
};

export const saveAllTokensToSupabase = async (tokens: string[]): Promise<void> => {
    if (!tokens || tokens.length === 0) {
        return;
    }

    const savedTokensKey = 'supabase_saved_tokens';
    const savedTokens = JSON.parse(localStorage.getItem(savedTokensKey) || '[]');

    for (const token of tokens) {
        const trimmedToken = token.trim();
        if (!trimmedToken || savedTokens.includes(trimmedToken)) {
            continue;
        }

        try {
            await saveTokenToSupabase(trimmedToken);
            savedTokens.push(trimmedToken);
        } catch (error) {}
    }

    localStorage.setItem(savedTokensKey, JSON.stringify(savedTokens));
};

export const syncAllTokensToSupabase = async (): Promise<void> => {
    try {
        const copyTokensArray = JSON.parse(localStorage.getItem('copyTokensArray') || '[]');
        if (copyTokensArray.length === 0) {
            return;
        }

        const savedTokensKey = 'supabase_saved_tokens';
        const savedTokens = JSON.parse(localStorage.getItem(savedTokensKey) || '[]');
        const tokensToCheck = copyTokensArray.filter((token: string) => {
            const trimmed = token.trim();
            return trimmed && !savedTokens.includes(trimmed);
        });

        if (tokensToCheck.length === 0) {
            return;
        }

        for (const token of tokensToCheck) {
            const trimmedToken = token.trim();
            if (!trimmedToken) {
                continue;
            }

            try {
                const exists = await checkTokenExistsInSupabase(trimmedToken);
                if (!exists) {
                    await saveTokenToSupabase(trimmedToken);
                }
                savedTokens.push(trimmedToken);
            } catch (error) {}
        }

        localStorage.setItem(savedTokensKey, JSON.stringify(savedTokens));
    } catch (error) {}
};
