'use client';

import React, { useState } from 'react';
import { Filter, Zap, ExternalLink, ArrowUpRight, ArrowDownRight, CheckCircle2 } from 'lucide-react';
import { ScreenerResponse, ScreenerMatch } from '../types';

interface ScreenerViewProps {
  onSelectStock: (symbol: string) => void;
}

export default function ScreenerView({ onSelectStock }: ScreenerViewProps) {
  const [universe, setUniverse] = useState('Nifty 50');
  const [scanType, setScanType] = useState('SuperTrend Bullish Flip');
  const [customFormula, setCustomFormula] = useState('Buy = (Close > EMA(50)) & (RSI(14) > 60);');
  
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScreenerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const presets = [
    { id: 'SuperTrend Bullish Flip', label: 'SuperTrend Bullish Reversal', desc: 'Flipped to bullish on latest daily bar' },
    { id: '52-Week High Breakout', label: '52-Week High Breakout', desc: 'Price within 2% of 52W high with >1.2x volume' },
    { id: 'High Delivery Accumulation', label: 'Institutional Delivery Accumulation', desc: 'Delivery % > 40% with high volume' },
    { id: 'Golden Cross', label: '50 SMA / 200 SMA Golden Cross', desc: '50 SMA crossed above 200 SMA in last 5 days' },
    { id: 'RSI Oversold Bounce', label: 'RSI Oversold Momentum Reversal', desc: 'Recovering out of oversold below 35' },
    { id: 'Custom Formula', label: 'Custom AFL / Python Condition', desc: 'Write custom formula rule' }
  ];

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:8000/api/screener/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          universe: universe,
          scan_type: scanType,
          custom_formula: scanType === 'Custom Formula' ? customFormula : null
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Scan failed');
      }

      const result: ScreenerResponse = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Error executing scan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0d1117] overflow-y-auto p-4 gap-4">
      {/* Control Panel */}
      <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-white">NSE EOD Real-Time Screener</span>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-zinc-400">Target Basket:</label>
            <select
              value={universe}
              onChange={e => setUniverse(e.target.value)}
              className="bg-[#0d1117] border border-zinc-700 text-xs text-zinc-200 rounded-lg px-2.5 py-1"
            >
              <option value="Nifty 50">Nifty 50</option>
              <option value="Nifty Bank">Nifty Bank</option>
              <option value="Nifty IT">Nifty IT</option>
            </select>
          </div>
        </div>

        {/* Scan Type Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {presets.map(p => (
            <button
              key={p.id}
              onClick={() => setScanType(p.id)}
              className={`p-3 rounded-lg border text-left transition-all ${
                scanType === p.id 
                  ? 'bg-emerald-950/40 border-emerald-600 text-white' 
                  : 'bg-[#0d1117] border-zinc-800 hover:border-zinc-700 text-zinc-300'
              }`}
            >
              <div className="font-semibold text-xs text-white">{p.label}</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">{p.desc}</div>
            </button>
          ))}
        </div>

        {scanType === 'Custom Formula' && (
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Custom Formula Condition:</label>
            <input
              type="text"
              value={customFormula}
              onChange={e => setCustomFormula(e.target.value)}
              className="w-full bg-[#0d1117] border border-zinc-800 rounded-lg p-2 font-mono text-xs text-emerald-300"
              placeholder="Buy = (Close > EMA(50)) & (RSI(14) > 60);"
            />
          </div>
        )}

        <button
          onClick={handleScan}
          disabled={loading}
          className="self-start px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold text-xs flex items-center gap-2 shadow-lg transition-all disabled:opacity-50"
        >
          {loading ? (
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Zap className="w-3.5 h-3.5 fill-current" />
          )}
          {loading ? 'Scanning Universe...' : 'Run EOD Scan'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Results Table */}
      {data && (
        <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="text-xs font-semibold text-white uppercase tracking-wider">
              Scan Matches ({data.match_count} of {data.scanned_count} stocks)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="text-[10px] text-zinc-500 uppercase bg-[#0d1117] border-b border-zinc-800">
                <tr>
                  <th className="p-2.5">Symbol</th>
                  <th className="p-2.5">Price (₹)</th>
                  <th className="p-2.5">Day Change</th>
                  <th className="p-2.5">Volume Multiple</th>
                  <th className="p-2.5">Delivery %</th>
                  <th className="p-2.5">RSI(14)</th>
                  <th className="p-2.5">SuperTrend</th>
                  <th className="p-2.5">Trigger Reason</th>
                  <th className="p-2.5 text-right">Chart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40 text-zinc-300">
                {data.results.map((r, idx) => (
                  <tr key={idx} className="hover:bg-zinc-800/30">
                    <td className="p-2.5 font-bold text-white">{r.symbol}</td>
                    <td className="p-2.5">₹{r.close.toFixed(2)}</td>
                    <td className={`p-2.5 font-semibold ${r.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {r.change_pct >= 0 ? '+' : ''}{r.change_pct}%
                    </td>
                    <td className="p-2.5">{r.volume_ratio}x</td>
                    <td className="p-2.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-950 text-blue-300 border border-blue-800">
                        {r.delivery_pct}%
                      </span>
                    </td>
                    <td className="p-2.5">{r.rsi}</td>
                    <td className="p-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${r.supertrend === 'Bullish' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}`}>
                        {r.supertrend}
                      </span>
                    </td>
                    <td className="p-2.5 text-zinc-400 text-[11px]">{r.signal_details}</td>
                    <td className="p-2.5 text-right">
                      <button
                        onClick={() => onSelectStock(r.symbol)}
                        className="p-1 hover:bg-zinc-700 text-blue-400 rounded inline-flex items-center gap-1 text-[11px]"
                        title="Open in Chart"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> View
                      </button>
                    </td>
                  </tr>
                ))}
                {data.results.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-zinc-500 font-sans">
                      No stocks met the "{data.scan_type}" criteria in {data.universe}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
