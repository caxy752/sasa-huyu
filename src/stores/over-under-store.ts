
import { action, makeObservable, observable } from 'mobx';
import { LogTypes } from '@/external/bot-skeleton';
import { TStores } from '@/types/stores.types';
import RootStore from './root-store';

const STATUS_OFFLINE = 'Offline';
const STATUS_CONNECTING = 'Connecting...';
const STATUS_LIVE = 'Live Ticks';
const STATUS_AUTHORIZED = 'Account Connected';

const MAX_TICKS = 1000;

const pip_sizes = {
    'R_100': 2,
    'R_75': 4,
    'R_50': 4,
    'R_25': 3,
    'R_10': 3,
    '1HZ100V': 2,
    '1HZ75V': 2,
    '1HZ50V': 2,
    '1HZ25V': 2,
    '1HZ10V': 2,
};

export default class OverUnderStore {
    root_store: RootStore;
    ws: WebSocket | null = null;
    reconnectTimeout: NodeJS.Timeout | null = null;
    is_authorized = false;
    debug_info: string[] = [];
    volatilityAnalyzer: Worker | null = null;

    connection_status = STATUS_OFFLINE;
    tick_history: number[] = [];
    last_digit: number | null = null;
    is_auto_running = false;
    stake = 1;
    initial_stake = 1;
    martingale = 2;
    is_volatility_changer = false;
    is_automate = false;
    use_second_trigger = true;
    is_manual_mode = false;
    manual_contract_type = 'DIGITOVER';
    manual_barrier = '5';
    is_recovery_active = false;
    recovery_contract_type = 'DIGITOVER';
    recovery_barrier = '5';
    use_recovery_delay = false;
    entry_digit = 7;
    second_entry_digit = 7;
    last_last_digit: number | null = null;
    is_turbo = false;
    selected_symbol = 'R_100';
    active_contracts: Set<string> = new Set();
    contract_results: Map<string, number> = new Map();

    // Volatility Analysis State
    is_analyzing_volatility = false;
    analysis_queue: string[] = [];
    best_score = Infinity;
    best_symbol: string | null = null;
    current_analyzing_symbol: string | null = null;

    constructor(root_store: RootStore) {
        makeObservable(this, {
            connection_status: observable,
            tick_history: observable,
            last_digit: observable,
            last_last_digit: observable,
            is_auto_running: observable,
            stake: observable,
            initial_stake: observable,
            martingale: observable,
            is_volatility_changer: observable,
            is_automate: observable,
            use_second_trigger: observable,
            is_manual_mode: observable,
            manual_contract_type: observable,
            manual_barrier: observable,
            is_recovery_active: observable,
            recovery_contract_type: observable,
            recovery_barrier: observable,
            use_recovery_delay: observable,
            entry_digit: observable,
            second_entry_digit: observable,
            is_turbo: observable,
            selected_symbol: observable,
            debug_info: observable,
            is_analyzing_volatility: observable,
            setStake: action.bound,
            setMartingale: action.bound,
            setIsVolatilityChanger: action.bound,
            setIsAutomate: action.bound,
            setUseSecondTrigger: action.bound,
            setIsManualMode: action.bound,
            setManualContractType: action.bound,
            setManualBarrier: action.bound,
            setIsRecoveryActive: action.bound,
            setRecoveryContractType: action.bound,
            setRecoveryBarrier: action.bound,
            setUseRecoveryDelay: action.bound,
            setEntryDigit: action.bound,
            setSecondEntryDigit: action.bound,
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
        this.initializeWorker();
    }

    initializeWorker() {
        this.volatilityAnalyzer = new Worker(new URL('../workers/volatility-analyzer.ts', import.meta.url));

        this.volatilityAnalyzer.onmessage = (event) => {
            const { score } = event.data;
            this.addLog(`Analysis for ${this.current_analyzing_symbol}: Score ${score.toFixed(2)}`);

            if (score < this.best_score) {
                this.best_score = score;
                this.best_symbol = this.current_analyzing_symbol;
                this.addLog(`New best volatility: ${this.best_symbol} (Score: ${score.toFixed(2)})`);
            }
            
            this.processAnalysisQueue();
        };
    }
    
    startVolatilityAnalysis() {
        if (!this.is_automate || this.is_analyzing_volatility) return;
        
        this.is_analyzing_volatility = true;
        this.analysis_queue = Object.keys(pip_sizes);
        this.best_score = Infinity;
        this.best_symbol = null;
        this.addLog('Volatility analysis started...');
        this.processAnalysisQueue();
    }

    processAnalysisQueue() {
        if (this.analysis_queue.length > 0) {
            this.current_analyzing_symbol = this.analysis_queue.shift();
            this.addLog(`Analyzing: ${this.current_analyzing_symbol}`);
            this.ws.send(JSON.stringify({ 
                ticks_history: this.current_analyzing_symbol, 
                count: 50, 
                end: 'latest', 
                style: 'ticks' 
            }));
        } else {
            this.is_analyzing_volatility = false;
            if (this.best_symbol) {
                this.addLog(`Analysis complete. Best volatility: ${this.best_symbol}`);
                this.setSelectedSymbol(this.best_symbol);
            } else {
                this.addLog('Analysis complete. No suitable volatility found. Switching to a random volatility.');
                const symbols = Object.keys(pip_sizes);
                const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
                this.setSelectedSymbol(randomSymbol);
            }
        }
    }

    addLog(msg: string) {
        const timestamp = new Date().toLocaleTimeString();
        this.debug_info.unshift(`[${timestamp}] ${msg}`);
        if (this.debug_info.length > 20) {
            this.debug_info.pop();
        }
    }
    
    clearDebug() {
        this.debug_info = [];
    }

    setStake(stake: number) {
        this.stake = stake;
        if (!this.is_auto_running) {
            this.initial_stake = stake;
        }
    }

    setMartingale(value: number) {
        this.martingale = value;
    }

    setIsVolatilityChanger(value: boolean) {
        this.is_volatility_changer = value;
    }

    setIsAutomate(value: boolean) {
        this.is_automate = value;
        if (value && this.is_volatility_changer) {
            this.startVolatilityAnalysis();
        }
    }

    setUseSecondTrigger(value: boolean) {
        this.use_second_trigger = value;
    }

    setIsManualMode(value: boolean) {
        this.is_manual_mode = value;
    }

    setManualContractType(value: string) {
        this.manual_contract_type = value;
    }

    setManualBarrier(value: string) {
        this.manual_barrier = value;
    }

    setIsRecoveryActive(value: boolean) {
        this.is_recovery_active = value;
    }

    setRecoveryContractType(value: string) {
        this.recovery_contract_type = value;
    }

    setRecoveryBarrier(value: string) {
        this.recovery_barrier = value;
    }

    setUseRecoveryDelay(value: boolean) {
        this.use_recovery_delay = value;
    }

    setEntryDigit(digit: number) {
        this.entry_digit = digit;
    }

    setSecondEntryDigit(digit: number) {
        this.second_entry_digit = digit;
    }

    setIsTurbo(is_turbo: boolean) {
        this.is_turbo = is_turbo;
    }

    setSelectedSymbol(symbol: string) {
        if (this.selected_symbol === symbol) return;
        this.selected_symbol = symbol;
        if (this.is_authorized || this.connection_status === STATUS_LIVE) {
            this.subscribeToTicks(symbol);
        }
    }

    setIsAutoRunning(is_running: boolean) {
        this.is_auto_running = is_running;
        if (is_running) {
            this.active_contracts.clear();
            this.contract_results.clear();
        }
    }

    handleStartStop() {
        if (!this.is_auto_running && !this.is_authorized) {
            this.addLog("Please log in to start the tool.");
            return;
        }
        
        if (!this.is_auto_running) {
            this.initial_stake = this.stake;
            this.setIsRecoveryActive(false);
        }

        this.setIsAutoRunning(!this.is_auto_running);
        if (this.is_auto_running) {
            this.addLog("Tool started. Waiting for trigger...");
            if (this.is_automate) {
                this.startVolatilityAnalysis();
            }
        } else {
            this.addLog("Tool stopped by user.");
            this.setIsRecoveryActive(false);
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

        const app_id = '117164';
        const server_url = 'ws.derivws.com';

        try {
            this.ws = new WebSocket(`wss://${server_url}/websockets/v3?app_id=${app_id}`);

            this.ws.onopen = () => {
                this.addLog('WS Opened. Authorizing...');
                this.connection_status = STATUS_LIVE;

                const token = localStorage.getItem('active_loginid') ? 
                    JSON.parse(localStorage.getItem('client.accounts') || '{}')[localStorage.getItem('active_loginid')].token :
                    null;

                if (token) {
                    this.ws?.send(JSON.stringify({ authorize: token }));
                } else {
                    this.addLog('No auth token found. Subscribing to public ticks.');
                    this.subscribeToTicks(this.selected_symbol);
                }
            };

            this.ws.onmessage = async msg => {
                try {
                    const data = JSON.parse(msg.data);

                    if (data.error) {
                        this.addLog(`Error: ${data.error.message}`);
                        return;
                    }
                    
                    if (this.is_analyzing_volatility && data.msg_type === 'history') {
                        if(data.echo_req.ticks_history === this.current_analyzing_symbol){
                            const pip_size = pip_sizes[this.current_analyzing_symbol] || 2;
                            const prices = data.history.prices;
                            const digits = prices.map((p: string | number) => {
                                const price_str = Number(p).toFixed(pip_size);
                                return parseInt(price_str.slice(-1), 10);
                            });

                            this.volatilityAnalyzer.postMessage({
                                ticks: digits,
                                contract_type: this.is_recovery_active ? this.recovery_contract_type : this.manual_contract_type,
                                barrier: this.is_recovery_active ? this.recovery_barrier : this.manual_barrier,
                            });
                        }
                        return;
                    }

                    if (data.msg_type === 'authorize') {
                        this.addLog('Authorization Successful!');
                        this.is_authorized = true;
                        this.connection_status = STATUS_AUTHORIZED;
                        this.subscribeToTicks(this.selected_symbol); 
                    }

                    if (data.msg_type === 'buy') {
                        const contract_id = data.buy.contract_id;
                        this.addLog(`Purchase Sent: ${contract_id}`);
                        this.active_contracts.add(String(contract_id));
                    }

                    if (data.msg_type === 'proposal_open_contract') {
                        const contract = data.proposal_open_contract;

                        if (this.root_store.summary_card?.onBotContractEvent) {
                            this.root_store.summary_card.onBotContractEvent(contract);
                        }

                        if (contract.is_sold) {
                            const contract_id = String(contract.contract_id);
                            if (this.active_contracts.has(contract_id)) {
                                const profit = contract.profit;
                                this.contract_results.set(contract_id, profit);
                                
                                const result = profit >= 0 ? 'WON' : 'LOST';
                                this.addLog(`Trade Result [${contract_id}]: ${result} ($${profit})`);
                                
                                this.active_contracts.delete(contract_id);

                                if (this.active_contracts.size === 0) {
                                    this.processRoundResults();
                                }
                            }
                        }
                    }

                    if (data.msg_type === 'history' && data.echo_req.subscribe === 1) {
                        const pip_size = pip_sizes[this.selected_symbol] || 2;
                        const prices = data.history.prices;
                        const digits = prices.map((p: string | number) => {
                            const price_str = Number(p).toFixed(pip_size);
                            return parseInt(price_str.slice(-1), 10);
                        });
                        this.tick_history = digits;
                        if (digits.length > 0) {
                            this.last_digit = digits[digits.length - 1];
                        }
                        this.addLog(`Loaded ${digits.length} historical ticks for ${this.selected_symbol}.`);
                    }

                    if (data.msg_type === 'tick') {
                        const quote = data.tick.quote;
                        const pip_size = data.tick.pip_size;
                        const quote_str = quote.toFixed(pip_size);
                        const digit = parseInt(quote_str.slice(-1), 10);

                        this.last_last_digit = this.last_digit;
                        this.last_digit = digit;
                        this.tick_history = [...this.tick_history.slice(-MAX_TICKS + 1), digit];

                        if (this.is_auto_running && !this.is_analyzing_volatility) {
                            let is_triggered = false;
                            
                            if (this.use_second_trigger) {
                                is_triggered = (this.last_last_digit === Number(this.entry_digit) && this.last_digit === Number(this.second_entry_digit)) || 
                                             (this.last_last_digit === Number(this.second_entry_digit) && this.last_digit === Number(this.entry_digit));
                            } else {
                                is_triggered = (this.last_digit === Number(this.entry_digit));
                            }

                            if (is_triggered && this.active_contracts.size === 0) {
                                if (this.is_manual_mode) {
                                    this.addLog(`Trigger Hit: Manual Trade`);
                                    this.executeTrade(this.manual_contract_type, this.manual_barrier);
                                } else if (this.is_recovery_active) {
                                    this.addLog(`Trigger Hit: Recovery Trade`);
                                    this.executeTrade(this.recovery_contract_type, this.recovery_barrier);
                                } else {
                                    this.addLog(`Trigger Hit: Standard Multi-Trade`);
                                    this.executeMultiTrade();
                                }
                            }
                        }
                    }
                } catch (error) {
                    this.addLog(`Error parsing message: ${error.message}`);
                }
            };

            this.ws.onclose = e => {
                this.addLog(`WS Closed. Reconnecting...`);
                this.connection_status = STATUS_OFFLINE;
                this.reconnectTimeout = setTimeout(() => this.connectWebSocket(), 5000);
            };
            this.ws.onerror = e => {
                this.addLog(`WS Error`);
            };
        } catch (e) {
            this.addLog(`WS Init Fail: ${e.message}`);
        }
    }

    processRoundResults() {
        const profits = Array.from(this.contract_results.values());
        const all_loss = profits.every(p => p < 0);

        this.addLog(`Round finished. All trades resulted in loss: ${all_loss}`);

        if (all_loss) {
            this.stake = Number((this.stake * this.martingale).toFixed(2));
            this.addLog(`Martingale Applied: New stake is ${this.stake}`);
            this.setIsRecoveryActive(true);
            
            if (!this.use_recovery_delay) {
                this.addLog("Immediate recovery trade");
                this.executeTrade(this.recovery_contract_type, this.recovery_barrier);
            }
        } else {
            this.stake = this.initial_stake;
            this.addLog(`Resetting stake to ${this.initial_stake}`);
            this.setIsRecoveryActive(false);
            
            if (this.is_volatility_changer && this.is_automate) {
                this.startVolatilityAnalysis();
            }
        }

        this.contract_results.clear();

        if (!this.is_turbo) {
            this.setIsAutoRunning(false);
            this.addLog('Turbo Mode is off. Stopping auto-run.');
        }
    }

    executeTrade(contract_type: string, barrier: string) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.is_authorized) return;
        const tradeAmount = Number(this.stake);
        const currency = 'USD';

        const params = {
            buy: 1, price: tradeAmount,
            parameters: { amount: tradeAmount, basis: 'stake', currency, duration: 1, duration_unit: 't', symbol: this.selected_symbol, contract_type, barrier },
        };
        this.addLog(`Executing: ${contract_type} ${barrier} @ ${tradeAmount}`);
        this.ws.send(JSON.stringify(params));
    }

    executeMultiTrade() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.is_authorized) return;
        const tradeAmount = Number(this.stake);
        const currency = 'USD';

        const baseParams = { amount: tradeAmount, basis: 'stake', currency, duration: 1, duration_unit: 't', symbol: this.selected_symbol };
        const trade1_params = { buy: 1, price: tradeAmount, parameters: { ...baseParams, contract_type: 'DIGITOVER', barrier: '5' } };
        const trade2_params = { buy: 1, price: tradeAmount, parameters: { ...baseParams, contract_type: 'DIGITUNDER', barrier: '4' } };

        this.addLog(`Executing Multi-Trade: O5/U4 @ ${tradeAmount}`);
        this.ws.send(JSON.stringify(trade1_params));
        this.ws.send(JSON.stringify(trade2_params));
    }
}
