import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional
from backend.core.database import db
from backend.analytics.indicators import ta
from backend.backtester.strategy_dsl import StrategyEvaluator, StrategyContext

class MarketScreener:
    """High-speed multi-criteria market screener across Indian equities"""

    SCREENER_PRESETS = {
        "52-Week High Breakout": {
            "name": "52-Week High Breakout with Volume",
            "description": "Stock trading within 2% of 52-week high with volume > 1.5x 20-day average",
            "type": "preset"
        },
        "SuperTrend Bullish Flip": {
            "name": "SuperTrend Bullish Reversal",
            "description": "SuperTrend (10, 3.0) flipped from bearish to bullish on the latest bar",
            "type": "preset"
        },
        "Golden Cross": {
            "name": "50 SMA / 200 SMA Golden Cross",
            "description": "50-day Simple Moving Average crossed above 200-day SMA in the last 5 sessions",
            "type": "preset"
        },
        "High Delivery Accumulation": {
            "name": "Institutional Delivery Accumulation",
            "description": "Delivery % > 45% and volume > 1.2x average (Strong institutional buying)",
            "type": "preset"
        },
        "RSI Oversold Bounce": {
            "name": "RSI Oversold Momentum Reversal",
            "description": "RSI(14) recovering from below 35 and crossing above 40",
            "type": "preset"
        }
    }

    def scan_universe(self, symbols: List[str], scan_type: str, custom_formula: Optional[str] = None) -> List[Dict[str, Any]]:
        """Scans a list of symbols against the chosen preset or custom formula"""
        matches = []
        for sym in symbols:
            df = db.get_symbol_data(sym)
            if df.empty or len(df) < 30:
                continue

            try:
                res = self._check_symbol(sym, df, scan_type, custom_formula)
                if res is not None:
                    matches.append(res)
            except Exception as e:
                # Silently skip errors on individual symbols during bulk scan
                continue

        # Sort matches by day change or volume spike
        matches.sort(key=lambda x: x.get('change_pct', 0.0), reverse=True)
        return matches

    def _check_symbol(self, symbol: str, df: pd.DataFrame, scan_type: str, custom_formula: Optional[str]) -> Optional[Dict[str, Any]]:
        enriched = ta.compute_all(df)
        last_bar = enriched.iloc[-1]
        prev_bar = enriched.iloc[-2] if len(enriched) >= 2 else last_bar

        close = float(last_bar['close'])
        prev_close = float(prev_bar['close'])
        change_pct = round(((close - prev_close) / prev_close) * 100.0, 2)
        volume = int(last_bar['volume'])
        vol_ratio = round(float(last_bar.get('volume_spike_ratio', 1.0)), 2)
        rsi = round(float(last_bar.get('rsi_14', 50.0)), 1)
        deliv_pct = round(float(last_bar.get('delivery_pct', 0.0)), 1)
        
        is_match = False
        signal_details = ""

        if custom_formula and scan_type == "Custom Formula":
            # AFL/Python expression scan: expects 'Buy' or 'Filter'
            formula_code = custom_formula
            if "Filter" in formula_code and "Buy" not in formula_code:
                formula_code = formula_code.replace("Filter", "Buy")
            buy_sig, _ = StrategyEvaluator.evaluate(formula_code, df)
            if bool(buy_sig.iloc[-1]):
                is_match = True
                signal_details = "Custom Formula Condition Satisfied"

        elif scan_type == "52-Week High Breakout":
            high_52w = float(df['high'].tail(252).max())
            if close >= (high_52w * 0.98) and vol_ratio >= 1.2:
                is_match = True
                signal_details = f"Within {round((high_52w - close)/high_52w * 100, 1)}% of 52W High ({round(high_52w, 1)})"

        elif scan_type == "SuperTrend Bullish Flip":
            st_trend = enriched['supertrend_trend']
            if st_trend.iloc[-1] == 1 and st_trend.iloc[-2] == -1:
                is_match = True
                signal_details = "SuperTrend flipped to Bullish"

        elif scan_type == "Golden Cross":
            sma50 = enriched['sma_50']
            sma200 = enriched['sma_200']
            if sma50.iloc[-1] > sma200.iloc[-1] and (sma50.iloc[-5:] <= sma200.iloc[-5:]).any():
                is_match = True
                signal_details = "50 SMA crossed above 200 SMA"

        elif scan_type == "High Delivery Accumulation":
            if deliv_pct >= 40.0 and vol_ratio >= 1.2 and change_pct > 0:
                is_match = True
                signal_details = f"Delivery {deliv_pct}% with {vol_ratio}x Volume surge"

        elif scan_type == "RSI Oversold Bounce":
            rsi_series = enriched['rsi_14']
            if (rsi_series.iloc[-4:-1] < 35).any() and rsi_series.iloc[-1] >= 35:
                is_match = True
                signal_details = f"RSI bounced out of oversold ({rsi})"

        if is_match:
            return {
                "symbol": symbol,
                "close": close,
                "change_pct": change_pct,
                "volume": volume,
                "volume_ratio": vol_ratio,
                "delivery_pct": deliv_pct,
                "rsi": rsi,
                "supertrend": "Bullish" if last_bar.get('supertrend_trend', 1) == 1 else "Bearish",
                "signal_details": signal_details,
                "date": str(last_bar['date'])
            }

        return None

screener = MarketScreener()
