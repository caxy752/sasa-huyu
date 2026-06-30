/**
 * WebSocket Session Manager for New Wallet Accounts
 * Handles DOT (crypto) and ROT (real) account WebSocket connections
 * Manages session creation, connection, and balance updates
 */

export interface WebSocketSessionRequest {
    account_id: string;
    access_token: string;
    account_type: 'dot' | 'rot';
}

export interface WebSocketSessionResponse {
    session_id: string;
    ws_url: string;
    expires_in: number;
}

export interface WebSocketMessage {
    msg_type: string;
    echo_req?: any;
    echo_resp?: any;
    [key: string]: any;
}

interface PendingRequest {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
}

/**
 * WebSocket Session Manager
 * Manages WebSocket connections for new wallet accounts
 * Automatically handles reconnection and token refresh
 */
export class WebSocketSessionManager {
    private ws: WebSocket | null = null;
    private sessionId: string | null = null;
    private wsUrl: string | null = null;
    private accessToken: string;
    private accountId: string;
    private accountType: 'dot' | 'rot';
    private messageId: number = 0;
    private pendingRequests: Map<number, PendingRequest> = new Map();
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;
    private reconnectDelay: number = 3000;
    private isConnecting: boolean = false;
    private messageHandlers: Map<string, (msg: WebSocketMessage) => void> = new Map();
    private onBalanceUpdate: ((balance: number) => void) | null = null;
    private onError: ((error: any) => void) | null = null;

    constructor(config: WebSocketSessionRequest) {
        this.accountId = config.account_id;
        this.accessToken = config.access_token;
        this.accountType = config.account_type;
    }

    /**
     * Initialize WebSocket session with backend
     * Requests WebSocket URL and session ID from server
     */
    async initializeSession(): Promise<WebSocketSessionResponse> {
        try {
            console.log(`[WS] Initializing ${this.accountType} session for account ${this.accountId}`);

            const response = await fetch('/api/websocket/session', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    account_id: this.accountId,
                    account_type: this.accountType,
                    access_token: this.accessToken,
                }),
            });

            if (!response.ok) {
                throw new Error(`Session initialization failed: ${response.status}`);
            }

            const sessionData: WebSocketSessionResponse = await response.json();
            this.sessionId = sessionData.session_id;
            this.wsUrl = sessionData.ws_url;

            console.log(`[WS] Session initialized. URL: ${this.wsUrl}`);
            return sessionData;
        } catch (error) {
            console.error('[WS] Session initialization failed:', error);
            throw error;
        }
    }

    /**
     * Connect to WebSocket
     */
    async connect(): Promise<void> {
        if (this.isConnecting) {
            console.log('[WS] Connection already in progress');
            return;
        }

        if (!this.wsUrl || !this.sessionId) {
            console.log('[WS] Initializing session before connect');
            await this.initializeSession();
        }

        this.isConnecting = true;

        try {
            return new Promise((resolve, reject) => {
                try {
                    console.log(`[WS] Connecting to ${this.wsUrl}`);
                    this.ws = new WebSocket(this.wsUrl!);

                    this.ws.onopen = () => {
                        console.log('[WS] Connected');
                        this.reconnectAttempts = 0;
                        this.isConnecting = false;
                        resolve();
                    };

                    this.ws.onmessage = (event) => {
                        this.handleMessage(JSON.parse(event.data));
                    };

                    this.ws.onerror = (error) => {
                        console.error('[WS] Connection error:', error);
                        this.isConnecting = false;
                        if (this.onError) {
                            this.onError(error);
                        }
                        reject(error);
                    };

                    this.ws.onclose = () => {
                        console.log('[WS] Connection closed');
                        this.ws = null;
                        this.isConnecting = false;
                        this.attemptReconnect();
                    };

                    // Connection timeout
                    const timeout = setTimeout(() => {
                        if (this.isConnecting) {
                            reject(new Error('WebSocket connection timeout'));
                        }
                    }, 10000);
                } catch (error) {
                    this.isConnecting = false;
                    reject(error);
                }
            });
        } catch (error) {
            console.error('[WS] Connection failed:', error);
            this.isConnecting = false;
            throw error;
        }
    }

    /**
     * Disconnect WebSocket
     */
    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        // Clear all pending requests
        this.pendingRequests.forEach((req) => {
            clearTimeout(req.timeout);
            req.reject(new Error('WebSocket disconnected'));
        });
        this.pendingRequests.clear();
    }

    /**
     * Send message to WebSocket
     */
    async send(message: WebSocketMessage): Promise<any> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket not connected');
        }

        const msgId = ++this.messageId;
        const msgToSend = { ...message, req_id: msgId };

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(msgId);
                reject(new Error(`Message timeout: ${message.msg_type}`));
            }, 30000); // 30 second timeout

            this.pendingRequests.set(msgId, { resolve, reject, timeout });

            try {
                this.ws!.send(JSON.stringify(msgToSend));
            } catch (error) {
                this.pendingRequests.delete(msgId);
                clearTimeout(timeout);
                reject(error);
            }
        });
    }

    /**
     * Handle incoming WebSocket messages
     */
    private handleMessage(message: WebSocketMessage): void {
        console.log(`[WS] Message received:`, message.msg_type);

        // Handle response to request
        if (message.req_id) {
            const pending = this.pendingRequests.get(message.req_id);
            if (pending) {
                this.pendingRequests.delete(message.req_id);
                clearTimeout(pending.timeout);

                if (message.error) {
                    pending.reject(new Error(message.error));
                } else {
                    pending.resolve(message);
                }
            }
        }

        // Handle subscription updates
        const handler = this.messageHandlers.get(message.msg_type);
        if (handler) {
            handler(message);
        }

        // Handle balance updates
        if (message.msg_type === 'balance' && message.balance) {
            if (this.onBalanceUpdate) {
                this.onBalanceUpdate(parseFloat(message.balance));
            }
        }
    }

    /**
     * Subscribe to balance updates
     */
    async subscribeToBalance(): Promise<void> {
        try {
            console.log('[WS] Subscribing to balance updates');
            await this.send({
                msg_type: 'balance',
                subscribe: 1,
                account_id: this.accountId,
            });
        } catch (error) {
            console.error('[WS] Balance subscription failed:', error);
            throw error;
        }
    }

    /**
     * Fetch account details
     */
    async getAccountInfo(): Promise<any> {
        try {
            const response = await this.send({
                msg_type: 'account_info',
                account_id: this.accountId,
            });
            return response;
        } catch (error) {
            console.error('[WS] Failed to get account info:', error);
            throw error;
        }
    }

    /**
     * Fetch balance
     */
    async getBalance(): Promise<number> {
        try {
            const response = await this.send({
                msg_type: 'balance',
                account_id: this.accountId,
            });
            return parseFloat(response.balance || 0);
        } catch (error) {
            console.error('[WS] Failed to get balance:', error);
            throw error;
        }
    }

    /**
     * Register message handler
     */
    onMessage(msgType: string, handler: (msg: WebSocketMessage) => void): void {
        this.messageHandlers.set(msgType, handler);
    }

    /**
     * Register balance update callback
     */
    onBalanceChanged(callback: (balance: number) => void): void {
        this.onBalanceUpdate = callback;
    }

    /**
     * Register error callback
     */
    onErrorOccurred(callback: (error: any) => void): void {
        this.onError = callback;
    }

    /**
     * Attempt reconnection
     */
    private async attemptReconnect(): Promise<void> {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[WS] Max reconnect attempts reached');
            if (this.onError) {
                this.onError(new Error('WebSocket reconnection failed'));
            }
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        console.log(`[WS] Attempting reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(async () => {
            try {
                // Refresh session before reconnecting
                await this.initializeSession();
                await this.connect();
                await this.subscribeToBalance();
            } catch (error) {
                console.error('[WS] Reconnect failed:', error);
                this.attemptReconnect();
            }
        }, delay);
    }

    /**
     * Get connection status
     */
    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }
}

/**
 * Factory function to create and manage WebSocket managers
 */
export const wsManagers: Map<string, WebSocketSessionManager> = new Map();

export async function getOrCreateWebSocketManager(
    config: WebSocketSessionRequest
): Promise<WebSocketSessionManager> {
    const key = `${config.account_type}_${config.account_id}`;

    if (wsManagers.has(key)) {
        const manager = wsManagers.get(key)!;
        if (manager.isConnected()) {
            return manager;
        }
    }

    const manager = new WebSocketSessionManager(config);
    await manager.connect();
    await manager.subscribeToBalance();

    wsManagers.set(key, manager);
    return manager;
}

export function disconnectWebSocketManager(accountType: 'dot' | 'rot', accountId: string): void {
    const key = `${accountType}_${accountId}`;
    const manager = wsManagers.get(key);
    if (manager) {
        manager.disconnect();
        wsManagers.delete(key);
    }
}

export function disconnectAllWebSockets(): void {
    wsManagers.forEach((manager) => {
        manager.disconnect();
    });
    wsManagers.clear();
}
