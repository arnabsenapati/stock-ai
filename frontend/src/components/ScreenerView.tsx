'use client';

import React, { useState, useEffect } from 'react';
import { Filter, Zap, ExternalLink, TrendingUp, TrendingDown, Clock, ShieldCheck, ShieldAlert, CheckCircle2, Download, ChevronRight } from 'lucide-react';
import { ScreenerResponse, ScreenerMatch, MarketRegimeStatus } from '../types';

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
  
  // Market Regime Cash Protection State
  const [enableRegimeFilter, setEnableRegimeFilter] = useState(true);
  const [regimeIndexSymbol, setRegimeIndexSymbol] = useState('^NSEI');
  const [regimeRule, setRegimeRule] = useState('sma_200');
  const [showRegimeOptions, setShowRegimeOptions] = useState(false);
  const [hideVetoedSignals, setHideVetoedSignals] = useState(true);
  const [liveRegime, setLiveRegime] = useState<MarketRegimeStatus | null>(null);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScreenerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch real-time market regime on load or when settings change
  useEffect(() => {
    let isMounted = true;
    const fetchRegime = async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/screener/regime?benchmark_symbol=${encodeURIComponent(regimeIndexSymbol)}&regime_rule=${encodeURIComponent(regimeRule)}`);
        if (res.ok) {
          const rData = await res.json();
          if (isMounted) setLiveRegime(rData);
        }
      } catch (e) {
        // non-blocking
      }
    };
    fetchRegime();
    return () => { isMounted = false; };
  }, [regimeIndexSymbol, regimeRule]);

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
      desc: 'Run multi-criteria Python formula scanner' 
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
          signal_filter: signalFilter,
          regime_filter: enableRegimeFilter,
          regime_index_symbol: regimeIndexSymbol,
          regime_rule: regimeRule
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Scan failed');
      }

      const result: ScreenerResponse = await res.json();
      setData(result);
      if (result.regime) {
        setLiveRegime(result.regime);
      }
    } catch (err: any) {
      setError(err.message || 'Error executing scan');
    } finally {
      setLoading(false);
    }
  };

  const activeBuyCount = data?.results.filter(r => r.signal_type === 'BUY' && !r.is_regime_vetoed).length ?? 0;
  const vetoedBuyCount = data?.results.filter(r => r.signal_type === 'BUY' && r.is_regime_vetoed).length ?? 0;
  const sellMatchesCount = data?.results.filter(r => r.signal_type === 'SELL').length ?? 0;

  const filteredResults = data?.results.filter(r => {
    if (hideVetoedSignals && r.is_regime_vetoed) return false;
    if (signalFilter === 'BUY') return r.signal_type === 'BUY';
    if (signalFilter === 'SELL') return r.signal_type === 'SELL';
    return true;
  }) ?? [];

  const handleExportCSV = () => {
    if (!filteredResults.length) return;
    const headers = ['Symbol', 'Signal Type', 'Regime Status', 'Timing', 'Close Price (Rs)', 'Day Change %', '100 SMA', 'SuperTrend', 'Volume Ratio', 'Delivery %', 'RSI 14', 'Trigger Rationale', 'Date'];
    const rows = filteredResults.map(r => [
      r.symbol,
      r.signal_type,
      r.is_regime_vetoed ? 'Vetoed (Cash Protection)' : 'Allowed',
      r.signal_timing || '',
      r.close,
      r.change_pct,
      r.sma_100 || '',
      r.supertrend,
      r.volume_ratio,
      r.delivery_pct,
      r.rsi,
      `"${(r.is_regime_vetoed ? `[CASH DEFENSE VETO] ` : '') + r.signal_details.replace(/"/g, '""')}"`,
      r.date
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `screener_${scanType.replace(/\s+/g, '_')}_${universe.replace(/\s+/g, '_')}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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

        {/* Market Regime: Index Cash Protection Accordion */}
        <div className="border border-zinc-800/80 rounded-lg overflow-hidden bg-[#0d1117]/80">
          <button
            type="button"
            onClick={() => setShowRegimeOptions(!showRegimeOptions)}
            className="w-full flex items-center justify-between p-2.5 text-xs font-semibold text-zinc-300 hover:text-white transition-colors bg-zinc-900/50"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Market Regime: Index Cash Protection</span>
              {enableRegimeFilter ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-950/80 border border-cyan-700/60 text-cyan-300 font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-cyan-400" /> Protected
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 font-mono">
                  Off
                </span>
              )}
              {liveRegime && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                  liveRegime.is_bullish 
                    ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300' 
                    : 'bg-rose-950/60 border-rose-700/60 text-rose-300'
                }`}>
                  {liveRegime.is_bullish ? '🐂 Bull Market' : '🐻 Bearish / Cash Defense'} ({liveRegime.benchmark_name} ₹{liveRegime.close.toLocaleString()})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500 hidden sm:inline font-mono">
                {enableRegimeFilter ? `${regimeIndexSymbol} > ${regimeRule.toUpperCase().replace('_', ' ')}` : 'Cash defense disabled'}
              </span>
              <ChevronRight className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${showRegimeOptions ? 'rotate-90' : ''}`} />
            </div>
          </button>

          {showRegimeOptions && (
            <div className="p-3 space-y-3 border-t border-zinc-800/80 bg-black/30 text-xs">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-200 font-medium flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableRegimeFilter}
                    onChange={e => setEnableRegimeFilter(e.target.checked)}
                    className="rounded border-zinc-700 text-cyan-500 focus:ring-cyan-500 bg-zinc-800 w-4 h-4"
                  />
                  <span>Enable Index Cash Protection</span>
                </label>
                <span className="text-[10px] text-zinc-500 font-mono">Avoid Bear Breakouts</span>
              </div>

              {enableRegimeFilter && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-zinc-800/60">
                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">Benchmark Index</label>
                    <input
                      type="text"
                      value={regimeIndexSymbol}
                      onChange={e => setRegimeIndexSymbol(e.target.value.toUpperCase())}
                      placeholder="^NSEI (Nifty 50)"
                      className="w-full bg-[#0d1117] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">Regime Defense Rule</label>
                    <select
                      value={regimeRule}
                      onChange={e => setRegimeRule(e.target.value)}
                      className="w-full bg-[#0d1117] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                    >
                      <option value="sma_200">Nifty 50 &gt; 200 SMA (Institutional Macro Bull - Max Profit)</option>
                      <option value="sma_100">Nifty 50 &gt; 100 SMA (Intermediate Macro Trend)</option>
                      <option value="sma_50">Nifty 50 &gt; 50 SMA (Tactical Trend - Lowest Drawdown)</option>
                      <option value="supertrend">Nifty 50 SuperTrend(10, 3) Bullish</option>
                    </select>
                  </div>
                </div>
              )}

              {liveRegime && enableRegimeFilter && (
                <div className={`p-2.5 rounded-lg border text-xs leading-relaxed ${
                  liveRegime.is_bullish 
                    ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-300' 
                    : 'bg-cyan-950/30 border-cyan-900/40 text-cyan-200'
                }`}>
                  <div className="font-semibold flex items-center gap-1.5 mb-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Live Index Status: {liveRegime.benchmark_name} ({liveRegime.benchmark_symbol})</span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold ${liveRegime.is_bullish ? 'text-emerald-400' : 'text-rose-400'}`}>
                      [{liveRegime.status}]
                    </span>
                  </div>
                  <div>
                    {liveRegime.message}
                  </div>
                </div>
              )}

              <div className="p-2 rounded bg-cyan-950/20 border border-cyan-900/30 text-[11px] text-cyan-200/90 leading-tight">
                🛡️ <strong>Cash Defense in Screener:</strong> When enabled, any new BUY triggers are vetoed while the benchmark index ({regimeIndexSymbol}) is in a downtrend. Keeps portfolio safely in cash during market corrections, cutting out false breakouts.
              </div>
            </div>
          )}
        </div>

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
                  All ({filteredResults.length})
                </button>
                <button
                  onClick={() => setSignalFilter('BUY')}
                  className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    signalFilter === 'BUY'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                      : 'text-emerald-400/80 hover:text-emerald-300'
                  }`}
                >
                  <TrendingUp className="w-3 h-3" /> Buy ({activeBuyCount}{vetoedBuyCount > 0 && !hideVetoedSignals ? ` + ${vetoedBuyCount} vetoed` : ''})
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
          {/* Regime Defense Informational Banner */}
          {data.regime_filter_enabled && data.regime && (
            <div className={`p-3 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs shadow-sm ${
              data.regime.is_bullish 
                ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300' 
                : 'bg-gradient-to-r from-cyan-950/40 via-amber-950/30 to-rose-950/30 border-cyan-700/60 text-cyan-200'
            }`}>
              <div className="flex items-start gap-2.5">
                <ShieldCheck className={`w-5 h-5 shrink-0 mt-0.5 ${data.regime.is_bullish ? 'text-emerald-400' : 'text-cyan-400'}`} />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 font-semibold">
                    <span>{data.regime.is_bullish ? 'Market Regime: Bullish Environment' : 'Market Regime Cash Protection Active'}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono uppercase font-bold ${
                      data.regime.is_bullish ? 'bg-emerald-900/60 text-emerald-300' : 'bg-rose-900/60 text-rose-300'
                    }`}>
                      {data.regime.benchmark_symbol} &gt; {data.regime.regime_rule.toUpperCase().replace('_', ' ')}: {data.regime.status}
                    </span>
                  </div>
                  <div className="text-zinc-300 text-[11px]">
                    {data.regime.message}
                    {vetoedBuyCount > 0 && (
                      <span className="ml-1 text-amber-300 font-semibold">
                        (Vetoed {vetoedBuyCount} false breakout BUY setups).
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {vetoedBuyCount > 0 && (
                <button
                  type="button"
                  onClick={() => setHideVetoedSignals(!hideVetoedSignals)}
                  className="px-3 py-1.5 rounded-lg border text-xs font-semibold shrink-0 transition-all bg-zinc-900/80 border-cyan-700/80 hover:bg-zinc-800 text-cyan-300 shadow-sm"
                >
                  {hideVetoedSignals ? `Inspect Vetoed Setups (${vetoedBuyCount})` : `Hide Vetoed Setups (${vetoedBuyCount})`}
                </button>
              )}
            </div>
          )}

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
                <span className="text-emerald-400 font-mono font-semibold">{activeBuyCount} Buy Triggers</span>
                {vetoedBuyCount > 0 && (
                  <span className="text-amber-400 font-mono text-[11px] font-semibold bg-amber-950/60 border border-amber-800/60 px-1.5 py-0.5 rounded">
                    🛡️ {vetoedBuyCount} Vetoed by Regime
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span className="text-rose-400 font-mono font-semibold">{sellMatchesCount} Sell Triggers</span>
              </div>
              <button
                onClick={handleExportCSV}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px] font-semibold flex items-center gap-1.5 transition-all border border-zinc-700 shadow-sm ml-2"
                title="Download screener matches in CSV format"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" /> Export CSV
              </button>
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
                    <tr key={idx} className={`transition-colors ${r.is_regime_vetoed ? 'bg-amber-950/10 hover:bg-amber-950/20' : 'hover:bg-zinc-800/30'}`}>
                      {/* Signal Badge */}
                      <td className="p-2.5">
                        <div className="flex items-center gap-1.5">
                          {r.is_regime_vetoed ? (
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/90 text-amber-300 border border-amber-600/70 shadow-sm line-through opacity-85"
                              title={r.regime_veto_reason}
                            >
                              <ShieldAlert className="w-3 h-3 text-amber-400 shrink-0" /> VETOED BUY
                            </span>
                          ) : isBuy ? (
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
                      <td className="p-2.5 text-zinc-400 text-[11px] max-w-xs truncate" title={r.is_regime_vetoed ? `${r.regime_veto_reason} | ${r.signal_details}` : r.signal_details}>
                        {r.is_regime_vetoed && (
                          <span className="text-amber-400 font-semibold mr-1">
                            [CASH DEFENSE]
                          </span>
                        )}
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
                        <ShieldCheck className="w-8 h-8 text-cyan-400" />
                        <div className="font-semibold text-zinc-200">
                          {vetoedBuyCount > 0 
                            ? `${vetoedBuyCount} BUY setups were vetoed by Market Regime Cash Protection` 
                            : `No ${signalFilter !== 'ALL' ? signalFilter : ''} signals found`}
                        </div>
                        <div className="text-xs text-zinc-400 max-w-md">
                          {vetoedBuyCount > 0 ? (
                            <div className="space-y-2">
                              <div>
                                Broad market benchmark ({data.regime?.benchmark_name ?? regimeIndexSymbol}) is in a Bear regime. Buy entries are blocked to prevent false breakouts and keep capital safely in cash.
                              </div>
                              <button 
                                onClick={() => setHideVetoedSignals(false)}
                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700/70 text-cyan-300 rounded font-semibold text-xs transition-colors"
                              >
                                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> Inspect {vetoedBuyCount} Vetoed Setups
                              </button>
                            </div>
                          ) : (
                            'Try increasing the "Signal Horizon" to Last 5 or 15 Days, or choose "All Active Trend Positions" to inspect currently active trends.'
                          )}
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
