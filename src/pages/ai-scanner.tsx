
import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import './ai-scanner.scss';

const AiScanner = observer(() => {
    const { over_under } = useStore();
    const { 
        is_ai_scanner_open,
        ai_contract_type,
        ai_barrier,
        ai_scan_results,
        is_ai_scanning,
        toggleAiScanner,
        setAiContractType,
        setAiBarrier,
        startAiScan 
    } = over_under;

    if (!is_ai_scanner_open) {
        return null;
    }

    return (
        <div className="ai-scanner-window">
            <div className="ai-scanner-header">
                <h3>AI Volatility Scanner</h3>
                <button onClick={toggleAiScanner} className="close-btn">X</button>
            </div>
            <div className="ai-scanner-content">
                <div className="scanner-controls">
                    <div className="input-group">
                        <label>Contract Type</label>
                        <select value={ai_contract_type} onChange={(e) => setAiContractType(e.target.value)}>
                            <option value="DIGITOVER">Over</option>
                            <option value="DIGITUNDER">Under</option>
                        </select>
                    </div>
                    <div className="input-group">
                        <label>Barrier</label>
                        <input type="number" value={ai_barrier} onChange={(e) => setAiBarrier(e.target.value)} min="0" max="9" />
                    </div>
                    <button onClick={startAiScan} disabled={is_ai_scanning}>
                        {is_ai_scanning ? 'Scanning...' : 'Start Scan'}
                    </button>
                </div>
                <div className="scanner-results">
                    <h4>Scan Results</h4>
                    {is_ai_scanning ? (
                        <p>Scanning in progress...</p>
                    ) : (
                        <ul>
                            {ai_scan_results.map((result, index) => (
                                <li key={index}>{result}</li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
});

export default AiScanner;
