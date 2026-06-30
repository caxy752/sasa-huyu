export const ErrorLogger = {
    error: (context: string, message: string, error?: unknown) => {
        console.error(`[${context}] ${message}`, error);
    },
    info: (context: string, message: string, data?: unknown) => {
        console.log(`[${context}] ${message}`, data);
    },
};
