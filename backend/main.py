from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date, datetime, timedelta
from contextlib import asynccontextmanager
import pandas as pd
import numpy as np

from backend.core.config import (
    NIFTY_50_SYMBOLS, NIFTY_BANK_SYMBOLS, NIFTY_IT_SYMBOLS, 
    BENCHMARKS, POPULAR_UNIVERSES
)
from backend.core.database import db
from backend.data.yfinance_feed import yf_feed
from backend.data.bhavcopy import bhavcopy_hub
from backend.data.scheduler import data_scheduler
from backend.analytics.indicators import ta
from backend.analytics.chart_types import chart_converter
from backend.backtester.engine import backtest_engine
from backend.backtester.strategy_dsl import PRESET_STRATEGIES
from backend.screener.scanner import screener
from backend.backtester.optimizer import strategy_optimizer
from backend.portfolio.scanner import portfolio_scanner

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: start automated morning scheduler
    data_scheduler.start()
    yield
    # Shutdown: stop scheduler
    data_scheduler.stop()

app = FastAPI(
    title="AmiBroker-Class Indian EOD Stock Terminal",
    description="High-performance End-of-Day Indian Market Analytics, Multi-Pane Charting & Backtesting Platform",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class DownloadRequest(BaseModel):
    symbols: List[str]
    period: str = "5y"

class IncrementalSyncRequest(BaseModel):
    symbols: Optional[List[str]] = None
    force: bool = False

class ScheduleConfigRequest(BaseModel):
    morning_schedule_enabled: Optional[bool] = None
    morning_schedule_time: Optional[str] = None
    auto_sync_on_open: Optional[bool] = None

class BacktestRequest(BaseModel):
    mode: str = "single" # "single" or "basket"
    symbol: Optional[str] = "RELIANCE"
    universe: Optional[str] = "Nifty 50"
    custom_symbols: Optional[List[str]] = None
    strategy_code: str
    initial_capital: float = 100000.0
    risk_per_trade_pct: float = 10.0
    max_positions: int = 10
    stop_loss_pct: Optional[float] = None
    take_profit_pct: Optional[float] = None
    trailing_stop_pct: Optional[float] = None
    slippage_pct: float = 0.05
    brokerage_pct: float = 0.10
    execution_timing: str = "next_open"
    compounding: bool = True
    partial_tp_pct: Optional[float] = None
    partial_tp_ratio: float = 50.0
    breakeven_on_partial: bool = False
    regime_filter: bool = False
    regime_index_symbol: str = "^NSEI"
    regime_rule: str = "sma_200"
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class ScreenerRequest(BaseModel):
    universe: str = "Nifty 50"
    scan_type: str = "SuperTrend + 100 SMA Trend Rider"
    custom_formula: Optional[str] = None
    lookback_days: int = 3
    signal_filter: str = "ALL"
    regime_filter: bool = False
    regime_index_symbol: str = "^NSEI"
    regime_rule: str = "sma_200"

class OptimizeStartRequest(BaseModel):
    strategy_name: str = "SuperTrend + 100 SMA Trend Rider (Optimal)"
    universe: str = "Nifty 50"
    strategy_code: str
    target_trials: int = 150
    target_metric: str = "sharpe_ratio"
    initial_capital: float = 100000.0
    execution_timing: str = "next_open"
    compounding: bool = True
    regime_filter: bool = False
    regime_index_symbol: str = "^NSEI"
    regime_rule: str = "sma_200"
    param_ranges: Optional[Dict[str, Any]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class OptimizeActionRequest(BaseModel):
    strategy_name: str
    universe: str
    regime_filter: Optional[bool] = False
    regime_rule: Optional[str] = "sma_200"

class StrategyPresetSaveRequest(BaseModel):
    strategy_name: str
    universe: str
    initial_capital: float = 100000.0
    risk_per_trade_pct: float = 10.0
    stop_loss_pct: Optional[float] = None
    take_profit_pct: Optional[float] = None
    trailing_stop_pct: Optional[float] = None
    max_positions: int = 10
    compounding: Optional[bool] = True
    regime_filter: Optional[bool] = False
    regime_rule: Optional[str] = "sma_200"
    best_metric_name: Optional[str] = "sharpe_ratio"
    best_metric_value: Optional[float] = 0.0
    total_trades: Optional[int] = 0
    win_rate: Optional[float] = 0.0
    total_return_pct: Optional[float] = 0.0
    max_drawdown_pct: Optional[float] = 0.0
    sharpe_ratio: Optional[float] = 0.0
    cagr_pct: Optional[float] = 0.0

class PortfolioPositionCreateRequest(BaseModel):
    symbol: str
    strategy_name: str
    strategy_code: Optional[str] = None
    buy_date: str
    buy_price: float
    qty: int
    stop_loss_pct: Optional[float] = None
    take_profit_pct: Optional[float] = None
    trailing_stop_pct: Optional[float] = None
    notes: Optional[str] = None

class PortfolioPositionUpdateRequest(BaseModel):
    symbol: Optional[str] = None
    strategy_name: Optional[str] = None
    strategy_code: Optional[str] = None
    buy_date: Optional[str] = None
    buy_price: Optional[float] = None
    qty: Optional[int] = None
    stop_loss_pct: Optional[float] = None
    take_profit_pct: Optional[float] = None
    trailing_stop_pct: Optional[float] = None
    notes: Optional[str] = None

class PortfolioPositionCloseRequest(BaseModel):
    exit_date: str
    exit_price: float
    exit_reason: Optional[str] = "Manual Exit"

class PortfolioEodScanRequest(BaseModel):
    strategy_name: Optional[str] = None

# Routes
@app.get("/")
def root():
    return {
        "app": "AmiBroker-Class Indian EOD Stock Terminal",
        "status": "online",
        "market": "NSE / BSE India",
        "docs_url": "http://127.0.0.1:8000/docs",
        "health_url": "http://127.0.0.1:8000/api/health",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "market": "NSE / BSE India",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/universes")
def get_universes():
    return {
        "universes": POPULAR_UNIVERSES,
        "benchmarks": BENCHMARKS
    }

@app.get("/api/symbols")
def get_symbols():
    stored = db.get_all_stored_symbols()
    summary = db.get_market_summary()
    return {
        "stored_symbols": stored,
        "nifty_50": NIFTY_50_SYMBOLS,
        "summary": summary
    }

@app.post("/api/data/download")
def download_data(req: DownloadRequest, background_tasks: BackgroundTasks):
    """Trigger background download of stock histories"""
    res = yf_feed.batch_download(req.symbols, period=req.period)
    return res

@app.post("/api/data/sync-incremental")
def sync_incremental(req: IncrementalSyncRequest):
    """
    Download missing EOD bars from last available date to today's date.
    Triggers automatically on app open or on demand.
    """
    return data_scheduler.trigger_sync(symbols=req.symbols, force=req.force, reason="user_or_app_request")

@app.get("/api/data/sync-status")
def get_sync_status():
    """Live status of morning scheduler, last sync, freshness and data horizon"""
    return data_scheduler.get_status()

@app.post("/api/data/sync-schedule")
def update_sync_schedule(req: ScheduleConfigRequest):
    """Configure morning scheduler and auto-sync on app open settings"""
    return data_scheduler.update_config(
        morning_schedule_enabled=req.morning_schedule_enabled,
        morning_schedule_time=req.morning_schedule_time,
        auto_sync_on_open=req.auto_sync_on_open
    )

@app.get("/api/data/summary")
def get_data_summary():
    return db.get_market_summary()

@app.get("/api/strategies/presets")
def get_strategy_presets():
    return PRESET_STRATEGIES

@app.get("/api/screener/presets")
def get_screener_presets():
    return screener.SCREENER_PRESETS

@app.get("/api/chart/{symbol}")
def get_chart_data(
    symbol: str,
    chart_type: str = Query("candlestick", pattern="^(candlestick|heikin_ashi|renko|line)$"),
    period: str = "5y"
):
    """Fetch OHLCV candlestick/renko data with indicators for TradingView lightweight-charts"""
    symbol = symbol.upper()
    df = db.get_symbol_data(symbol)
    
    # Auto-fetch if not cached yet
    if df.empty:
        yf_feed.fetch_symbol_history(symbol, period=period)
        df = db.get_symbol_data(symbol)
        
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data found for symbol {symbol}")

    # Compute technical indicators
    enriched = ta.compute_all(df)

    # Format for chart type
    if chart_type == "heikin_ashi":
        transformed = chart_converter.to_heikin_ashi(enriched)
    else:
        transformed = enriched

    # Lightweight-charts candle format: { time: 'YYYY-MM-DD', open, high, low, close }
    candles = []
    volume_series = []
    delivery_series = []
    
    # Indicator series
    ema_9 = []
    ema_21 = []
    ema_50 = []
    sma_100 = []
    ema_200 = []
    supertrend_series = []
    bb_upper = []
    bb_lower = []
    rsi_series = []
    macd_series = []
    macd_signal_series = []
    macd_hist_series = []

    # Ensure date is strictly formatted as 'YYYY-MM-DD' for Lightweight Charts
    transformed['clean_date'] = pd.to_datetime(transformed['date']).dt.strftime('%Y-%m-%d')

    for _, row in transformed.iterrows():
        t = str(row['clean_date'])
        o = float(row['open'])
        h = float(row['high'])
        l = float(row['low'])
        c = float(row['close'])
        v = int(row['volume'])
        d_pct = float(row.get('delivery_pct', 0.0))

        candles.append({"time": t, "open": o, "high": h, "low": l, "close": c})
        volume_series.append({
            "time": t,
            "value": v,
            "color": "rgba(38, 166, 154, 0.5)" if c >= o else "rgba(239, 83, 80, 0.5)"
        })
        delivery_series.append({"time": t, "value": d_pct})

        if pd.notna(row.get('ema_9')):
            ema_9.append({"time": t, "value": round(float(row['ema_9']), 2)})
        if pd.notna(row.get('ema_21')):
            ema_21.append({"time": t, "value": round(float(row['ema_21']), 2)})
        if pd.notna(row.get('ema_50')):
            ema_50.append({"time": t, "value": round(float(row['ema_50']), 2)})
        if pd.notna(row.get('sma_100')):
            sma_100.append({"time": t, "value": round(float(row['sma_100']), 2)})
        if pd.notna(row.get('ema_200')):
            ema_200.append({"time": t, "value": round(float(row['ema_200']), 2)})

        if pd.notna(row.get('supertrend')):
            supertrend_series.append({
                "time": t,
                "value": round(float(row['supertrend']), 2),
                "trend": int(row.get('supertrend_trend', 1))
            })

        if pd.notna(row.get('bb_upper')) and pd.notna(row.get('bb_lower')):
            bb_upper.append({"time": t, "value": round(float(row['bb_upper']), 2)})
            bb_lower.append({"time": t, "value": round(float(row['bb_lower']), 2)})

        if pd.notna(row.get('rsi_14')):
            rsi_series.append({"time": t, "value": round(float(row['rsi_14']), 2)})

        if pd.notna(row.get('macd')):
            macd_series.append({"time": t, "value": round(float(row['macd']), 2)})
            macd_signal_series.append({"time": t, "value": round(float(row['macd_signal']), 2)})
            macd_hist_series.append({
                "time": t, 
                "value": round(float(row['macd_hist']), 2),
                "color": "#26a69a" if float(row['macd_hist']) >= 0 else "#ef5350"
            })

    # Generate strategy signal markers: SuperTrend + 100 SMA
    strategy_signals = []
    st_trend = enriched.get('supertrend_trend')
    sma100_ser = enriched.get('sma_100')
    close_ser = enriched.get('close')
    if st_trend is not None and sma100_ser is not None and close_ser is not None:
        enriched_dates = pd.to_datetime(enriched['date']).dt.strftime('%Y-%m-%d').values
        for i in range(1, len(enriched)):
            t_str = str(enriched_dates[i])
            if st_trend.iloc[i] == 1 and st_trend.iloc[i-1] == -1 and close_ser.iloc[i] > sma100_ser.iloc[i]:
                strategy_signals.append({
                    "time": t_str,
                    "position": "belowBar",
                    "color": "#10b981",
                    "shape": "arrowUp",
                    "text": "BUY"
                })
            elif st_trend.iloc[i] == -1 and st_trend.iloc[i-1] == 1:
                strategy_signals.append({
                    "time": t_str,
                    "position": "aboveBar",
                    "color": "#ef4444",
                    "shape": "arrowDown",
                    "text": "SELL"
                })

    renko_bricks = []
    if chart_type == "renko":
        renko_bricks = chart_converter.to_renko(df)

    return {
        "symbol": symbol,
        "chart_type": chart_type,
        "total_bars": len(candles),
        "latest": {
            "close": candles[-1]['close'],
            "open": candles[-1]['open'],
            "high": candles[-1]['high'],
            "low": candles[-1]['low'],
            "volume": volume_series[-1]['value'],
            "change_pct": round(((candles[-1]['close'] - candles[-2]['close']) / candles[-2]['close']) * 100.0, 2) if len(candles) > 1 else 0.0
        },
        "candles": candles,
        "volume": volume_series,
        "delivery": delivery_series,
        "indicators": {
            "ema_9": ema_9,
            "ema_21": ema_21,
            "ema_50": ema_50,
            "sma_100": sma_100,
            "ema_200": ema_200,
            "supertrend": supertrend_series,
            "bb_upper": bb_upper,
            "bb_lower": bb_lower,
            "rsi": rsi_series,
            "macd": macd_series,
            "macd_signal": macd_signal_series,
            "macd_hist": macd_hist_series
        },
        "strategy_signals": strategy_signals,
        "renko_bricks": renko_bricks
    }

@app.post("/api/backtest/run")
def run_backtest(req: BacktestRequest):
    """Executes single stock or basket backtest"""
    engine = backtest_engine
    engine.initial_capital = req.initial_capital
    engine.max_positions = req.max_positions
    engine.risk_per_trade_pct = req.risk_per_trade_pct
    engine.stop_loss_pct = req.stop_loss_pct
    engine.take_profit_pct = req.take_profit_pct
    engine.trailing_stop_pct = req.trailing_stop_pct
    engine.slippage_pct = req.slippage_pct / 100.0
    engine.brokerage_pct = req.brokerage_pct / 100.0
    engine.execution_timing = req.execution_timing
    engine.compounding = req.compounding
    engine.partial_tp_pct = req.partial_tp_pct
    engine.partial_tp_ratio = req.partial_tp_ratio
    engine.breakeven_on_partial = req.breakeven_on_partial
    engine.regime_filter = req.regime_filter
    engine.regime_index_symbol = req.regime_index_symbol
    engine.regime_rule = req.regime_rule

    try:
        if req.mode == "single":
            if not req.symbol:
                raise HTTPException(status_code=400, detail="Symbol must be specified for single mode")
            result = engine.run_single_stock(
                symbol=req.symbol,
                strategy_code=req.strategy_code,
                start_date=req.start_date,
                end_date=req.end_date
            )
        else: # basket mode
            if req.custom_symbols:
                symbols = req.custom_symbols
            elif req.universe in POPULAR_UNIVERSES:
                symbols = POPULAR_UNIVERSES[req.universe]
            else:
                symbols = NIFTY_50_SYMBOLS

            result = engine.run_basket(
                symbols=symbols,
                strategy_code=req.strategy_code,
                start_date=req.start_date,
                end_date=req.end_date
            )
            
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/screener/regime")
def get_screener_regime(
    benchmark_symbol: str = Query("^NSEI"),
    regime_rule: str = Query("sma_200")
):
    """Fetch real-time market regime status for the screener benchmark index"""
    return screener.get_market_regime(benchmark_symbol, regime_rule)

@app.post("/api/screener/scan")
def run_screener(req: ScreenerRequest):
    """Scan universe based on selected preset or custom formula with optional market regime cash defense"""
    symbols = POPULAR_UNIVERSES.get(req.universe, NIFTY_50_SYMBOLS)
    results = screener.scan_universe(
        symbols=symbols,
        scan_type=req.scan_type,
        custom_formula=req.custom_formula,
        lookback_days=req.lookback_days,
        signal_filter=req.signal_filter,
        regime_filter=req.regime_filter,
        regime_index_symbol=req.regime_index_symbol,
        regime_rule=req.regime_rule
    )
    regime_info = screener.get_market_regime(req.regime_index_symbol, req.regime_rule) if req.regime_filter else None
    vetoed_count = sum(1 for r in results if r.get('is_regime_vetoed', False))

    return {
        "universe": req.universe,
        "scan_type": req.scan_type,
        "lookback_days": req.lookback_days,
        "signal_filter": req.signal_filter,
        "scanned_count": len(symbols),
        "match_count": len(results),
        "results": results,
        "regime": regime_info,
        "regime_filter_enabled": req.regime_filter,
        "regime_vetoed_count": vetoed_count
    }

# ==========================================
# Strategy & Basket Optimization Endpoints
# ==========================================
@app.post("/api/optimize/start")
def start_optimization(req: OptimizeStartRequest):
    """Start or resume background Optuna optimization for strategy + basket"""
    try:
        strategy_optimizer.start_optimization(
            strategy_name=req.strategy_name,
            universe=req.universe,
            strategy_code=req.strategy_code,
            target_trials=req.target_trials,
            target_metric=req.target_metric,
            initial_capital=req.initial_capital,
            execution_timing=req.execution_timing,
            compounding=req.compounding,
            regime_filter=req.regime_filter,
            regime_index_symbol=req.regime_index_symbol,
            regime_rule=req.regime_rule,
            param_ranges=req.param_ranges,
            start_date=req.start_date,
            end_date=req.end_date
        )
        return {"status": "started", "message": f"Optimization started for {req.strategy_name} on {req.universe}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/optimize/pause")
def pause_optimization():
    """Safely pause optimization; current trial commits to SQLite checkpoint"""
    try:
        res = strategy_optimizer.pause_optimization()
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/optimize/resume")
def resume_optimization(req: Optional[OptimizeStartRequest] = None):
    """Resume optimization from SQLite checkpoint"""
    try:
        if req:
            res = strategy_optimizer.resume_optimization(
                strategy_name=req.strategy_name,
                universe=req.universe,
                strategy_code=req.strategy_code,
                execution_timing=req.execution_timing,
                regime_filter=req.regime_filter,
                regime_index_symbol=req.regime_index_symbol,
                regime_rule=req.regime_rule
            )
        else:
            res = strategy_optimizer.resume_optimization()
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/optimize/status")
def get_optimization_status(
    strategy_name: Optional[str] = Query(None),
    universe: Optional[str] = Query(None),
    regime_filter: Optional[bool] = Query(False),
    regime_rule: Optional[str] = Query("sma_200")
):
    """Live status, trial progress, and current best parameters"""
    return strategy_optimizer.get_status(strategy_name, universe, regime_filter, regime_rule)

@app.post("/api/optimize/reset")
def reset_optimization(req: OptimizeActionRequest):
    """Reset persistent study for strategy + universe"""
    return strategy_optimizer.reset_study(
        req.strategy_name,
        req.universe,
        regime_filter=req.regime_filter or False,
        regime_rule=req.regime_rule or "sma_200"
    )

@app.post("/api/optimize/apply")
def apply_optimization(req: OptimizeActionRequest):
    """Persist best trial parameters to DuckDB and JSON preset profile"""
    try:
        saved_profile = strategy_optimizer.apply_best_profile(
            req.strategy_name,
            req.universe,
            regime_filter=req.regime_filter or False,
            regime_rule=req.regime_rule or "sma_200"
        )
        return {
            "status": "applied",
            "message": f"Optimal parameters saved for {req.strategy_name} on {req.universe}",
            "profile": saved_profile
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==========================================
# Strategy & Basket Presets Management
# ==========================================
@app.get("/api/presets/profile")
def get_preset_profile(strategy_name: str = Query(...), universe: str = Query(...)):
    """Fetch saved preset for strategy + universe pair"""
    profile = db.get_strategy_basket_profile(strategy_name, universe)
    return {"profile": profile}

@app.post("/api/presets/save")
def save_preset_profile(req: StrategyPresetSaveRequest):
    """Manual save/update preset for strategy + universe"""
    profile_dict = req.dict()
    db.save_strategy_basket_profile(profile_dict)
    return {"status": "saved", "profile": profile_dict}

@app.get("/api/presets/all")
def get_all_preset_profiles():
    """List all saved strategy + basket profiles"""
    return {"profiles": db.list_strategy_basket_profiles()}

# ==========================================
# Real-World Strategy Portfolio & EoD Exit Scanner Endpoints
# ==========================================
@app.get("/api/portfolio")
def get_portfolio(
    status: Optional[str] = Query("OPEN"),
    strategy_name: Optional[str] = Query(None)
):
    """
    Fetch portfolio positions (OPEN or CLOSED).
    For OPEN positions, enriches with latest close price, day change, unrealized PnL, and current value.
    For CLOSED positions, computes realized PnL and return %.
    """
    positions = db.get_portfolio_positions(status=status, strategy_name=strategy_name)
    enriched_positions = []
    
    for pos in positions:
        p = dict(pos)
        sym = p["symbol"]
        qty = int(p["qty"])
        buy_px = float(p["buy_price"])
        invested = round(buy_px * qty, 2)
        p["invested_value"] = invested

        if p.get("status") == "OPEN":
            df = db.get_symbol_data(sym)
            if not df.empty and len(df) >= 2:
                last_c = float(df['close'].iloc[-1])
                prev_c = float(df['close'].iloc[-2])
                p["current_price"] = last_c
                p["latest_date"] = str(df['date'].iloc[-1])[:10]
                p["day_change_pct"] = round(((last_c - prev_c) / prev_c) * 100.0, 2)
                p["current_value"] = round(last_c * qty, 2)
                p["unrealized_pnl"] = round((last_c - buy_px) * qty, 2)
                p["unrealized_pnl_pct"] = round(((last_c - buy_px) / buy_px) * 100.0, 2)
            else:
                p["current_price"] = buy_px
                p["latest_date"] = None
                p["day_change_pct"] = 0.0
                p["current_value"] = invested
                p["unrealized_pnl"] = 0.0
                p["unrealized_pnl_pct"] = 0.0
        else: # CLOSED
            exit_px = float(p.get("exit_price") or buy_px)
            realized_pnl = round((exit_px - buy_px) * qty, 2)
            p["realized_pnl"] = realized_pnl
            p["realized_pnl_pct"] = round(((exit_px - buy_px) / buy_px) * 100.0, 2)
            p["exit_value"] = round(exit_px * qty, 2)

        enriched_positions.append(p)

    return {"positions": enriched_positions, "count": len(enriched_positions)}

@app.get("/api/portfolio/summary")
def get_portfolio_summary():
    """
    High-level dashboard summary of portfolio holdings, PnL, active strategies and sell alert count.
    """
    open_positions = db.get_portfolio_positions(status="OPEN")
    closed_positions = db.get_portfolio_positions(status="CLOSED")
    strategies = db.get_portfolio_strategies()

    total_invested = 0.0
    total_current_val = 0.0
    for pos in open_positions:
        qty = int(pos["qty"])
        buy_px = float(pos["buy_price"])
        invested = buy_px * qty
        total_invested += invested
        
        df = db.get_symbol_data(pos["symbol"])
        if not df.empty:
            cur_px = float(df['close'].iloc[-1])
            total_current_val += cur_px * qty
        else:
            total_current_val += invested

    total_realized_pnl = 0.0
    for pos in closed_positions:
        qty = int(pos["qty"])
        buy_px = float(pos["buy_price"])
        exit_px = float(pos.get("exit_price") or buy_px)
        total_realized_pnl += (exit_px - buy_px) * qty

    total_unrealized_pnl = total_current_val - total_invested
    total_unrealized_pct = round((total_unrealized_pnl / total_invested * 100.0), 2) if total_invested > 0 else 0.0

    # Quick scan for sell alerts
    scan_res = portfolio_scanner.scan_portfolio()
    sell_alerts_count = scan_res.get("sell_tomorrow_count", 0)

    return {
        "total_invested": round(total_invested, 2),
        "total_current_value": round(total_current_val, 2),
        "total_unrealized_pnl": round(total_unrealized_pnl, 2),
        "total_unrealized_pnl_pct": total_unrealized_pct,
        "total_realized_pnl": round(total_realized_pnl, 2),
        "open_positions_count": len(open_positions),
        "closed_positions_count": len(closed_positions),
        "strategies_count": len(strategies),
        "active_strategies": strategies,
        "sell_tomorrow_alerts_count": sell_alerts_count,
        "latest_market_session": scan_res.get("latest_market_session")
    }

@app.get("/api/portfolio/strategies")
def get_portfolio_strategies():
    """
    Returns user portfolio strategies and preset strategies list.
    """
    portfolio_strats = db.get_portfolio_strategies()
    all_presets = list(PRESET_STRATEGIES.keys())
    combined = sorted(list(set(portfolio_strats + all_presets)))
    return {
        "portfolio_strategies": portfolio_strats,
        "preset_strategies": all_presets,
        "all_strategies": combined
    }

@app.post("/api/portfolio/positions")
def add_portfolio_position(req: PortfolioPositionCreateRequest):
    """
    Add a new real-world stock trade to the portfolio linked to a strategy.
    """
    strat_code = req.strategy_code
    if not strat_code:
        strat_code = PRESET_STRATEGIES.get(req.strategy_name)

    sym = req.symbol.upper().strip()
    existing = db.get_symbol_data(sym)
    if existing.empty:
        try:
            yf_feed.fetch_symbol_history(sym, period="2y")
        except Exception:
            pass

    pos_id = db.add_portfolio_position({
        "symbol": sym,
        "strategy_name": req.strategy_name,
        "strategy_code": strat_code,
        "buy_date": req.buy_date,
        "buy_price": req.buy_price,
        "qty": req.qty,
        "stop_loss_pct": req.stop_loss_pct,
        "take_profit_pct": req.take_profit_pct,
        "trailing_stop_pct": req.trailing_stop_pct,
        "status": "OPEN",
        "notes": req.notes
    })
    return {"status": "created", "position_id": pos_id}

@app.get("/api/portfolio/positions/{pos_id}")
def get_portfolio_position(pos_id: str):
    """
    Get a single portfolio position by ID.
    """
    pos = db.get_portfolio_position(pos_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")
    return {"position": pos}

@app.put("/api/portfolio/positions/{pos_id}")
def update_portfolio_position(pos_id: str, req: PortfolioPositionUpdateRequest):
    """
    Update position details.
    """
    updates = req.dict(exclude_unset=True)
    if not updates:
        return {"status": "no_changes"}
    
    if "strategy_name" in updates and "strategy_code" not in updates:
        updates["strategy_code"] = PRESET_STRATEGIES.get(updates["strategy_name"])

    success = db.update_portfolio_position(pos_id, updates)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to update position")
    return {"status": "updated", "position_id": pos_id}

@app.delete("/api/portfolio/positions/{pos_id}")
def delete_portfolio_position(pos_id: str):
    """
    Delete a position permanently.
    """
    success = db.delete_portfolio_position(pos_id)
    return {"status": "deleted" if success else "failed", "position_id": pos_id}

@app.post("/api/portfolio/positions/{pos_id}/close")
def close_portfolio_position(pos_id: str, req: PortfolioPositionCloseRequest):
    """
    Close an open position (record exit).
    """
    pos = db.get_portfolio_position(pos_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")
    
    db.close_portfolio_position(
        pos_id=pos_id,
        exit_date=req.exit_date,
        exit_price=req.exit_price,
        exit_reason=req.exit_reason
    )
    return {"status": "closed", "position_id": pos_id}

@app.post("/api/portfolio/eod-scan")
def run_portfolio_eod_scan(req: Optional[PortfolioEodScanRequest] = None):
    """
    Execute End-of-Day Exit Scan across open portfolio positions.
    Evaluates each position against its specific purchase strategy rule,
    Stop Loss %, Take Profit %, and Trailing Stop % to determine if it should
    be SOLD tomorrow at market open (09:15 AM) or held.
    """
    strat = req.strategy_name if req else None
    results = portfolio_scanner.scan_portfolio(strategy_name=strat)
    return results

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
