import React, { useEffect, useState } from 'react';
import AnalysisTool from './analysis-tool';
import DpTools from '../dp-tools';
import Dcircles from '../dtrader/dcircles/dcircles';
import AllAnalysis from './all-analysis';
import Signals from '../signals';
import TickAnalyser from './tick-analyser';
import IframeWrapper from '@/components/iframe-wrapper';
import { useStore } from '@/hooks/useStore';
import { ApiHelpers } from '@/external/bot-skeleton';
import './analysis-tools.scss';

type AnalysisToolSubTab =
    | 'dcircles'
    | 'signals'
    | 'analysis-tool'
    | 'dp-tools'
    | 'smart-analysis'
    | 'all-analysis'
    | 'tick-analyser';

const AnalysisTools: React.FC = () => {
    const { run_panel } = useStore();
    const [active_tool, setActiveTool] = useState<AnalysisToolSubTab>('dcircles');
    const [show_trade_config, setShowTradeConfig] = useState(false);
    const [tradeConfig, setTradeConfig] = useState({
        market: 'synthetic_index',
        submarket: 'continuous_index',
        symbol: 'R_50',
        tradeTypeCategory: 'digits',
        tradeType: 'evenodd',
        type: 'evenodd',
        contract: 'DIGITEVEN',
        duration: '1',
        durationUnit: 't',
        stake: '0.5',
        stakeCurrency: 'AUD',
        candleInterval: '1m',
        prediction: '0',
        prediction2: '0',
    });
    const [hasPrediction2, setHasPrediction2] = useState(false);
    const volatilityOptions: Array<{ value: string; label: string }> = [
        { value: 'R_10', label: 'Volatility 10 Index' },
        { value: 'R_25', label: 'Volatility 25 Index' },
        { value: 'R_50', label: 'Volatility 50 Index' },
        { value: 'R_75', label: 'Volatility 75 Index' },
        { value: 'R_100', label: 'Volatility 100 Index' },
        { value: '1HZ10V', label: 'Volatility 10 (1s) Index' },
        { value: '1HZ25V', label: 'Volatility 25 (1s) Index' },
        { value: '1HZ50V', label: 'Volatility 50 (1s) Index' },
        { value: '1HZ75V', label: 'Volatility 75 (1s) Index' },
        { value: '1HZ100V', label: 'Volatility 100 (1s) Index' },
    ];
    const [options, setOptions] = useState({
        markets: [] as Array<[string, string]>,
        submarkets: [] as Array<[string, string]>,
        symbols: [] as Array<[string, string]>,
        tradeTypeCategories: [] as Array<[string, string]>,
        tradeTypes: [] as Array<[string, string]>,
        contractTypes: [] as Array<[string, string]>,
        durationTypes: [
            ['Ticks', 't'],
            ['Seconds', 's'],
            ['Minutes', 'm'],
            ['Hours', 'h'],
            ['Days', 'd'],
        ] as Array<[string, string]>,
        currencies: [
            ['USD', 'USD'],
            ['EUR', 'EUR'],
            ['GBP', 'GBP'],
            ['AUD', 'AUD'],
        ] as Array<[string, string]>,
    });

    const cleanValue = (val: string, fallback: string) => {
        if (!val) return fallback;
        const lowered = val.toLowerCase();
        if (lowered.includes('not available')) return fallback;
        return val;
    };

    const findVariableNumber = (workspace: any, varNames: string[], fallback: string) => {
        try {
            const blocks = workspace.getAllBlocks(false).filter((b: any) => b.type === 'variables_set');
            for (const b of blocks) {
                const varName = (b.getFieldValue('VAR') || '').toLowerCase();
                if (varNames.includes(varName)) {
                    const target = b.getInputTargetBlock('VALUE');
                    const num = target?.getFieldValue?.('NUM');
                    return cleanValue(num, fallback);
                }
            }
        } catch {
            //
        }
        return fallback;
    };

    const ensureValueInOptions = (value: string, opts: Array<[string, string]>, defaultVal?: string) => {
        if (!opts?.length) return value || defaultVal || '';
        const exists = opts.some(([, v]) => v === value);
        if (exists) return value;
        return defaultVal || opts[0][1];
    };

    const getNumberFromInput = (block: any, inputName: string, fallback: string) => {
        if (!block?.getInputTargetBlock) return fallback;
        const target = block.getInputTargetBlock(inputName);
        const num = target?.getFieldValue?.('NUM');
        return cleanValue(num, fallback);
    };

    const readFromWorkspace = () => {
        try {
            const workspace = (window as any)?.Blockly?.derivWorkspace;
            if (!workspace) return;
            const trade_def = workspace.getAllBlocks(false).find((b: any) => b.type === 'trade_definition');
            if (!trade_def) return;

            const durationUnitMap: Record<string, string> = { t: 't', s: 's', m: 'm', h: 'h', d: 'd' };

            const market_block = trade_def.getChildByType?.('trade_definition_market');
            const trade_type_block = trade_def.getChildByType?.('trade_definition_tradetype');
            const contract_block = trade_def.getChildByType?.('trade_definition_contracttype');
            const trade_options_block = trade_def.getChildByType?.('trade_definition_tradeoptions');
            const candle_block = trade_def.getChildByType?.('trade_definition_candleinterval');

            const market = cleanValue(market_block?.getFieldValue('MARKET_LIST'), tradeConfig.market);
            const submarket = cleanValue(market_block?.getFieldValue('SUBMARKET_LIST'), tradeConfig.submarket);
            const symbol = cleanValue(market_block?.getFieldValue('SYMBOL_LIST'), tradeConfig.symbol);
            const tradeTypeCategory = cleanValue(
                trade_type_block?.getFieldValue('TRADETYPECAT_LIST'),
                tradeConfig.tradeTypeCategory
            );
            const tradeType = cleanValue(trade_type_block?.getFieldValue('TRADETYPE_LIST'), tradeConfig.tradeType);
            const contract = cleanValue(contract_block?.getFieldValue('TYPE_LIST'), tradeConfig.contract);
            const durationUnit =
                durationUnitMap[trade_options_block?.getFieldValue('DURATIONTYPE_LIST') || ''] ||
                tradeConfig.durationUnit;
            const duration = getNumberFromInput(trade_options_block, 'DURATION', tradeConfig.duration);
            const stake = getNumberFromInput(trade_options_block, 'AMOUNT', tradeConfig.stake);
            const stakeCurrency = cleanValue(
                trade_options_block?.getFieldValue('CURRENCY_LIST'),
                tradeConfig.stakeCurrency
            );
            const candleInterval = cleanValue(
                candle_block?.getFieldValue('CANDLEINTERVAL_LIST'),
                tradeConfig.candleInterval
            );
            let prediction = getNumberFromInput(trade_options_block, 'PREDICTION', tradeConfig.prediction);
            if (!prediction || prediction === tradeConfig.prediction) {
                prediction = findVariableNumber(
                    workspace,
                    ['prediction', 'prediction one', 'prediction 1', 'prediction_one'],
                    prediction
                );
            }

            const prediction2 = findVariableNumber(
                workspace,
                ['prediction two', 'prediction 2', 'prediction_two'],
                tradeConfig.prediction2
            );
            const hasPred2 = !!prediction2 || prediction2 === '0';

            const stakeVar = findVariableNumber(workspace, ['stake'], tradeConfig.stake);

            setTradeConfig(prev => ({
                ...prev,
                market,
                submarket,
                symbol,
                tradeTypeCategory,
                tradeType,
                type: tradeType,
                contract,
                duration,
                durationUnit,
                stake: stakeVar || stake,
                stakeCurrency,
                candleInterval,
                prediction,
                prediction2,
            }));
            setHasPrediction2(hasPred2);
        } catch (e) {
            // ignore read failures; fall back to defaults
        }
    };

    const setNumberInput = (block: any, inputName: string, value: string, blockType = 'math_number_positive') => {
        if (!block?.workspace) return;
        const input = block.getInput(inputName);
        if (!input) return;
        const target = block.getInputTargetBlock(inputName);
        const numValue = value?.toString() || '';
        if (target && target.setFieldValue) {
            target.setFieldValue(numValue, 'NUM');
            return;
        }
        const numBlock = block.workspace.newBlock(blockType);
        numBlock.setFieldValue(numValue, 'NUM');
        numBlock.initSvg();
        numBlock.render();
        input.connection.connect(numBlock.outputConnection);
    };

    const setNumberVariable = (workspace: any, varNames: string[], value: string) => {
        if (!workspace) return;
        const blocks = workspace.getAllBlocks(false).filter((b: any) => b.type === 'variables_set');
        const numValue = value?.toString() || '';
        for (const b of blocks) {
            const varName = (b.getFieldValue('VAR') || '').toLowerCase();
            if (varNames.includes(varName)) {
                const input = b.getInput('VALUE');
                if (!input) continue;
                const target = input.connection?.targetBlock();
                if (target && target.setFieldValue) {
                    target.setFieldValue(numValue, 'NUM');
                    return;
                }
                const numBlock = workspace.newBlock('math_number_positive');
                numBlock.setInputsInline(true);
                numBlock.setShadow(true);
                numBlock.setFieldValue(numValue, 'NUM');
                numBlock.initSvg();
                numBlock.render();
                input.connection.connect(numBlock.outputConnection);
                return;
            }
        }
    };

    const writeToWorkspace = () => {
        try {
            const workspace = (window as any)?.Blockly?.derivWorkspace;
            if (!workspace) return;
            const trade_def = workspace.getAllBlocks(false).find((b: any) => b.type === 'trade_definition');
            if (!trade_def) return;

            const durationUnitMap: Record<string, string> = { t: 't', s: 's', m: 'm', h: 'h', d: 'd' };

            const market_block = trade_def.getChildByType?.('trade_definition_market');
            const trade_type_block = trade_def.getChildByType?.('trade_definition_tradetype');
            const contract_block = trade_def.getChildByType?.('trade_definition_contracttype');
            const trade_options_block = trade_def.getChildByType?.('trade_definition_tradeoptions');
            const candle_block = trade_def.getChildByType?.('trade_definition_candleinterval');

            const api = ApiHelpers?.instance;
            const active = api?.active_symbols;
            const contracts = api?.contracts_for;

            const marketOptions = active?.getMarketDropdownOptions?.() || [];
            const selectedMarket = ensureValueInOptions(tradeConfig.market, marketOptions, marketOptions[0]?.[1]);
            market_block?.setFieldValue(selectedMarket, 'MARKET_LIST');

            const submarketOptions = active?.getSubmarketDropdownOptions?.(selectedMarket) || [];
            const selectedSubmarket = ensureValueInOptions(
                tradeConfig.submarket,
                submarketOptions,
                submarketOptions[0]?.[1]
            );
            market_block?.setFieldValue(selectedSubmarket, 'SUBMARKET_LIST');

            const symbolOptions = active?.getSymbolDropdownOptions?.(selectedSubmarket) || [];
            const selectedSymbol = ensureValueInOptions(tradeConfig.symbol, symbolOptions, symbolOptions[0]?.[1]);
            market_block?.setFieldValue(selectedSymbol, 'SYMBOL_LIST');

            const ttcOptions = options.tradeTypeCategories.length
                ? options.tradeTypeCategories
                : fallbackData.tradeTypeCategories;
            const selectedTtc = ensureValueInOptions(tradeConfig.tradeTypeCategory, ttcOptions, ttcOptions[0]?.[1]);
            trade_type_block?.setFieldValue(selectedTtc, 'TRADETYPECAT_LIST');

            const ttOptions =
                options.tradeTypes.length && options.tradeTypeCategories.length
                    ? options.tradeTypes
                    : fallbackData.tradeTypesByCategory[normalizeKey(selectedTtc)] || [];
            const selectedTt = ensureValueInOptions(tradeConfig.tradeType, ttOptions, ttOptions[0]?.[1]);
            trade_type_block?.setFieldValue(selectedTt, 'TRADETYPE_LIST');

            const ctOptions =
                options.contractTypes.length && options.tradeTypes.length
                    ? options.contractTypes
                    : fallbackData.contractTypesByTradeType[normalizeKey(selectedTt)] || [];
            const selectedCt = ensureValueInOptions(tradeConfig.contract, ctOptions, ctOptions[0]?.[1]);
            if (selectedCt && selectedCt !== 'Select') contract_block?.setFieldValue(selectedCt, 'TYPE_LIST');

            trade_options_block?.setFieldValue(durationUnitMap[tradeConfig.durationUnit] || 't', 'DURATIONTYPE_LIST');
            setNumberInput(trade_options_block, 'DURATION', tradeConfig.duration);
            setNumberInput(trade_options_block, 'AMOUNT', tradeConfig.stake);
            setNumberVariable(workspace, ['stake'], tradeConfig.stake);
            trade_options_block?.setFieldValue(tradeConfig.stakeCurrency, 'CURRENCY_LIST');
            if (trade_options_block?.getInput('PREDICTION')) {
                setNumberInput(trade_options_block, 'PREDICTION', tradeConfig.prediction);
            }
            setNumberVariable(
                workspace,
                ['prediction', 'prediction one', 'prediction 1', 'prediction_one'],
                tradeConfig.prediction
            );
            if (hasPrediction2) {
                setNumberVariable(
                    workspace,
                    ['prediction two', 'prediction 2', 'prediction_two'],
                    tradeConfig.prediction2
                );
            }
            candle_block?.setFieldValue(tradeConfig.candleInterval, 'CANDLEINTERVAL_LIST');
        } catch (e) {
            // ignore write failures
        }
    };

    const fallbackData = {
        markets: [
            ['Derived', 'synthetic_index'],
            ['Forex', 'forex'],
            ['Stock Indices', 'stock'],
            ['Commodities', 'commodities'],
            ['Cryptocurrencies', 'crypto'],
        ],
        submarketsByMarket: {
            derived: [
                ['Continuous Indices', 'continuous_index'],
                ['Crash/Boom Indices', 'random_daily'],
                ['Step Indices', 'random_index'],
            ],
            forex: [['Major Pairs', 'major_pairs']],
            stock: [['US Indices', 'us_indices']],
            commodities: [['Metals', 'metals']],
            crypto: [['Crypto', 'crypto_pairs']],
        } as Record<string, Array<[string, string]>>,
        symbolsBySubmarket: {
            continuous_index: [
                ['Volatility 10 Index', 'R_10'],
                ['Volatility 25 Index', 'R_25'],
                ['Volatility 50 Index', 'R_50'],
            ],
            random_daily: [
                ['Boom 500 Index', 'BOOM500'],
                ['Crash 500 Index', 'CRASH500'],
            ],
            random_index: [['Step Index', 'STEPS']],
            major_pairs: [['EUR/USD', 'frxEURUSD']],
            us_indices: [['Wall Street Index', 'DJI']],
            metals: [['Gold/USD', 'XAUUSD']],
            crypto_pairs: [['Bitcoin/USD', 'BTCUSD']],
        } as Record<string, Array<[string, string]>>,
        tradeTypeCategories: [
            ['Digits', 'digits'],
            ['Rise/Fall', 'callput'],
            ['Over/Under', 'overunder'],
        ],
        tradeTypesByCategory: {
            digits: [
                ['Even/Odd', 'evenodd'],
                ['Matches/Differs', 'matchdiff'],
                ['Over/Under', 'overunder'],
            ],
            callput: [
                ['Rise', 'rise'],
                ['Fall', 'fall'],
            ],
            overunder: [
                ['Over', 'over'],
                ['Under', 'under'],
            ],
        } as Record<string, Array<[string, string]>>,
        contractTypesByTradeType: {
            evenodd: [
                ['Even', 'DIGITEVEN'],
                ['Odd', 'DIGITODD'],
            ],
            matchdiff: [
                ['Matches', 'DIGITMATCH'],
                ['Differs', 'DIGITDIFF'],
            ],
            overunder: [
                ['Over', 'DIGITOVER'],
                ['Under', 'DIGITUNDER'],
            ],
            rise: [['Rise', 'CALL']],
            fall: [['Fall', 'PUT']],
            over: [['Over', 'DIGITOVER']],
            under: [['Under', 'DIGITUNDER']],
        } as Record<string, Array<[string, string]>>,
    };

    const normalizeKey = (val: string) => (val || '').toLowerCase().trim();

    const applyFallbacks = () => {
        setOptions(prev => {
            const normalizedMarket = normalizeKey(tradeConfig.market);
            const normalizedSubmarket = normalizeKey(tradeConfig.submarket);
            const normalizedTradeTypeCat = normalizeKey(tradeConfig.tradeTypeCategory);
            const normalizedTradeType = normalizeKey(tradeConfig.tradeType);

            const submarkets =
                prev.submarkets.length || !normalizedMarket
                    ? prev.submarkets
                    : fallbackData.submarketsByMarket[normalizedMarket] || prev.submarkets;

            const symbols =
                prev.symbols.length || !normalizedSubmarket
                    ? prev.symbols
                    : fallbackData.symbolsBySubmarket[normalizedSubmarket] || prev.symbols;

            const tradeTypeCategories = prev.tradeTypeCategories.length
                ? prev.tradeTypeCategories
                : fallbackData.tradeTypeCategories;

            const tradeTypes =
                prev.tradeTypes.length || !normalizedTradeTypeCat
                    ? prev.tradeTypes
                    : fallbackData.tradeTypesByCategory[normalizedTradeTypeCat] || prev.tradeTypes;

            const contractTypes =
                prev.contractTypes.length || !normalizedTradeType
                    ? prev.contractTypes
                    : fallbackData.contractTypesByTradeType[normalizedTradeType] || prev.contractTypes;

            return {
                ...prev,
                markets: prev.markets.length ? prev.markets : fallbackData.markets,
                submarkets,
                symbols,
                tradeTypeCategories,
                tradeTypes,
                contractTypes,
            };
        });

        // Auto-select first fallback values if current is empty/invalid
        setTradeConfig(prev => {
            const next = { ...prev };
            const normalizedMarket = normalizeKey(prev.market);
            if (!normalizedMarket || normalizedMarket === 'not available') {
                next.market = fallbackData.markets[0][1];
            }
            const normalizedSubmarket = normalizeKey(next.submarket);
            const subOpts = fallbackData.submarketsByMarket[normalizeKey(next.market)] || [];
            if ((!normalizedSubmarket || normalizedSubmarket === 'not available') && subOpts.length) {
                next.submarket = subOpts[0][1];
            }
            const normalizedSymbol = normalizeKey(next.symbol);
            const symOpts = fallbackData.symbolsBySubmarket[normalizeKey(next.submarket)] || [];
            if ((!normalizedSymbol || normalizedSymbol === 'not available') && symOpts.length) {
                next.symbol = symOpts[0][1];
            }
            const normalizedCat = normalizeKey(next.tradeTypeCategory);
            if (!normalizedCat || normalizedCat === 'not available') {
                next.tradeTypeCategory = fallbackData.tradeTypeCategories[0][1];
            }
            const normalizedType = normalizeKey(next.tradeType);
            const typeOpts = fallbackData.tradeTypesByCategory[normalizeKey(next.tradeTypeCategory)] || [];
            if ((!normalizedType || normalizedType === 'not available') && typeOpts.length) {
                next.tradeType = typeOpts[0][1];
            }
            const normalizedContract = normalizeKey(next.contract);
            const cOpts = fallbackData.contractTypesByTradeType[normalizeKey(next.tradeType)] || [];
            if ((!normalizedContract || normalizedContract === 'not available') && cOpts.length) {
                next.contract = cOpts[0][1];
            }
            return next;
        });
    };

    const loadOptions = async (
        level: 'market' | 'submarket' | 'symbol' | 'tradeTypeCategory' | 'tradeType' | 'contractType'
    ) => {
        const api = ApiHelpers?.instance;
        if (!api) {
            applyFallbacks();
            return;
        }
        const active = api.active_symbols;
        const contracts = api.contracts_for;
        try {
            if (active && typeof active.retrieveActiveSymbols === 'function') {
                await active.retrieveActiveSymbols();
            }
            if (level === 'market') {
                const markets = active?.getMarketDropdownOptions?.() || [];
                setOptions(prev => ({ ...prev, markets }));
            }
            if (level === 'submarket') {
                const submarkets = tradeConfig.market
                    ? active?.getSubmarketDropdownOptions?.(tradeConfig.market) || []
                    : [];
                setOptions(prev => ({ ...prev, submarkets }));
            }
            if (level === 'symbol') {
                const symbols = tradeConfig.submarket
                    ? active?.getSymbolDropdownOptions?.(tradeConfig.submarket) || []
                    : [];
                setOptions(prev => ({ ...prev, symbols }));
            }
            if (level === 'tradeTypeCategory') {
                let ttc: Array<[string, string]> = [];
                if (
                    contracts?.getTradeTypeCategories &&
                    tradeConfig.market &&
                    tradeConfig.submarket &&
                    tradeConfig.symbol
                ) {
                    const result = await contracts.getTradeTypeCategories(
                        tradeConfig.market,
                        tradeConfig.submarket,
                        tradeConfig.symbol
                    );
                    ttc = result || [];
                } else {
                    ttc = [
                        ['Digits', 'digits'],
                        ['Rise/Fall', 'callput'],
                        ['Over/Under', 'overunder'],
                    ];
                }
                setOptions(prev => ({ ...prev, tradeTypeCategories: ttc }));
            }
            if (level === 'tradeType') {
                let tt: Array<[string, string]> = [];
                if (
                    contracts?.getTradeTypes &&
                    tradeConfig.market &&
                    tradeConfig.submarket &&
                    tradeConfig.symbol &&
                    tradeConfig.tradeTypeCategory
                ) {
                    const result = await contracts.getTradeTypes(
                        tradeConfig.market,
                        tradeConfig.submarket,
                        tradeConfig.symbol,
                        tradeConfig.tradeTypeCategory
                    );
                    tt = result || [];
                } else {
                    tt = fallbackData.tradeTypesByCategory[normalizeKey(tradeConfig.tradeTypeCategory)] || [];
                }
                setOptions(prev => ({ ...prev, tradeTypes: tt }));
            }
            if (level === 'contractType') {
                let ct: Array<[string, string]> = [];
                if (contracts?.getContractTypes && tradeConfig.tradeType) {
                    const result = contracts.getContractTypes(tradeConfig.tradeType) || [];
                    ct = result.map((c: any) => [c.text, c.value]);
                } else {
                    ct = fallbackData.contractTypesByTradeType[normalizeKey(tradeConfig.tradeType)] || [];
                }
                setOptions(prev => ({ ...prev, contractTypes: ct }));
            }
        } catch {
            // ignore option load errors
        } finally {
            applyFallbacks();
        }
    };

    useEffect(() => {
        if (show_trade_config) {
            readFromWorkspace();
            loadOptions('market');
            loadOptions('tradeTypeCategory');
            loadOptions('tradeType');
            loadOptions('contractType');
        }
    }, [show_trade_config]);

    useEffect(() => {
        if (!show_trade_config) return;
        loadOptions('tradeTypeCategory');
        if (options.tradeTypeCategories.length) {
            setTradeConfig(p => ({ ...p, tradeTypeCategory: '', tradeType: '', contract: 'Select' }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tradeConfig.symbol]);

    useEffect(() => {
        if (!show_trade_config) return;
        loadOptions('tradeType');
        if (options.tradeTypes.length) {
            setTradeConfig(p => ({ ...p, tradeType: '', contract: 'Select' }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tradeConfig.tradeTypeCategory]);

    useEffect(() => {
        if (!show_trade_config) return;
        loadOptions('contractType');
        if (options.contractTypes.length) {
            setTradeConfig(p => ({ ...p, contract: 'Select' }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tradeConfig.tradeType]);

    // Autofill first available option when current value is empty
    useEffect(() => {
        if (!show_trade_config) return;
        if (!tradeConfig.market && options.markets.length) {
            setTradeConfig(p => ({ ...p, market: options.markets[0][1] }));
        }
    }, [options.markets, show_trade_config]); // depend only on options to avoid resetting user edits

    useEffect(() => {
        if (!show_trade_config) return;
        if (!tradeConfig.submarket && options.submarkets.length) {
            setTradeConfig(p => ({ ...p, submarket: options.submarkets[0][1] }));
        }
    }, [options.submarkets, show_trade_config]);

    useEffect(() => {
        if (!show_trade_config) return;
        if (!tradeConfig.symbol && options.symbols.length) {
            setTradeConfig(p => ({ ...p, symbol: options.symbols[0][1] }));
        }
    }, [options.symbols, show_trade_config]);

    useEffect(() => {
        if (!show_trade_config) return;
        if (!tradeConfig.tradeTypeCategory && options.tradeTypeCategories.length) {
            setTradeConfig(p => ({ ...p, tradeTypeCategory: options.tradeTypeCategories[0][1] }));
        }
    }, [options.tradeTypeCategories, show_trade_config]);

    useEffect(() => {
        if (!show_trade_config) return;
        if (!tradeConfig.tradeType && options.tradeTypes.length) {
            setTradeConfig(p => ({ ...p, tradeType: options.tradeTypes[0][1] }));
        }
    }, [options.tradeTypes, show_trade_config]);

    useEffect(() => {
        if (!show_trade_config) return;
        if (!tradeConfig.contract && options.contractTypes.length) {
            setTradeConfig(p => ({ ...p, contract: options.contractTypes[0][1] }));
        }
    }, [options.contractTypes, show_trade_config]);

    // Keep Blockly trade definition in sync as the user edits the modal (no need to press Run)
    useEffect(() => {
        if (!show_trade_config) return;
        writeToWorkspace();
    }, [tradeConfig, show_trade_config]);

    const handleCardClick = (tool: AnalysisToolSubTab) => {
        setActiveTool(tool);
    };

    const renderContent = () => {
        if (!active_tool) return null;

        switch (active_tool) {
            case 'dcircles':
                return <Dcircles />;
            case 'signals':
                return <Signals />;
            case 'analysis-tool':
                return <AnalysisTool />;
            case 'dp-tools':
                return <DpTools />;
            case 'smart-analysis':
                return (
                    <IframeWrapper
                        src='https://www.smartanalysistool.com/signal-center'
                        title='Smart Analysis'
                        className='smart-analysis-container'
                    />
                );
            case 'all-analysis':
                return <AllAnalysis />;
            case 'tick-analyser':
                return <TickAnalyser />;
            case 'xenon-ai':
                return <IframeWrapper src='/xenon-ai.html' title='Xenon AI' className='xenon-ai-container' />;
            default:
                return null;
        }
    };

    return (
        <div className='analysis-tools'>
            <div className='analysis-tools__cards-container'>
                <div
                    className={`analysis-tools__card analysis-tools__card--dark ${active_tool === 'dcircles' ? 'analysis-tools__card--active' : ''}`}
                    onClick={() => handleCardClick('dcircles')}
                >
                    <div className='analysis-tools__card-content'>
                        <span className='analysis-tools__card-label'>DCIRCLES</span>
                    </div>
                </div>
                <div
                    className={`analysis-tools__card analysis-tools__card--light ${active_tool === 'signals' ? 'analysis-tools__card--active' : ''}`}
                    onClick={() => handleCardClick('signals')}
                >
                    <div className='analysis-tools__card-content'>
                        <span className='analysis-tools__card-label'>Signals</span>
                    </div>
                </div>
                <div
                    className={`analysis-tools__card analysis-tools__card--light ${active_tool === 'all-analysis' ? 'analysis-tools__card--active' : ''}`}
                    onClick={() => handleCardClick('all-analysis')}
                >
                    <div className='analysis-tools__card-content'>
                        <span className='analysis-tools__card-label'>All Analysis</span>
                    </div>
                </div>
                <div
                    className={`analysis-tools__card analysis-tools__card--light ${active_tool === 'dp-tools' ? 'analysis-tools__card--active' : ''}`}
                    onClick={() => handleCardClick('dp-tools')}
                >
                    <div className='analysis-tools__card-content'>
                        <span className='analysis-tools__card-label'>DP Tools</span>
                    </div>
                </div>
                <div
                    className={`analysis-tools__card analysis-tools__card--light ${active_tool === 'tick-analyser' ? 'analysis-tools__card--active' : ''}`}
                    onClick={() => handleCardClick('tick-analyser')}
                >
                    <div className='analysis-tools__card-content'>
                        <span className='analysis-tools__card-label'>Tick Analyser</span>
                    </div>
                </div>
            </div>
            <div className='analysis-tools__actions'>
                <button type='button' className='analysis-tools__trade-button' onClick={() => setShowTradeConfig(true)}>
                    Trade Set_UP
                </button>
            </div>
            {active_tool && <div className='analysis-tools__content'>{renderContent()}</div>}
            {show_trade_config && (
                <div className='analysis-tools__trade-modal-backdrop' onClick={() => setShowTradeConfig(false)}>
                    <div
                        className='analysis-tools__trade-modal'
                        onClick={e => e.stopPropagation()}
                        role='dialog'
                        aria-modal='true'
                        aria-label='Trade Set_UP'
                    >
                        <div className='analysis-tools__trade-modal-header'>
                            <span>Trade Set_UP</span>
                            <button
                                type='button'
                                className='analysis-tools__trade-close'
                                onClick={() => setShowTradeConfig(false)}
                                aria-label='Close'
                            >
                                ×
                            </button>
                        </div>
                        <div className='analysis-tools__trade-grid'>
                            <label>
                                Volatility:
                                <select
                                    value={
                                        volatilityOptions.some(opt => opt.value === tradeConfig.symbol)
                                            ? tradeConfig.symbol
                                            : volatilityOptions[0].value
                                    }
                                    onChange={e =>
                                        setTradeConfig(p => ({
                                            ...p,
                                            market: 'synthetic_index',
                                            submarket: 'continuous_index',
                                            symbol: e.target.value,
                                        }))
                                    }
                                >
                                    {volatilityOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Market:
                                <select
                                    value={tradeConfig.market}
                                    onChange={e => setTradeConfig(p => ({ ...p, market: e.target.value }))}
                                >
                                    {options.markets.map(([label, value]) => (
                                        <option key={value} value={value}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Trade Type:
                                <select
                                    value={tradeConfig.tradeTypeCategory}
                                    onChange={e => setTradeConfig(p => ({ ...p, tradeTypeCategory: e.target.value }))}
                                >
                                    {options.tradeTypeCategories.map(([label, value]) => (
                                        <option key={value} value={value}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Type:
                                <select
                                    value={tradeConfig.tradeType}
                                    onChange={e => setTradeConfig(p => ({ ...p, tradeType: e.target.value }))}
                                >
                                    {options.tradeTypes.map(([label, value]) => (
                                        <option key={value} value={value}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Contract:
                                <select
                                    value={tradeConfig.contract}
                                    onChange={e => setTradeConfig(p => ({ ...p, contract: e.target.value }))}
                                >
                                    {options.contractTypes.map(([label, value]) => (
                                        <option key={value} value={value}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Prediction:
                                <input
                                    type='number'
                                    min={0}
                                    max={9}
                                    value={tradeConfig.prediction}
                                    onChange={e => setTradeConfig(p => ({ ...p, prediction: e.target.value }))}
                                />
                            </label>
                            {hasPrediction2 && (
                                <label>
                                    Prediction 2:
                                    <input
                                        type='number'
                                        min={0}
                                        max={9}
                                        value={tradeConfig.prediction2}
                                        onChange={e => setTradeConfig(p => ({ ...p, prediction2: e.target.value }))}
                                    />
                                </label>
                            )}
                            <label>
                                Duration:
                                <div className='analysis-tools__trade-inline'>
                                    <input
                                        type='number'
                                        min={1}
                                        value={tradeConfig.duration}
                                        onChange={e => setTradeConfig(p => ({ ...p, duration: e.target.value }))}
                                    />
                                    <select
                                        value={tradeConfig.durationUnit}
                                        onChange={e => setTradeConfig(p => ({ ...p, durationUnit: e.target.value }))}
                                    >
                                        {options.durationTypes.map(([label, value]) => (
                                            <option key={value} value={value}>
                                                {label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </label>
                            <label>
                                Stake:
                                <div className='analysis-tools__trade-inline'>
                                    <input
                                        type='number'
                                        step='0.01'
                                        value={tradeConfig.stake}
                                        onChange={e => setTradeConfig(p => ({ ...p, stake: e.target.value }))}
                                    />
                                    <select
                                        value={tradeConfig.stakeCurrency}
                                        onChange={e => setTradeConfig(p => ({ ...p, stakeCurrency: e.target.value }))}
                                    >
                                        {options.currencies.map(([label, value]) => (
                                            <option key={value} value={value}>
                                                {label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </label>
                            <label>
                                Candle Interval:
                                <input
                                    type='text'
                                    value={tradeConfig.candleInterval}
                                    onChange={e => setTradeConfig(p => ({ ...p, candleInterval: e.target.value }))}
                                />
                            </label>
                        </div>
                        <div className='analysis-tools__trade-footer'>
                            <button
                                type='button'
                                className='analysis-tools__trade-run'
                                onClick={() => {
                                    writeToWorkspace();
                                    run_panel?.onRunButtonClick?.();
                                    setShowTradeConfig(false);
                                }}
                            >
                                ▶ Run
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnalysisTools;
