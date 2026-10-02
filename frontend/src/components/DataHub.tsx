'use client';

import React, { useState, useEffect } from 'react';
import { 
  Database, 
  DownloadCloud, 
  RefreshCw, 
  HardDrive, 
  CheckCircle2, 
  AlertCircle, 
  Zap, 
  Clock, 
  Calendar, 
  Sliders, 
  Play, 
  ShieldCheck,
  Check
} from 'lucide-react';
import { SyncStatusResponse } from '../types';

interface DataHubProps {
  onRefreshSymbols: () => void;
}

export default function DataHub({ onRefreshSymbols }: DataHubProps) {
  const [summary, setSummary] = useState<any>(null);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  
  // Action states
  const [syncingIncremental, setSyncingIncremental] = useState(false);
  const [syncingFull, setSyncingFull] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Schedule config state
  const [morningEnabled, setMorningEnabled] = useState(true);
  const [morningTime, setMorningTime] = useState('08:30');
  const [autoOpenEnabled, setAutoOpenEnabled] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleSavedToast, setScheduleSavedToast] = useState(false);

  const fetchSyncStatus = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/data/sync-status');
      if (res.ok) {
        const data: SyncStatusResponse = await res.json();
        setSyncStatus(data);
        setSummary(data.market_summary);
        setMorningEnabled(data.morning_schedule_enabled);
        setMorningTime(data.morning_schedule_time);
        setAutoOpenEnabled(data.auto_sync_on_open);
      }
    } catch (e) {
      console.error("Error fetching sync status:", e);
    }
  };

  const fetchSymbols = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/symbols');
      const data = await res.json();
      setSymbols(data.stored_symbols || []);
      if (!summary && data.summary) {
        setSummary(data.summary);
      }
    } catch (e) {
      console.error("Error fetching symbols:", e);
    }
  };

  useEffect(() => {
    fetchSyncStatus();
    fetchSymbols();
  }, []);

  // 1. Trigger fast incremental sync from last date to today
  const handleIncrementalSync = async (force: boolean = false) => {
    setSyncingIncremental(true);
    setSyncMessage(null);
    setSyncError(null);
    try {
      const res = await fetch('http://localhost:8000/api/data/sync-incremental', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force })
      });
      const data = await res.json();
      if (res.ok) {
        setSyncMessage(data.message || `Sync completed: ${data.rows_added || 0} rows merged.`);
        await fetchSyncStatus();
        await fetchSymbols();
        onRefreshSymbols();
      } else {
        setSyncError(data.detail || data.message || "Failed to execute incremental sync.");
      }
    } catch (e: any) {
      setSyncError(`Sync error: ${e.message}`);
    } finally {
      setSyncingIncremental(false);
    }
  };

  // 2. Trigger full 2-year backfill
  const handleSyncNifty50 = async () => {
    setSyncingFull(true);
    setSyncMessage(null);
    setSyncError(null);
    try {
      const symRes = await fetch('http://localhost:8000/api/universes');
      const univData = await symRes.json();
      const n50 = univData.universes['Nifty 50'] || [];

      const res = await fetch('http://localhost:8000/api/data/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: n50, period: '2y' })
      });
      const data = await res.json();
      setSyncMessage(`Successfully backfilled ${data.success_count} of ${data.total_requested} stocks (2 Years) into DuckDB & Parquet.`);
      await fetchSyncStatus();
      await fetchSymbols();
      onRefreshSymbols();
    } catch (e: any) {
      setSyncError(`Full sync failed: ${e.message}`);
    } finally {
      setSyncingFull(false);
    }
  };

  // 3. Save schedule configuration
  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const res = await fetch('http://localhost:8000/api/data/sync-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          morning_schedule_enabled: morningEnabled,
          morning_schedule_time: morningTime,
          auto_sync_on_open: autoOpenEnabled
        })
      });
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data);
        setScheduleSavedToast(true);
        setTimeout(() => setScheduleSavedToast(false), 3000);
      }
    } catch (e) {
      console.error("Failed to save schedule settings:", e);
    } finally {
      setSavingSchedule(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0d1117] overflow-y-auto p-4 gap-4">
      {/* Header Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* DuckDB Lake Card */}
        <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-4 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-blue-950/60 border border-blue-800 flex items-center justify-center text-blue-400 shrink-0">
            <HardDrive className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] text-zinc-400 uppercase tracking-wider block">DuckDB Columnar Lake</span>
            <span className="text-xl font-bold font-mono text-white truncate block">
              {summary?.total_rows ? summary.total_rows.toLocaleString() : '0'} rows
            </span>
            <span className="text-[11px] text-zinc-500 block truncate">Sub-millisecond analytical speed</span>
          </div>
        </div>

        {/* Cached Equities Card */}
        <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-4 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-800 flex items-center justify-center text-emerald-400 shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] text-zinc-400 uppercase tracking-wider block">Cached Equities</span>
            <span className="text-xl font-bold font-mono text-white block">
              {symbols.length} Symbols
            </span>
            <span className="text-[11px] text-zinc-500 block truncate">Parquet & DuckDB dual-indexed</span>
          </div>
        </div>

        {/* Date Horizon Card */}
        <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-4 flex items-center gap-4 shadow-sm">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            syncStatus?.is_up_to_date 
              ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-400' 
              : 'bg-amber-950/60 border border-amber-800 text-amber-400'
          }`}>
            <Calendar className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider">Date Horizon</span>
              {syncStatus && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  syncStatus.is_up_to_date 
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700' 
                    : 'bg-amber-950/80 text-amber-300 border-amber-700 animate-pulse'
                }`}>
                  {syncStatus.is_up_to_date ? 'Up to Date' : `${syncStatus.days_behind || 1}d Behind`}
                </span>
              )}
            </div>
            <span className="text-sm font-semibold font-mono text-zinc-200 block truncate mt-0.5">
              {summary?.min_date || 'N/A'} to {summary?.max_date || 'N/A'}
            </span>
            <span className="text-[11px] text-zinc-500 block truncate">
              Latest Session: {syncStatus?.latest_expected_trading_day || 'Today'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Ingestion Action Hub */}
      <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-5 flex flex-col gap-4 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-400" />
            Automated Indian Market Data Ingestion
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Sync missing recent daily bars from last available data up to today&apos;s date, or backfill multi-year historical histories.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* 1. Primary Incremental Sync Button */}
          <button
            onClick={() => handleIncrementalSync(false)}
            disabled={syncingIncremental || syncingFull}
            className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-900/30 disabled:opacity-50 transition-all cursor-pointer"
          >
            {syncingIncremental ? (
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
            )}
            <span>{syncingIncremental ? 'Downloading Recent Bars...' : 'Sync to Today (Incremental Download)'}</span>
          </button>

          {/* 2. Full Nifty 50 2Y Backfill Button */}
          <button
            onClick={handleSyncNifty50}
            disabled={syncingIncremental || syncingFull}
            className="px-4 py-2.5 bg-[#0d1117] hover:bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold flex items-center gap-2 disabled:opacity-50 transition-all cursor-pointer"
          >
            {syncingFull ? (
              <RefreshCw className="w-4 h-4 animate-spin text-zinc-400" />
            ) : (
              <DownloadCloud className="w-4 h-4 text-zinc-400" />
            )}
            <span>{syncingFull ? 'Backfilling Nifty 50...' : 'Backfill Full Nifty 50 (2 Years)'}</span>
          </button>

          {/* Force Re-Sync Button */}
          <button
            onClick={() => handleIncrementalSync(true)}
            disabled={syncingIncremental || syncingFull}
            title="Force refresh recent candles even if considered up to date"
            className="px-3 py-2.5 bg-[#0d1117] hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg text-xs font-mono transition-all cursor-pointer"
          >
            Force Re-check
          </button>
        </div>

        {/* Feedback messages */}
        {syncMessage && (
          <div className="p-3 bg-emerald-950/30 border border-emerald-800/80 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{syncMessage}</span>
          </div>
        )}

        {syncError && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-lg text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{syncError}</span>
          </div>
        )}
      </div>

      {/* Automated Scheduling & App-Open Sync Settings */}
      <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-5 flex flex-col gap-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              Automated Schedule & App-Open Synchronization
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Set the terminal to stay continuously updated automatically every morning or immediately whenever you launch the app.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {scheduleSavedToast && (
              <span className="text-xs font-medium text-emerald-400 flex items-center gap-1 animate-fade-in">
                <Check className="w-3.5 h-3.5" /> Saved!
              </span>
            )}
            <button
              onClick={handleSaveSchedule}
              disabled={savingSchedule}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {savingSchedule ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Feature 1: Auto Sync on App Open */}
          <div className="p-4 bg-[#0d1117] border border-zinc-800/90 rounded-xl flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  Auto-Sync on App Launch
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoOpenEnabled}
                    onChange={(e) => setAutoOpenEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>
              <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
                Automatically detects missing days from your last cached date to today and triggers a background incremental sync whenever you open the terminal.
              </p>
            </div>

            <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] font-mono">
              <span className="text-zinc-500">Status:</span>
              <span className={autoOpenEnabled ? "text-emerald-400" : "text-zinc-400"}>
                {autoOpenEnabled ? "Enabled (Syncs on launch)" : "Disabled (Manual only)"}
              </span>
            </div>
          </div>

          {/* Feature 2: Daily Morning Backend Schedule */}
          <div className="p-4 bg-[#0d1117] border border-zinc-800/90 rounded-xl flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  Daily Morning Backend Schedule
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={morningEnabled}
                    onChange={(e) => setMorningEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
                Background service daemon automatically checks and downloads yesterday&apos;s finalized NSE/BSE EOD bhavcopy bars every morning before Indian market open (09:15 AM).
              </p>
            </div>

            <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px]">
              <span className="text-zinc-400 font-medium">Scheduled Time (IST):</span>
              <input
                type="time"
                value={morningTime}
                disabled={!morningEnabled}
                onChange={(e) => setMorningTime(e.target.value)}
                className="bg-[#161b22] border border-zinc-700 rounded px-2 py-0.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500 disabled:opacity-40"
              />
            </div>
          </div>
        </div>

        {/* Real-Time Scheduler Diagnostics Info */}
        <div className="bg-[#090d13] border border-zinc-800/80 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Backend Daemon</span>
            <span className="font-mono text-zinc-300 flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Active (NSSM / Service Runner)
            </span>
          </div>

          <div>
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Next Scheduled Morning Run</span>
            <span className="font-mono text-blue-400 mt-0.5 block">
              {syncStatus?.next_run_estimate || 'Today at ' + morningTime}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Last Completed Sync</span>
            <span className="font-mono text-zinc-300 truncate mt-0.5 block" title={syncStatus?.last_sync_timestamp || 'N/A'}>
              {syncStatus?.last_sync_timestamp ? new Date(syncStatus.last_sync_timestamp).toLocaleTimeString() : 'Recently'} ({syncStatus?.last_sync_status || 'OK'})
            </span>
          </div>
        </div>
      </div>

      {/* Stored Symbols Grid */}
      <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
          <span className="text-xs font-semibold text-white uppercase tracking-wider">
            Cached Equities in Local Storage ({symbols.length})
          </span>
          <span className="text-[11px] text-zinc-500 font-mono">
            Direct High-Speed Parquet & DuckDB Integration
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
          {symbols.map(sym => (
            <div key={sym} className="p-2.5 bg-[#0d1117] border border-zinc-800 hover:border-zinc-700 rounded-lg text-center transition-colors">
              <div className="font-bold text-xs text-zinc-200">{sym}</div>
              <div className="text-[10px] text-emerald-400 mt-0.5 flex items-center justify-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Parquet
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
