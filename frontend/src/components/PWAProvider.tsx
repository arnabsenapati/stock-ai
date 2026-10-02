'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Download, WifiOff, CheckCircle2, RefreshCw } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PWAContextType {
  isInstallable: boolean;
  isInstalled: boolean;
  isOnline: boolean;
  hasUpdate: boolean;
  installApp: () => Promise<void>;
  updateApp: () => void;
}

const PWAContext = createContext<PWAContextType>({
  isInstallable: false,
  isInstalled: false,
  isOnline: true,
  hasUpdate: false,
  installApp: async () => {},
  updateApp: () => {},
});

export const usePWA = () => useContext(PWAContext);

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    // 1. Check if running in standalone / installed mode
    if (typeof window !== 'undefined') {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://');
      setIsInstalled(isStandalone);
      setIsOnline(navigator.onLine);

      // Listen for display mode changes
      const mediaQuery = window.matchMedia('(display-mode: standalone)');
      const handleDisplayModeChange = (e: MediaQueryListEvent) => {
        setIsInstalled(e.matches);
      };
      mediaQuery.addEventListener('change', handleDisplayModeChange);

      // 2. Network connectivity listeners
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      // 3. Before Install Prompt event listener
      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as BeforeInstallPromptEvent);
        setIsInstallable(true);
      };
      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

      // 4. App Installed event listener
      const handleAppInstalled = () => {
        setIsInstalled(true);
        setIsInstallable(false);
        setDeferredPrompt(null);
        console.log('[PWA] Stock AI terminal successfully installed');
      };
      window.addEventListener('appinstalled', handleAppInstalled);

      // 5. Register Service Worker
      if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'development') {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('[PWA] Service Worker registered with scope:', registration.scope);

            // Check if there is an updated worker waiting
            if (registration.waiting) {
              setWaitingWorker(registration.waiting);
              setHasUpdate(true);
            }

            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    setWaitingWorker(newWorker);
                    setHasUpdate(true);
                  }
                });
              }
            });
          })
          .catch((err) => {
            console.warn('[PWA] Service worker registration failed:', err);
          });
      }

      return () => {
        mediaQuery.removeEventListener('change', handleDisplayModeChange);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.removeEventListener('appinstalled', handleAppInstalled);
      };
    }
  }, []);

  const installApp = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        setIsInstallable(false);
      }
      setDeferredPrompt(null);
    } catch (e) {
      console.error('[PWA] Error during installation prompt:', e);
    }
  };

  const updateApp = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  };

  return (
    <PWAContext.Provider
      value={{
        isInstallable,
        isInstalled,
        isOnline,
        hasUpdate,
        installApp,
        updateApp,
      }}
    >
      {/* Offline Alert Bar */}
      {!isOnline && (
        <div className="bg-amber-600/90 text-white text-xs px-4 py-1.5 flex items-center justify-between z-50 animate-in fade-in select-none">
          <div className="flex items-center gap-2 font-medium">
            <WifiOff className="w-3.5 h-3.5" />
            <span>Working Offline: Network disconnected. Data may be cached or delayed.</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="text-[11px] bg-black/20 hover:bg-black/40 px-2 py-0.5 rounded transition font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* App Update Notification Banner */}
      {hasUpdate && (
        <div className="bg-blue-600 text-white text-xs px-4 py-1.5 flex items-center justify-between z-50 shadow-md select-none">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>A new version of Stock AI is available!</span>
          </div>
          <button
            onClick={updateApp}
            className="text-[11px] bg-white text-blue-700 font-semibold px-2.5 py-0.5 rounded hover:bg-blue-50 transition"
          >
            Update Now
          </button>
        </div>
      )}

      {children}
    </PWAContext.Provider>
  );
}

export function PWAInstallButton() {
  const { isInstallable, isInstalled, installApp } = usePWA();

  if (isInstalled) {
    return (
      <div 
        className="flex items-center gap-1.5 bg-blue-950/60 border border-blue-800/60 text-blue-300 px-2.5 py-1 rounded-lg text-xs font-medium cursor-default"
        title="Running as an installed Progressive Web App"
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
        <span className="hidden sm:inline">PWA Installed</span>
      </div>
    );
  }

  if (!isInstallable) return null;

  return (
    <button
      onClick={installApp}
      className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium px-3 py-1 rounded-lg text-xs transition shadow-md shadow-blue-900/30 cursor-pointer animate-pulse"
      title="Install Stock AI to your desktop or device"
    >
      <Download className="w-3.5 h-3.5" />
      <span>Install App</span>
    </button>
  );
}
