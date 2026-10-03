'use client';

import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Edit3,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  RefreshCw,
  Search,
  Filter,
  Layers,
  ExternalLink,
  ShieldAlert,
  Activity,
  FileText,
  DollarSign,
  Check,
  ChevronRight,
  Calendar,
  Zap,
  Tag
} from 'lucide-react';
import { 
  PortfolioPosition, 
  PortfolioScanResponse, 
  PortfolioSummaryResponse, 
  StrategySummaryItem 
} from '../types';

interface PortfolioStudioProps {
  onSelectSymbol: (symbol: string) => void;
  availableSymbols: string[];
}

export default function PortfolioStudio({ onSelectSymbol, availableSymbols }: PortfolioStudioProps) {
  // Core Portfolio & Scan Data States
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [closedPositions, setClosedPositions] = useState<PortfolioPosition[]>([]);
  const [summary, setSummary] = useState<PortfolioSummaryResponse | null>(null);
  const [scanResults, setScanResults] = useState<PortfolioScanResponse | null>(null);
  const [availableStrategies, setAvailableStrategies] = useState<string[]>([]);
  
  // Filtering & Sub-Tabs
  const [selectedStrategyFilter, setSelectedStrategyFilter] = useState<string>('ALL');
  const [activeSubTab, setActiveSubTab] = useState<'eod_scan' | 'open_positions' | 'closed_trades'>('eod_scan');
  const [directiveFilter, setDirectiveFilter] = useState<'ALL' | 'SELL' | 'HOLD'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Loading & Action States
  const [loadingData, setLoadingData] = useState(false);
  const [loadingScan, setLoadingScan] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Modal Dialog States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPos, setSelectedPos] = useState<PortfolioPosition | null>(null);

  // Add Position Form State
  const [formSymbol, setFormSymbol] = useState('RELIANCE');
  const [formStrategy, setFormStrategy] = useState('SuperTrend + 100 SMA Trend Rider (Optimal)');
  const [formCustomStrategy, setFormCustomStrategy] = useState('');
  const [formBuyDate, setFormBuyDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formBuyPrice, setFormBuyPrice] = useState<number>(2500);
  const [formQty, setFormQty] = useState<number>(10);
  const [formStopLossPct, setFormStopLossPct] = useState<number | string>(5.0);
  const [formTakeProfitPct, setFormTakeProfitPct] = useState<number | string>(15.0);
  const [formTrailingStopPct, setFormTrailingStopPct] = useState<number | string>('');
  const [formNotes, setFormNotes] = useState('');

  // Close Position Form State
  const [closeExitDate, setCloseExitDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [closeExitPrice, setCloseExitPrice] = useState<number>(0);
  const [closeExitReason, setCloseExitReason] = useState('Strategy Sell Signal');

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Fetch Strategies list
  const fetchStrategies = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/portfolio/strategies');
      if (res.ok) {
        const data = await res.json();
        setAvailableStrategies(data.all_strategies || []);
        if (data.all_strategies && data.all_strategies.length > 0 && !formStrategy) {
          setFormStrategy(data.all_strategies[0]);
        }
      }
    } catch (e) {
      console.error('Error fetching strategies:', e);
    }
  };

  // Fetch Portfolio Positions & Summary
  const fetchPortfolioData = async (stratFilter?: string) => {
    setLoadingData(true);
    try {
      const activeFilter = stratFilter !== undefined ? stratFilter : selectedStrategyFilter;
      const filterParam = activeFilter !== 'ALL' ? `&strategy_name=${encodeURIComponent(activeFilter)}` : '';
      
      const [openRes, closedRes, summaryRes] = await Promise.all([
        fetch(`http://localhost:8000/api/portfolio?status=OPEN${filterParam}`),
        fetch(`http://localhost:8000/api/portfolio?status=CLOSED${filterParam}`),
        fetch('http://localhost:8000/api/portfolio/summary')
      ]);

      if (openRes.ok) {
        const data = await openRes.json();
        setPositions(data.positions || []);
      }
      if (closedRes.ok) {
        const data = await closedRes.json();
        setClosedPositions(data.positions || []);
      }
      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary(data);
      }
    } catch (e) {
      console.error('Error loading portfolio data:', e);
      showToast('Failed to load portfolio data', 'error');
    } finally {
      setLoadingData(false);
    }
  };

  // Execute EoD Exit Scan
  const runEodScan = async (stratFilter?: string) => {
    setLoadingScan(true);
    try {
      const activeFilter = stratFilter !== undefined ? stratFilter : selectedStrategyFilter;
      const payload = activeFilter !== 'ALL' ? { strategy_name: activeFilter } : {};
      
      const res = await fetch('http://localhost:8000/api/portfolio/eod-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data: PortfolioScanResponse = await res.json();
        setScanResults(data);
        showToast(
          `EoD Scan Complete: ${data.sell_tomorrow_count} Sell Alert(s) for tomorrow`,
          data.sell_tomorrow_count > 0 ? 'error' : 'success'
        );
      } else {
        showToast('EoD Scan failed to execute', 'error');
      }
    } catch (e) {
      console.error('Error executing EoD scan:', e);
      showToast('Error during EoD exit scanning', 'error');
    } finally {
      setLoadingScan(false);
    }
  };

  // Initial Load
  useEffect(() => {
    fetchStrategies();
    fetchPortfolioData();
    runEodScan();
  }, []);

  // Handle Strategy Filter Change
  const handleStrategyFilterChange = (strat: string) => {
    setSelectedStrategyFilter(strat);
    fetchPortfolioData(strat);
    runEodScan(strat);
  };

  // Auto-fetch current price when symbol changes in Add Modal
  const handleSymbolChangeInAddModal = async (sym: string) => {
    const cleanSym = sym.toUpperCase().trim();
    setFormSymbol(cleanSym);
    try {
      const res = await fetch(`http://localhost:8000/api/chart/${cleanSym}?period=1mo`);
      if (res.ok) {
        const data = await res.json();
        if (data.latest && data.latest.close) {
          setFormBuyPrice(Number(data.latest.close.toFixed(2)));
        }
      }
    } catch (e) {
      // Ignore background fetch error in modal
    }
  };

  // Open Add Trade Modal
  const openAddModal = (presetSymbol?: string) => {
    const initialSym = presetSymbol || (availableSymbols.length > 0 ? availableSymbols[0] : 'RELIANCE');
    handleSymbolChangeInAddModal(initialSym);
    setFormBuyDate(new Date().toISOString().split('T')[0]);
    setFormQty(10);
    setFormStopLossPct(5.0);
    setFormTakeProfitPct(15.0);
    setFormTrailingStopPct('');
    setFormNotes('');
    setIsAddModalOpen(true);
  };

  // Submit New Trade
  const handleCreatePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSymbol || !formBuyPrice || !formQty) {
      showToast('Please specify valid Symbol, Buy Price, and Quantity', 'error');
      return;
    }

    const finalStrategy = formStrategy === 'CUSTOM' ? formCustomStrategy : formStrategy;
    if (!finalStrategy) {
      showToast('Please specify a strategy', 'error');
      return;
    }

    try {
      const res = await fetch('http://localhost:8000/api/portfolio/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: formSymbol.toUpperCase().trim(),
          strategy_name: finalStrategy,
          buy_date: formBuyDate,
          buy_price: Number(formBuyPrice),
          qty: Number(formQty),
          stop_loss_pct: formStopLossPct !== '' ? Number(formStopLossPct) : null,
          take_profit_pct: formTakeProfitPct !== '' ? Number(formTakeProfitPct) : null,
          trailing_stop_pct: formTrailingStopPct !== '' ? Number(formTrailingStopPct) : null,
          notes: formNotes || null
        })
      });

      if (res.ok) {
        showToast(`Trade added: ${formSymbol} under ${finalStrategy}`, 'success');
        setIsAddModalOpen(false);
        await fetchPortfolioData();
        runEodScan();
      } else {
        const err = await res.json();
        showToast(`Failed: ${err.detail || 'Could not add position'}`, 'error');
      }
    } catch (e) {
      showToast('Error saving trade to portfolio', 'error');
    }
  };

  // Open Close/Sell Modal
  const openCloseModal = (pos: PortfolioPosition) => {
    setSelectedPos(pos);
    setCloseExitDate(new Date().toISOString().split('T')[0]);
    setCloseExitPrice(pos.current_price ? Number(pos.current_price.toFixed(2)) : pos.buy_price);
    
    // Auto-prefill exit reason based on EoD trigger
    let reason = 'Strategy Sell Signal';
    if (pos.verdict_badge === 'SELL_STOP_LOSS') reason = 'Stop Loss Hit';
    else if (pos.verdict_badge === 'SELL_TAKE_PROFIT') reason = 'Take Profit Target Reached';
    else if (pos.verdict_badge === 'SELL_TRAILING_STOP') reason = 'Trailing Stop Triggered';
    else if (pos.trigger_reason) reason = pos.trigger_reason;
    setCloseExitReason(reason);

    setIsCloseModalOpen(true);
  };

  // Submit Close Position
  const handleClosePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPos) return;

    try {
      const res = await fetch(`http://localhost:8000/api/portfolio/positions/${selectedPos.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exit_date: closeExitDate,
          exit_price: Number(closeExitPrice),
          exit_reason: closeExitReason
        })
      });

      if (res.ok) {
        showToast(`Closed ${selectedPos.symbol} trade at ₹${closeExitPrice}`, 'success');
        setIsCloseModalOpen(false);
        setSelectedPos(null);
        await fetchPortfolioData();
        runEodScan();
      } else {
        showToast('Failed to record trade exit', 'error');
      }
    } catch (e) {
      showToast('Error closing position', 'error');
    }
  };

  // Delete Position
  const handleDeletePosition = async (posId: string, sym: string) => {
    if (!confirm(`Are you sure you want to remove ${sym} from your portfolio?`)) return;
    try {
      const res = await fetch(`http://localhost:8000/api/portfolio/positions/${posId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast(`Removed ${sym} position`, 'info');
        await fetchPortfolioData();
        runEodScan();
      }
    } catch (e) {
      showToast('Error deleting position', 'error');
    }
  };

  // Filter positions based on active filters
  const displayPositions = (scanResults?.positions || positions).filter(p => {
    if (searchQuery && !p.symbol.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (directiveFilter === 'SELL' && p.action !== 'SELL') return false;
    if (directiveFilter === 'HOLD' && p.action !== 'HOLD') return false;
    return true;
  });

  const displayClosedPositions = closedPositions.filter(p => {
    if (searchQuery && !p.symbol.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  // Calculate distinct strategies that currently have holdings for filter pills
  const activeHoldingStrategies = scanResults?.per_strategy_summary || [];

  return (
    <div className="flex-1 flex flex-col bg-[#090d13] text-zinc-100 overflow-hidden font-sans select-none relative">
      {/* Toast Alert */}
      {toastMsg && (
        <div className={`absolute top-4 right-6 z-50 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold border animate-fade-in ${
          toastMsg.type === 'error'
            ? 'bg-rose-950/95 border-rose-700 text-rose-200'
            : toastMsg.type === 'success'
            ? 'bg-emerald-950/95 border-emerald-700 text-emerald-200'
            : 'bg-[#161b22] border-blue-700 text-blue-200'
        }`}>
          {toastMsg.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}
          {toastMsg.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          {toastMsg.type === 'info' && <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Top Portfolio Summary & Urgent Directives Bar */}
      <div className="bg-[#161b22] border-b border-zinc-800 p-4 shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Header Title & Tagline */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 via-indigo-600 to-blue-500 flex items-center justify-center shadow-lg shadow-blue-900/30">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-wide">
                  Strategy Portfolio & EoD Directives
                </h1>
                <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-800 px-2 py-0.5 rounded-full font-mono">
                  Real-World Execution
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Live position tracking with automated End-of-Day scanning for next-day sell directives
              </p>
            </div>
          </div>

          {/* Action Buttons: Run EoD Scan & Add Trade */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => runEodScan()}
              disabled={loadingScan}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-xs px-3.5 py-2 rounded-lg shadow-md transition-all cursor-pointer disabled:opacity-50 active:scale-95"
            >
              <Zap className={`w-3.5 h-3.5 ${loadingScan ? 'animate-spin text-amber-300' : 'text-amber-400 fill-amber-400'}`} />
              <span>{loadingScan ? 'Scanning Open Positions...' : 'Run EoD Exit Scan'}</span>
            </button>

            <button
              onClick={() => openAddModal()}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-3.5 py-2 rounded-lg shadow-md transition-all cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Add Real-World Trade</span>
            </button>
          </div>
        </div>

        {/* High-Level Financial Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-3.5">
          {/* Card 1: Total Portfolio Value */}
          <div className="bg-[#0d1117] border border-zinc-800/80 rounded-xl p-3 flex flex-col justify-between">
            <span className="text-[11px] font-medium text-zinc-400">Current Value</span>
            <div className="text-base font-bold text-white font-mono mt-1">
              ₹{(summary?.total_current_value || scanResults?.total_current_value || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })}
            </div>
            <span className="text-[10px] text-zinc-500 mt-0.5">
              Invested: ₹{(summary?.total_invested || scanResults?.total_invested || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })}
            </span>
          </div>

          {/* Card 2: Unrealized P&L */}
          {(() => {
            const pnl = summary?.total_unrealized_pnl ?? scanResults?.total_unrealized_pnl ?? 0;
            const pnlPct = summary?.total_unrealized_pnl_pct ?? scanResults?.total_unrealized_pnl_pct ?? 0;
            const isProfit = pnl >= 0;
            return (
              <div className="bg-[#0d1117] border border-zinc-800/80 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-[11px] font-medium text-zinc-400">Unrealized P&L</span>
                <div className={`text-base font-bold font-mono mt-1 flex items-center gap-1 ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isProfit ? <ArrowUpRight className="w-4 h-4 shrink-0" /> : <ArrowDownRight className="w-4 h-4 shrink-0" />}
                  <span>{isProfit ? '+' : ''}₹{pnl.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</span>
                </div>
                <span className={`text-[10px] font-mono font-medium ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isProfit ? '+' : ''}{pnlPct}% return
                </span>
              </div>
            );
          })()}

          {/* Card 3: Realized P&L */}
          {(() => {
            const rPnl = summary?.total_realized_pnl ?? 0;
            const isProfit = rPnl >= 0;
            return (
              <div className="bg-[#0d1117] border border-zinc-800/80 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-[11px] font-medium text-zinc-400">Realized P&L</span>
                <div className={`text-base font-bold font-mono mt-1 ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isProfit ? '+' : ''}₹{rPnl.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                </div>
                <span className="text-[10px] text-zinc-500 mt-0.5">
                  {summary?.closed_positions_count || closedPositions.length} closed trades
                </span>
              </div>
            );
          })()}

          {/* Card 4: Open Positions */}
          <div className="bg-[#0d1117] border border-zinc-800/80 rounded-xl p-3 flex flex-col justify-between">
            <span className="text-[11px] font-medium text-zinc-400">Open Holdings</span>
            <div className="text-base font-bold text-white font-mono mt-1">
              {summary?.open_positions_count || positions.length}
            </div>
            <span className="text-[10px] text-zinc-500 mt-0.5">
              Across {summary?.strategies_count || activeHoldingStrategies.length || 0} active strategies
            </span>
          </div>

          {/* Card 5: Next-Day Directives */}
          {(() => {
            const sellCount = scanResults?.sell_tomorrow_count ?? summary?.sell_tomorrow_alerts_count ?? 0;
            const hasSell = sellCount > 0;
            return (
              <div className={`border rounded-xl p-3 flex flex-col justify-between transition-all ${
                hasSell 
                  ? 'bg-rose-950/40 border-rose-700/80 shadow-md shadow-rose-950/30' 
                  : 'bg-[#0d1117] border-zinc-800/80'
              }`}>
                <span className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
                  Next-Day Action
                  {hasSell && <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />}
                </span>
                <div className={`text-base font-bold font-mono mt-1 ${hasSell ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`}>
                  {hasSell ? `🚨 ${sellCount} to SELL` : '🟢 All Safe to Hold'}
                </div>
                <span className="text-[10px] text-zinc-400 mt-0.5">
                  Session: {scanResults?.latest_market_session || summary?.latest_market_session || 'Latest EOD'}
                </span>
              </div>
            );
          })()}

          {/* Card 6: Scanner Status */}
          <div className="bg-[#0d1117] border border-zinc-800/80 rounded-xl p-3 flex flex-col justify-between">
            <span className="text-[11px] font-medium text-zinc-400">EoD Scan Status</span>
            <div className="text-xs font-semibold text-zinc-200 mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
              <span>Up to Date</span>
            </div>
            <span className="text-[10px] text-zinc-500 mt-0.5 truncate font-mono" title={scanResults?.scan_timestamp}>
              {scanResults?.scan_timestamp ? scanResults.scan_timestamp.split(' ')[1] : 'Just now'}
            </span>
          </div>
        </div>
      </div>

      {/* Urgent Action Banner if Any Stock Must be Sold Tomorrow */}
      {(scanResults?.sell_tomorrow_count || 0) > 0 && (
        <div className="bg-gradient-to-r from-rose-950/80 via-red-900/60 to-rose-950/80 border-b border-rose-600/80 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-rose-200 font-medium shrink-0 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-3.5 h-3.5 text-white" />
            </div>
            <span>
              <strong className="text-white font-semibold">ACTION REQUIRED FOR NEXT SESSION (09:15 AM OPEN):</strong>{' '}
              {scanResults?.sell_tomorrow_count} stock(s) triggered EXIT conditions based on their purchase strategies. Review and execute sell orders at market open.
            </span>
          </div>
          <button
            onClick={() => {
              setActiveSubTab('eod_scan');
              setDirectiveFilter('SELL');
            }}
            className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[11px] px-3 py-1 rounded-lg shrink-0 transition-all cursor-pointer"
          >
            View Sell Directives →
          </button>
        </div>
      )}

      {/* Strategy Pills & Filtering Bar */}
      <div className="bg-[#12161f] border-b border-zinc-800 px-4 py-2 flex items-center justify-between gap-3 shrink-0 overflow-x-auto">
        <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-thin">
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Filter by Strategy:
          </span>

          {/* All Strategies Pill */}
          <button
            onClick={() => handleStrategyFilterChange('ALL')}
            className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all shrink-0 flex items-center gap-1.5 ${
              selectedStrategyFilter === 'ALL'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-[#161b22] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800'
            }`}
          >
            <span>All Strategies</span>
            <span className="bg-black/30 px-1.5 py-0.2 rounded-full text-[10px] font-mono">
              {positions.length}
            </span>
          </button>

          {/* Dynamic Active Strategy Pills */}
          {activeHoldingStrategies.map((s) => (
            <button
              key={s.strategy_name}
              onClick={() => handleStrategyFilterChange(s.strategy_name)}
              className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all shrink-0 flex items-center gap-1.5 ${
                selectedStrategyFilter === s.strategy_name
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-[#161b22] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800'
              }`}
            >
              <span className="max-w-[160px] truncate">{s.strategy_name}</span>
              <span className="bg-black/30 px-1.5 py-0.2 rounded-full text-[10px] font-mono">
                {s.positions_count}
              </span>
              {s.sell_tomorrow_count > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title={`${s.sell_tomorrow_count} to sell tomorrow`} />
              )}
            </button>
          ))}
        </div>

        {/* Quick Search */}
        <div className="relative shrink-0 w-44 sm:w-56">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search symbol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0d1117] border border-zinc-800 rounded-lg pl-8 pr-2.5 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-600 font-mono"
          />
        </div>
      </div>

      {/* Sub-Navigation Tabs & Directive Filter Bar */}
      <div className="bg-[#0d1117] border-b border-zinc-800 px-4 py-2 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2 text-xs font-medium">
          <button
            onClick={() => setActiveSubTab('eod_scan')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-2 cursor-pointer transition-all ${
              activeSubTab === 'eod_scan'
                ? 'bg-blue-600 text-white shadow'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>EoD Next-Day Directives</span>
            {scanResults && scanResults.sell_tomorrow_count > 0 && (
              <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                {scanResults.sell_tomorrow_count}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('open_positions')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-2 cursor-pointer transition-all ${
              activeSubTab === 'open_positions'
                ? 'bg-blue-600 text-white shadow'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Open Positions</span>
            <span className="text-[10px] text-zinc-400 font-mono">({positions.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('closed_trades')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-2 cursor-pointer transition-all ${
              activeSubTab === 'closed_trades'
                ? 'bg-blue-600 text-white shadow'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Trade Journal & History</span>
            <span className="text-[10px] text-zinc-400 font-mono">({closedPositions.length})</span>
          </button>
        </div>

        {/* Filter by Directive (SELL vs HOLD) when on EoD scan tab */}
        {activeSubTab === 'eod_scan' && (
          <div className="flex items-center gap-1.5 bg-[#161b22] border border-zinc-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setDirectiveFilter('ALL')}
              className={`px-2.5 py-1 rounded-md cursor-pointer transition-all font-medium ${
                directiveFilter === 'ALL' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All Directives
            </button>
            <button
              onClick={() => setDirectiveFilter('SELL')}
              className={`px-2.5 py-1 rounded-md cursor-pointer transition-all font-medium flex items-center gap-1 ${
                directiveFilter === 'SELL' ? 'bg-rose-900/80 text-rose-200 border border-rose-700' : 'text-rose-400 hover:text-rose-300'
              }`}
            >
              <AlertTriangle className="w-3 h-3" /> Sell Orders Only
            </button>
            <button
              onClick={() => setDirectiveFilter('HOLD')}
              className={`px-2.5 py-1 rounded-md cursor-pointer transition-all font-medium flex items-center gap-1 ${
                directiveFilter === 'HOLD' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'text-emerald-400 hover:text-emerald-300'
              }`}
            >
              <Check className="w-3 h-3" /> Hold Orders Only
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        {/* SUBTAB 1: EOD NEXT-DAY DIRECTIVES */}
        {activeSubTab === 'eod_scan' && (
          <div className="flex flex-col gap-4">
            {displayPositions.length === 0 ? (
              <div className="bg-[#161b22] border border-zinc-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center max-w-lg mx-auto mt-8">
                <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 flex items-center justify-center text-zinc-400 mb-4">
                  <Briefcase className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-white mb-1">No Open Portfolio Positions Found</h3>
                <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
                  Add the stocks you have bought in the real world along with their respective strategy. The End-of-Day scanner will automatically evaluate each position every evening and tell you whether to sell or hold next day.
                </p>
                <button
                  onClick={() => openAddModal()}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs px-4 py-2.5 rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Add Your First Real-World Trade
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5">
                {displayPositions.map((pos) => {
                  const isSell = pos.action === 'SELL';
                  const isProfit = (pos.unrealized_pnl ?? 0) >= 0;
                  
                  return (
                    <div
                      key={pos.id}
                      className={`border rounded-xl p-4 transition-all ${
                        isSell
                          ? 'bg-[#181116] border-rose-700/80 shadow-lg shadow-rose-950/20'
                          : 'bg-[#12161f] border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        {/* Left: Stock Symbol, Strategy Badge & Directive Badge */}
                        <div className="flex items-start sm:items-center gap-3.5">
                          <button
                            onClick={() => onSelectSymbol(pos.symbol)}
                            className="text-left group cursor-pointer"
                            title="Open in Chart Studio"
                          >
                            <div className="text-lg font-black text-white font-mono group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
                              {pos.symbol}
                              <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-blue-400" />
                            </div>
                            <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                              <Tag className="w-3 h-3 text-blue-400" />
                              <span className="font-medium text-zinc-300">{pos.strategy_name}</span>
                            </div>
                          </button>

                          {/* Recommendation Directive Badge */}
                          <div className="ml-1">
                            {isSell ? (
                              <div className="flex items-center gap-1.5 bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide shadow-md shadow-rose-900/40 animate-pulse">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                <span>{pos.recommendation || '🚨 SELL TOMORROW AT OPEN'}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 bg-emerald-950/90 text-emerald-300 border border-emerald-700 px-3 py-1.5 rounded-lg text-xs font-semibold">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                <span>{pos.recommendation || '🟢 HOLD POSITION'}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Middle: Prices, P&L, Targets */}
                        <div className="flex flex-wrap items-center gap-5 text-xs">
                          {/* Buy Price */}
                          <div className="flex flex-col">
                            <span className="text-[10px] text-zinc-500 uppercase font-mono">Buy Price</span>
                            <span className="font-mono text-zinc-300 font-medium">₹{pos.buy_price.toFixed(2)}</span>
                            <span className="text-[10px] text-zinc-500 font-mono">{pos.qty} shares</span>
                          </div>

                          {/* Current Price */}
                          <div className="flex flex-col">
                            <span className="text-[10px] text-zinc-500 uppercase font-mono">Current EOD</span>
                            <span className="font-mono text-white font-bold text-sm">
                              ₹{(pos.current_price || pos.buy_price).toFixed(2)}
                            </span>
                            <span className={`text-[10px] font-mono ${
                              (pos.day_change_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                              {(pos.day_change_pct ?? 0) >= 0 ? '+' : ''}{pos.day_change_pct ?? 0}% today
                            </span>
                          </div>

                          {/* P&L */}
                          <div className="flex flex-col">
                            <span className="text-[10px] text-zinc-500 uppercase font-mono">Unrealized P&L</span>
                            <span className={`font-mono font-bold text-sm flex items-center gap-0.5 ${
                              isProfit ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                              {isProfit ? '+' : ''}₹{(pos.unrealized_pnl ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                            </span>
                            <span className={`text-[10px] font-mono font-medium ${
                              isProfit ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                              {isProfit ? '+' : ''}{pos.unrealized_pnl_pct ?? 0}%
                            </span>
                          </div>

                          {/* Stop Loss Target */}
                          {pos.stop_loss_pct && (
                            <div className="flex flex-col">
                              <span className="text-[10px] text-zinc-500 uppercase font-mono">Stop Loss</span>
                              <span className="font-mono text-amber-300 font-medium">
                                ₹{pos.stop_loss_price ? pos.stop_loss_price.toFixed(2) : '-'}
                              </span>
                              <span className="text-[10px] text-zinc-500 font-mono">-{pos.stop_loss_pct}%</span>
                            </div>
                          )}

                          {/* Take Profit Target */}
                          {pos.take_profit_pct && (
                            <div className="flex flex-col">
                              <span className="text-[10px] text-zinc-500 uppercase font-mono">Target Profit</span>
                              <span className="font-mono text-indigo-300 font-medium">
                                ₹{pos.take_profit_price ? pos.take_profit_price.toFixed(2) : '-'}
                              </span>
                              <span className="text-[10px] text-zinc-500 font-mono">+{pos.take_profit_pct}%</span>
                            </div>
                          )}
                        </div>

                        {/* Right: Quick Action Buttons */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openCloseModal(pos)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow flex items-center gap-1.5 ${
                              isSell
                                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                            }`}
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            <span>{isSell ? 'Execute Exit / Mark Sold' : 'Close Trade'}</span>
                          </button>

                          <button
                            onClick={() => onSelectSymbol(pos.symbol)}
                            className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-700/60 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                            title="Inspect in Chart Studio"
                          >
                            Chart
                          </button>

                          <button
                            onClick={() => handleDeletePosition(pos.id, pos.symbol)}
                            className="text-zinc-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Delete from Portfolio"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Directive Details & Reason Breakdown */}
                      <div className="mt-3 pt-3 border-t border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                        <div className="flex items-start gap-2">
                          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider shrink-0 mt-0.5">
                            Directive Reason:
                          </span>
                          <span className={`${isSell ? 'text-rose-300 font-medium' : 'text-zinc-300'}`}>
                            {pos.trigger_reason}
                          </span>
                        </div>

                        {/* Technical Indicator Snapshots */}
                        {pos.indicators && (
                          <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400 shrink-0">
                            {pos.indicators.supertrend_trend !== undefined && (
                              <span className={`px-2 py-0.5 rounded font-medium ${
                                pos.indicators.supertrend_trend === 1 
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
                                  : 'bg-rose-950 text-rose-400 border border-rose-800'
                              }`}>
                                ST: {pos.indicators.supertrend_trend === 1 ? 'Bullish' : 'Bearish'}
                              </span>
                            )}
                            {pos.indicators.rsi_14 !== undefined && (
                              <span>RSI: <strong className="text-zinc-200">{pos.indicators.rsi_14}</strong></span>
                            )}
                            {pos.indicators.sma_100 !== undefined && (
                              <span>100 SMA: <strong className="text-zinc-200">₹{pos.indicators.sma_100}</strong></span>
                            )}
                            <span>Holding: <strong className="text-zinc-200">{pos.holding_days ?? 0}d</strong></span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 2: OPEN POSITIONS TABLE */}
        {activeSubTab === 'open_positions' && (
          <div className="bg-[#12161f] border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-[#161b22] text-zinc-400 uppercase text-[10px] font-mono tracking-wider border-b border-zinc-800">
                  <tr>
                    <th className="py-3 px-4">Symbol</th>
                    <th className="py-3 px-4">Strategy</th>
                    <th className="py-3 px-4">Buy Date</th>
                    <th className="py-3 px-4 text-right">Qty</th>
                    <th className="py-3 px-4 text-right">Buy Price</th>
                    <th className="py-3 px-4 text-right">Current Price</th>
                    <th className="py-3 px-4 text-right">Invested Value</th>
                    <th className="py-3 px-4 text-right">Current Value</th>
                    <th className="py-3 px-4 text-right">Unrealized P&L</th>
                    <th className="py-3 px-4 text-center">Next-Day Signal</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {displayPositions.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-zinc-500 font-mono">
                        No open positions matching criteria
                      </td>
                    </tr>
                  ) : (
                    displayPositions.map((pos) => {
                      const isProfit = (pos.unrealized_pnl ?? 0) >= 0;
                      const isSell = pos.action === 'SELL';

                      return (
                        <tr key={pos.id} className="hover:bg-zinc-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-white">
                            <button
                              onClick={() => onSelectSymbol(pos.symbol)}
                              className="hover:text-blue-400 transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <span>{pos.symbol}</span>
                              <ExternalLink className="w-3 h-3 text-zinc-500" />
                            </button>
                          </td>
                          <td className="py-3 px-4 text-zinc-300 max-w-[200px] truncate" title={pos.strategy_name}>
                            {pos.strategy_name}
                          </td>
                          <td className="py-3 px-4 font-mono text-zinc-400">
                            {pos.buy_date} <span className="text-[10px] text-zinc-500">({pos.holding_days ?? 0}d)</span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-zinc-200">
                            {pos.qty}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-zinc-300">
                            ₹{pos.buy_price.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-white">
                            ₹{(pos.current_price || pos.buy_price).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-zinc-400">
                            ₹{pos.invested_value.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-zinc-200">
                            ₹{(pos.current_value || pos.invested_value).toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                          </td>
                          <td className={`py-3 px-4 text-right font-mono font-bold ${
                            isProfit ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            <div>{isProfit ? '+' : ''}₹{(pos.unrealized_pnl ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })}</div>
                            <div className="text-[10px] font-normal">{isProfit ? '+' : ''}{pos.unrealized_pnl_pct ?? 0}%</div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isSell ? (
                              <span className="bg-rose-950 text-rose-300 border border-rose-700 px-2 py-0.5 rounded text-[11px] font-bold">
                                🚨 SELL
                              </span>
                            ) : (
                              <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded text-[11px] font-semibold">
                                🟢 HOLD
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => openCloseModal(pos)}
                                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer"
                                title="Close / Sell"
                              >
                                Close
                              </button>
                              <button
                                onClick={() => handleDeletePosition(pos.id, pos.symbol)}
                                className="text-zinc-500 hover:text-rose-400 p-1 rounded hover:bg-rose-950/40 cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUBTAB 3: CLOSED TRADES JOURNAL */}
        {activeSubTab === 'closed_trades' && (
          <div className="bg-[#12161f] border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-[#161b22] text-zinc-400 uppercase text-[10px] font-mono tracking-wider border-b border-zinc-800">
                  <tr>
                    <th className="py-3 px-4">Symbol</th>
                    <th className="py-3 px-4">Strategy</th>
                    <th className="py-3 px-4">Buy Date</th>
                    <th className="py-3 px-4">Exit Date</th>
                    <th className="py-3 px-4 text-right">Qty</th>
                    <th className="py-3 px-4 text-right">Buy Price</th>
                    <th className="py-3 px-4 text-right">Exit Price</th>
                    <th className="py-3 px-4 text-right">Realized P&L</th>
                    <th className="py-3 px-4">Exit Reason</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {displayClosedPositions.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-zinc-500 font-mono">
                        No closed trades recorded yet. Once you close an open position, its performance will be tracked here.
                      </td>
                    </tr>
                  ) : (
                    displayClosedPositions.map((pos) => {
                      const isProfit = (pos.realized_pnl ?? 0) >= 0;

                      return (
                        <tr key={pos.id} className="hover:bg-zinc-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-white">
                            <button
                              onClick={() => onSelectSymbol(pos.symbol)}
                              className="hover:text-blue-400 transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <span>{pos.symbol}</span>
                              <ExternalLink className="w-3 h-3 text-zinc-500" />
                            </button>
                          </td>
                          <td className="py-3 px-4 text-zinc-300 max-w-[200px] truncate" title={pos.strategy_name}>
                            {pos.strategy_name}
                          </td>
                          <td className="py-3 px-4 font-mono text-zinc-400">{pos.buy_date}</td>
                          <td className="py-3 px-4 font-mono text-zinc-400">{pos.exit_date || '-'}</td>
                          <td className="py-3 px-4 text-right font-mono text-zinc-200">{pos.qty}</td>
                          <td className="py-3 px-4 text-right font-mono text-zinc-300">₹{pos.buy_price.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-white">
                            ₹{(pos.exit_price ?? 0).toFixed(2)}
                          </td>
                          <td className={`py-3 px-4 text-right font-mono font-bold ${
                            isProfit ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            <div>{isProfit ? '+' : ''}₹{(pos.realized_pnl ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })}</div>
                            <div className="text-[10px] font-normal">{isProfit ? '+' : ''}{pos.realized_pnl_pct ?? 0}%</div>
                          </td>
                          <td className="py-3 px-4 text-zinc-400 max-w-[220px] truncate" title={pos.exit_reason || ''}>
                            {pos.exit_reason || 'Manual Exit'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleDeletePosition(pos.id, pos.symbol)}
                              className="text-zinc-500 hover:text-rose-400 p-1 rounded hover:bg-rose-950/40 cursor-pointer"
                              title="Delete Trade Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: ADD REAL-WORLD POSITION                                          */}
      {/* ========================================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#161b22] border border-zinc-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Add Real-World Trade</h3>
                  <p className="text-xs text-zinc-400">Record bought stock and link with execution strategy</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePosition} className="p-5 flex flex-col gap-4 text-xs">
              {/* Row 1: Symbol & Buy Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Stock Symbol (NSE)</label>
                  <input
                    type="text"
                    required
                    value={formSymbol}
                    onChange={(e) => handleSymbolChangeInAddModal(e.target.value)}
                    placeholder="e.g. RELIANCE, TATAMOTORS"
                    className="w-full bg-[#0d1117] border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono uppercase focus:border-blue-500 focus:outline-none"
                    list="stock-symbols-list"
                  />
                  <datalist id="stock-symbols-list">
                    {availableSymbols.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Buy Date</label>
                  <input
                    type="date"
                    required
                    value={formBuyDate}
                    onChange={(e) => setFormBuyDate(e.target.value)}
                    className="w-full bg-[#0d1117] border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Row 2: Strategy Selector */}
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">
                  Purchase Strategy (Used for EoD Exit Scanning)
                </label>
                <select
                  value={formStrategy}
                  onChange={(e) => setFormStrategy(e.target.value)}
                  className="w-full bg-[#0d1117] border border-zinc-800 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  {availableStrategies.map((strat) => (
                    <option key={strat} value={strat}>
                      {strat}
                    </option>
                  ))}
                  <option value="CUSTOM">Custom Strategy (specify name)</option>
                </select>
                {formStrategy === 'CUSTOM' && (
                  <input
                    type="text"
                    required
                    placeholder="Enter custom strategy name..."
                    value={formCustomStrategy}
                    onChange={(e) => setFormCustomStrategy(e.target.value)}
                    className="w-full mt-2 bg-[#0d1117] border border-zinc-800 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                )}
              </div>

              {/* Row 3: Buy Price & Quantity */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Buy Price (₹)</label>
                  <input
                    type="number"
                    step="0.05"
                    required
                    value={formBuyPrice}
                    onChange={(e) => setFormBuyPrice(parseFloat(e.target.value))}
                    className="w-full bg-[#0d1117] border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Quantity</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formQty}
                    onChange={(e) => setFormQty(parseInt(e.target.value))}
                    className="w-full bg-[#0d1117] border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Total Invested preview */}
              <div className="bg-[#0d1117] border border-zinc-800/80 rounded-lg p-2.5 flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-400">Total Invested:</span>
                <span className="font-bold text-white">
                  ₹{(formBuyPrice * formQty).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>

              {/* Row 4: Risk Parameters (Stop Loss %, Take Profit %) */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Stop Loss (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="e.g. 5.0"
                    value={formStopLossPct}
                    onChange={(e) => setFormStopLossPct(e.target.value)}
                    className="w-full bg-[#0d1117] border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Take Profit (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="e.g. 15.0"
                    value={formTakeProfitPct}
                    onChange={(e) => setFormTakeProfitPct(e.target.value)}
                    className="w-full bg-[#0d1117] border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Trailing Stop (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="Optional"
                    value={formTrailingStopPct}
                    onChange={(e) => setFormTrailingStopPct(e.target.value)}
                    className="w-full bg-[#0d1117] border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Row 5: Notes */}
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">Trade Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Stage 2 base breakout with 2x volume..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full bg-[#0d1117] border border-zinc-800 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer shadow-lg shadow-emerald-900/30"
                >
                  Save Position
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CLOSE / SELL POSITION                                            */}
      {/* ========================================================================= */}
      {isCloseModalOpen && selectedPos && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#161b22] border border-zinc-700/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  Record Trade Exit: <span className="font-mono text-blue-400">{selectedPos.symbol}</span>
                </h3>
                <p className="text-xs text-zinc-400">Strategy: {selectedPos.strategy_name}</p>
              </div>
              <button
                onClick={() => setIsCloseModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleClosePosition} className="p-5 flex flex-col gap-4 text-xs">
              <div className="bg-[#0d1117] border border-zinc-800 rounded-xl p-3 grid grid-cols-2 gap-3 font-mono">
                <div>
                  <span className="text-[10px] text-zinc-500 block">Buy Price</span>
                  <span className="text-zinc-200 font-bold">₹{selectedPos.buy_price.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block">Quantity</span>
                  <span className="text-zinc-200 font-bold">{selectedPos.qty}</span>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-medium">Exit Date</label>
                <input
                  type="date"
                  required
                  value={closeExitDate}
                  onChange={(e) => setCloseExitDate(e.target.value)}
                  className="w-full bg-[#0d1117] border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-medium">Exit / Sold Price (₹)</label>
                <input
                  type="number"
                  step="0.05"
                  required
                  value={closeExitPrice}
                  onChange={(e) => setCloseExitPrice(parseFloat(e.target.value))}
                  className="w-full bg-[#0d1117] border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-medium">Exit Reason</label>
                <select
                  value={closeExitReason}
                  onChange={(e) => setCloseExitReason(e.target.value)}
                  className="w-full bg-[#0d1117] border border-zinc-800 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="Strategy Sell Signal">Strategy Exit Signal Triggered</option>
                  <option value="Stop Loss Hit">Stop Loss Triggered</option>
                  <option value="Take Profit Target Reached">Target Profit Achieved</option>
                  <option value="Trailing Stop Triggered">Trailing Stop Triggered</option>
                  <option value="Manual Exit / Risk Management">Manual Discretionary Exit</option>
                </select>
              </div>

              {/* Estimated Realized P&L Preview */}
              {(() => {
                const estPnl = (closeExitPrice - selectedPos.buy_price) * selectedPos.qty;
                const estPct = ((closeExitPrice - selectedPos.buy_price) / selectedPos.buy_price) * 100;
                const isProf = estPnl >= 0;
                return (
                  <div className="bg-[#0d1117] border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between font-mono">
                    <span className="text-zinc-400">Estimated Realized P&L:</span>
                    <span className={`font-bold text-sm ${isProf ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isProf ? '+' : ''}₹{estPnl.toFixed(2)} ({isProf ? '+' : ''}{estPct.toFixed(1)}%)
                    </span>
                  </div>
                );
              })()}

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCloseModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer shadow-lg shadow-rose-900/30"
                >
                  Confirm Exit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
