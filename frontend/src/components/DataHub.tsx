'use client';

import React, { useState, useEffect } from 'react';
import { Database, DownloadCloud, RefreshCw, HardDrive, CheckCircle2, AlertCircle } from 'lucide-react';

interface DataHubProps {
  onRefreshSymbols: () => void;
}

export default function DataHub({ onRefreshSymbols }: DataHubProps) {
  const [summary, setSummary] = useState<any>(null);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const fetchSummary = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/symbols');
      const data = await res.json();
      setSummary(data.summary);
      setSymbols(data.stored_symbols || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const handleSyncNifty50 = async () => {
    setSyncing(true);
    setSyncMessage("Downloading 2 years of daily data for Nifty 50 stocks...");
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
      setSyncMessage(`Successfully synced ${data.success_count} of ${data.total_requested} stocks into DuckDB & Parquet.`);
      await fetchSummary();
      onRefreshSymbols();
    } catch (e: any) {
      setSyncMessage(`Sync failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0d1117] overflow-y-auto p-4 gap-4">
      {/* Header Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-950/60 border border-blue-800 flex items-center justify-center text-blue-400">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] text-zinc-400 uppercase tracking-wider block">DuckDB Columnar Lake</span>
            <span className="text-xl font-bold font-mono text-white">
              {summary?.total_rows ? summary.total_rows.toLocaleString() : '0'} rows
            </span>
            <span className="text-[11px] text-zinc-500 block">Sub-millisecond query speed</span>
          </div>
        </div>

        <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-800 flex items-center justify-center text-emerald-400">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] text-zinc-400 uppercase tracking-wider block">Cached Equities</span>
            <span className="text-xl font-bold font-mono text-white">
              {symbols.length} Symbols
            </span>
            <span className="text-[11px] text-zinc-500 block">Parquet & DuckDB indexed</span>
          </div>
        </div>

        <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-950/60 border border-purple-800 flex items-center justify-center text-purple-400">
            <RefreshCw className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] text-zinc-400 uppercase tracking-wider block">Date Horizon</span>
            <span className="text-sm font-semibold font-mono text-zinc-200 block">
              {summary?.min_date || 'N/A'} to {summary?.max_date || 'N/A'}
            </span>
            <span className="text-[11px] text-zinc-500 block">EOD History span</span>
          </div>
        </div>
      </div>

      {/* Action Hub */}
      <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Automated Indian Market Data Ingestion</h3>
          <p className="text-xs text-zinc-400 mt-1">
            Download and cache full NSE Bhavcopies (with security-wise delivery statistics) or sync historical EOD bars.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSyncNifty50}
            disabled={syncing}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg disabled:opacity-50 transition-all"
          >
            {syncing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <DownloadCloud className="w-4 h-4" />
            )}
            {syncing ? 'Syncing...' : 'Sync Full Nifty 50 Universe (2 Years)'}
          </button>
        </div>

        {syncMessage && (
          <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{syncMessage}</span>
          </div>
        )}
      </div>

      {/* Stored Symbols Table */}
      <div className="bg-[#161b22] border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
          <span className="text-xs font-semibold text-white uppercase tracking-wider">
            Cached Equities in Local Storage ({symbols.length})
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
          {symbols.map(sym => (
            <div key={sym} className="p-2.5 bg-[#0d1117] border border-zinc-800 rounded-lg text-center">
              <div className="font-bold text-xs text-zinc-200">{sym}</div>
              <div className="text-[10px] text-emerald-400 mt-0.5">Parquet Cached</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
