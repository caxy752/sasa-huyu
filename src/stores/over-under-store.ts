
import { action, makeObservable, observable } from 'mobx';
import { LogTypes } from '@/external/bot-skeleton';
import { TStores } from '@/types/stores.types';
import RootStore from './root-store';

const STATUS_OFFLINE = 'Offline';
const STATUS_CONNECTING = 'Connecting...';
const STATUS_LIVE = 'Live Ticks';
const STATUS_AUTHORIZED = 'Account Connected';

const MAX_TICKS = 1000;

export default class OverUnderStore {
    root_store: RootStore;
    ws: WebSocket | null = null;
    reconnectTimeout: NodeJS.Timeout | null = null;
    is_authorized = false;
    debug_info: string[] = [];

    connection_status = STATUS_OFFLINE;
    tick_history: number[] = [];
    last_digit: number | null = null;
    is_auto_running = false;
    stake = 1;
    entry_digit = 7;
    is_turbo = false;
    selected_symbol = 'R_100';

    constructor(root_store: RootStore) {
        makeObservable(this, {
            connection_status: observable,
            tick_history: observable,
            last_digit: observable,
            is_auto_running: observable,
            stake: observable,
            entry_digit: observable,
            is_turbo: observable,
            selected_symbol: observable,
            debug_info: observable,
            setStake: action.bound,
            setEntryDigit: action.bound,
            setIsTurbo: action.bound,
            setSelectedSymbol: action.bound,
            setIsAutoRunning: action.bound,
            connectWebSocket: action.bound,
            executeMultiTrade: action.bound,
            handleStartStop: action.bound,
            addLog: action.bound,
            clearDebug: action.bound,
        });
        this.root_store = root_store;
    }

    addLog(msg: string) {
        console.log(`[OverUnder] ${msg}`);
        const timestamp = new Date().toLocaleTimeString();
        this.debug_info.unshift(`[${timestamp}] ${msg}`);
        if (this.debug_info.length > 30) {
            this.debug_info.pop();
        }
    }
    
    clearDebug() {
        this.debug_info = [];
    }

    setStake(stake: number) {
        this.stake = stake;
    }

    setEntryDigit(digit: number) {
        this.entry_digit = digit;
    }

    setIsTurbo(is_turbo: boolean) {
        this.is_turbo = is_turbo;
    }

    setSelectedSymbol(symbol: string) {
        this.selected_symbol = symbol;
        if (this.connection_status === STATUS_LIVE || this.connection_status === STATUS_AUTHORIZED) {
            this.subscribeToTicks(symbol);
        }
    }

    setIsAutoRunning(is_running: boolean) {
        this.is_auto_running = is_running;
    }

    handleStartStop() {
        if (!this.is_auto_running && !this.is_authorized) {
            this.addLog("Please log in to start the tool.");
            this.root_store.journal.pushMessage('⚠️ Login required to trade.', 'error');
            return;
        }
        this.setIsAutoRunning(!this.is_auto_running);
        if (this.is_auto_running) {
            this.addLog("Tool started. Waiting for trigger...");
            this.root_store.run_panel.setActiveTab('journal');
        } else {
            this.addLog("Tool stopped by user.");
        }
    }
    
    subscribeToTicks(symbol: string) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.addLog('WS not open for subscribe');
            return;
        }

        this.addLog(`Fetching history & subscribing: ${symbol}`);
        this.ws.send(JSON.stringify({ forget_all: 'ticks' }));

        this.ws.send(
            JSON.stringify({
                ticks_history: symbol,
                count: MAX_TICKS,
                end: 'latest',
                style: 'ticks',
                subscribe: 1,
            })
        );

        this.tick_history = [];
        this.last_digit = null;
    }
    
    connectWebSocket() {
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.close();
        }

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        this.addLog('Connecting...');
        this.connection_status = STATUS_CONNECTING;
        this.is_authorized = false;

        const app_id = localStorage.getItem('config.app_id') || '117164';
        const server_url = localStorage.getItem('config.server_url') || 'ws.derivws.com';

        try {
            this.ws = new WebSocket(`wss://${server_url}/websockets/v3?app_id=${app_id}`);

            this.ws.onopen = () => {
                this.addLog('WS Opened. Subscribing to ticks...');
                this.connection_status = STATUS_LIVE;
                this.subscribeToTicks(this.selected_symbol);

                const token =
                    localStorage.getItem('authToken') ||
                    localStorage.getItem('token') ||
                    JSON.parse(localStorage.getItem('accountsList') || '{}')[this.root_store.client.loginid];

                if (token) {
                    this.addLog('Authorizing with token...');
                    this.ws?.send(JSON.stringify({ authorize: token }));
                } else {
                    this.addLog('No auth token found. Trading will be disabled.');
                }
            };

            this.ws.onmessage = msg => {
                try {
                    const data = JSON.parse(msg.data);

                    if (data.error) {
                        if (data.error.code === 'SelfExclusion') {
                            this.setIsAutoRunning(false);
                        }
                        this.addLog(`Error Received: ${data.error.message} (Code: ${data.error.code})`);
                        return;
                    }

                    if (data.msg_type === 'authorize') {
                        this.addLog('Authorization Successful!');
                        this.is_authorized = true;
                        this.connection_status = STATUS_AUTHORIZED;
                    }

                    if (data.msg_type === 'buy') {
                        const buy_data = data.buy;
                        const contract_id = buy_data.contract_id;
                        this.addLog(`Purchase Successful: ${contract_id}`);
                        this.root_store.transactions.pushTransaction(buy_data);

                        this.ws?.send(
                            JSON.stringify({
                                proposal_open_contract: 1,
                                contract_id: contract_id,
                                subscribe: 1,
                            })
                        );
                    }

                    if (data.msg_type === 'proposal_open_contract') {
                        const contract = data.proposal_open_contract;

                        this.root_store.transactions.pushTransaction(contract);

                        if (this.root_store.summary_card?.onBotContractEvent) {
                            this.root_store.summary_card.onBotContractEvent(contract);
                        }

                        if (contract.is_sold) {
                            const profit = contract.profit;
                            const result = profit >= 0 ? 'WON' : 'LOST';
                            this.addLog(`Trade Result: ${result} ($${profit})`);
                            this.root_store.journal.onLogSuccess({
                                log_type: profit > 0 ? LogTypes.PROFIT : LogTypes.LOST,
                                extra: { currency: this.root_store.client.currency, profit },
                            });
                        }
                    }

                    if (data.msg_type === 'history') {
                        const prices = data.history.prices;
                        const digits = prices.map((p: string | number) => parseInt(p.toString().slice(-1), 10));
                        this.tick_history = digits;
                        if (digits.length > 0) {
                            this.last_digit = digits[digits.length - 1];
                        }
                        this.addLog(`Loaded ${digits.length} historical ticks.`);
                    }

                    if (data.msg_type === 'tick') {
                        const quote = data.tick.quote;
                        const digit = parseInt(quote.toString().slice(-1), 10);

                        this.last_digit = digit;
                        this.tick_history = [...this.tick_history.slice(-MAX_TICKS + 1), digit];

                        if (this.is_auto_running && digit === Number(this.entry_digit)) {
                            this.addLog(`Trigger Hit: Last digit is ${digit}`);
                            this.executeMultiTrade();
                        }
                    }
                } catch (error) {
                    this.addLog(`Error parsing message: ${error.message}`);
                }
            };

            this.ws.onclose = e => {
                this.addLog(`WS Closed: Code ${e.code}. Reconnecting in 5s...`);
                this.connection_status = STATUS_OFFLINE;
                this.reconnectTimeout = setTimeout(this.connectWebSocket, 5000);
            };
            this.ws.onerror = e => {
                this.addLog(`WS Error: ${e.message}`);
            };
        } catch (e) {
            this.addLog(`WS Init Fail: ${e.message}`);
        }
    }

    executeMultiTrade() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.addLog('Cannot trade: WS not open.');
            return;
        }

        if (!this.is_authorized) {
            this.addLog('Cannot trade: Not authorized. Please log in.');
            this.root_store.journal.pushMessage('⚠️ Login required to trade.', 'error');
            this.setIsAutoRunning(false);
            return;
        }

        const tradeAmount = Number(this.stake);
        if (tradeAmount <= 0) {
            this.addLog(`Cannot trade: Invalid stake of ${tradeAmount}.`);
            this.root_store.journal.pushMessage('⚠️ Stake must be a positive number.', 'error');
            this.setIsAutoRunning(false);
            return;
        }

        const currency = this.root_store.client.currency || 'USD';

        const baseParameters = {
            amount: tradeAmount,
            basis: 'stake',
            currency: currency,
            duration: 1,
            duration_unit: 't',
            symbol: this.selected_symbol,
        };

        const trade1_params = {
            buy: 1,
            price: tradeAmount,
            parameters: { ...baseParameters, contract_type: 'DIGITOVER', barrier: '5' },
        };

        const trade2_params = {
            buy: 1,
            price: tradeAmount,
            parameters: { ...baseParameters, contract_type: 'DIGITUNDER', barrier: '4' },
        };

        this.addLog(`Executing trades: Over 5, Under 4. Stake: ${tradeAmount} ${currency}`);

        this.addLog(`Sending Trade 1: ${JSON.stringify(trade1_params)}`);
        this.ws.send(JSON.stringify(trade1_params));

        this.addLog(`Sending Trade 2: ${JSON.stringify(trade2_params)}`);
        this.ws.send(JSON.stringify(trade2_params));

        if (!this.is_turbo) {
            this.setIsAutoRunning(false);
            this.addLog('Auto-run stopped (Turbo OFF).');
        }
    }
}
