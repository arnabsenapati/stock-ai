'use client';

import React from 'react';
import { WifiOff, RefreshCw, ArrowLeft, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

export default function OfflinePage() {
  const handleRetry = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#090d13] text-zinc-100 p-6 select-none">
      <div className="max-w-md w-full bg-[#161b22] border border-zinc-800 rounded-2xl p-8 shadow-2xl text-center flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6 text-amber-400">
          <WifiOff className="w-8 h-8 animate-pulse" />
        </div>

        <h1 className="text-xl font-bold text-white mb-2">Offline Mode Active</h1>
        <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
          The AmiBroker Terminal is operating in local offline mode. Live stock data feeds and database synchronization require an active network connection.
        </p>

        <div className="w-full bg-[#0d1117] rounded-xl p-4 border border-zinc-800/80 mb-6 text-left">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300 mb-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>PWA Offline Cache</span>
          </div>
          <ul className="text-xs text-zinc-400 space-y-1.5 list-disc list-inside">
            <li>Terminal shell and charting engines remain cached.</li>
            <li>Stored local calculations are preserved.</li>
            <li>Real-time quotes will resume once connected.</li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            onClick={handleRetry}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2.5 rounded-xl transition shadow-lg shadow-blue-600/20 text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Connection
          </button>
          <Link
            href="/"
            className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium px-4 py-2.5 rounded-xl transition border border-zinc-700 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Launch Terminal
          </Link>
        </div>
      </div>

      <div className="mt-8 text-xs text-zinc-400 font-mono">
        AmiBroker-Class Indian EOD Stock Terminal • PWA v1.0
      </div>
    </div>
  );
}
