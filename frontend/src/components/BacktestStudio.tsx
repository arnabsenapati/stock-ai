'use client';

import React, { useState, useEffect } from 'react';
import { 
  Play, 
  RotateCcw, 
  TrendingUp, 
  ShieldAlert, 
  Award, 
  Percent, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight,
  Download,
  Code2,
  Sliders,
  DollarSign,
  Clock,
  Sparkles,
  Pause,
  CheckCircle2,
  Save,
  Cpu,
  RefreshCw,
  X,
  Zap,
  Layers,
  ChevronRight
} from 'lucide-react';
import { BacktestResponse, OptimizationStatusResponse, StrategyBasketProfile } from '../types';

interface BacktestStudioProps {
  currentSymbol: string;
  availableSymbols: string[];
}

export default function BacktestStudio({ currentSymbol, availableSymbols }: BacktestStudioProps) {
  const [mode, setMode] = useState<'single' | 'basket'>('single');
  const [selectedStock, setSelectedStock] = useState(currentSymbol || 'RELIANCE');
  const [selectedUniverse, setSelectedUniverse] = useState('Nifty 50');
  const [lookbackPeriod, setLookbackPeriod] = useState<string>('5y');
  const [executionTiming, setExecutionTiming] = useState<'next_open' | 'same_close'>('next_open');
  
  const [strategyCode, setStrategyCode] = useState<string>(`# SuperTrend + 100 SMA Trend Rider (Optimal)
# Rule 1: Macro Trend - Only buy stocks above 100-day moving average
MacroTrend = Close > SMA(Close, 100)

# Rule 2: Intermediate momentum trigger - SuperTrend flips bullish
Trend = SuperTrend_Trend(10, 3.0)

# Rule 3: Entry Signal
Buy = MacroTrend & Cross(Trend, 0)

# Rule 4: Exit Signal
Sell = CrossUnder(Trend, 0)
`);

  // Risk parameters (Defaults: 100,000 capital, ~10,000 per trade)
  const [initialCapital, setInitialCapital] = useState(100000);
  const [riskPerTrade, setRiskPerTrade] = useState(10);
  const [maxPositions, setMaxPositions] = useState(10);
  const [stopLoss, setStopLoss] = useState<string>('4.5');
  const [takeProfit, setTakeProfit] = useState<string>('18.0');
  const [trailingStop, setTrailingStop] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tradeFilter, setTradeFilter] = useState<'all' | 'wins' | 'losses'>('all');

  const [selectedPresetName, setSelectedPresetName] = useState<string>("SuperTrend + 100 SMA Trend Rider (Optimal)");
  const [savedProfile, setSavedProfile] = useState<StrategyBasketProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);
  const [showOptModal, setShowOptModal] = useState<boolean>(false);

  // Optimization state
  const [optStatus, setOptStatus] = useState<OptimizationStatusResponse | null>(null);
  const [optLoading, setOptLoading] = useState<boolean>(false);
  const [optMetric, setOptMetric] = useState<string>('sharpe_ratio');
  const [optTrials, setOptTrials] = useState<number>(150);
  const [optRanges, setOptRanges] = useState({
    sl_min: 2.0,
    sl_max: 15.0,
    tp_min: 5.0,
    tp_max: 35.0,
    risk_min: 5.0,
    risk_max: 25.0,
    pos_min: 4,
    pos_max: 12,
    ts_mode: 'auto' as 'auto' | 'always_on' | 'disabled',
    ts_min: 2.0,
    ts_max: 10.0
  });

  const presets: Record<string, string> = {
    "SuperTrend + 100 SMA Trend Rider (Optimal)": `# SuperTrend + 100 SMA Trend Rider (Optimal)
MacroTrend = Close > SMA(Close, 100)
Trend = SuperTrend_Trend(10, 3.0)
Buy = MacroTrend & Cross(Trend, 0)
Sell = CrossUnder(Trend, 0)
`,
    "1-2 Month Low-Risk Positional Trend Rider": `# 1-2 Month Low-Risk Positional Trend Rider (NSE Large/Midcap)
MacroTrend = (Close > SMA(Close, 100)) & (SMA(Close, 50) > SMA(Close, 200))
Trend = SuperTrend_Trend(10, 3.0)
Buy = MacroTrend & Cross(Trend, 0)
Sell = CrossUnder(Trend, 0) | CrossUnder(Close, EMA(Close, 50))
`,
    "SuperTrend Trend Following": `# SuperTrend Trend Following System
Trend = SuperTrend_Trend(10, 3.0)
Buy = Cross(Trend, 0)
Sell = CrossUnder(Trend, 0)
`,
    "Golden Cross (SMA 50 / 200)": `# Golden Cross with RSI Momentum Filter
Buy = Cross(SMA(Close, 50), SMA(Close, 200)) & (RSI(Close, 14) > 50)
Sell = Cross(SMA(Close, 200), SMA(Close, 50)) | (RSI(Close, 14) < 40)
`,
    "RSI Mean Reversion (Oversold Bounce)": `# RSI 14 Mean Reversion
Buy = Cross(RSI(Close, 14), 30)
Sell = Cross(RSI(Close, 14), 70) | (Close < LLV(Low, 15))
`,
    "Volume Breakout with Delivery Edge": `# Indian Market Edge: High Volume + High Delivery %
VolAvg = SMA(Volume, 20)
Buy = (Close > HHV(Close, 20).shift(1)) & (Volume > VolAvg * 1.5) & (DeliveryPct > 45.0)
Sell = CrossUnder(Close, EMA(Close, 20))
`,
    "Turtle Donchian Breakout": `# Classic 20-Day Donchian Breakout
Buy = Close > HHV(High, 20).shift(1)
Sell = Close < LLV(Low, 10).shift(1)
`
  };

  // Apply saved profile parameters directly into the input fields
  const applyProfileToInputs = (p: StrategyBasketProfile) => {
    if (p.initial_capital) setInitialCapital(p.initial_capital);
    if (p.risk_per_trade_pct) setRiskPerTrade(p.risk_per_trade_pct);
    if (p.stop_loss_pct !== null && p.stop_loss_pct !== undefined) setStopLoss(String(p.stop_loss_pct));
    if (p.take_profit_pct !== null && p.take_profit_pct !== undefined) setTakeProfit(String(p.take_profit_pct));
    if (p.trailing_stop_pct !== null && p.trailing_stop_pct !== undefined) setTrailingStop(String(p.trailing_stop_pct));
    else setTrailingStop('');
    if (p.max_positions) setMaxPositions(p.max_positions);
  };

  // Fetch preset whenever strategy or universe changes
  useEffect(() => {
    const fetchPreset = async () => {
      setProfileLoading(true);
      try {
        const res = await fetch(`http://localhost:8000/api/presets/profile?strategy_name=${encodeURIComponent(selectedPresetName)}&universe=${encodeURIComponent(selectedUniverse)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.profile) {
            setSavedProfile(data.profile);
          } else {
            setSavedProfile(null);
          }
        }
      } catch (err) {
        // silent
      } finally {
        setProfileLoading(false);
      }
    };
    fetchPreset();
  }, [selectedPresetName, selectedUniverse]);

  // Status poller when modal is open or when optimizer is running
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (showOptModal || optStatus?.status === 'running') {
      const pollStatus = async () => {
        try {
          const res = await fetch(`http://localhost:8000/api/optimize/status?strategy_name=${encodeURIComponent(selectedPresetName)}&universe=${encodeURIComponent(selectedUniverse)}`);
          if (res.ok) {
            const data: OptimizationStatusResponse = await res.json();
            setOptStatus(data);
          }
        } catch (e) {
          // silent
        }
      };
      pollStatus();
      interval = setInterval(pollStatus, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showOptModal, optStatus?.status, selectedPresetName, selectedUniverse]);

  const handleStartOpt = async () => {
    setOptLoading(true);
    try {
      let startDate: string | null = null;
      if (lookbackPeriod === '3y') startDate = '2023-09-28';
      else if (lookbackPeriod === '2y') startDate = '2024-09-28';
      else if (lookbackPeriod === '1y') startDate = '2025-09-28';

      const res = await fetch('http://localhost:8000/api/optimize/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy_name: selectedPresetName,
          universe: selectedUniverse,
          strategy_code: strategyCode,
          target_trials: optTrials,
          target_metric: optMetric,
          initial_capital: initialCapital,
          execution_timing: executionTiming,
          param_ranges: optRanges,
          start_date: startDate
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to start optimization');
      }
      const statusRes = await fetch(`http://localhost:8000/api/optimize/status?strategy_name=${encodeURIComponent(selectedPresetName)}&universe=${encodeURIComponent(selectedUniverse)}`);
      if (statusRes.ok) {
        setOptStatus(await statusRes.json());
      }
    } catch (e: any) {
      alert(e.message || 'Error starting optimizer');
    } finally {
      setOptLoading(false);
    }
  };

  const handlePauseOpt = async () => {
    try {
      await fetch('http://localhost:8000/api/optimize/pause', { method: 'POST' });
      const statusRes = await fetch(`http://localhost:8000/api/optimize/status?strategy_name=${encodeURIComponent(selectedPresetName)}&universe=${encodeURIComponent(selectedUniverse)}`);
      if (statusRes.ok) {
        setOptStatus(await statusRes.json());
      }
    } catch (e: any) {
      alert(e.message || 'Error pausing optimizer');
    }
  };

  const handleResumeOpt = async () => {
    try {
      await fetch('http://localhost:8000/api/optimize/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy_name: selectedPresetName,
          universe: selectedUniverse,
          strategy_code: strategyCode,
          execution_timing: executionTiming
        })
      });
      const statusRes = await fetch(`http://localhost:8000/api/optimize/status?strategy_name=${encodeURIComponent(selectedPresetName)}&universe=${encodeURIComponent(selectedUniverse)}`);
      if (statusRes.ok) {
        setOptStatus(await statusRes.json());
      }
    } catch (e: any) {
      alert(e.message || 'Error resuming optimizer');
    }
  };

  const handleResetOpt = async () => {
    if (!confirm(`Are you sure you want to reset the optimization study for "${selectedPresetName}" on "${selectedUniverse}"? All trial checkpoints will be cleared.`)) return;
    try {
      await fetch('http://localhost:8000/api/optimize/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy_name: selectedPresetName,
          universe: selectedUniverse
        })
      });
      setOptStatus(null);
    } catch (e: any) {
      alert(e.message || 'Error resetting study');
    }
  };

  const handleApplyOpt = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/optimize/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy_name: selectedPresetName,
          universe: selectedUniverse
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to apply profile');
      }
      const data = await res.json();
      if (data.profile) {
        applyProfileToInputs(data.profile);
        setSavedProfile(data.profile);
        setShowOptModal(false);
      }
    } catch (e: any) {
      alert(e.message || 'Error applying best profile');
    }
  };

  const handleSaveCurrentAsPreset = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/presets/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy_name: selectedPresetName,
          universe: selectedUniverse,
          initial_capital: initialCapital,
          risk_per_trade_pct: riskPerTrade,
          stop_loss_pct: stopLoss ? parseFloat(stopLoss) : null,
          take_profit_pct: takeProfit ? parseFloat(takeProfit) : null,
          trailing_stop_pct: trailingStop ? parseFloat(trailingStop) : null,
          max_positions: maxPositions,
          best_metric_name: 'manual',
          best_metric_value: result?.metrics.sharpe_ratio ?? 0,
          total_trades: result?.metrics.total_trades ?? 0,
          win_rate: result?.metrics.win_rate_pct ?? 0,
          total_return_pct: result?.metrics.total_return_pct ?? 0,
          max_drawdown_pct: result?.metrics.max_drawdown_pct ?? 0,
          sharpe_ratio: result?.metrics.sharpe_ratio ?? 0,
          cagr_pct: result?.metrics.cagr_pct ?? 0
        })
      });
      if (res.ok) {
        const data = await res.json();
        setSavedProfile(data.profile);
        alert(`Saved preset configuration for "${selectedPresetName}" on "${selectedUniverse}"!`);
      }
    } catch (e: any) {
      alert(e.message || 'Error saving preset');
    }
  };

  const handleRunBacktest = async () => {
    setLoading(true);
    setError(null);
    try {
      let startDate: string | null = null;
      if (lookbackPeriod === '3y') startDate = '2023-09-28';
      else if (lookbackPeriod === '2y') startDate = '2024-09-28';
      else if (lookbackPeriod === '1y') startDate = '2025-09-28';

      const res = await fetch('http://localhost:8000/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: mode,
          symbol: selectedStock,
          universe: selectedUniverse,
          strategy_code: strategyCode,
          initial_capital: initialCapital,
          risk_per_trade_pct: riskPerTrade,
          max_positions: maxPositions,
          stop_loss_pct: stopLoss ? parseFloat(stopLoss) : null,
          take_profit_pct: takeProfit ? parseFloat(takeProfit) : null,
          trailing_stop_pct: trailingStop ? parseFloat(trailingStop) : null,
          slippage_pct: 0.05,
          brokerage_pct: 0.10,
          execution_timing: executionTiming,
          start_date: startDate
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Backtest failed');
      }

      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred during backtest');
    } finally {
      setLoading(false);
    }
  };

  const filteredTrades = result?.trades.filter(t => {
    if (tradeFilter === 'wins') return t.pnl > 0;
    if (tradeFilter === 'losses') return t.pnl <= 0;
    return true;
  }) || [];

  const totalFilteredTradeValue = filteredTrades.reduce((sum, t) => sum + (t.trade_value ?? (t.entry_price * t.qty)), 0);
  const totalFilteredTurnover = filteredTrades.reduce((sum, t) => sum + (t.turnover ?? ((t.entry_price + t.exit_price) * t.qty)), 0);

  const handleExportTradesCSV = () => {
    if (!result || !result.trades.length) return;
    const headers = ['Symbol', 'Entry Date', 'Exit Date', 'Entry Price', 'Exit Price', 'Qty', 'Traded Value (Rs)', 'Turnover (Rs)', 'P&L (Rs)', 'Return %', 'Holding Days', 'Exit Reason'];
    const rows = result.trades.map(t => [
      t.symbol,
      t.entry_date,
      t.exit_date,
      t.entry_price,
      t.exit_price,
      t.qty,
      (t.trade_value ?? (t.entry_price * t.qty)).toFixed(2),
      (t.turnover ?? ((t.entry_price + t.exit_price) * t.qty)).toFixed(2),
      t.pnl,
      t.return_pct,
      t.holding_days,
      `"${t.exit_reason}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `backtest_trades_${mode === 'single' ? selectedStock : selectedUniverse.replace(/\s+/g, '_')}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0d1117] overflow-y-auto p-4 gap-4">
      {/* Top Header & Strategy Config */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Code Editor Panel */}
        <div className="lg:col-span-8 bg-[#161b22] border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-white">AmiBroker AFL / Python Strategy Studio</span>
            </div>

            {/* Strategy Preset Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">Presets:</span>
              <select
                value={selectedPresetName}
                onChange={e => {
                  setSelectedPresetName(e.target.value);
                  setStrategyCode(presets[e.target.value]);
                }}
                className="bg-[#0d1117] border border-zinc-700 text-xs text-zinc-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-blue-500"
              >
                {Object.keys(presets).map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="relative">
            <textarea
              value={strategyCode}
              onChange={e => setStrategyCode(e.target.value)}
              rows={6}
              className="w-full bg-[#0d1117] border border-zinc-800 rounded-lg p-3 font-mono text-xs text-emerald-300 focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
              spellCheck={false}
            />
          </div>

          <div className="text-[11px] text-zinc-500 flex flex-wrap gap-2">
            <span>Built-ins:</span>
            <code className="text-zinc-400">Close, Open, High, Low, Volume, DeliveryPct</code>
            <code className="text-zinc-400">EMA(series, period), SMA(), RSI(), ATR(), SuperTrend_Trend()</code>
            <code className="text-zinc-400">Cross(A, B), CrossUnder(A, B)</code>
          </div>
        </div>

        {/* Execution & Risk Control Panel */}
        <div className="lg:col-span-4 bg-[#161b22] border border-zinc-800 rounded-xl p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
            <Sliders className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-white">Backtest Settings</span>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-[#0d1117] rounded-lg p-0.5 border border-zinc-800 text-xs">
            <button
              onClick={() => setMode('single')}
              className={`flex-1 py-1.5 rounded font-medium transition-all ${mode === 'single' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400'}`}
            >
              Single Stock
            </button>
            <button
              onClick={() => setMode('basket')}
              className={`flex-1 py-1.5 rounded font-medium transition-all ${mode === 'basket' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400'}`}
            >
              Basket / Portfolio
            </button>
          </div>

          {/* Target Symbol or Universe */}
          {mode === 'single' ? (
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Target Stock</label>
              <select
                value={selectedStock}
                onChange={e => setSelectedStock(e.target.value)}
                className="w-full bg-[#0d1117] border border-zinc-800 text-xs text-zinc-200 rounded-lg px-2.5 py-1.5"
              >
                {availableSymbols.map(sym => (
                  <option key={sym} value={sym}>{sym} (NSE)</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Target Universe Basket</label>
              <select
                value={selectedUniverse}
                onChange={e => setSelectedUniverse(e.target.value)}
                className="w-full bg-[#0d1117] border border-zinc-800 text-xs text-zinc-200 rounded-lg px-2.5 py-1.5"
              >
                <option value="Nifty 50">Nifty 50 (50 Large Cap Equities)</option>
                <option value="Nifty Bank">Nifty Bank (12 Banking Stocks)</option>
                <option value="Nifty IT">Nifty IT (10 IT Leaders)</option>
              </select>
            </div>
          )}

          {/* Backtest Horizon Selector */}
          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">Backtest Horizon / Period</label>
            <select
              value={lookbackPeriod}
              onChange={e => setLookbackPeriod(e.target.value)}
              className="w-full bg-[#0d1117] border border-zinc-800 text-xs text-zinc-200 rounded-lg px-2.5 py-1.5 font-medium"
            >
              <option value="5y">Last 5 Years (Full History: 2021–2026)</option>
              <option value="3y">Last 3 Years (2023–2026)</option>
              <option value="2y">Last 2 Years (2024–2026)</option>
              <option value="1y">Last 1 Year (2025–2026)</option>
            </select>
          </div>

          {/* Execution Timing Toggle */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
                <Clock className="w-3 h-3 text-emerald-400" /> Execution Timing
              </label>
              <span className="text-[10px] text-zinc-500 font-mono">
                {executionTiming === 'next_open' ? 'Zero Lookahead' : 'MOC (3:20 PM)'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#0d1117] border border-zinc-800 rounded-lg">
              <button
                type="button"
                onClick={() => setExecutionTiming('next_open')}
                className={`py-1.5 px-2 rounded text-[11px] font-semibold flex items-center justify-center gap-1 transition-all ${
                  executionTiming === 'next_open'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/70 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Fill at 9:15 AM Open next morning after EOD signal confirmed"
              >
                <span>🌅</span> Next Day Open
              </button>
              <button
                type="button"
                onClick={() => setExecutionTiming('same_close')}
                className={`py-1.5 px-2 rounded text-[11px] font-semibold flex items-center justify-center gap-1 transition-all ${
                  executionTiming === 'same_close'
                    ? 'bg-blue-950 text-blue-300 border border-blue-600/70 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Fill at 3:20 PM Market-On-Close order"
              >
                <span>🕒</span> Same Day Close
              </button>
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">
              {executionTiming === 'next_open' 
                ? 'Orders execute at 9:15 AM Open next day (realistic EOD routine)' 
                : 'Orders execute at 3:20 PM Close on confirming signal candle'}
            </div>
          </div>

          {/* Active Preset Ribbon */}
          {savedProfile && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-[11px]">
              <div className="flex items-center gap-1.5 text-emerald-300">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <div className="truncate">
                  <span className="font-semibold text-emerald-200">Preset Active: </span>
                  <span className="font-mono text-emerald-300">SL {savedProfile.stop_loss_pct ?? 'N/A'}% • TP {savedProfile.take_profit_pct ?? 'N/A'}% • Sharpe {savedProfile.sharpe_ratio}</span>
                </div>
              </div>
              <button 
                onClick={() => applyProfileToInputs(savedProfile)} 
                type="button"
                className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-200 bg-emerald-900/50 hover:bg-emerald-900 px-2 py-0.5 rounded border border-emerald-700/50 transition-colors ml-2 shrink-0"
                title="Populate input fields with these saved optimal parameters"
              >
                Apply
              </button>
            </div>
          )}

          {/* Capital & Stops Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-[10px] text-zinc-400">Capital (₹)</label>
              <input
                type="number"
                value={initialCapital}
                onChange={e => setInitialCapital(Number(e.target.value))}
                className="w-full bg-[#0d1117] border border-zinc-800 rounded px-2 py-1 text-zinc-200 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-400">Risk / Trade %</label>
              <input
                type="number"
                value={riskPerTrade}
                onChange={e => setRiskPerTrade(Number(e.target.value))}
                className="w-full bg-[#0d1117] border border-zinc-800 rounded px-2 py-1 text-zinc-200 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-400">Stop Loss %</label>
              <input
                type="text"
                value={stopLoss}
                onChange={e => setStopLoss(e.target.value)}
                className="w-full bg-[#0d1117] border border-zinc-800 rounded px-2 py-1 text-zinc-200 font-mono"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-400">Take Profit %</label>
              <input
                type="text"
                value={takeProfit}
                onChange={e => setTakeProfit(e.target.value)}
                className="w-full bg-[#0d1117] border border-zinc-800 rounded px-2 py-1 text-zinc-200 font-mono"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-400">Trailing Stop %</label>
              <input
                type="text"
                value={trailingStop}
                onChange={e => setTrailingStop(e.target.value)}
                className="w-full bg-[#0d1117] border border-zinc-800 rounded px-2 py-1 text-zinc-200 font-mono"
                placeholder="Blank = Disabled"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-400">Max Open Positions</label>
              <input
                type="number"
                value={maxPositions}
                onChange={e => setMaxPositions(Number(e.target.value))}
                className="w-full bg-[#0d1117] border border-zinc-800 rounded px-2 py-1 text-zinc-200 font-mono"
              />
            </div>
          </div>

          {/* Optimization & Preset Action Buttons */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setShowOptModal(true)}
              className="py-2 px-2 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white rounded-lg font-semibold text-[11px] flex items-center justify-center gap-1.5 shadow-md shadow-purple-950/50 transition-all border border-purple-500/30"
            >
              <Cpu className="w-3.5 h-3.5 text-purple-200" />
              <span>⚡ Optimize Basket</span>
            </button>
            <button
              type="button"
              onClick={handleSaveCurrentAsPreset}
              className="py-2 px-2 bg-[#0d1117] hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white rounded-lg font-semibold text-[11px] flex items-center justify-center gap-1.5 transition-all"
              title="Save current risk & capital parameters for this strategy and basket"
            >
              <Save className="w-3.5 h-3.5 text-blue-400" />
              <span>Save Preset</span>
            </button>
          </div>

          {/* Run Button */}
          <button
            onClick={handleRunBacktest}
            disabled={loading}
            className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30 transition-all disabled:opacity-50"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            {loading ? 'Simulating Strategy...' : 'Execute Vectorized Backtest'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Backtest Results Dashboard */}
      {result && (
        <div className="space-y-4">
          {/* Header with Execution Timing Badge */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1 border-b border-zinc-800/80">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white tracking-wide">Simulation Results</span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-mono border font-semibold flex items-center gap-1 ${
                result.execution_timing === 'next_open'
                  ? 'bg-emerald-950/80 border-emerald-600/70 text-emerald-300'
                  : 'bg-blue-950/80 border-blue-600/70 text-blue-300'
              }`}>
                {result.execution_timing === 'next_open' 
                  ? '🌅 Filled at Next Day Open (9:15 AM - Zero Lookahead)' 
                  : '🕒 Filled at Same Day Close (3:20 PM - MOC Order)'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-zinc-400 font-mono">
                ₹{result.metrics.initial_capital.toLocaleString()} Initial → ₹{result.metrics.final_equity.toLocaleString()} Equity
              </span>
              <button
                onClick={handleExportTradesCSV}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px] font-semibold flex items-center gap-1.5 transition-all border border-zinc-700 shadow-sm"
                title="Download full trades log in CSV"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" /> Export CSV
              </button>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-9 gap-3">
            <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-3">
              <span className="text-[10px] text-zinc-400 block uppercase">Net Profit</span>
              <span className={`text-base font-bold font-mono ${result.metrics.net_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ₹{result.metrics.net_profit.toLocaleString()}
              </span>
              <span className="text-[10px] text-zinc-500 block">
                {result.metrics.total_return_pct}% return
              </span>
            </div>

            <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-3">
              <span className="text-[10px] text-zinc-400 block uppercase">CAGR %</span>
              <span className="text-base font-bold font-mono text-zinc-200">
                {result.metrics.cagr_pct}%
              </span>
              <span className="text-[10px] text-zinc-500 block">Annualized</span>
            </div>

            <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-3">
              <span className="text-[10px] text-zinc-400 block uppercase">Sharpe Ratio</span>
              <span className="text-base font-bold font-mono text-zinc-200">
                {result.metrics.sharpe_ratio}
              </span>
              <span className="text-[10px] text-zinc-500 block">Rf 6.5%</span>
            </div>

            <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-3">
              <span className="text-[10px] text-zinc-400 block uppercase">Max Drawdown</span>
              <span className="text-base font-bold font-mono text-rose-400">
                -{result.metrics.max_drawdown_pct}%
              </span>
              <span className="text-[10px] text-zinc-500 block">Peak to trough</span>
            </div>

            <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-3">
              <span className="text-[10px] text-zinc-400 block uppercase">Win Rate</span>
              <span className="text-base font-bold font-mono text-emerald-400">
                {result.metrics.win_rate_pct}%
              </span>
              <span className="text-[10px] text-zinc-500 block">{result.metrics.winning_trades}W / {result.metrics.losing_trades}L</span>
            </div>

            <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-3">
              <span className="text-[10px] text-zinc-400 block uppercase">Total Trades</span>
              <span className="text-base font-bold font-mono text-zinc-200">
                {result.metrics.total_trades}
              </span>
              <span className="text-[10px] text-zinc-500 block">Completed</span>
            </div>

            <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-3">
              <span className="text-[10px] text-zinc-400 block uppercase">Total Traded</span>
              <span className="text-base font-bold font-mono text-blue-400">
                ₹{(result.metrics.total_traded_value ?? result.trades.reduce((s, t) => s + (t.trade_value ?? (t.entry_price * t.qty)), 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span className="text-[10px] text-zinc-500 block truncate" title={`Turnover: ₹${(result.metrics.total_turnover ?? result.trades.reduce((s, t) => s + (t.turnover ?? ((t.entry_price + t.exit_price) * t.qty)), 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}>
                Turnover: ₹{(result.metrics.total_turnover ?? result.trades.reduce((s, t) => s + (t.turnover ?? ((t.entry_price + t.exit_price) * t.qty)), 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>

            <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-3">
              <span className="text-[10px] text-zinc-400 block uppercase">Profit Factor</span>
              <span className="text-base font-bold font-mono text-zinc-200">
                {result.metrics.profit_factor}
              </span>
              <span className="text-[10px] text-zinc-500 block">Gross P/L ratio</span>
            </div>

            <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-3">
              <span className="text-[10px] text-zinc-400 block uppercase">Avg Holding</span>
              <span className="text-base font-bold font-mono text-zinc-200">
                {result.metrics.avg_holding_days} d
              </span>
              <span className="text-[10px] text-zinc-500 block">Per trade</span>
            </div>
          </div>

          {/* Equity Curve SVG Chart */}
          <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-blue-400" /> Cumulative Portfolio Equity Curve
              </span>
              <span className="text-xs font-mono text-zinc-400">
                End Equity: <strong className="text-emerald-400">₹{result.metrics.final_equity.toLocaleString()}</strong>
              </span>
            </div>

            {/* Simple Dynamic SVG Curve */}
            {result.equity_curve.length > 1 && (
              <div className="w-full h-48 bg-[#0d1117] rounded-lg p-2 relative overflow-hidden flex items-end">
                <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${result.equity_curve.length} 100`} preserveAspectRatio="none">
                  {(() => {
                    const minEq = Math.min(...result.equity_curve.map(e => e.equity));
                    const maxEq = Math.max(...result.equity_curve.map(e => e.equity));
                    const range = maxEq - minEq || 1;
                    const points = result.equity_curve.map((e, idx) => {
                      const x = idx;
                      const y = 95 - ((e.equity - minEq) / range) * 90;
                      return `${x},${y}`;
                    }).join(' ');

                    return (
                      <>
                        <polyline
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="1.8"
                          points={points}
                        />
                      </>
                    );
                  })()}
                </svg>
              </div>
            )}
          </div>

          {/* Trade Log Table */}
          <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-white uppercase tracking-wider">
                  Detailed Trade Execution Log ({filteredTrades.length} Trades • Total Traded Value: ₹{totalFilteredTradeValue.toLocaleString(undefined, { maximumFractionDigits: 0 })})
                </span>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-1 bg-[#0d1117] rounded-lg p-0.5 border border-zinc-800 text-xs">
                {(['all', 'wins', 'losses'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setTradeFilter(f)}
                    className={`px-2 py-0.5 rounded capitalize ${tradeFilter === f ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="text-[10px] text-zinc-500 uppercase bg-[#0d1117] border-b border-zinc-800">
                  <tr>
                    <th className="p-2.5">Symbol</th>
                    <th className="p-2.5">Entry Date</th>
                    <th className="p-2.5">Exit Date</th>
                    <th className="p-2.5">Entry (₹)</th>
                    <th className="p-2.5">Exit (₹)</th>
                    <th className="p-2.5">Qty</th>
                    <th className="p-2.5">Traded Value (₹)</th>
                    <th className="p-2.5">PnL (₹)</th>
                    <th className="p-2.5">Return %</th>
                    <th className="p-2.5">Hold Days</th>
                    <th className="p-2.5">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40 text-zinc-300">
                  {filteredTrades.map((t, idx) => (
                    <tr key={idx} className="hover:bg-zinc-800/30">
                      <td className="p-2.5 font-bold text-white">{t.symbol}</td>
                      <td className="p-2.5 text-zinc-400">{t.entry_date}</td>
                      <td className="p-2.5 text-zinc-400">{t.exit_date}</td>
                      <td className="p-2.5">₹{t.entry_price.toFixed(2)}</td>
                      <td className="p-2.5">₹{t.exit_price.toFixed(2)}</td>
                      <td className="p-2.5">{t.qty}</td>
                      <td className="p-2.5 font-mono text-zinc-200">
                        <div>₹{(t.trade_value ?? (t.entry_price * t.qty)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="text-[10px] text-zinc-500">Turnover: ₹{(t.turnover ?? ((t.entry_price + t.exit_price) * t.qty)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                      </td>
                      <td className={`p-2.5 font-semibold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {t.pnl >= 0 ? '+' : ''}₹{t.pnl.toFixed(2)}
                      </td>
                      <td className={`p-2.5 font-semibold ${t.return_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {t.return_pct >= 0 ? '+' : ''}{t.return_pct.toFixed(2)}%
                      </td>
                      <td className="p-2.5">{t.holding_days}d</td>
                      <td className="p-2.5 text-zinc-400 text-[11px]">{t.exit_reason}</td>
                    </tr>
                  ))}
                  {filteredTrades.length === 0 && (
                    <tr>
                      <td colSpan={11} className="p-6 text-center text-zinc-500 font-sans">
                        No completed trades recorded for this strategy configuration.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Optimization Modal */}
      {showOptModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-zinc-700/80 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-[#0d1117]/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-950/80 border border-purple-700/50 text-purple-400">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-white">Bayesian Parameter Optimizer</h2>
                    <span className="text-[10px] font-semibold bg-purple-900/60 text-purple-300 border border-purple-700/50 px-2 py-0.5 rounded-full font-mono">
                      Optuna TPE • State Checkpointed
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Finds optimal SL, TP, Trailing Stop, Risk % & Positions for <span className="text-purple-300 font-semibold">{selectedPresetName}</span> on <span className="text-emerald-400 font-semibold">{selectedUniverse}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOptModal(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* Target Setup Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#0d1117] p-2.5 rounded-xl border border-zinc-800/80 text-[11px]">
                <div>
                  <span className="text-zinc-500 block text-[10px]">Strategy</span>
                  <span className="text-white font-medium truncate block" title={selectedPresetName}>{selectedPresetName}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px]">Target Universe</span>
                  <span className="text-emerald-400 font-semibold">{selectedUniverse}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px]">Horizon</span>
                  <span className="text-zinc-300 font-mono">{lookbackPeriod.toUpperCase()}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px]">Execution Timing</span>
                  <span className="text-zinc-300">{executionTiming === 'next_open' ? 'Next Day Open' : 'Same Day Close'}</span>
                </div>
              </div>

              {/* Controls Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#0d1117]/60 p-3 rounded-xl border border-zinc-800">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1 font-medium">Optimization Target Metric</label>
                  <select
                    value={optMetric}
                    onChange={e => setOptMetric(e.target.value)}
                    disabled={optStatus?.status === 'running'}
                    className="w-full bg-[#161b22] border border-zinc-700 text-zinc-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-500 text-xs"
                  >
                    <option value="sharpe_ratio">Sharpe Ratio (Risk-Adjusted Return)</option>
                    <option value="cagr_pct">CAGR % (Annualized Growth Rate)</option>
                    <option value="calmar_ratio">Calmar Ratio (CAGR / Max Drawdown)</option>
                    <option value="profit_factor">Profit Factor (Gross Win / Gross Loss)</option>
                    <option value="total_return_pct">Total Return % (Net Capital Return)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1 font-medium">Total Exploration Trials</label>
                  <select
                    value={optTrials}
                    onChange={e => setOptTrials(Number(e.target.value))}
                    disabled={optStatus?.status === 'running'}
                    className="w-full bg-[#161b22] border border-zinc-700 text-zinc-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-500 text-xs"
                  >
                    <option value={50}>50 Trials (Fast Quick Scan ~3s)</option>
                    <option value={150}>150 Trials (Recommended Balance ~10s)</option>
                    <option value={300}>300 Trials (Deep Bayesian Exploration ~20s)</option>
                    <option value={500}>500 Trials (High Precision ~40s)</option>
                    <option value={1000}>1000 Trials (Exhaustive Institutional Sweep ~1.5m)</option>
                  </select>
                </div>
              </div>

              {/* Parameter Boundaries Grid */}
              <div className="bg-[#0d1117]/60 p-3 rounded-xl border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-zinc-300 block">Parameter Search Boundaries</span>
                  <span className="text-[10px] text-zinc-500">Fine-tune bounds before starting</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-[#161b22] border border-zinc-800">
                    <span className="text-zinc-400 text-[10px] block">Stop Loss % Range</span>
                    <div className="flex items-center gap-1 mt-1 font-mono text-zinc-200">
                      <input 
                        type="number" 
                        value={optRanges.sl_min} 
                        onChange={e => setOptRanges({...optRanges, sl_min: Number(e.target.value)})}
                        disabled={optStatus?.status === 'running'}
                        className="w-10 bg-[#0d1117] border border-zinc-700 rounded px-1 py-0.5 text-center text-xs" 
                      />
                      <span>-</span>
                      <input 
                        type="number" 
                        value={optRanges.sl_max} 
                        onChange={e => setOptRanges({...optRanges, sl_max: Number(e.target.value)})}
                        disabled={optStatus?.status === 'running'}
                        className="w-10 bg-[#0d1117] border border-zinc-700 rounded px-1 py-0.5 text-center text-xs" 
                      />
                      <span>%</span>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-[#161b22] border border-zinc-800">
                    <span className="text-zinc-400 text-[10px] block">Take Profit % Range</span>
                    <div className="flex items-center gap-1 mt-1 font-mono text-zinc-200">
                      <input 
                        type="number" 
                        value={optRanges.tp_min} 
                        onChange={e => setOptRanges({...optRanges, tp_min: Number(e.target.value)})}
                        disabled={optStatus?.status === 'running'}
                        className="w-10 bg-[#0d1117] border border-zinc-700 rounded px-1 py-0.5 text-center text-xs" 
                      />
                      <span>-</span>
                      <input 
                        type="number" 
                        value={optRanges.tp_max} 
                        onChange={e => setOptRanges({...optRanges, tp_max: Number(e.target.value)})}
                        disabled={optStatus?.status === 'running'}
                        className="w-10 bg-[#0d1117] border border-zinc-700 rounded px-1 py-0.5 text-center text-xs" 
                      />
                      <span>%</span>
                    </div>
                  </div>

                  {/* Trailing Stop Range & Mode Card */}
                  <div className="p-2 rounded-lg bg-[#161b22] border border-purple-900/40">
                    <div className="flex items-center justify-between">
                      <span className="text-purple-300 text-[10px] font-semibold block">Trailing Stop</span>
                      <select
                        value={optRanges.ts_mode}
                        onChange={e => setOptRanges({...optRanges, ts_mode: e.target.value as any})}
                        disabled={optStatus?.status === 'running'}
                        className="bg-[#0d1117] text-[10px] text-zinc-300 border border-zinc-800 rounded px-1 py-0.5"
                      >
                        <option value="auto">Auto (AI)</option>
                        <option value="always_on">Always On</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    </div>
                    {optRanges.ts_mode !== 'disabled' ? (
                      <div className="flex items-center gap-1 mt-1 font-mono text-zinc-200">
                        <input 
                          type="number" 
                          value={optRanges.ts_min} 
                          onChange={e => setOptRanges({...optRanges, ts_min: Number(e.target.value)})}
                          disabled={optStatus?.status === 'running'}
                          className="w-10 bg-[#0d1117] border border-zinc-700 rounded px-1 py-0.5 text-center text-xs" 
                        />
                        <span>-</span>
                        <input 
                          type="number" 
                          value={optRanges.ts_max} 
                          onChange={e => setOptRanges({...optRanges, ts_max: Number(e.target.value)})}
                          disabled={optStatus?.status === 'running'}
                          className="w-10 bg-[#0d1117] border border-zinc-700 rounded px-1 py-0.5 text-center text-xs" 
                        />
                        <span>%</span>
                      </div>
                    ) : (
                      <div className="text-[10px] text-zinc-500 mt-1 italic">
                        Trailing stop omitted
                      </div>
                    )}
                  </div>

                  <div className="p-2 rounded-lg bg-[#161b22] border border-zinc-800">
                    <span className="text-zinc-400 text-[10px] block">Risk / Trade % Range</span>
                    <div className="flex items-center gap-1 mt-1 font-mono text-zinc-200">
                      <input 
                        type="number" 
                        value={optRanges.risk_min} 
                        onChange={e => setOptRanges({...optRanges, risk_min: Number(e.target.value)})}
                        disabled={optStatus?.status === 'running'}
                        className="w-10 bg-[#0d1117] border border-zinc-700 rounded px-1 py-0.5 text-center text-xs" 
                      />
                      <span>-</span>
                      <input 
                        type="number" 
                        value={optRanges.risk_max} 
                        onChange={e => setOptRanges({...optRanges, risk_max: Number(e.target.value)})}
                        disabled={optStatus?.status === 'running'}
                        className="w-10 bg-[#0d1117] border border-zinc-700 rounded px-1 py-0.5 text-center text-xs" 
                      />
                      <span>%</span>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-[#161b22] border border-zinc-800">
                    <span className="text-zinc-400 text-[10px] block">Max Positions</span>
                    <div className="flex items-center gap-1 mt-1 font-mono text-zinc-200">
                      <input 
                        type="number" 
                        value={optRanges.pos_min} 
                        onChange={e => setOptRanges({...optRanges, pos_min: Number(e.target.value)})}
                        disabled={optStatus?.status === 'running'}
                        className="w-10 bg-[#0d1117] border border-zinc-700 rounded px-1 py-0.5 text-center text-xs" 
                      />
                      <span>-</span>
                      <input 
                        type="number" 
                        value={optRanges.pos_max} 
                        onChange={e => setOptRanges({...optRanges, pos_max: Number(e.target.value)})}
                        disabled={optStatus?.status === 'running'}
                        className="w-10 bg-[#0d1117] border border-zinc-700 rounded px-1 py-0.5 text-center text-xs" 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress & Live Status Box */}
              <div className="p-3 rounded-xl bg-[#0d1117] border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-zinc-300">Optimization Status:</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      optStatus?.status === 'running' ? 'bg-emerald-950 text-emerald-300 border border-emerald-600 animate-pulse' :
                      optStatus?.status === 'paused' ? 'bg-amber-950 text-amber-300 border border-amber-600' :
                      optStatus?.status === 'completed' ? 'bg-blue-950 text-blue-300 border border-blue-600' :
                      optStatus?.status === 'error' ? 'bg-rose-950 text-rose-300 border border-rose-600' :
                      'bg-zinc-800 text-zinc-400'
                    }`}>
                      {optStatus?.status || 'IDLE'}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    Trial {optStatus?.completed_trials || 0} / {optTrials} ({optStatus?.progress_pct || 0}%)
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-zinc-800/80 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, optStatus?.progress_pct || 0)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] text-zinc-500">
                  <span>SQLite Checkpoint: <code className="text-zinc-400">optuna_studies.db</code></span>
                  <span>{optStatus?.status === 'running' ? 'Saving trials on-the-fly' : optStatus?.status === 'paused' ? 'Safely paused • Ready to resume' : 'Zero compute lost'}</span>
                </div>
              </div>

              {/* Best Result Highlight Card */}
              {optStatus && optStatus.best_value !== null && optStatus.best_value !== undefined ? (
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-purple-950/40 via-zinc-900 to-[#161b22] border border-purple-600/40 shadow-lg space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
                    <div className="flex items-center gap-1.5 text-purple-300 font-semibold text-xs">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span>Current Best Discovery</span>
                      <span className="text-[10px] text-zinc-400 font-normal">({optStatus.target_metric})</span>
                    </div>
                    <span className="text-base font-extrabold font-mono text-emerald-400">
                      {optStatus.best_value > 0 ? '+' : ''}{optStatus.best_value.toFixed(2)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                    <div className="p-2 rounded-lg bg-[#0d1117] border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 block">Stop Loss</span>
                      <span className="text-xs font-bold text-white font-mono">{optStatus.best_params.stop_loss_pct}%</span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#0d1117] border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 block">Take Profit</span>
                      <span className="text-xs font-bold text-emerald-400 font-mono">{optStatus.best_params.take_profit_pct}%</span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#0d1117] border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 block">Trailing Stop</span>
                      <span className="text-xs font-bold text-indigo-300 font-mono">
                        {optStatus.best_params.enable_trailing_stop ? `${optStatus.best_params.trailing_stop_pct}%` : 'Disabled'}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#0d1117] border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 block">Risk / Trade</span>
                      <span className="text-xs font-bold text-white font-mono">{optStatus.best_params.risk_per_trade_pct}%</span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#0d1117] border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 block">Max Positions</span>
                      <span className="text-xs font-bold text-white font-mono">{optStatus.best_params.max_positions}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-[11px] bg-[#0d1117]/50 p-2 rounded-lg border border-zinc-800/50">
                    <div>
                      <span className="text-zinc-500 text-[10px] block">Win Rate</span>
                      <span className="font-semibold text-emerald-400 font-mono">{optStatus.best_metrics.win_rate ?? 0}%</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] block">Max Drawdown</span>
                      <span className="font-semibold text-rose-400 font-mono">{optStatus.best_metrics.max_drawdown_pct ?? 0}%</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] block">CAGR %</span>
                      <span className="font-semibold text-zinc-200 font-mono">{optStatus.best_metrics.cagr_pct ?? 0}%</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] block">Total Trades</span>
                      <span className="font-semibold text-zinc-300 font-mono">{optStatus.best_metrics.total_trades ?? 0}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#0d1117] border border-dashed border-zinc-800 text-center text-zinc-500">
                  <Cpu className="w-6 h-6 mx-auto mb-2 text-zinc-600" />
                  <p className="text-[11px]">No active trials in this session. Click &quot;Start Bayesian Optimization&quot; to begin exploration.</p>
                  <p className="text-[10px] text-zinc-600 mt-1">Evaluates multi-year basket simulations using Tree-structured Parzen Estimator (TPE).</p>
                </div>
              )}

              {/* Recent Trials Table */}
              {optStatus && optStatus.recent_trials && optStatus.recent_trials.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-zinc-400 block">Recent Trial Explored Samples:</span>
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-zinc-800 bg-[#0d1117]">
                    <table className="w-full text-left text-[10px]">
                      <thead className="bg-[#161b22] text-zinc-400 sticky top-0">
                        <tr>
                          <th className="p-1.5">#</th>
                          <th className="p-1.5">Metric ({optMetric})</th>
                          <th className="p-1.5">SL %</th>
                          <th className="p-1.5">TP %</th>
                          <th className="p-1.5">Trail %</th>
                          <th className="p-1.5">Risk %</th>
                          <th className="p-1.5">Win Rate</th>
                          <th className="p-1.5">Max DD</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/40 text-zinc-300 font-mono">
                        {optStatus.recent_trials.slice(-8).reverse().map((t, idx) => (
                          <tr key={idx} className="hover:bg-zinc-800/30">
                            <td className="p-1.5 text-zinc-500">{t.trial_number}</td>
                            <td className="p-1.5 font-bold text-emerald-400">{t.value}</td>
                            <td className="p-1.5">{t.params.stop_loss_pct}%</td>
                            <td className="p-1.5">{t.params.take_profit_pct}%</td>
                            <td className="p-1.5">{t.params.enable_trailing_stop ? `${t.params.trailing_stop_pct}%` : '-'}</td>
                            <td className="p-1.5">{t.params.risk_per_trade_pct}%</td>
                            <td className="p-1.5">{t.metrics.win_rate ?? 0}%</td>
                            <td className="p-1.5 text-rose-400">{t.metrics.max_drawdown_pct ?? 0}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-3.5 border-t border-zinc-800 bg-[#0d1117] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleResetOpt}
                disabled={optStatus?.status === 'running'}
                className="py-1.5 px-3 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-950/30 border border-zinc-800 text-[11px] transition-colors disabled:opacity-40"
              >
                Reset Study
              </button>

              <div className="flex items-center gap-2">
                {optStatus?.status === 'running' ? (
                  <button
                    type="button"
                    onClick={handlePauseOpt}
                    className="py-2 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-amber-950 transition-all"
                  >
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    <span>Pause & Save Checkpoint</span>
                  </button>
                ) : optStatus?.status === 'paused' ? (
                  <>
                    <button
                      type="button"
                      onClick={handleResumeOpt}
                      className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950 transition-all"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Resume Optimization</span>
                    </button>
                    {optStatus.best_value !== null && (
                      <button
                        type="button"
                        onClick={handleApplyOpt}
                        className="py-2 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-purple-950 transition-all"
                      >
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span>Apply & Save to Basket</span>
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleStartOpt}
                      disabled={optLoading}
                      className="py-2 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-purple-950 transition-all disabled:opacity-50"
                    >
                      {optLoading ? (
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                      <span>{optStatus?.completed_trials ? 'Run More Trials' : 'Start Optimization'}</span>
                    </button>

                    {optStatus?.best_value !== null && optStatus?.best_value !== undefined && (
                      <button
                        type="button"
                        onClick={handleApplyOpt}
                        className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950 transition-all"
                      >
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span>Apply & Save to Basket</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
