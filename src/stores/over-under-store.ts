
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

interface AiScanResult {
    symbol: string;
    signal: 'Strong' | 'Potential' | 'Not Recommended' | 'Insufficient data';
}

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

    // AI Scanner State
    is_ai_scanner_open = false;
    ai_contract_type = 'DIGITOVER';
    ai_barrier = '3';
    ai_scan_results: AiScanResult[] = [];
    is_ai_scanning = false;
    ai_volatility_data: Map<string, number[]> = new Map();

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
            is_ai_scanner_open: observable,
            ai_contract_type: observable,
            ai_barrier: observable,
            ai_scan_results: observable,
            is_ai_scanning: observable,
            ai_volatility_data: observable,
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
            toggleAiScanner: action.bound,
            setAiContractType: action.bound,
            setAiBarrier: action.bound,
            startAiScan: action.bound,
        });
        this.root_store = root_store;
        this.initializeWorker();
    }

    initializeWorker() {
        this.volatilityAnalyzer = new Worker(new URL('../workers/volatility-analyzer.ts', import.meta.url));

        this.volatilityAnalyzer.onmessage = (event) => {
            const bestVolatility = event.data;
            if (bestVolatility) {
                this.addLog(`Automate: Best volatility found: ${bestVolatility}`);
                this.setSelectedSymbol(bestVolatility);
            } else {
                this.addLog('Automate: Could not determine best volatility, using random.');
                const symbols = Object.keys(pip_sizes);
                const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
                this.setSelectedSymbol(randomSymbol);
            }
        };
    }
    
    toggleAiScanner() {
        this.is_ai_scanner_open = !this.is_ai_scanner_open;
    }

    setAiContractType(type: string) {
        this.ai_contract_type = type;
    }

    setAiBarrier(barrier: string) {
        this.ai_barrier = barrier;
    }

    startAiScan() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.addLog('Cannot start AI scan: WebSocket not connected.');
            return;
        }

        this.is_ai_scanning = true;
        this.ai_scan_results = [];
        this.ai_volatility_data.clear();
        this.addLog('AI Scan Started: Fetching data for all volatilities...');

        const symbols = Object.keys(pip_sizes);
        symbols.forEach(symbol => {
            this.ws.send(JSON.stringify({ ticks_history: symbol, count: 100, end: 'latest', style: 'ticks' }));
        });
    }

    analyzeVolatility(symbol: string, ticks: number[]): AiScanResult {
        const barrier = parseInt(this.ai_barrier, 10);
        const contract_type = this.ai_contract_type;
        const total_ticks = ticks.length;

        if (total_ticks < 50) {
            return { symbol, signal: 'Insufficient data' };
        }

        const digit_stats = Array(10).fill(0);
        ticks.forEach(digit => digit_stats[digit]++);

        const first_half_stats = Array(10).fill(0);
        ticks.slice(0, Math.floor(total_ticks / 2)).forEach(digit => first_half_stats[digit]++);

        const second_half_stats = Array(10).fill(0);
        ticks.slice(Math.floor(total_ticks / 2)).forEach(digit => second_half_stats[digit]++);

        const percentages = digit_stats.map(count => (count / total_ticks) * 100);
        const first_half_percentages = first_half_stats.map(count => (count / (total_ticks/2)) * 100);
        const second_half_percentages = second_half_stats.map(count => (count / (total_ticks/2)) * 100);

        const max_val = Math.max(...percentages);
        const min_val = Math.min(...percentages);
        const hot_digit = percentages.indexOf(max_val);
        const cold_digit = percentages.indexOf(min_val);

        let target_digits: number[] = [];
        if (contract_type === 'DIGITOVER') {
            for (let i = 0; i < barrier; i++) target_digits.push(i);
        } else { // DIGITUNDER
            for (let i = barrier + 1; i < 10; i++) target_digits.push(i);
        }

        const total_percentage = target_digits.reduce((sum, digit) => sum + percentages[digit], 0);
        const is_increasing = target_digits.some(digit => second_half_percentages[digit] > first_half_percentages[digit]);
        const has_hot_cold_conflict = target_digits.some(digit => digit === hot_digit || digit === cold_digit);

        if (total_percentage < 10 && !is_increasing && !has_hot_cold_conflict) {
            return { symbol, signal: 'Strong' };
        } else if (total_percentage < 15 && !is_increasing) {
            return { symbol, signal: 'Potential' };
        } else {
            return { symbol, signal: 'Not Recommended' };
        }
    }

    addLog(msg: string) {
        // Optimized logging
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
            this.root_store.journal.pushMessage('⚠️ Login required to trade.', 'error');
            return;
        }
        
        if (!this.is_auto_running) {
            this.initial_stake = this.stake;
            this.setIsRecoveryActive(false); // Reset recovery on new start
        }

        this.setIsAutoRunning(!this.is_auto_running);
        if (this.is_auto_running) {
            this.addLog("Tool started. Waiting for trigger...");
            this.root_store.run_panel.setActiveTab('journal');
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

    fetchAllVolatilityTicks() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.addLog('Cannot fetch all ticks: WebSocket not connected.');
            return;
        }
        this.addLog('Fetching recent ticks for all volatilities...');
        const symbols = Object.keys(pip_sizes);
        this.ai_volatility_data.clear();
        symbols.forEach(symbol => {
            this.ws.send(JSON.stringify({ ticks_history: symbol, count: 50, end: 'latest', style: 'ticks' }));
        });
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
                this.addLog('WS Opened. Authorizing...');
                this.connection_status = STATUS_LIVE;

                const token =
                    localStorage.getItem('authToken') ||
                    localStorage.getItem('token') ||
                    JSON.parse(localStorage.getItem('accountsList') || '{}')[this.root_store.client.loginid];

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
                        if (data.error.code === 'SelfExclusion') {
                            this.setIsAutoRunning(false);
                        }
                        this.addLog(`Error Received: ${data.error.message} (Code: ${data.error.code})`);
                        return;
                    }

                    if ((this.is_automate || this.is_ai_scanning) && data.msg_type === 'history') {
                        const symbol = data.echo_req.ticks_history;
                        const pip_size = pip_sizes[symbol] || 2;
                        const prices = data.history.prices;
                        const digits = prices.map((p: string | number) => {
                            const price_str = Number(p).toFixed(pip_size);
                            return parseInt(price_str.slice(-1), 10);
                        });
                        this.ai_volatility_data.set(symbol, digits);

                        if (this.ai_volatility_data.size === Object.keys(pip_sizes).length) {
                             if (this.is_ai_scanning) {
                                this.addLog('All volatility data received. Analyzing...');
                                const results: AiScanResult[] = [];
                                this.ai_volatility_data.forEach((ticks, sym) => {
                                    results.push(this.analyzeVolatility(sym, ticks));
                                });
                                this.ai_scan_results = results;
                                this.is_ai_scanning = false;
                                this.addLog('AI Scan Finished.');
                            } else if (this.is_automate) {
                                this.addLog('All volatility data received. Analyzing for automation...');
                                const contract_type = this.is_recovery_active ? this.recovery_contract_type : this.manual_contract_type;
                                const barrier = this.is_recovery_active ? this.recovery_barrier : this.manual_barrier;

                                const plain_tick_data = {};
                                for (const [key, value] of this.ai_volatility_data.entries()) {
                                    plain_tick_data[key] = [...value];
                                }

                                this.volatilityAnalyzer.postMessage({
                                    tick_data: plain_tick_data,
                                    contract_type,
                                    barrier
                                });
                            }
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
                        const buy_data = data.buy;
                        const contract_id = buy_data.contract_id;
                        this.addLog(`Purchase Successful: ${contract_id}`);
                        this.active_contracts.add(String(contract_id));

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
                            const contract_id = String(contract.contract_id);
                            const profit = contract.profit;
                            this.contract_results.set(contract_id, profit);
                            
                            const result = profit >= 0 ? 'WON' : 'LOST';
                            this.addLog(`Trade Result [${contract_id}]: ${result} ($${profit})`);
                            this.root_store.journal.onLogSuccess({
                                log_type: profit > 0 ? LogTypes.PROFIT : LogTypes.LOST,
                                extra: { currency: this.root_store.client.currency, profit },
                            });

                            // Check if all active trades for this round are finished
                            const expected_count = (this.is_manual_mode || this.is_recovery_active) ? 1 : (this.use_second_trigger ? 2 : 1);
                            if (this.contract_results.size >= expected_count) {
                                this.processRoundResults();
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
                        this.addLog(`Loaded ${digits.length} historical ticks.`);
                    }

                    if (data.msg_type === 'tick') {
                        const quote = data.tick.quote;
                        const pip_size = data.tick.pip_size;
                        const quote_str = quote.toFixed(pip_size);
                        const digit = parseInt(quote_str.slice(-1), 10);

                        this.last_last_digit = this.last_digit;
                        this.last_digit = digit;
                        this.tick_history = [...this.tick_history.slice(-MAX_TICKS + 1), digit];

                        if (this.is_auto_running) {
                            let is_triggered = false;
                            
                            if (this.use_second_trigger) {
                                const match1 = (this.last_last_digit === Number(this.entry_digit) && this.last_digit === Number(this.second_entry_digit));
                                const match2 = (this.last_last_digit === Number(this.second_entry_digit) && this.last_digit === Number(this.entry_digit));
                                is_triggered = match1 || match2;
                            } else {
                                is_triggered = (this.last_digit === Number(this.entry_digit));
                            }

                            if (is_triggered) {
                                // Only trigger if no active trades
                                if (this.active_contracts.size === 0) {
                                     if (this.is_manual_mode) {
                                        this.addLog(`Trigger Hit: Executing Manual Trade`);
                                        this.executeTrade(this.manual_contract_type, this.manual_barrier);
                                    } else if (this.is_recovery_active) {
                                        this.addLog(`Trigger Hit: Executing Recovery Trade`);
                                        this.executeTrade(this.recovery_contract_type, this.recovery_barrier);
                                    } else {
                                        this.addLog(`Trigger Hit: Pattern matched`);
                                        this.executeMultiTrade();
                                    }
                                }
                            }
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

    async processRoundResults() {
        const profits = Array.from(this.contract_results.values());
        const all_loss = profits.every(p => p < 0);

        this.addLog(`Round finished. All trades resulted in loss: ${all_loss}`);

        if (all_loss) {
            this.stake = Number((this.stake * this.martingale).toFixed(2));
            this.addLog(`Martingale Applied: New stake is ${this.stake}`);
            this.setIsRecoveryActive(true);
            
            if (!this.use_recovery_delay) {
                this.addLog("Immediate recovery triggered (Delay OFF)");
                this.executeTrade(this.recovery_contract_type, this.recovery_barrier);
            }
        } else {
            this.stake = this.initial_stake;
            this.addLog(`Win or break-even detected. Resetting stake to ${this.initial_stake}`);
            this.setIsRecoveryActive(false);
            
            if (this.is_volatility_changer) {
                if (this.is_automate) {
                    this.addLog('Automate: Analyzing volatilities...');
                    this.fetchAllVolatilityTicks();
                } else {
                    const symbols = Object.keys(pip_sizes);
                    const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
                    this.addLog(`Volatility Changer: Switching to ${randomSymbol}`);
                    this.setSelectedSymbol(randomSymbol);
                }
            }
        }

        // Reset for next round
        this.active_contracts.clear();
        this.contract_results.clear();

        if (!this.is_turbo) {
            this.setIsAutoRunning(false);
            this.addLog('Auto-run stopped: Turbo Mode is off.');
        }
    }

    executeTrade(contract_type: string, barrier: string) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.is_authorized) return;

        const tradeAmount = Number(this.stake);
        const currency = this.root_store.client.currency || 'USD';

        const params = {
            buy: 1,
            price: tradeAmount,
            parameters: {
                amount: tradeAmount,
                basis: 'stake',
                currency: currency,
                duration: 1,
                duration_unit: 't',
                symbol: this.selected_school,
                contract_type,
                barrier,
            },
        };

        this.addLog(`Executing Trade: ${contract_type} ${barrier}. Stake: ${tradeAmount}`);
        this.ws.send(JSON.stringify(params));
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

        this.ws.send(JSON.stringify(trade1_params));
        this.ws.send(JSON.stringify(trade2_params));
    }
}
