import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getSocketURL, getAppId } from '@/components/shared';
import { sendViaNewSystemWithPromise, onNewSystemMessage, sendViaNewSystem } from '@/auth/NewDerivAuth';

const SYMBOLS = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100', '1HZ100V', '1HZ150V', '1HZ200V'];
const CONTRACT_TYPES = [
  { value: 'CALL', label: 'Rise' },
  { value: 'PUT', label: 'Fall' },
  { value: 'DIGITOVER', label: 'Over' },
  { value: 'DIGITUNDER', label: 'Under' },
];

const TICK_BUFFER = 500;
const DIGIT_HISTORY = 200;

function getDigit(price: number): number {
  const str = price.toFixed(8).replace(/0+$/, '');
  const last = str[str.length - 1];
  return last ? parseInt(last, 10) : 0;
}

interface ContractInfo {
  id: string;
  contract_type: string;
  stake: number;
  symbol: string;
  entry_tick: number;
  exit_tick?: number;
  profit?: number;
  is_sold: boolean;
  entry_digit: number;
  exit_digit?: number;
  is_win?: boolean;
}

const NewDTrader: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const tickPrices = useRef<number[]>([]);
  const animRef = useRef<number>(0);

  const [symbol, setSymbol] = useState('R_100');
  const [contractType, setContractType] = useState('CALL');
  const [stake, setStake] = useState(5);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [currentDigit, setCurrentDigit] = useState<number | null>(null);
  const priceRef = useRef<number | null>(null);
  const digitRef = useRef<number | null>(null);
  const activeContractsRef = useRef<ContractInfo[]>([]);
  const [tickHistory, setTickHistory] = useState<number[]>([]);
  const [digitCounts, setDigitCounts] = useState<number[]>(Array(10).fill(0));
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [balance, setBalance] = useState<number | null>(null);
  const [activeContracts, setActiveContracts] = useState<ContractInfo[]>([]);
  const [contractHistory, setContractHistory] = useState<ContractInfo[]>([]);
  const [sessionStats, setSessionStats] = useState({ wins: 0, losses: 0, profit: 0 });
  const [isTrading, setIsTrading] = useState(false);
  const [exitHighlight, setExitHighlight] = useState<{ digit: number; win: boolean } | null>(null);
  const contractTypeRef = useRef(contractType);
  const stakeRef = useRef(stake);
  const symbolRef = useRef(symbol);
  contractTypeRef.current = contractType;
  stakeRef.current = stake;
  symbolRef.current = symbol;

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const pad = { top: 20, right: 60, bottom: 30, left: 10 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    const prices = tickPrices.current;
    if (prices.length < 2) {
      ctx.fillStyle = '#555';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for ticks...', W / 2, H / 2);
      return;
    }

    const visible = prices.slice(-300);
    const minP = Math.min(...visible);
    const maxP = Math.max(...visible);
    const range = maxP - minP || 1;
    const padding = range * 0.05;
    const yMin = minP - padding;
    const yMax = maxP + padding;
    const yRange = yMax - yMin;

    const toX = (i: number) => pad.left + (i / (visible.length - 1)) * chartW;
    const toY = (v: number) => pad.top + chartH - ((v - yMin) / yRange) * chartH;

    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (i / gridLines) * chartH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();

      const val = yMax - (i / gridLines) * yRange;
      ctx.fillStyle = '#666';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(2), W - pad.right + 55, y + 4);
    }

    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.01)');
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(visible[0]));
    for (let i = 1; i < visible.length; i++) {
      ctx.lineTo(toX(i), toY(visible[i]));
    }
    ctx.lineTo(toX(visible.length - 1), pad.top + chartH);
    ctx.lineTo(toX(0), pad.top + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(visible[0]));
    for (let i = 1; i < visible.length; i++) {
      ctx.lineTo(toX(i), toY(visible[i]));
    }
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.stroke();

    const lastX = toX(visible.length - 1);
    const lastY = toY(visible[visible.length - 1]);

    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ff4444';
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 68, 68, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(lastX, pad.top);
    ctx.lineTo(lastX, pad.top + chartH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(visible[visible.length - 1].toFixed(5), lastX + 6, lastY - 4);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ro = new ResizeObserver(() => drawChart());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [drawChart]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(function loop() {
      drawChart();
      animRef.current = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(animRef.current);
  }, [drawChart]);

  const connectTicks = useCallback((sym: string) => {
    if (wsRef.current) {
      try {
        wsRef.current.onclose = null;
        wsRef.current.close();
      } catch {}
    }
    tickPrices.current = [];
    setCurrentPrice(null);
    setCurrentDigit(null);
    setTickHistory([]);
    setDigitCounts(Array(10).fill(0));

    const server_url = getSocketURL()?.replace(/[^a-zA-Z0-9.]/g, '');
    const app_id = getAppId();
    if (!server_url || !app_id) return;

    const ws = new WebSocket(`wss://${server_url}/websockets/v3?app_id=${app_id}`);
    wsRef.current = ws;
    setConnectionStatus('Connecting...');

    ws.onopen = () => {
      if (ws !== wsRef.current) return;
      ws.send(JSON.stringify({ ticks: sym, subscribe: 1 }));
      ws.send(JSON.stringify({ ticks_history: sym, adjust_start_time: 1, end: 'latest', start: 1, style: 'ticks' }));
      setConnectionStatus('Live');
    };

    ws.onmessage = (event) => {
      if (ws !== wsRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data.msg_type === 'tick' && data.tick?.quote) {
          const price = data.tick.quote;
          const digit = getDigit(price);
          tickPrices.current = [...tickPrices.current.slice(-TICK_BUFFER + 1), price];
          priceRef.current = price;
          digitRef.current = digit;
          setCurrentPrice(price);
          setCurrentDigit(digit);
          setTickHistory(prev => {
            const next = [...prev.slice(-DIGIT_HISTORY + 1), digit];
            const counts = Array(10).fill(0) as number[];
            next.forEach(d => counts[d]++);
            setDigitCounts(counts);
            return next;
          });
        } else if (data.msg_type === 'history' && data.history?.prices) {
          const prices: number[] = data.history.prices;
          tickPrices.current = prices.slice(-TICK_BUFFER);
          if (prices.length > 0) {
            const lastP = prices[prices.length - 1];
            priceRef.current = lastP;
            digitRef.current = getDigit(lastP);
            setCurrentPrice(lastP);
            setCurrentDigit(getDigit(lastP));
          }
        }
      } catch {}
    };

    ws.onclose = () => {
      if (ws !== wsRef.current) return;
      setConnectionStatus('Disconnected');
      setTimeout(() => connectTicks(sym), 3000);
    };

    ws.onerror = () => {
      if (ws !== wsRef.current) return;
      ws.close();
    };
  }, []);

  useEffect(() => {
    connectTicks(symbol);
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbol, connectTicks]);

  useEffect(() => {
    const unsub = onNewSystemMessage((event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        if (data.msg_type === 'balance' && !data.error) {
          const bal = data.balance?.balance ?? data.balance?.accounts?.total;
          if (bal != null) setBalance(Number(bal));
          return;
        }

        if (data.msg_type === 'buy') {
          setIsTrading(false);
          if (!data.error && data.buy?.contract_id) {
            const contract_id = String(data.buy.contract_id);
            const entryPrice = priceRef.current || 0;
            const entryDigit = digitRef.current || 0;
            const newContract: ContractInfo = {
              id: contract_id,
              contract_type: contractTypeRef.current,
              stake: stakeRef.current,
              symbol: symbolRef.current,
              entry_tick: entryPrice,
              entry_digit: entryDigit,
              is_sold: false,
            };
            setActiveContracts(prev => { activeContractsRef.current = [...prev, newContract]; return activeContractsRef.current; });
            sendViaNewSystem({ proposal_open_contract: 1, contract_id: data.buy.contract_id, subscribe: 1 });
            sendViaNewSystem({ balance: 1 });
          }
          return;
        }

        if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract) {
          const poc = data.proposal_open_contract;
          const cid = String(poc.contract_id);
          if (poc.is_sold) {
            const exitTick = poc.exit_tick ?? 0;
            const exitDigit = exitTick ? getDigit(exitTick) : 0;
            const profit = Number(poc.profit ?? 0);
            const isWin = profit >= 0;

            setExitHighlight({ digit: exitDigit, win: isWin });
            setTimeout(() => setExitHighlight(null), 3000);

            setActiveContracts(prev => { activeContractsRef.current = prev.filter(c => c.id !== cid); return activeContractsRef.current; });
            setContractHistory(prev => {
              if (prev.find(c => c.id === cid)) return prev;
              const activeContract = activeContractsRef.current.find(c => c.id === cid);
              return [...prev, {
                id: cid,
                contract_type: poc.contract_type || activeContract?.contract_type || '',
                stake: Number(poc.buy_price ?? activeContract?.stake ?? 0),
                symbol: poc.symbol || activeContract?.symbol || '',
                entry_tick: poc.entry_tick ?? activeContract?.entry_tick ?? 0,
                exit_tick: exitTick,
                profit,
                is_sold: true,
                entry_digit: activeContract?.entry_digit ?? 0,
                exit_digit: exitDigit,
                is_win: isWin,
              }];
            });
            setSessionStats(prev => ({
              wins: prev.wins + (isWin ? 1 : 0),
              losses: prev.losses + (isWin ? 0 : 1),
              profit: prev.profit + profit,
            }));
            sendViaNewSystem({ balance: 1 });
          } else {
            setActiveContracts(prev => {
              const updated = prev.map(c => c.id === cid ? { ...c, entry_tick: poc.entry_tick ?? c.entry_tick } : c);
              activeContractsRef.current = updated;
              return updated;
            });
          }
          return;
        }
      } catch {}
    });
    return unsub;
  }, []);

  const handleBuy = async () => {
    if (isTrading) return;
    setIsTrading(true);
    const params: Record<string, any> = {
      amount: stake,
      basis: 'stake',
      currency: 'USD',
      duration: 1,
      duration_unit: 't',
      symbol,
      contract_type: contractType,
    };
    if (contractType === 'DIGITOVER') params.barrier = '5';
    if (contractType === 'DIGITUNDER') params.barrier = '4';
    try {
      await sendViaNewSystemWithPromise({ buy: 1, price: stake, parameters: params });
    } catch (err: any) {
      setIsTrading(false);
    }
  };

  const digitPercentages = digitCounts.map((count, i) => ({
    digit: i,
    count,
    pct: tickHistory.length > 0 ? (count / tickHistory.length) * 100 : 0,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: '#ddd', fontSize: '13px', background: '#151515' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 16px', background: '#1e1e1e', borderBottom: '1px solid #333', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ color: '#999' }}>Symbol:</label>
          <select value={symbol} onChange={e => setSymbol(e.target.value)}
            style={{ background: '#2a2a2a', color: '#ddd', border: '1px solid #444', borderRadius: '4px', padding: '4px 8px' }}>
            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ color: '#999' }}>Contract:</label>
          <select value={contractType} onChange={e => setContractType(e.target.value)}
            style={{ background: '#2a2a2a', color: '#ddd', border: '1px solid #444', borderRadius: '4px', padding: '4px 8px' }}>
            {CONTRACT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ color: '#999' }}>Stake ($):</label>
          <input type="number" value={stake} onChange={e => setStake(Math.max(0.5, Number(e.target.value)))}
            min={0.5} step={0.5}
            style={{ background: '#2a2a2a', color: '#ddd', border: '1px solid #444', borderRadius: '4px', padding: '4px 8px', width: '70px' }} />
        </div>
        <button onClick={handleBuy} disabled={isTrading || currentPrice === null}
          style={{
            background: isTrading ? '#555' : '#4caf50',
            color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 20px',
            cursor: isTrading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px',
          }}>
          {isTrading ? 'Buying...' : 'Buy'}
        </button>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: connectionStatus === 'Live' ? '#4caf50' : '#ff9800' }}>●</span>
          <span>{connectionStatus}</span>
          {balance !== null && <span style={{ color: '#4fc3f7' }}>Balance: ${Number(balance).toFixed(2)}</span>}
          {currentPrice !== null && <span style={{ color: '#ff4444' }}>Price: {currentPrice.toFixed(5)}</span>}
          {currentDigit !== null && <span style={{ color: '#ffeb3b', fontWeight: 'bold', fontSize: '18px' }}>{currentDigit}</span>}
        </span>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>

        <div style={{ width: '240px', minWidth: '240px', background: '#1a1a1a', borderLeft: '1px solid #333', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px', borderBottom: '1px solid #333' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>DIGIT DISTRIBUTION (last {tickHistory.length || 0})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
              {digitPercentages.map(({ digit, pct }) => {
                const isCurrent = currentDigit === digit;
                const isHighlight = exitHighlight?.digit === digit;
                const highlightColor = exitHighlight
                  ? (exitHighlight.win ? '#4caf50' : '#f44336')
                  : (isCurrent ? '#ffeb3b' : 'transparent');
                return (
                  <div key={digit} style={{ textAlign: 'center' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', margin: '0 auto',
                      background: isHighlight ? highlightColor : (isCurrent ? '#ffeb3b' : '#333'),
                      color: (isCurrent && !isHighlight) ? '#000' : '#fff',
                      fontWeight: 'bold', fontSize: '14px', transition: 'all 0.3s',
                      boxShadow: isCurrent ? '0 0 8px rgba(255,235,59,0.5)' : 'none',
                    }}>
                      {digit}
                    </div>
                    <div style={{ marginTop: '4px', height: '4px', background: '#2a2a2a', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${pct}%`,
                        background: isHighlight
                          ? highlightColor
                          : (pct > 12 ? '#4caf50' : pct > 9 ? '#ff9800' : '#f44336'),
                        borderRadius: '2px', transition: 'width 0.3s',
                      }} />
                    </div>
                    <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>{pct.toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>
          </div>

          {activeContracts.length > 0 && (
            <div style={{ padding: '12px', borderBottom: '1px solid #333' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>ACTIVE CONTRACTS</div>
              {activeContracts.map(c => (
                <div key={c.id} style={{ padding: '6px 8px', background: '#222', borderRadius: '4px', marginBottom: '4px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#4fc3f7' }}>{c.contract_type}</span>
                    <span style={{ color: '#aaa' }}>{c.symbol}</span>
                  </div>
                  <div style={{ color: '#888' }}>Stake: ${c.stake} | Entry: {c.entry_digit}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ padding: '12px', borderBottom: '1px solid #333' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>SESSION</div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px' }}>
              <span style={{ color: '#4caf50' }}>W: {sessionStats.wins}</span>
              <span style={{ color: '#f44336' }}>L: {sessionStats.losses}</span>
              <span style={{ color: sessionStats.profit >= 0 ? '#4caf50' : '#f44336' }}>
                P&L: ${sessionStats.profit.toFixed(2)}
              </span>
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>HISTORY</div>
            {contractHistory.slice(-50).reverse().map(c => (
              <div key={c.id + String(c.exit_tick)} style={{
                padding: '6px 8px', background: '#222', borderRadius: '4px', marginBottom: '4px', fontSize: '12px',
                borderLeft: `3px solid ${c.is_win ? '#4caf50' : '#f44336'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#4fc3f7' }}>{c.contract_type}</span>
                  <span style={{ color: c.is_win ? '#4caf50' : '#f44336', fontWeight: 'bold' }}>
                    {c.is_win ? `+$${c.profit?.toFixed(2) || '0.00'}` : `-$${Math.abs(c.profit || 0).toFixed(2)}`}
                  </span>
                </div>
                <div style={{ color: '#888' }}>
                  Entry: {c.entry_digit} → Exit: {c.exit_digit ?? '?'} | {c.symbol}
                </div>
              </div>
            ))}
            {contractHistory.length === 0 && (
              <div style={{ color: '#555', textAlign: 'center', padding: '20px', fontSize: '12px' }}>
                No trades yet. Select a contract and click Buy.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewDTrader;
