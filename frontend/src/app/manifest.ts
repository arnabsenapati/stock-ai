import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Stock AI - Algorithmic Trading & Analytics',
    short_name: 'Stock AI',
    description: 'NSE / BSE End-of-Day Quantitative Workstation & Optimizer',
    start_url: '/',
    display: 'standalone',
    background_color: '#090d13',
    theme_color: '#090d13',
    orientation: 'any',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Chart Studio',
        url: '/?tab=chart',
        description: 'Open Technical Analysis Charting Studio',
      },
      {
        name: 'Backtest Studio',
        url: '/?tab=backtest',
        description: 'Run Quantitative Python Backtests',
      },
      {
        name: 'EOD Screener',
        url: '/?tab=screener',
        description: 'Scan Breakouts and Delivery Accumulation',
      },
      {
        name: 'Data Hub',
        url: '/?tab=data',
        description: 'Download and Ingest NSE Bhavcopy Data',
      },
    ],
    categories: ['finance', 'business', 'productivity', 'utilities'],
  };
}
