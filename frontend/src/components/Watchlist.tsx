'use client';

import React, { useState } from 'react';
import { Search, TrendingUp, TrendingDown, Bookmark } from 'lucide-react';

interface WatchlistProps {
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  availableSymbols: string[];
}

export default function Watchlist({
  selectedSymbol,
  onSelectSymbol,
  availableSymbols
}: WatchlistProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'NIFTY 50' | 'BANK NIFTY' | 'IT'>('NIFTY 50');

  const filtered = availableSymbols.filter(s => 
    s.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-64 flex flex-col bg-[#161b22] border-r border-zinc-800 h-full shrink-0 select-none">
      {/* Header & Search */}
      <div className="p-3 border-b border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Bookmark className="w-3.5 h-3.5 text-blue-400" /> Watchlist
          </span>
          <span className="text-[11px] font-mono text-zinc-500 bg-zinc-800/80 px-1.5 py-0.5 rounded">
            {filtered.length}
          </span>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search stock / index..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1.5 bg-[#0d1117] border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Stock List */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/40">
        {filtered.map(symbol => {
          const isSelected = selectedSymbol === symbol;
          return (
            <button
              key={symbol}
              onClick={() => onSelectSymbol(symbol)}
              className={`w-full px-3.5 py-2.5 flex items-center justify-between text-left transition-all ${
                isSelected 
                  ? 'bg-blue-600/15 border-l-2 border-blue-500 text-blue-300' 
                  : 'hover:bg-zinc-800/40 text-zinc-300'
              }`}
            >
              <div>
                <div className="font-semibold text-xs tracking-wide">{symbol}</div>
                <div className="text-[10px] text-zinc-500">NSE EQ</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-mono text-zinc-400">EOD</div>
                <div className="text-[10px] text-emerald-400 flex items-center justify-end gap-0.5">
                  <TrendingUp className="w-2.5 h-2.5" /> Tracked
                </div>
              </div>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div className="p-6 text-center text-xs text-zinc-500">
            No stocks found matching "{search}"
          </div>
        )}
      </div>
    </div>
  );
}
