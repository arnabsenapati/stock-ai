import sys
sys.path.insert(0, '.')
from backend.backtester.engine import BacktestEngine
import pandas as pd

symbols = ['TITAN', 'BAJFINANCE', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'M&M', 'LT', 'RELIANCE', 'KOTAKBANK']

# Test with SL and TP, but NO premature trailing stop
strats = {
    '1. SuperTrend + 100 SMA Trend Rider': '''
Macro = Close > SMA(Close, 100)
Trend = SuperTrend_Trend(10, 3.0)
Buy = Macro & Cross(Trend, 0)
Sell = CrossUnder(Trend, 0)
''',
    '2. Golden Cross (EMA 20 / EMA 50) + 200 SMA': '''
Uptrend = Close > SMA(Close, 200)
Cross20_50 = Cross(EMA(Close, 20), EMA(Close, 50))
Buy = Uptrend & Cross20_50
Sell = CrossUnder(EMA(Close, 20), EMA(Close, 50))
''',
    '3. 52-Week High Breakout Leader': '''
Near52W = Close >= (HHV(High, 252).shift(1) * 0.90)
Break20 = Close > HHV(High, 20).shift(1)
Vol = Volume > SMA(Volume, 20)
Buy = Near52W & Break20 & Vol
Sell = CrossUnder(Close, EMA(Close, 50))
''',
    '4. Stage-2 Dip Buy (50 EMA Bounce)': '''
Uptrend = (Close > SMA(Close, 100)) & (SMA(Close, 50) > SMA(Close, 200))
Dip = (Low <= EMA(Close, 50)) & (Close > EMA(Close, 50))
Bounce = Close > Open
Buy = Uptrend & Dip & Bounce
Sell = CrossUnder(Close, EMA(Close, 50)) | (RSI(Close, 14) > 75)
''',
    '5. Donchian 20-Day Breakout + Trend': '''
Macro = Close > SMA(Close, 100)
Break = Close > HHV(High, 20).shift(1)
Vol = Volume > SMA(Volume, 20)
Buy = Macro & Break & Vol
Sell = CrossUnder(Close, EMA(Close, 50)) | (Close < LLV(Low, 15).shift(1))
'''
}

engine = BacktestEngine(
    initial_capital=100000.0,
    max_positions=10,
    risk_per_trade_pct=10.0,
    stop_loss_pct=5.5,
    take_profit_pct=16.0,
    trailing_stop_pct=None # No premature trailing stop!
)

records = []
for name, code in strats.items():
    res = engine.run_basket(symbols, code)
    m = res['metrics']
    records.append({
        'Strategy': name,
        'Net Profit (Rs)': m['net_profit'],
        'Return %': m['total_return_pct'],
        'Win Rate %': m['win_rate_pct'],
        'Profit Factor': m['profit_factor'],
        'Max DD %': m['max_drawdown_pct'],
        'Total Trades': m['total_trades'],
        'Avg Days': m['avg_holding_days']
    })

df = pd.DataFrame(records).sort_values(by='Net Profit (Rs)', ascending=False)
print(df.to_string(index=False))
