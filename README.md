# Stock AI - Indian EOD Stock Market Terminal

A high-performance End-of-Day (EOD) stock market analytics, multi-pane charting, screening, and backtesting workstation tailored for Indian markets (NSE & BSE).

---

## 🌟 Key Features

1. **GPU-Accelerated 60 FPS Charting Studio**:
   - Built on TradingView's Lightweight Charts (Canvas / WebGL).
   - Chart Types: **Standard Candlesticks**, **Heikin-Ashi**, **Renko Bricks** (dynamic ATR or fixed size), and Line.
   - Indicator Overlays: EMA Ribbons (9, 21, 50, 200), SMA (20, 50, 200), SuperTrend (ATR multiplier), Bollinger Bands (Upper, Lower, Middle, Bandwidth), Keltner Channels, Donchian Channels.
   - Separate Oscillator Panes: RSI (14, Wilder's smoothing with 70/30 bands), MACD (12, 26, 9 with signal line and color-coded histogram).
   - Crosshair synchronization across multiple panes.

2. **Python Strategy Scripting & Formula DSL**:
   - Write strategies using clean Python expressions:
     ```python
     # Example: SuperTrend Trend Following
     Trend = SuperTrend_Trend(10, 3.0)
     Buy = Cross(Trend, 0)
     Sell = CrossUnder(Trend, 0)

     # Example: Golden Cross with RSI Momentum Filter
     Buy = Cross(SMA(Close, 50), SMA(Close, 200)) & (RSI(Close, 14) > 50)
     Sell = Cross(SMA(Close, 200), SMA(Close, 50)) | (RSI(Close, 14) < 40)
     ```
   - Built-ins include: `Close`, `Open`, `High`, `Low`, `Volume`, `DeliveryPct`, `EMA()`, `SMA()`, `RSI()`, `ATR()`, `SuperTrend_Trend()`, `Cross()`, `CrossUnder()`, `HHV()`, `LLV()`.

3. **Basket & Individual Stock Backtesting Engine**:
   - Run on single stocks or multi-stock baskets (**Nifty 50**, **Nifty Bank**, **Nifty IT**).
   - Capital allocation across maximum concurrent open positions.
   - Indian market transaction costs: STT (Securities Transaction Tax 0.1%), Brokerage (₹20 / 0.03%), and Slippage.
   - Institutional performance metrics: CAGR %, Total Return %, Sharpe Ratio, Sortino Ratio, Calmar Ratio, Max Drawdown %, Win Rate %, Profit Factor, Expectancy, and Average Holding Days.
   - Cumulative Portfolio Equity Curve & Detailed Trade Execution Log.

4. **Real-Time EOD Market Screener**:
   - Instant scan across Indian equity universes in milliseconds.
   - Presets:
     - 52-Week High Breakout with >1.2x Volume
     - SuperTrend Bullish Reversal
     - High Institutional Delivery Accumulation (Delivery % > 40% with volume surge)
     - 50 SMA / 200 SMA Golden Cross
     - RSI Oversold Momentum Bounce
     - Custom Formula Scanner
   - 1-Click jump from scan result directly into Chart Studio.

5. **Automated Indian Market Data Ingestion & Morning Scheduler (DuckDB + Parquet Lake)**:
   - **Incremental EOD Ingestion**: Automatically detects missing trading days from the last available date to today's date and fetches only the delta bars in parallel batch (<2s for full universe).
   - **Auto-Sync on App Launch**: Automatically checks date freshness upon opening the web or desktop PWA app and syncs recent missing bars in the background with live status feedback.
   - **Background Morning Scheduler**: Built-in background daemon scheduler that runs every morning (default 08:30 AM IST before market open) to ingest previous session's finalized Bhavcopy/EOD data unattended.
   - **Windows NSSM Service Ready**: Operates 24/7 as an autonomous background service, ensuring the database is always updated every morning even when the user hasn't opened the UI.
   - **Dual Columnar Storage**: High-speed DuckDB atomic upserts and synchronized Parquet caching for sub-millisecond charting and screener queries.

6. **Progressive Web App (PWA) & Desktop Standalone Mode**:
   - Installable directly as a native desktop or mobile application (Chrome, Edge, Safari, Android).
   - Service Worker caching app shell, navigation, and static charting bundles.
   - Built-in offline fallback page with connection state recovery.
   - OS shortcuts for 1-click access directly into Chart Studio, Backtester, Screener, or Data Hub.
   - Interactive in-app installation banner and online/offline connectivity indicator.

---

## 🚀 Quick Start Guide

### Prerequisites
- Python 3.10+ (tested with Python 3.14)
- Node.js 18+ (tested with Node 24)

### One-Click Launch (Windows)
Double-click `start_all.bat` or run:
```powershell
.\start_all.bat
```

### Manual Launch

#### 1. Start Backend:
```powershell
python start_backend.py
```
FastAPI server runs on [http://127.0.0.1:8000](http://127.0.0.1:8000). Interactive Swagger docs available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

#### 2. Start Frontend:
```powershell
cd frontend
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### Run as a Background Windows Service (NSSM)

To run the terminal automatically in the background as a persistent Windows Service:

1. **Install and Start Service**:
   Double-click `install_service.bat` (or run in an elevated PowerShell prompt: `.\install_service.ps1`).
   - Registers a Windows Service named `StockAI` using NSSM.
   - Automatically runs both the FastAPI backend and Next.js frontend via [`service_runner.py`](file:///d:/SourceCode/stock-ai/service_runner.py).
   - Configures automatic restart and daily log rotation under `d:\SourceCode\stock-ai\logs\`.

2. **Stop and Uninstall Service**:
   Double-click `uninstall_service.bat` to gracefully stop and remove the service.

3. **Manual Service Control**:
   ```powershell
   nssm start StockAI
   nssm stop StockAI
   nssm status StockAI
   ```

