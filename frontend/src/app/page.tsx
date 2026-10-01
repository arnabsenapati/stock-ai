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
  WifiOff
} from 'lucide-react';

import TradingChart from '../components/TradingChart';
import Watchlist from '../components/Watchlist';
import BacktestStudio from '../components/BacktestStudio';
import ScreenerView from '../components/ScreenerView';
import DataHub from '../components/DataHub';
import { PWAInstallButton, usePWA } from '../components/PWAProvider';
import { ChartDataResponse } from '../types';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'chart' | 'backtest' | 'screener' | 'data'>('chart');
  const [selectedSymbol, setSelectedSymbol] = useState('RELIANCE');
  const [chartType, setChartType] = useState<'candlestick' | 'heikin_ashi' | 'renko' | 'line'>('candlestick');
  
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [chartData, setChartData] = useState<ChartDataResponse | null>(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const { isOnline } = usePWA();

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

  useEffect(() => {
    fetchSymbols();
  }, []);

  useEffect(() => {
    fetchChart(selectedSymbol, chartType);
  }, [selectedSymbol, chartType]);

  const handleSelectSymbolFromScreener = (sym: string) => {
    setSelectedSymbol(sym);
    setActiveTab('chart');
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#090d13] text-zinc-100 overflow-hidden font-sans antialiased">
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
                AmiBroker<span className="text-blue-400">Terminal</span>
                <span className="text-[10px] font-medium bg-blue-950 text-blue-300 border border-blue-800 px-1.5 py-0.2 rounded font-mono">
                  v1.0
                </span>
              </div>
              <div className="text-[10px] text-zinc-400">NSE / BSE End-of-Day Workstation</div>
            </div>
          </div>

          {/* Module Tabs */}
          <nav className="flex items-center bg-[#0d1117] rounded-lg p-0.5 border border-zinc-800 text-xs font-medium">
            <button
              onClick={() => setActiveTab('chart')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                activeTab === 'chart' 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <CandlestickChart className="w-3.5 h-3.5" /> Chart Studio
            </button>
            <button
              onClick={() => setActiveTab('backtest')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                activeTab === 'backtest' 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" /> Backtest & Optimizer
            </button>
            <button
              onClick={() => setActiveTab('screener')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                activeTab === 'screener' 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Filter className="w-3.5 h-3.5" /> EOD Screener
            </button>
            <button
              onClick={() => setActiveTab('data')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                activeTab === 'data' 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Database className="w-3.5 h-3.5" /> Bhavcopy & Data Hub
            </button>
          </nav>
        </div>

        {/* Right Info Badges & PWA Action */}
        <div className="flex items-center gap-3 text-xs">
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
