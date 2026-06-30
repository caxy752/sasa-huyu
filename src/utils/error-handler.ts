export const handleError = (error: unknown, context?: string) => {
    console.error(`Error${context ? ` in ${context}` : ''}:`, error);
};

export const isBackendError = (error: unknown): error is { code: string; message: string } => {
    return typeof error === 'object' && error !== null && 'code' in error && 'message' in error;
};

export const handleBackendError = (error: { code: string; message: string }): string => {
    return `[${error.code}] ${error.message}`;
};
