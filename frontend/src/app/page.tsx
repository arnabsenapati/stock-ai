'use client';

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  CandlestickChart, 
  LineChart, 
  Cpu, 
  Database, 
  Filter, 
  Search, 
  Settings,
  Layers,
  Sparkles,
  TrendingUp,
  Activity,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Zap,
  Clock
} from 'lucide-react';

import TradingChart from '../components/TradingChart';
import Watchlist from '../components/Watchlist';
import BacktestStudio from '../components/BacktestStudio';
import ScreenerView from '../components/ScreenerView';
import DataHub from '../components/DataHub';
import { PWAInstallButton, usePWA } from '../components/PWAProvider';
import { ChartDataResponse, SyncStatusResponse } from '../types';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'chart' | 'backtest' | 'screener' | 'data'>('chart');
  const [selectedSymbol, setSelectedSymbol] = useState('RELIANCE');
  const [chartType, setChartType] = useState<'candlestick' | 'heikin_ashi' | 'renko' | 'line'>('candlestick');
  
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [chartData, setChartData] = useState<ChartDataResponse | null>(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const { isOnline } = usePWA();

  // EOD Ingestion & Auto-Sync State
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [isSyncingEod, setIsSyncingEod] = useState(false);
  const [syncToastMessage, setSyncToastMessage] = useState<string | null>(null);

  // Support direct PWA shortcut / query param tab switching
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['chart', 'backtest', 'screener', 'data'].includes(tabParam)) {
        setActiveTab(tabParam as 'chart' | 'backtest' | 'screener' | 'data');
      }
    }
  }, []);

  // Fetch initial symbol list
  const fetchSymbols = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/symbols');
      const data = await res.json();
      const n50 = data.nifty_50 || [];
      const stored = data.stored_symbols || [];
      const combined = Array.from(new Set([...stored, ...n50]));
      setAvailableSymbols(combined);
    } catch (e) {
      console.error("Error fetching symbols:", e);
    }
  };

  // Fetch chart data for selected symbol
  const fetchChart = async (symbol: string, type: string) => {
    setLoadingChart(true);
    try {
      const res = await fetch(`http://localhost:8000/api/chart/${symbol}?chart_type=${type}&period=5y`);
      if (res.ok) {
        const data = await res.json();
        setChartData(data);
      }
    } catch (e) {
      console.error("Error fetching chart data:", e);
    } finally {
      setLoadingChart(false);
    }
  };

  // Fetch Sync Status & Perform Auto-Sync on App Launch
  const checkFreshnessAndAutoSync = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/data/sync-status');
      if (!res.ok) return;
      const status: SyncStatusResponse = await res.json();
      setSyncStatus(status);

      // Automated check on opening the app
      if (status.auto_sync_on_open && !status.is_up_to_date) {
        setIsSyncingEod(true);
        setSyncToastMessage(`Auto-syncing recent EOD data to ${status.latest_expected_trading_day}...`);
        
        try {
          const syncRes = await fetch('http://localhost:8000/api/data/sync-incremental', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: false })
          });
          const syncResult = await syncRes.json();
          if (syncRes.ok) {
            setSyncToastMessage(`✓ Market data up to date (${syncResult.latest_date || status.latest_expected_trading_day})`);
            // Refresh updated symbols and current chart
            await fetchSymbols();
            fetchChart(selectedSymbol, chartType);
            // Refresh sync status
            const updatedStatusRes = await fetch('http://localhost:8000/api/data/sync-status');
            if (updatedStatusRes.ok) {
              setSyncStatus(await updatedStatusRes.json());
            }
          }
        } catch (syncErr) {
          console.error("Auto-sync error on launch:", syncErr);
        } finally {
          setIsSyncingEod(false);
          setTimeout(() => setSyncToastMessage(null), 4000);
        }
      }
    } catch (e) {
      console.error("Error checking sync status:", e);
    }
  };

  // Manual trigger from header button
  const triggerManualSync = async (force: boolean = false) => {
    setIsSyncingEod(true);
    setSyncToastMessage("Downloading latest market data to today...");
    try {
      const res = await fetch('http://localhost:8000/api/data/sync-incremental', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force })
      });
      const data = await res.json();
      if (res.ok) {
        setSyncToastMessage(`✓ ${data.message || 'Market data updated to today.'}`);
        await fetchSymbols();
        fetchChart(selectedSymbol, chartType);
        const updatedRes = await fetch('http://localhost:8000/api/data/sync-status');
        if (updatedRes.ok) {
          setSyncStatus(await updatedRes.json());
        }
      } else {
        setSyncToastMessage(`⚠️ Sync failed: ${data.detail || data.message}`);
      }
    } catch (e: any) {
      setSyncToastMessage(`⚠️ Sync error: ${e.message}`);
    } finally {
      setIsSyncingEod(false);
      setTimeout(() => setSyncToastMessage(null), 4000);
    }
  };

  useEffect(() => {
    fetchSymbols();
    checkFreshnessAndAutoSync();
  }, []);

  useEffect(() => {
    fetchChart(selectedSymbol, chartType);
  }, [selectedSymbol, chartType]);

  const handleSelectSymbolFromScreener = (sym: string) => {
    setSelectedSymbol(sym);
    setActiveTab('chart');
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#090d13] text-zinc-100 overflow-hidden font-sans antialiased relative">
      {/* Toast Notification Banner for Ingestion / Auto-sync */}
      {syncToastMessage && (
        <div className="absolute top-16 right-4 z-50 bg-[#161b22] border border-blue-700/80 text-zinc-100 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs animate-fade-in font-medium">
          {isSyncingEod ? (
            <RefreshCw className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
          ) : (
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{syncToastMessage}</span>
        </div>
      )}

      {/* Top Main Navigation Bar */}
      <header className="h-14 bg-[#161b22] border-b border-zinc-800 flex items-center justify-between px-4 shrink-0 select-none z-20">
        <div className="flex items-center gap-6">
          {/* Logo & Terminal Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-900/30">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-extrabold tracking-wide text-white flex items-center gap-1.5">
                Stock <span className="text-blue-400">AI</span>
                <span className="text-[10px] font-medium bg-blue-950 text-blue-300 border border-blue-800 px-1.5 py-0.2 rounded font-mono">
                  v1.0
                </span>
              </div>
              <div className="text-[10px] text-zinc-400">AI & Algorithmic Trading Workstation</div>
            </div>
          </div>

          {/* Module Tabs */}
          <nav className="flex items-center bg-[#0d1117] rounded-lg p-0.5 border border-zinc-800 text-xs font-medium">
            <button
              onClick={() => setActiveTab('chart')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'chart' 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <CandlestickChart className="w-3.5 h-3.5" /> Chart Studio
            </button>
            <button
              onClick={() => setActiveTab('backtest')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'backtest' 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" /> Backtest & Optimizer
            </button>
            <button
              onClick={() => setActiveTab('screener')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'screener' 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Filter className="w-3.5 h-3.5" /> EOD Screener
            </button>
            <button
              onClick={() => setActiveTab('data')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'data' 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Database className="w-3.5 h-3.5" /> Bhavcopy & Data Hub
            </button>
          </nav>
        </div>

        {/* Right Info Badges, EOD Status & PWA Action */}
        <div className="flex items-center gap-3 text-xs">
          {/* EOD Data Synchronization Status Indicator */}
          {isSyncingEod ? (
            <div className="flex items-center gap-1.5 bg-blue-950/80 border border-blue-700/80 px-2.5 py-1 rounded-lg font-mono text-[11px] text-blue-300 animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
              <span>Syncing EOD...</span>
            </div>
          ) : syncStatus?.is_up_to_date ? (
            <button
              onClick={() => triggerManualSync(true)}
              title="Market data is up to date with the latest session. Click to force refresh."
              className="flex items-center gap-1.5 bg-[#0d1117] border border-zinc-800 hover:border-zinc-700 px-2.5 py-1 rounded-lg font-mono text-[11px] text-emerald-400 cursor-pointer transition-all"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-zinc-400 hidden sm:inline">EOD:</span>
              <span className="text-zinc-200">{syncStatus?.current_db_date || 'Current'}</span>
            </button>
          ) : (
            <button
              onClick={() => triggerManualSync(false)}
              title="Click to sync missing EOD bars to today"
              className="flex items-center gap-1.5 bg-gradient-to-r from-amber-950/80 to-amber-900/60 border border-amber-600/80 hover:border-amber-500 text-amber-300 px-2.5 py-1 rounded-lg font-mono text-[11px] transition-all cursor-pointer shadow-sm animate-pulse"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>Sync to Today ({syncStatus?.days_behind || 1}d behind)</span>
            </button>
          )}

          {/* PWA Direct Installation Button */}
          <PWAInstallButton />

          {/* Connectivity Status */}
          <div className="flex items-center gap-1.5 bg-[#0d1117] px-2.5 py-1 rounded-lg border border-zinc-800 font-mono text-[11px]">
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-zinc-400 hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
          </div>

          <div className="hidden md:flex items-center gap-2 bg-[#0d1117] px-2.5 py-1 rounded-lg border border-zinc-800 font-mono text-[11px]">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-zinc-400">Engine:</span>
            <span className="text-zinc-200">DuckDB + Numba</span>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'chart' && (
          <div className="flex-1 flex overflow-hidden">
            <Watchlist
              selectedSymbol={selectedSymbol}
              onSelectSymbol={setSelectedSymbol}
              availableSymbols={availableSymbols}
            />
            <div className="flex-1 p-3 flex flex-col overflow-hidden">
              <TradingChart
                data={chartData}
                loading={loadingChart}
                chartType={chartType}
                onChartTypeChange={setChartType}
              />
            </div>
          </div>
        )}

        {activeTab === 'backtest' && (
          <BacktestStudio
            currentSymbol={selectedSymbol}
            availableSymbols={availableSymbols}
          />
        )}

        {activeTab === 'screener' && (
          <ScreenerView
            onSelectStock={handleSelectSymbolFromScreener}
          />
        )}

        {activeTab === 'data' && (
          <DataHub
            onRefreshSymbols={fetchSymbols}
          />
        )}
      </div>
    </div>
  );
}
