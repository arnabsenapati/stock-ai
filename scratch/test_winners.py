import sys
sys.path.insert(0, '.')
from backend.backtester.engine import BacktestEngine

symbols = ['TITAN', 'BAJFINANCE', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'M&M', 'LT', 'RELIANCE', 'KOTAKBANK']

strats = {
    '1. SuperTrend Momentum Trend-Rider (Trailing 6%)': {
        'code': """
Macro = (Close > SMA(Close, 50)) & (SMA(Close, 50) > SMA(Close, 100))
Trend = SuperTrend_Trend(10, 3.0)
Buy = Macro & Cross(Trend, 0)
Sell = CrossUnder(Trend, 0) | CrossUnder(Close, EMA(Close, 50))
""",
        'sl': 5.0, 'tp': 18.0, 'ts': 6.0
    },
    '2. 52-Week High Breakout Leader (Target 15%)': {
        'code': """
Near52W = Close >= (HHV(High, 252).shift(1) * 0.92)
Break20 = Close > HHV(High, 20).shift(1)
Vol = Volume > SMA(Volume, 20)
Buy = Near52W & Break20 & Vol
Sell = CrossUnder(Close, EMA(Close, 20))
""",
        'sl': 4.5, 'tp': 15.0, 'ts': 5.0
    },
    '3. 50 EMA Pullback Bounce (Buy the Dip in Uptrend)': {
        'code': """
Uptrend = (Close > SMA(Close, 100)) & (SMA(Close, 50) > SMA(Close, 200))
Dip = (Low <= EMA(Close, 50)) & (Close > EMA(Close, 50))
Bounce = Close > Open
Buy = Uptrend & Dip & Bounce
Sell = CrossUnder(Close, EMA(Close, 50)) | (RSI(Close, 14) > 70)
""",
        'sl': 5.0, 'tp': 15.0, 'ts': 5.0
    },
    '4. Golden Cross (EMA 20 / EMA 50) with 200 SMA Filter': {
        'code': """
Uptrend = Close > SMA(Close, 200)
Cross20_50 = Cross(EMA(Close, 20), EMA(Close, 50))
Buy = Uptrend & Cross20_50
Sell = CrossUnder(EMA(Close, 20), EMA(Close, 50))
""",
        'sl': 6.0, 'tp': 18.0, 'ts': 6.0
    },
    '5. 3-High Base Breakout with Volume Confirmation': {
        'code': """
Uptrend = (Close > SMA(Close, 100)) & (SMA(Close, 50) > SMA(Close, 200))
ThreeUp = (Close > Close.shift(1)) & (Close.shift(1) > Close.shift(2)) & (Close.shift(2) > Close.shift(3))
Breakout = Close > HHV(High, 20).shift(3)
Vol = Volume > SMA(Volume, 20)
Buy = Uptrend & ThreeUp & Breakout & Vol
Sell = CrossUnder(Close, EMA(Close, 50)) | (Close < LLV(Low, 15).shift(1))
""",
        'sl': 5.0, 'tp': 15.0, 'ts': 5.0
    }
}

results = []

for name, s in strats.items():
    engine = BacktestEngine(
        initial_capital=100000.0,
        max_positions=10,
        risk_per_trade_pct=10.0, # ~10k per trade
        stop_loss_pct=s['sl'],
        take_profit_pct=s['tp'],
        trailing_stop_pct=s['ts'],
        slippage_pct=0.05,
        brokerage_pct=0.10
    )
    res = engine.run_basket(symbols, s['code'])
    m = res['metrics']
    results.append({
        'Strategy': name,
        'StopLoss%': s['sl'],
        'TakeProfit%': s['tp'],
        'TrailingStop%': s['ts'],
        'Net Profit (Rs)': m['net_profit'],
        'Return %': m['total_return_pct'],
        'CAGR %': m['cagr_pct'],
        'Max Drawdown %': m['max_drawdown_pct'],
        'Win Rate %': m['win_rate_pct'],
        'Profit Factor': m['profit_factor'],
        'Total Trades': m['total_trades'],
        'Avg Days': m['avg_holding_days']
    })

import pandas as pd
df = pd.DataFrame(results).sort_values(by='Net Profit (Rs)', ascending=False)
print(df.to_string(index=False))
