import { observer as globalObserver } from '../../../utils/observer';
import { createDetails } from '../utils/helpers';

const getBotInterface = tradeEngine => {
    const getDetail = i => {
        const contract = tradeEngine.data.contract;
        if (!contract || Object.keys(contract).length === 0) {
            return '';
        }
        return createDetails(contract)[i];
    };

    return {
        init: (...args) => tradeEngine.init(...args),
        start: (...args) => tradeEngine.start(...args),
        stop: (...args) => tradeEngine.stop(...args),
        purchase: contract_type => tradeEngine.purchase(contract_type),
        getAskPrice: contract_type => Number(getProposal(contract_type, tradeEngine).ask_price),
        getPayout: contract_type => Number(getProposal(contract_type, tradeEngine).payout),
        getPurchaseReference: () => tradeEngine.getPurchaseReference(),
        isSellAvailable: () => tradeEngine.isSellAtMarketAvailable(),
        sellAtMarket: () => tradeEngine.sellAtMarket(),
        getSellPrice: () => getSellPrice(tradeEngine),
        isResult: result => getDetail(10) === result,
        isTradeAgain: result => globalObserver.emit('bot.trade_again', result),
        readDetails: i => getDetail(i - 1),
        setVirtualHook: settings => {
            if (tradeEngine.vh_state) {
                if (typeof settings.enabled !== 'undefined') {
                    tradeEngine.vh_state.enabled = !!settings.enabled;
                    // If enabling, also set is_virtual to true to start virtual trades
                    if (settings.enabled) {
                        tradeEngine.vh_state.is_virtual = true;
                    }
                }
                if (typeof settings.threshold !== 'undefined') {
                    tradeEngine.vh_state.threshold = Number(settings.threshold);
                }
            }
        },
    };
};

const getProposal = (contract_type, tradeEngine) => {
    return tradeEngine.data.proposals.find(
        proposal =>
            proposal.contract_type === contract_type &&
            proposal.purchase_reference === tradeEngine.getPurchaseReference()
    );
};

const getSellPrice = tradeEngine => {
    return tradeEngine.getSellPrice();
};

export default getBotInterface;
