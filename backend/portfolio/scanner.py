import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional
from datetime import datetime
from backend.core.database import db
from backend.analytics.indicators import ta
from backend.backtester.strategy_dsl import StrategyEvaluator, PRESET_STRATEGIES
from backend.data.yfinance_feed import yf_feed

class PortfolioScanner:
    """
    End-of-Day (EoD) Strategy Exit Scanner & Real-World Portfolio Analyzer.
    Evaluates open stock positions against the specific technical strategy 
    and risk parameters (Stop Loss, Take Profit, Trailing Stop) under which they were bought.
    Determines next-day action (SELL at open / HOLD / TAKE PROFIT / STOP LOSS).
    """

    def scan_portfolio(self, strategy_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Runs EoD exit analysis across open real-world positions.
        Optionally filters by strategy_name.
        """
        positions = db.get_portfolio_positions(status="OPEN", strategy_name=strategy_name)
        
        scanned_items: List[Dict[str, Any]] = []
        strategy_stats: Dict[str, Dict[str, Any]] = {}
        
        total_invested = 0.0
        total_current_val = 0.0
        sell_count = 0
        hold_count = 0
        latest_market_session = None

        for pos in positions:
            item = self._evaluate_position(pos)
            scanned_items.append(item)

            # Accumulate portfolio metrics
            inv = item["invested_value"]
            cur = item["current_value"]
            total_invested += inv
            total_current_val += cur

            if item["action"] == "SELL":
                sell_count += 1
            else:
                hold_count += 1

            if item.get("latest_date") and (not latest_market_session or item["latest_date"] > latest_market_session):
                latest_market_session = item["latest_date"]

            # Accumulate per-strategy breakdown
            strat = item["strategy_name"]
            if strat not in strategy_stats:
                strategy_stats[strat] = {
                    "strategy_name": strat,
                    "positions_count": 0,
                    "invested_value": 0.0,
                    "current_value": 0.0,
                    "unrealized_pnl": 0.0,
                    "unrealized_pnl_pct": 0.0,
                    "sell_tomorrow_count": 0,
                    "hold_count": 0,
                    "profitable_count": 0
                }

            s_stat = strategy_stats[strat]
            s_stat["positions_count"] += 1
            s_stat["invested_value"] += inv
            s_stat["current_value"] += cur
            s_stat["unrealized_pnl"] += item["unrealized_pnl"]
            if item["action"] == "SELL":
                s_stat["sell_tomorrow_count"] += 1
            else:
                s_stat["hold_count"] += 1
            if item["unrealized_pnl"] > 0:
                s_stat["profitable_count"] += 1

        # Finalize strategy percentage returns and win rates
        strategy_summary_list = []
        for s_name, s_data in strategy_stats.items():
            if s_data["invested_value"] > 0:
                s_data["unrealized_pnl_pct"] = round(
                    (s_data["unrealized_pnl"] / s_data["invested_value"]) * 100.0, 2
                )
            s_data["invested_value"] = round(s_data["invested_value"], 2)
            s_data["current_value"] = round(s_data["current_value"], 2)
            s_data["unrealized_pnl"] = round(s_data["unrealized_pnl"], 2)
            s_data["win_rate_pct"] = round(
                (s_data["profitable_count"] / max(s_data["positions_count"], 1)) * 100.0, 1
            )
            strategy_summary_list.append(s_data)

        # Sort positions: SELL recommendations first, then worst to best or highest PnL
        scanned_items.sort(
            key=lambda x: (
                0 if x["action"] == "SELL" else 1,
                0 if "STOP_LOSS" in x["verdict_badge"] else (1 if "STRATEGY" in x["verdict_badge"] else 2),
                -abs(x["day_change_pct"])
            )
        )

        total_unrealized_pnl = total_current_val - total_invested
        total_pnl_pct = round((total_unrealized_pnl / total_invested * 100.0), 2) if total_invested > 0 else 0.0

        return {
            "total_open_positions": len(positions),
            "total_invested": round(total_invested, 2),
            "total_current_value": round(total_current_val, 2),
            "total_unrealized_pnl": round(total_unrealized_pnl, 2),
            "total_unrealized_pnl_pct": total_pnl_pct,
            "sell_tomorrow_count": sell_count,
            "hold_count": hold_count,
            "latest_market_session": latest_market_session or str(datetime.now().date()),
            "scan_timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "strategy_filter": strategy_name or "ALL",
            "per_strategy_summary": strategy_summary_list,
            "positions": scanned_items
        }

    def _evaluate_position(self, pos: Dict[str, Any]) -> Dict[str, Any]:
        """Deep evaluation of a single position against its strategy and market conditions"""
        symbol = str(pos["symbol"]).upper().strip()
        buy_price = float(pos["buy_price"])
        qty = int(pos["qty"])
        buy_date = str(pos["buy_date"])[:10]
        strategy_name = str(pos["strategy_name"]).strip()
        strategy_code = pos.get("strategy_code") or ""
        stop_loss_pct = float(pos["stop_loss_pct"]) if pos.get("stop_loss_pct") is not None else None
        take_profit_pct = float(pos["take_profit_pct"]) if pos.get("take_profit_pct") is not None else None
        trailing_stop_pct = float(pos["trailing_stop_pct"]) if pos.get("trailing_stop_pct") is not None else None

        # 1. Fetch OHLCV data for symbol
        df = db.get_symbol_data(symbol)
        if df.empty or len(df) < 5:
            # Fallback auto-fetch if missing from local cache
            try:
                yf_feed.fetch_symbol_history(symbol, period="2y")
                df = db.get_symbol_data(symbol)
            except Exception:
                pass

        if df.empty or len(df) < 2:
            # Fallback if no market data is obtainable
            return self._build_fallback_result(pos, "Market data unavailable for symbol")

        # 2. Indicators & Latest Session
        enriched = ta.compute_all(df)
        last_bar = enriched.iloc[-1]
        prev_bar = enriched.iloc[-2]

        latest_date = str(last_bar["date"])[:10]
        current_price = float(last_bar["close"])
        prev_close = float(prev_bar["close"])
        day_change_pct = round(((current_price - prev_close) / prev_close) * 100.0, 2)
        day_low = float(last_bar["low"])
        day_high = float(last_bar["high"])

        invested_value = round(buy_price * qty, 2)
        current_value = round(current_price * qty, 2)
        unrealized_pnl = round(current_value - invested_value, 2)
        unrealized_pnl_pct = round(((current_price - buy_price) / buy_price) * 100.0, 2)

        # Holding duration
        try:
            d_buy = pd.to_datetime(buy_date).date()
            d_latest = pd.to_datetime(latest_date).date()
            holding_days = (d_latest - d_buy).days
        except Exception:
            holding_days = 0

        # Peak high since purchase for trailing stop
        df_since_entry = df[pd.to_datetime(df['date']).dt.date >= pd.to_datetime(buy_date).date()]
        if not df_since_entry.empty:
            peak_high_since_buy = float(df_since_entry['high'].max())
        else:
            peak_high_since_buy = max(buy_price, day_high)

        # 3. Strategy Code Resolution
        if not strategy_code.strip():
            strategy_code = PRESET_STRATEGIES.get(strategy_name, "")
            if not strategy_code:
                # Case-insensitive or partial preset lookup
                for p_name, p_code in PRESET_STRATEGIES.items():
                    if p_name.lower().strip() == strategy_name.lower().strip() or strategy_name.lower() in p_name.lower():
                        strategy_code = p_code
                        break

        # 4. Strategy Rule Evaluation
        strategy_sell_triggered = False
        strategy_sell_details = ""
        strategy_evaluated = False

        if strategy_code.strip():
            try:
                buy_sig, sell_sig = StrategyEvaluator.evaluate(strategy_code, df)
                strategy_evaluated = True
                
                # Check latest bar (session close)
                if bool(sell_sig.iloc[-1]):
                    strategy_sell_triggered = True
                    strategy_sell_details = f"Strategy '{strategy_name}' exit rule triggered on session close"
                elif len(sell_sig) >= 2 and bool(sell_sig.iloc[-2]) and not bool(buy_sig.iloc[-1]):
                    # Yesterday triggered and today no re-buy
                    strategy_sell_triggered = True
                    strategy_sell_details = f"Strategy '{strategy_name}' exit signal confirmed"
            except Exception as e:
                strategy_sell_details = f"Evaluation note: {str(e)}"

        # 5. Technical Context
        st_trend = int(last_bar.get("supertrend_trend", 1))
        st_val = round(float(last_bar.get("supertrend", current_price)), 2)
        rsi_val = round(float(last_bar.get("rsi_14", 50.0)), 1)
        sma_100_val = round(float(enriched.get("sma_100", pd.Series(current_price, index=df.index)).iloc[-1]), 2)
        ema_50_val = round(float(enriched.get("ema_50", pd.Series(current_price, index=df.index)).iloc[-1]), 2)
        ema_200_val = round(float(enriched.get("ema_200", pd.Series(current_price, index=df.index)).iloc[-1]), 2)
        delivery_pct = round(float(last_bar.get("delivery_pct", 0.0)), 1)

        # 6. Risk Rule Checks
        stop_loss_hit = False
        stop_loss_price = None
        if stop_loss_pct is not None:
            stop_loss_price = round(buy_price * (1.0 - (stop_loss_pct / 100.0)), 2)
            if current_price <= stop_loss_price or day_low <= stop_loss_price:
                stop_loss_hit = True

        take_profit_hit = False
        take_profit_price = None
        if take_profit_pct is not None:
            take_profit_price = round(buy_price * (1.0 + (take_profit_pct / 100.0)), 2)
            if current_price >= take_profit_price or day_high >= take_profit_price:
                take_profit_hit = True

        trailing_stop_hit = False
        trailing_stop_price = None
        if trailing_stop_pct is not None:
            trailing_stop_price = round(peak_high_since_buy * (1.0 - (trailing_stop_pct / 100.0)), 2)
            if current_price <= trailing_stop_price:
                trailing_stop_hit = True

        # 7. Decision Synthesis (Priority: Stop Loss > Strategy Sell > Trailing Stop > Take Profit > Hold)
        action = "HOLD"
        verdict_badge = "HOLD_HEALTHY"
        recommendation = "🟢 HOLD & RIDE TREND"
        action_urgency = "LOW"
        trigger_reason = "Holding criteria intact. No exit signals triggered."

        if stop_loss_hit:
            action = "SELL"
            verdict_badge = "SELL_STOP_LOSS"
            action_urgency = "CRITICAL"
            recommendation = "🚨 SELL TOMORROW AT OPEN (09:15 AM)"
            trigger_reason = (
                f"Stop Loss Triggered: Price (Rs. {current_price:.2f}) touched stop loss level "
                f"Rs. {stop_loss_price:.2f} (-{stop_loss_pct}% from entry Rs. {buy_price:.2f})"
            )
        elif strategy_sell_triggered:
            action = "SELL"
            verdict_badge = "SELL_STRATEGY"
            action_urgency = "HIGH"
            recommendation = "🚨 SELL TOMORROW AT OPEN (09:15 AM)"
            trigger_reason = (
                f"Strategy Exit Triggered: {strategy_sell_details}. "
                f"Conditions violated (SuperTrend / MA crossover / Momentum flip)."
            )
        elif trailing_stop_hit:
            action = "SELL"
            verdict_badge = "SELL_TRAILING_STOP"
            action_urgency = "HIGH"
            recommendation = "🚨 SELL TOMORROW AT OPEN (09:15 AM)"
            trigger_reason = (
                f"Trailing Stop Triggered: Price fell -{trailing_stop_pct}% from peak high "
                f"Rs. {peak_high_since_buy:.2f} to Rs. {current_price:.2f} (Trailing stop: Rs. {trailing_stop_price:.2f})"
            )
        elif take_profit_hit:
            action = "SELL"
            verdict_badge = "SELL_TAKE_PROFIT"
            action_urgency = "HIGH"
            recommendation = "🎯 BOOK PROFIT TOMORROW AT OPEN"
            trigger_reason = (
                f"Target Profit Achieved: Gain of {unrealized_pnl_pct:+.1f}% hit target of "
                f"+{take_profit_pct}% (Target level: Rs. {take_profit_price:.2f})"
            )
        elif stop_loss_price and current_price <= (stop_loss_price * 1.02):
            action = "HOLD"
            verdict_badge = "WATCH_WARNING"
            action_urgency = "MEDIUM"
            recommendation = "⚠️ WATCH CLOSELY"
            trigger_reason = (
                f"Approaching Stop Loss: Current price Rs. {current_price:.2f} is within 2% "
                f"of stop level Rs. {stop_loss_price:.2f}"
            )
        elif st_trend == -1:
            action = "HOLD"
            verdict_badge = "WATCH_WARNING"
            action_urgency = "MEDIUM"
            recommendation = "⚠️ BEARISH MOMENTUM WARNING"
            trigger_reason = f"SuperTrend is Bearish at Rs. {st_val}. Monitor position closely."
        else:
            action = "HOLD"
            verdict_badge = "HOLD_HEALTHY"
            action_urgency = "LOW"
            recommendation = "🟢 HOLD POSITION"
            trigger_reason = (
                f"Bullish Trend Intact: Trading above key levels. SuperTrend Bullish (Rs. {st_val}), "
                f"RSI {rsi_val} in healthy momentum."
            )

        return {
            "id": pos["id"],
            "symbol": symbol,
            "strategy_name": strategy_name,
            "strategy_code": strategy_code,
            "strategy_evaluated": strategy_evaluated,
            "buy_date": buy_date,
            "buy_price": buy_price,
            "qty": qty,
            "invested_value": invested_value,
            "current_price": current_price,
            "current_value": current_value,
            "unrealized_pnl": unrealized_pnl,
            "unrealized_pnl_pct": unrealized_pnl_pct,
            "day_change_pct": day_change_pct,
            "holding_days": holding_days,
            "peak_high_since_buy": peak_high_since_buy,
            "stop_loss_pct": stop_loss_pct,
            "stop_loss_price": stop_loss_price,
            "take_profit_pct": take_profit_pct,
            "take_profit_price": take_profit_price,
            "trailing_stop_pct": trailing_stop_pct,
            "trailing_stop_price": trailing_stop_price,
            "action": action, # "SELL" or "HOLD"
            "verdict_badge": verdict_badge, # "SELL_STRATEGY" | "SELL_STOP_LOSS" | "SELL_TAKE_PROFIT" | "SELL_TRAILING_STOP" | "WATCH_WARNING" | "HOLD_HEALTHY"
            "action_urgency": action_urgency, # "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
            "recommendation": recommendation,
            "trigger_reason": trigger_reason,
            "indicators": {
                "supertrend": st_val,
                "supertrend_trend": st_trend,
                "rsi_14": rsi_val,
                "sma_100": sma_100_val,
                "ema_50": ema_50_val,
                "ema_200": ema_200_val,
                "delivery_pct": delivery_pct
            },
            "latest_date": latest_date,
            "notes": pos.get("notes") or "",
            "status": pos.get("status", "OPEN")
        }

    def _build_fallback_result(self, pos: Dict[str, Any], note: str) -> Dict[str, Any]:
        """Fallback representation when symbol market data is not found"""
        buy_price = float(pos["buy_price"])
        qty = int(pos["qty"])
        inv = round(buy_price * qty, 2)
        return {
            "id": pos["id"],
            "symbol": pos["symbol"].upper(),
            "strategy_name": pos["strategy_name"],
            "strategy_code": pos.get("strategy_code") or "",
            "strategy_evaluated": False,
            "buy_date": str(pos["buy_date"])[:10],
            "buy_price": buy_price,
            "qty": qty,
            "invested_value": inv,
            "current_price": buy_price,
            "current_value": inv,
            "unrealized_pnl": 0.0,
            "unrealized_pnl_pct": 0.0,
            "day_change_pct": 0.0,
            "holding_days": 0,
            "peak_high_since_buy": buy_price,
            "stop_loss_pct": pos.get("stop_loss_pct"),
            "stop_loss_price": None,
            "take_profit_pct": pos.get("take_profit_pct"),
            "take_profit_price": None,
            "trailing_stop_pct": pos.get("trailing_stop_pct"),
            "trailing_stop_price": None,
            "action": "HOLD",
            "verdict_badge": "WATCH_WARNING",
            "action_urgency": "MEDIUM",
            "recommendation": "DATA PENDING",
            "trigger_reason": note,
            "indicators": {},
            "latest_date": str(datetime.now().date()),
            "notes": pos.get("notes") or "",
            "status": pos.get("status", "OPEN")
        }

portfolio_scanner = PortfolioScanner()
