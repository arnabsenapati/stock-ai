import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional
from backend.core.database import db
from backend.analytics.indicators import ta
from backend.backtester.strategy_dsl import StrategyEvaluator, StrategyContext

class MarketScreener:
    """High-speed multi-criteria market screener across Indian equities"""

    SCREENER_PRESETS = {
        "SuperTrend + 100 SMA Trend Rider": {
            "name": "SuperTrend + 100 SMA Trend Rider (Buy & Sell)",
            "description": "BUY when SuperTrend turns bullish above 100 SMA; SELL when SuperTrend turns bearish",
            "type": "strategy_preset"
        },
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

    def scan_universe(
        self,
        symbols: List[str],
        scan_type: str,
        custom_formula: Optional[str] = None,
        lookback_days: int = 3,
        signal_filter: str = "ALL"
    ) -> List[Dict[str, Any]]:
        """Scans a list of symbols against the chosen preset or custom formula"""
        matches = []
        for sym in symbols:
            df = db.get_symbol_data(sym)
            if df.empty or len(df) < 30:
                continue

            try:
                res = self._check_symbol(
                    symbol=sym,
                    df=df,
                    scan_type=scan_type,
                    custom_formula=custom_formula,
                    lookback_days=lookback_days,
                    signal_filter=signal_filter
                )
                if res is not None:
                    matches.append(res)
            except Exception as e:
                # Silently skip errors on individual symbols during bulk scan
                continue

        # Sort matches: BUY first, then Today signals first, then by day change
        matches.sort(
            key=lambda x: (
                0 if x.get('signal_type') == 'BUY' else 1,
                0 if x.get('signal_timing') == 'Today' else 1,
                -x.get('change_pct', 0.0)
            )
        )
        return matches

    def _check_symbol(
        self,
        symbol: str,
        df: pd.DataFrame,
        scan_type: str,
        custom_formula: Optional[str] = None,
        lookback_days: int = 3,
        signal_filter: str = "ALL"
    ) -> Optional[Dict[str, Any]]:
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
        st_trend = enriched['supertrend_trend']
        st_val = round(float(last_bar.get('supertrend', close)), 2)
        sma100_val = round(float(enriched.get('sma_100', pd.Series(close, index=df.index)).iloc[-1]), 2)
        dist_sma100 = round(((close - sma100_val) / sma100_val) * 100.0, 2) if sma100_val > 0 else 0.0

        is_match = False
        signal_type = "NEUTRAL"
        signal_timing = "Today"
        signal_details = ""
        signal_date = str(last_bar['date'])[:10]

        # 1. SuperTrend + 100 SMA Trend Rider (Buy & Sell Signals)
        if scan_type in ["SuperTrend + 100 SMA Trend Rider", "SuperTrend + 100 SMA Trend Rider (Buy & Sell)"]:
            c = enriched['close']
            sma100 = enriched['sma_100']
            
            # Active Position State scan
            if lookback_days >= 900:
                if st_trend.iloc[-1] == 1 and c.iloc[-1] > sma100.iloc[-1]:
                    is_match = True
                    signal_type = "BUY"
                    signal_timing = "Active Bullish"
                    signal_details = f"Riding Bullish Trend: Close (Rs. {close:.1f}) is {dist_sma100:+.1f}% above 100 SMA (Rs. {sma100_val})"
                elif st_trend.iloc[-1] == -1:
                    is_match = True
                    signal_type = "SELL"
                    signal_timing = "Active Bearish"
                    signal_details = f"Bearish / Flat: SuperTrend Bearish (Rs. {st_val}) - Out of market / Cash"
            else:
                max_lb = min(lookback_days, len(enriched) - 2)
                for i in range(1, max_lb + 1):
                    idx = -i
                    prev_idx = -i - 1
                    days_ago = i - 1
                    timing = "Today" if days_ago == 0 else f"{days_ago}d ago"
                    
                    # BUY: SuperTrend flipped to Bullish AND price is above 100 SMA
                    if st_trend.iloc[idx] == 1 and st_trend.iloc[prev_idx] == -1 and c.iloc[idx] > sma100.iloc[idx]:
                        is_match = True
                        signal_type = "BUY"
                        signal_timing = timing
                        signal_date = str(enriched['date'].iloc[idx])[:10]
                        trigger_px = round(float(c.iloc[idx]), 1)
                        trigger_sma = round(float(sma100.iloc[idx]), 1)
                        signal_details = f"BUY Signal ({timing}): SuperTrend turned Bullish at Rs. {trigger_px} above 100 SMA (Rs. {trigger_sma})"
                        break
                    
                    # SELL: SuperTrend flipped to Bearish (Exit / Cut Loss)
                    elif st_trend.iloc[idx] == -1 and st_trend.iloc[prev_idx] == 1:
                        is_match = True
                        signal_type = "SELL"
                        signal_timing = timing
                        signal_date = str(enriched['date'].iloc[idx])[:10]
                        trigger_px = round(float(c.iloc[idx]), 1)
                        signal_details = f"SELL Signal ({timing}): SuperTrend flipped Bearish at Rs. {trigger_px} (Exit Position)"
                        break

        # 2. Custom Strategy Formula (supports both Buy and Sell)
        elif custom_formula and scan_type == "Custom Formula":
            formula_code = custom_formula
            if "Filter" in formula_code and "Buy" not in formula_code:
                formula_code = formula_code.replace("Filter", "Buy")
            buy_sig, sell_sig = StrategyEvaluator.evaluate(formula_code, df)
            
            max_lb = min(lookback_days, len(enriched) - 2) if lookback_days < 900 else 1
            for i in range(1, max_lb + 1):
                idx = -i
                days_ago = i - 1
                timing = "Today" if days_ago == 0 else f"{days_ago}d ago"
                if bool(buy_sig.iloc[idx]):
                    is_match = True
                    signal_type = "BUY"
                    signal_timing = timing
                    signal_date = str(enriched['date'].iloc[idx])[:10]
                    signal_details = f"BUY Trigger ({timing}): Custom strategy Buy rule satisfied"
                    break
                elif bool(sell_sig.iloc[idx]):
                    is_match = True
                    signal_type = "SELL"
                    signal_timing = timing
                    signal_date = str(enriched['date'].iloc[idx])[:10]
                    signal_details = f"SELL Trigger ({timing}): Custom strategy Sell rule satisfied"
                    break

        # 3. Standard Bullish Presets
        elif scan_type == "52-Week High Breakout":
            high_52w = float(df['high'].tail(252).max())
            if close >= (high_52w * 0.98) and vol_ratio >= 1.2:
                is_match = True
                signal_type = "BUY"
                signal_details = f"Within {round((high_52w - close)/high_52w * 100, 1)}% of 52W High ({round(high_52w, 1)})"

        elif scan_type == "SuperTrend Bullish Flip":
            if st_trend.iloc[-1] == 1 and st_trend.iloc[-2] == -1:
                is_match = True
                signal_type = "BUY"
                signal_details = "SuperTrend flipped to Bullish on latest bar"

        elif scan_type == "Golden Cross":
            sma50 = enriched['sma_50']
            sma200 = enriched['sma_200']
            if sma50.iloc[-1] > sma200.iloc[-1] and (sma50.iloc[-5:] <= sma200.iloc[-5:]).any():
                is_match = True
                signal_type = "BUY"
                signal_details = "50 SMA crossed above 200 SMA"

        elif scan_type == "High Delivery Accumulation":
            if deliv_pct >= 40.0 and vol_ratio >= 1.2 and change_pct > 0:
                is_match = True
                signal_type = "BUY"
                signal_details = f"Delivery {deliv_pct}% with {vol_ratio}x Volume surge"

        elif scan_type == "RSI Oversold Bounce":
            rsi_series = enriched['rsi_14']
            if (rsi_series.iloc[-4:-1] < 35).any() and rsi_series.iloc[-1] >= 35:
                is_match = True
                signal_type = "BUY"
                signal_details = f"RSI bounced out of oversold ({rsi})"

        # Signal Type Filter (ALL, BUY, SELL)
        if is_match:
            if signal_filter.upper() == "BUY" and signal_type != "BUY":
                return None
            if signal_filter.upper() == "SELL" and signal_type != "SELL":
                return None

            return {
                "symbol": symbol,
                "close": close,
                "change_pct": change_pct,
                "volume": volume,
                "volume_ratio": vol_ratio,
                "delivery_pct": deliv_pct,
                "rsi": rsi,
                "supertrend": "Bullish" if last_bar.get('supertrend_trend', 1) == 1 else "Bearish",
                "supertrend_val": st_val,
                "sma_100": sma100_val,
                "dist_sma100_pct": dist_sma100,
                "signal_type": signal_type,
                "signal_timing": signal_timing,
                "signal_date": signal_date,
                "signal_details": signal_details,
                "date": str(last_bar['date'])[:10]
            }

        return None

screener = MarketScreener()
