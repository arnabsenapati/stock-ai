import sys
sys.path.insert(0, '.')
import pandas as pd
from backend.backtester.engine import BacktestEngine

symbols = [
    'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'ITC', 
    'LT', 'BHARTIARTL', 'M&M', 'SUNPHARMA', 'AXISBANK', 'KOTAKBANK', 'TITAN', 'BAJFINANCE'
]

# Let's test diverse strategies
strategies = {
    # 1. SuperTrend Trend Follower with Volatility Filter
    "SuperTrend Momentum Trend-Rider": """
Macro = Close > SMA(Close, 100)
Trend = SuperTrend_Trend(10, 3.0)
Buy = Macro & Cross(Trend, 0)
Sell = CrossUnder(Trend, 0)
""",

    # 2. Golden Cross (50 EMA / 200 EMA)
    "Golden Cross 50/200 Long-Term Trend": """
Buy = Cross(EMA(Close, 50), EMA(Close, 200))
Sell = CrossUnder(EMA(Close, 50), EMA(Close, 200))
""",

    # 3. Dual EMA Momentum (20 EMA > 50 EMA with RSI Recovery)
    "Dual EMA (20/50) + RSI Recovery": """
Uptrend = (EMA(Close, 20) > EMA(Close, 50)) & (Close > SMA(Close, 100))
RSI_Cross = Cross(RSI(Close, 14), 45)
Buy = Uptrend & RSI_Cross
Sell = CrossUnder(Close, EMA(Close, 50)) | (RSI(Close, 14) < 38)
""",

    # 4. Donchian 20-Day Breakout with ATR Trailing
    "Donchian 20-Day Turtle Breakout": """
Macro = Close > SMA(Close, 100)
Break = Close > HHV(High, 20).shift(1)
Vol = Volume > SMA(Volume, 20)
Buy = Macro & Break & Vol
Sell = CrossUnder(Close, EMA(Close, 50))
""",

    # 5. RSI 2-Period Deep Oversold Bounce in Bull Market (Connors RSI Mean Reversion)
    "Bull Market Mean-Reversion Dip Buy": """
Uptrend = Close > SMA(Close, 200)
DeepDip = RSI(Close, 14) < 35
Bounce = Close > Open
Buy = Uptrend & DeepDip & Bounce
Sell = Cross(RSI(Close, 14), 65) | CrossUnder(Close, SMA(Close, 200))
""",

    # 6. High Delivery Accumulation Breakout
    "High Delivery Accumulation Breakout": """
Uptrend = Close > SMA(Close, 100)
HighDelivery = DeliveryPct >= 40.0
VolBreak = (Volume > SMA(Volume, 20) * 1.2) & (Close > HHV(Close, 15).shift(1))
Buy = Uptrend & HighDelivery & VolBreak
Sell = CrossUnder(Close, EMA(Close, 50))
"""
}

# Parameter combinations
# Starting capital: 100,000, risk/trade: 10% (~10,000 per trade), max_positions: 10
configs = [
    {"label": "Conservative: SL 4.5%, TP 12%, TS 5%", "sl": 4.5, "tp": 12.0, "ts": 5.0},
    {"label": "Medium: SL 5.5%, TP 15%, TS 6%", "sl": 5.5, "tp": 15.0, "ts": 6.0},
    {"label": "Wide Stop Trend Runner: SL 7.0%, TP None, TS 7%", "sl": 7.0, "tp": None, "ts": 7.0},
    {"label": "High Target: SL 4.0%, TP 16%, TS 5%", "sl": 4.0, "tp": 16.0, "ts": 5.0},
    {"label": "Tight Trailing: SL 5.0%, TP 10%, TS 4%", "sl": 5.0, "tp": 10.0, "ts": 4.0},
]

records = []

for s_name, s_code in strategies.items():
    for cfg in configs:
        engine = BacktestEngine(
            initial_capital=100000.0,
            max_positions=10,
            risk_per_trade_pct=10.0, # ~10k per trade
            stop_loss_pct=cfg["sl"],
            take_profit_pct=cfg["tp"],
            trailing_stop_pct=cfg["ts"],
            slippage_pct=0.05,
            brokerage_pct=0.10
        )
        try:
            res = engine.run_basket(symbols, s_code)
            m = res["metrics"]
            records.append({
                "Strategy": s_name,
                "Config": cfg["label"],
                "SL%": cfg["sl"],
                "TP%": cfg["tp"],
                "TS%": cfg["ts"],
                "Net Profit (Rs)": m["net_profit"],
                "Return %": m["total_return_pct"],
                "CAGR %": m["cagr_pct"],
                "Max DD %": m["max_drawdown_pct"],
                "Win Rate %": m["win_rate_pct"],
                "Profit Factor": m["profit_factor"],
                "Total Trades": m["total_trades"],
                "Avg Days": m["avg_holding_days"]
            })
        except Exception as e:
            pass

df_all = pd.DataFrame(records)
df_all = df_all.sort_values(by="Net Profit (Rs)", ascending=False)
print("=== TOP 10 PROFITABLE STRATEGIES RANKED ===")
print(df_all.head(15)[["Strategy", "Config", "Net Profit (Rs)", "Return %", "Win Rate %", "Profit Factor", "Max DD %", "Avg Days"]].to_string(index=False))
