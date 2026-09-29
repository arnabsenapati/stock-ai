import sys
sys.path.insert(0, '.')
from backend.backtester.engine import BacktestEngine
import pandas as pd

symbols = ['TITAN', 'BAJFINANCE', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'M&M', 'LT', 'RELIANCE', 'KOTAKBANK']

strat_code = '''
Macro = Close > SMA(Close, 100)
Trend = SuperTrend_Trend(10, 3.0)
Buy = Macro & Cross(Trend, 0)
Sell = CrossUnder(Trend, 0)
'''

# Grid of SL and TP combinations
grid = []
for sl in [4.0, 4.5, 5.0, 5.5, 6.0]:
    for tp in [12.0, 15.0, 18.0, 20.0, None]:
        engine = BacktestEngine(
            initial_capital=100000.0,
            max_positions=10,
            risk_per_trade_pct=10.0,
            stop_loss_pct=sl,
            take_profit_pct=tp,
            trailing_stop_pct=None,
            slippage_pct=0.05,
            brokerage_pct=0.10
        )
        res = engine.run_basket(symbols, strat_code)
        m = res['metrics']
        grid.append({
            'SL%': sl,
            'TP%': tp if tp else 'Open',
            'Net Profit (Rs)': m['net_profit'],
            'Return %': m['total_return_pct'],
            'Win Rate %': m['win_rate_pct'],
            'Profit Factor': m['profit_factor'],
            'Max DD %': m['max_drawdown_pct'],
            'Total Trades': m['total_trades'],
            'Avg Days': m['avg_holding_days']
        })

df_grid = pd.DataFrame(grid).sort_values(by='Net Profit (Rs)', ascending=False)
print("=== PARAMETER OPTIMIZATION GRID: SUPERTREND + 100 SMA ===")
print(df_grid.head(10).to_string(index=False))
