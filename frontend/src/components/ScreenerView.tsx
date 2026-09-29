'use client';

import React, { useState } from 'react';
import { Filter, Zap, ExternalLink, TrendingUp, TrendingDown, Clock, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { ScreenerResponse, ScreenerMatch } from '../types';

interface ScreenerViewProps {
  onSelectStock: (symbol: string) => void;
}

export default function ScreenerView({ onSelectStock }: ScreenerViewProps) {
  const [universe, setUniverse] = useState('Nifty 50');
  const [scanType, setScanType] = useState('SuperTrend + 100 SMA Trend Rider');
  const [lookbackDays, setLookbackDays] = useState(3);
  const [signalFilter, setSignalFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [customFormula, setCustomFormula] = useState(
`MacroTrend = Close > SMA(Close, 100)
Trend = SuperTrend_Trend(10, 3.0)
Buy = MacroTrend & Cross(Trend, 0)
Sell = CrossUnder(Trend, 0)`
  );
  
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScreenerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const presets = [
    { 
      id: 'SuperTrend + 100 SMA Trend Rider', 
      label: 'SuperTrend + 100 SMA Trend Rider (Optimal)', 
      desc: 'BUY: Bullish flip above 100 SMA | SELL: SuperTrend breakdown',
      highlight: true
    },
    { 
      id: 'SuperTrend Bullish Flip', 
      label: 'SuperTrend Bullish Reversal', 
      desc: 'Flipped to bullish on latest daily bar' 
    },
    { 
      id: '52-Week High Breakout', 
      label: '52-Week High Breakout', 
      desc: 'Price within 2% of 52W high with >1.2x volume' 
    },
    { 
      id: 'High Delivery Accumulation', 
      label: 'Institutional Delivery Accumulation', 
      desc: 'Delivery % > 40% with high volume accumulation' 
    },
    { 
      id: 'Golden Cross', 
      label: '50 SMA / 200 SMA Golden Cross', 
      desc: '50 SMA crossed above 200 SMA in last 5 days' 
    },
    { 
      id: 'RSI Oversold Bounce', 
      label: 'RSI Oversold Momentum Reversal', 
      desc: 'Recovering out of oversold below 35' 
    },
    { 
      id: 'Custom Formula', 
      label: 'Custom Strategy Rule (Buy & Sell)', 
      desc: 'Run multi-criteria AFL/Python formula scanner' 
    }
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
          custom_formula: scanType === 'Custom Formula' ? customFormula : null,
          lookback_days: lookbackDays,
          signal_filter: signalFilter
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

  const buyMatchesCount = data?.results.filter(r => r.signal_type === 'BUY').length ?? 0;
  const sellMatchesCount = data?.results.filter(r => r.signal_type === 'SELL').length ?? 0;

  const filteredResults = data?.results.filter(r => {
    if (signalFilter === 'BUY') return r.signal_type === 'BUY';
    if (signalFilter === 'SELL') return r.signal_type === 'SELL';
    return true;
  }) ?? [];

  return (
    <div className="flex-1 flex flex-col bg-[#0d1117] overflow-y-auto p-4 gap-4">
      {/* Control Panel */}
      <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-4 flex flex-col gap-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-white">NSE EOD Real-Time Screener</span>
            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950/70 border border-emerald-700/60 text-emerald-300 font-mono">
              Buy & Sell Engine
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            {/* Universe Basket */}
            <div className="flex items-center gap-2">
              <label className="text-zinc-400">Basket:</label>
              <select
                value={universe}
                onChange={e => setUniverse(e.target.value)}
                className="bg-[#0d1117] border border-zinc-700 text-xs text-zinc-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-emerald-500"
              >
                <option value="Nifty 50">Nifty 50</option>
                <option value="Nifty Bank">Nifty Bank</option>
                <option value="Nifty IT">Nifty IT</option>
              </select>
            </div>

            {/* Lookback Window */}
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <label className="text-zinc-400">Signal Horizon:</label>
              <select
                value={lookbackDays}
                onChange={e => setLookbackDays(Number(e.target.value))}
                className="bg-[#0d1117] border border-zinc-700 text-xs text-zinc-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-emerald-500"
              >
                <option value={1}>Today Only (Latest Bar)</option>
                <option value={3}>Last 3 Days (Swing Entry)</option>
                <option value={5}>Last 5 Days (1 Week)</option>
                <option value={15}>Last 15 Days (Recent Crossovers)</option>
                <option value={999}>All Active Trend Positions</option>
              </select>
            </div>
          </div>
        </div>

        {/* Scan Preset Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {presets.map(p => (
            <button
              key={p.id}
              onClick={() => setScanType(p.id)}
              className={`p-3 rounded-lg border text-left transition-all ${
                scanType === p.id 
                  ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-sm ring-1 ring-emerald-500/20' 
                  : p.highlight 
                    ? 'bg-[#121d17] border-emerald-900/60 hover:border-emerald-700 text-zinc-300' 
                    : 'bg-[#0d1117] border-zinc-800 hover:border-zinc-700 text-zinc-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`font-semibold text-xs ${scanType === p.id ? 'text-emerald-400' : 'text-white'}`}>
                  {p.label}
                </div>
                {p.highlight && (
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">
                    Optimal
                  </span>
                )}
              </div>
              <div className="text-[11px] text-zinc-400 mt-1 leading-snug">{p.desc}</div>
            </button>
          ))}
        </div>

        {scanType === 'Custom Formula' && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400">Custom Strategy Formula (Define Buy & Sell rules):</label>
              <span className="text-[10px] text-zinc-500 font-mono">Supports Close, SMA, EMA, RSI, SuperTrend_Trend, Cross, etc.</span>
            </div>
            <textarea
              rows={4}
              value={customFormula}
              onChange={e => setCustomFormula(e.target.value)}
              className="w-full bg-[#0d1117] border border-zinc-800 rounded-lg p-2.5 font-mono text-xs text-emerald-300 focus:outline-none focus:border-emerald-500 resize-none"
              placeholder="Buy = ... &#10;Sell = ..."
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            onClick={handleScan}
            disabled={loading}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold text-xs flex items-center gap-2 shadow-lg transition-all disabled:opacity-50"
          >
            {loading ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5 fill-current" />
            )}
            {loading ? 'Scanning Market Universe...' : 'Run EOD Scan'}
          </button>

          {data && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-500">Filter Signals:</span>
              <div className="inline-flex rounded-lg border border-zinc-800 bg-[#0d1117] p-0.5">
                <button
                  onClick={() => setSignalFilter('ALL')}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                    signalFilter === 'ALL'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  All ({data.match_count})
                </button>
                <button
                  onClick={() => setSignalFilter('BUY')}
                  className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    signalFilter === 'BUY'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                      : 'text-emerald-400/80 hover:text-emerald-300'
                  }`}
                >
                  <TrendingUp className="w-3 h-3" /> Buy ({buyMatchesCount})
                </button>
                <button
                  onClick={() => setSignalFilter('SELL')}
                  className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    signalFilter === 'SELL'
                      ? 'bg-rose-950 text-rose-300 border border-rose-700/60'
                      : 'text-rose-400/80 hover:text-rose-300'
                  }`}
                >
                  <TrendingDown className="w-3 h-3" /> Sell ({sellMatchesCount})
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Results Section */}
      {data && (
        <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white uppercase tracking-wider">
                Scan Results: {filteredResults.length} matches in {data.universe}
              </span>
              <span className="text-xs text-zinc-500">
                (Scanned {data.scanned_count} equities)
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-emerald-400 font-mono font-semibold">{buyMatchesCount} Buy Triggers</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span className="text-rose-400 font-mono font-semibold">{sellMatchesCount} Sell Triggers</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="text-[10px] text-zinc-500 uppercase bg-[#0d1117] border-b border-zinc-800">
                <tr>
                  <th className="p-2.5">Signal</th>
                  <th className="p-2.5">Symbol</th>
                  <th className="p-2.5">Price (₹)</th>
                  <th className="p-2.5">Day Change</th>
                  <th className="p-2.5">100 SMA</th>
                  <th className="p-2.5">SuperTrend</th>
                  <th className="p-2.5">Volume</th>
                  <th className="p-2.5">Delivery %</th>
                  <th className="p-2.5">RSI(14)</th>
                  <th className="p-2.5">Trigger Rationale</th>
                  <th className="p-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40 text-zinc-300">
                {filteredResults.map((r, idx) => {
                  const isBuy = r.signal_type === 'BUY';
                  const isSell = r.signal_type === 'SELL';

                  return (
                    <tr key={idx} className="hover:bg-zinc-800/30 transition-colors">
                      {/* Signal Badge */}
                      <td className="p-2.5">
                        <div className="flex items-center gap-1.5">
                          {isBuy ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-600/70 shadow-sm">
                              <TrendingUp className="w-3 h-3 text-emerald-400" /> BUY
                            </span>
                          ) : isSell ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-950 text-rose-300 border border-rose-600/70 shadow-sm">
                              <TrendingDown className="w-3 h-3 text-rose-400" /> SELL
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300">
                              NEUTRAL
                            </span>
                          )}
                          {r.signal_timing && (
                            <span className="text-[10px] text-zinc-500">
                              {r.signal_timing}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Symbol */}
                      <td className="p-2.5 font-bold text-white tracking-wide">
                        {r.symbol}
                      </td>

                      {/* Price */}
                      <td className="p-2.5 font-semibold text-white">
                        ₹{r.close.toFixed(2)}
                      </td>

                      {/* Day Change */}
                      <td className={`p-2.5 font-semibold ${r.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {r.change_pct >= 0 ? '+' : ''}{r.change_pct}%
                      </td>

                      {/* 100 SMA */}
                      <td className="p-2.5 text-zinc-300">
                        {r.sma_100 ? (
                          <div>
                            <div>₹{r.sma_100.toFixed(1)}</div>
                            {r.dist_sma100_pct !== undefined && (
                              <div className={`text-[10px] ${r.dist_sma100_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {r.dist_sma100_pct >= 0 ? '+' : ''}{r.dist_sma100_pct}%
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-600">-</span>
                        )}
                      </td>

                      {/* SuperTrend */}
                      <td className="p-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          r.supertrend === 'Bullish' 
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60' 
                            : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                        }`}>
                          {r.supertrend}
                        </span>
                      </td>

                      {/* Volume */}
                      <td className="p-2.5">
                        <span className={r.volume_ratio >= 1.5 ? 'text-amber-400 font-bold' : 'text-zinc-300'}>
                          {r.volume_ratio}x
                        </span>
                      </td>

                      {/* Delivery */}
                      <td className="p-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          r.delivery_pct >= 45 
                            ? 'bg-blue-950 text-blue-300 border border-blue-700/80 font-bold' 
                            : 'bg-zinc-800/60 text-zinc-400'
                        }`}>
                          {r.delivery_pct}%
                        </span>
                      </td>

                      {/* RSI */}
                      <td className="p-2.5">
                        <span className={r.rsi >= 70 ? 'text-rose-400 font-bold' : r.rsi <= 35 ? 'text-emerald-400 font-bold' : 'text-zinc-300'}>
                          {r.rsi}
                        </span>
                      </td>

                      {/* Trigger Rationale */}
                      <td className="p-2.5 text-zinc-400 text-[11px] max-w-xs truncate" title={r.signal_details}>
                        {r.signal_details}
                      </td>

                      {/* Action */}
                      <td className="p-2.5 text-right">
                        <button
                          onClick={() => onSelectStock(r.symbol)}
                          className="px-2.5 py-1 bg-zinc-800 hover:bg-emerald-600 hover:text-white text-zinc-200 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition-all"
                          title="Open Chart in Workstation"
                        >
                          <ExternalLink className="w-3 h-3" /> Chart
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredResults.length === 0 && (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-zinc-500 font-sans">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <ShieldCheck className="w-8 h-8 text-zinc-600" />
                        <div className="font-semibold text-zinc-400">No {signalFilter !== 'ALL' ? signalFilter : ''} signals found</div>
                        <div className="text-xs text-zinc-500 max-w-sm">
                          Try increasing the "Signal Horizon" to Last 5 or 15 Days, or choose "All Active Trend Positions" to inspect currently active trends.
                        </div>
                      </div>
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
