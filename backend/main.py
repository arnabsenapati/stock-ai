from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date, datetime, timedelta
import pandas as pd
import numpy as np

from backend.core.config import (
    NIFTY_50_SYMBOLS, NIFTY_BANK_SYMBOLS, NIFTY_IT_SYMBOLS, 
    BENCHMARKS, POPULAR_UNIVERSES
)
from backend.core.database import db
from backend.data.yfinance_feed import yf_feed
from backend.data.bhavcopy import bhavcopy_hub
from backend.analytics.indicators import ta
from backend.analytics.chart_types import chart_converter
from backend.backtester.engine import backtest_engine
from backend.backtester.strategy_dsl import PRESET_STRATEGIES
from backend.screener.scanner import screener
from backend.backtester.optimizer import strategy_optimizer

app = FastAPI(
    title="AmiBroker-Class Indian EOD Stock Terminal",
    description="High-performance End-of-Day Indian Market Analytics, Multi-Pane Charting & Backtesting Platform",
    version="1.0.0"
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

class BacktestRequest(BaseModel):
    mode: str = "single" # "single" or "basket"
    symbol: Optional[str] = "RELIANCE"
    universe: Optional[str] = "Nifty 50"
    custom_symbols: Optional[List[str]] = None
    strategy_code: str
    initial_capital: float = 1000000.0
    risk_per_trade_pct: float = 10.0
    max_positions: int = 10
    stop_loss_pct: Optional[float] = None
    take_profit_pct: Optional[float] = None
    trailing_stop_pct: Optional[float] = None
    slippage_pct: float = 0.05
    brokerage_pct: float = 0.10
    execution_timing: str = "next_open"
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class ScreenerRequest(BaseModel):
    universe: str = "Nifty 50"
    scan_type: str = "SuperTrend + 100 SMA Trend Rider"
    custom_formula: Optional[str] = None
    lookback_days: int = 3
    signal_filter: str = "ALL"

class OptimizeStartRequest(BaseModel):
    strategy_name: str = "SuperTrend + 100 SMA Trend Rider (Optimal)"
    universe: str = "Nifty 50"
    strategy_code: str
    target_trials: int = 150
    target_metric: str = "sharpe_ratio"
    initial_capital: float = 100000.0
    execution_timing: str = "next_open"
    param_ranges: Optional[Dict[str, Any]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class OptimizeActionRequest(BaseModel):
    strategy_name: str
    universe: str

class StrategyPresetSaveRequest(BaseModel):
    strategy_name: str
    universe: str
    initial_capital: float = 100000.0
    risk_per_trade_pct: float = 10.0
    stop_loss_pct: Optional[float] = None
    take_profit_pct: Optional[float] = None
    trailing_stop_pct: Optional[float] = None
    max_positions: int = 10
    best_metric_name: Optional[str] = "sharpe_ratio"
    best_metric_value: Optional[float] = 0.0
    total_trades: Optional[int] = 0
    win_rate: Optional[float] = 0.0
    total_return_pct: Optional[float] = 0.0
    max_drawdown_pct: Optional[float] = 0.0
    sharpe_ratio: Optional[float] = 0.0
    cagr_pct: Optional[float] = 0.0

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

@app.post("/api/screener/scan")
def run_screener(req: ScreenerRequest):
    """Scan universe based on selected preset or custom formula"""
    symbols = POPULAR_UNIVERSES.get(req.universe, NIFTY_50_SYMBOLS)
    results = screener.scan_universe(
        symbols=symbols,
        scan_type=req.scan_type,
        custom_formula=req.custom_formula,
        lookback_days=req.lookback_days,
        signal_filter=req.signal_filter
    )
    return {
        "universe": req.universe,
        "scan_type": req.scan_type,
        "lookback_days": req.lookback_days,
        "signal_filter": req.signal_filter,
        "scanned_count": len(symbols),
        "match_count": len(results),
        "results": results
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
                execution_timing=req.execution_timing
            )
        else:
            res = strategy_optimizer.resume_optimization()
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/optimize/status")
def get_optimization_status(
    strategy_name: Optional[str] = Query(None),
    universe: Optional[str] = Query(None)
):
    """Live status, trial progress, and current best parameters"""
    return strategy_optimizer.get_status(strategy_name, universe)

@app.post("/api/optimize/reset")
def reset_optimization(req: OptimizeActionRequest):
    """Reset persistent study for strategy + universe"""
    return strategy_optimizer.reset_study(req.strategy_name, req.universe)

@app.post("/api/optimize/apply")
def apply_optimization(req: OptimizeActionRequest):
    """Persist best trial parameters to DuckDB and JSON preset profile"""
    try:
        saved_profile = strategy_optimizer.apply_best_profile(req.strategy_name, req.universe)
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
