'use client';

import React, { useState } from 'react';
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
  Clock
} from 'lucide-react';
import { BacktestResponse } from '../types';

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
                onChange={e => setStrategyCode(presets[e.target.value])}
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
    </div>
  );
}
