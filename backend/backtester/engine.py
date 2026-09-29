import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional
from datetime import datetime
from backend.core.database import db
from backend.backtester.strategy_dsl import StrategyEvaluator

class BacktestEngine:
    def __init__(self,
                 initial_capital: float = 1000000.0,
                 max_positions: int = 10,
                 risk_per_trade_pct: float = 10.0,
                 stop_loss_pct: Optional[float] = None,
                 take_profit_pct: Optional[float] = None,
                 trailing_stop_pct: Optional[float] = None,
                 slippage_pct: float = 0.05,
                 brokerage_pct: float = 0.10): # Indian delivery STT + Brokerage approx 0.10%
        self.initial_capital = initial_capital
        self.max_positions = max_positions
        self.risk_per_trade_pct = risk_per_trade_pct
        self.stop_loss_pct = stop_loss_pct
        self.take_profit_pct = take_profit_pct
        self.trailing_stop_pct = trailing_stop_pct
        self.slippage_pct = slippage_pct / 100.0
        self.brokerage_pct = brokerage_pct / 100.0

    def run_single_stock(self, symbol: str, strategy_code: str, 
                         start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict[str, Any]:
        """Backtest a single stock strategy"""
        df = db.get_symbol_data(symbol, start_date, end_date)
        if df.empty or len(df) < 30:
            raise ValueError(f"Insufficient data for symbol {symbol}. Found {len(df)} rows.")

        buy_signals, sell_signals = StrategyEvaluator.evaluate(strategy_code, df)
        df['buy_signal'] = buy_signals
        df['sell_signal'] = sell_signals

        return self._simulate_portfolio({symbol: df})

    def run_basket(self, symbols: List[str], strategy_code: str,
                   start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict[str, Any]:
        """Backtest a portfolio basket of stocks"""
        symbol_data = {}
        for sym in symbols:
            df = db.get_symbol_data(sym, start_date, end_date)
            if not df.empty and len(df) >= 30:
                try:
                    buy_sig, sell_sig = StrategyEvaluator.evaluate(strategy_code, df)
                    df['buy_signal'] = buy_sig
                    df['sell_signal'] = sell_sig
                    symbol_data[sym] = df
                except Exception as e:
                    print(f"Skipping {sym} due to evaluation error: {e}")

        if not symbol_data:
            raise ValueError("No valid stock data found for the selected basket.")

        return self._simulate_portfolio(symbol_data)

    def _simulate_portfolio(self, symbol_dfs: Dict[str, pd.DataFrame]) -> Dict[str, Any]:
        """Simulates portfolio day-by-day with capital management and trade logs"""
        # Pre-index dataframes by date for O(1) lookup
        date_indexed = {}
        all_dates_set = set()
        for sym, df in symbol_dfs.items():
            df_copy = df.copy()
            df_copy['date'] = pd.to_datetime(df_copy['date']).dt.date
            all_dates_set.update(df_copy['date'].unique())
            date_indexed[sym] = df_copy.set_index('date')

        all_dates = sorted(list(all_dates_set))
        capital = self.initial_capital
        cash = capital
        open_positions = {} # symbol -> {entry_date, entry_price, qty, highest_price}
        trades_log = []
        equity_curve = []

        for current_date in all_dates:
            # 1. Update open positions and check exits (Stop Loss, Take Profit, Trailing Stop, Sell Signal)
            symbols_to_close = []
            
            for sym, pos in list(open_positions.items()):
                sym_table = date_indexed[sym]
                if current_date not in sym_table.index:
                    continue
                
                bar = sym_table.loc[current_date]
                close_price = bar['close']
                high_price = bar['high']
                low_price = bar['low']
                sell_signal = bar.get('sell_signal', False)

                pos['highest_price'] = max(pos['highest_price'], high_price)
                exit_price = None
                exit_reason = None

                # Check Stop Loss
                if self.stop_loss_pct is not None:
                    sl_threshold = pos['entry_price'] * (1.0 - self.stop_loss_pct / 100.0)
                    if low_price <= sl_threshold:
                        exit_price = min(bar['open'], sl_threshold) # conservative execution
                        exit_reason = "Stop Loss"

                # Check Take Profit
                if exit_price is None and self.take_profit_pct is not None:
                    tp_threshold = pos['entry_price'] * (1.0 + self.take_profit_pct / 100.0)
                    if high_price >= tp_threshold:
                        exit_price = max(bar['open'], tp_threshold)
                        exit_reason = "Take Profit"

                # Check Trailing Stop
                if exit_price is None and self.trailing_stop_pct is not None:
                    ts_threshold = pos['highest_price'] * (1.0 - self.trailing_stop_pct / 100.0)
                    if low_price <= ts_threshold:
                        exit_price = min(bar['open'], ts_threshold)
                        exit_reason = "Trailing Stop"

                # Check Sell Signal
                if exit_price is None and sell_signal:
                    exit_price = close_price
                    exit_reason = "Sell Signal"

                # Execute Exit
                if exit_price is not None:
                    # Apply slippage & brokerage on exit
                    eff_exit_price = exit_price * (1.0 - self.slippage_pct)
                    gross_revenue = eff_exit_price * pos['qty']
                    costs = gross_revenue * self.brokerage_pct
                    net_revenue = gross_revenue - costs
                    
                    pnl = net_revenue - pos['total_cost']
                    pnl_pct = (pnl / pos['total_cost']) * 100.0
                    
                    cash += net_revenue
                    
                    holding_days = (current_date - pos['entry_date']).days
                    trades_log.append({
                        "symbol": sym,
                        "entry_date": str(pos['entry_date']),
                        "exit_date": str(current_date),
                        "entry_price": round(float(pos['entry_price']), 2),
                        "exit_price": round(float(eff_exit_price), 2),
                        "qty": int(pos['qty']),
                        "pnl": round(float(pnl), 2),
                        "return_pct": round(float(pnl_pct), 2),
                        "holding_days": int(holding_days),
                        "exit_reason": exit_reason
                    })
                    symbols_to_close.append(sym)

            for sym in symbols_to_close:
                del open_positions[sym]

            # 2. Check for new buy entries
            available_slots = self.max_positions - len(open_positions)
            if available_slots > 0 and cash > 5000:
                candidate_buys = []
                for sym in symbol_dfs.keys():
                    if sym in open_positions:
                        continue
                    sym_table = date_indexed[sym]
                    if current_date in sym_table.index:
                        bar = sym_table.loc[current_date]
                        if bar.get('buy_signal', False):
                            candidate_buys.append((sym, bar['close']))

                # Allocate capital equally among available candidates
                for sym, price in candidate_buys[:available_slots]:
                    # Allocation budget
                    alloc_budget = min(cash, (self.initial_capital * (self.risk_per_trade_pct / 100.0)))
                    if alloc_budget < 2000:
                        break

                    eff_entry_price = price * (1.0 + self.slippage_pct)
                    qty = int(alloc_budget // eff_entry_price)
                    if qty > 0:
                        gross_cost = qty * eff_entry_price
                        total_cost = gross_cost * (1.0 + self.brokerage_pct)
                        if total_cost <= cash:
                            cash -= total_cost
                            open_positions[sym] = {
                                "entry_date": current_date,
                                "entry_price": eff_entry_price,
                                "qty": qty,
                                "total_cost": total_cost,
                                "highest_price": eff_entry_price
                            }

            # 3. Calculate portfolio equity at end of day
            invested_value = 0.0
            for sym, pos in open_positions.items():
                sym_table = date_indexed[sym]
                cur_price = sym_table.loc[current_date]['close'] if current_date in sym_table.index else pos['entry_price']
                invested_value += cur_price * pos['qty']

            total_equity = cash + invested_value
            equity_curve.append({
                "date": str(current_date),
                "equity": round(total_equity, 2),
                "cash": round(cash, 2),
                "invested": round(invested_value, 2),
                "open_positions": len(open_positions)
            })

        # Calculate performance statistics
        metrics = self._calculate_metrics(equity_curve, trades_log)
        monthly_matrix = self._calculate_monthly_returns(equity_curve)

        return {
            "metrics": metrics,
            "equity_curve": equity_curve,
            "trades": trades_log,
            "monthly_returns": monthly_matrix
        }

    def _calculate_metrics(self, equity_curve: List[Dict[str, Any]], trades: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not equity_curve:
            return {}

        eq_series = pd.Series([e['equity'] for e in equity_curve])
        initial_val = self.initial_capital
        final_val = eq_series.iloc[-1]
        net_profit = final_val - initial_val
        total_return_pct = (net_profit / initial_val) * 100.0

        # Drawdown calculation
        running_max = eq_series.cummax()
        drawdown_series = (eq_series - running_max) / running_max
        max_drawdown_pct = abs(float(drawdown_series.min())) * 100.0

        # CAGR calculation
        total_days = max(1, len(equity_curve))
        years = total_days / 252.0
        cagr = ((final_val / initial_val) ** (1.0 / max(years, 0.1)) - 1.0) * 100.0 if final_val > 0 else -100.0

        # Sharpe & Sortino (assuming 6.5% risk free rate for India)
        daily_returns = eq_series.pct_change().dropna()
        rf_daily = (1.0 + 0.065) ** (1.0 / 252.0) - 1.0
        excess_returns = daily_returns - rf_daily
        
        sharpe = float(np.sqrt(252) * (excess_returns.mean() / excess_returns.std())) if excess_returns.std() > 0 else 0.0
        
        downside_returns = excess_returns[excess_returns < 0]
        sortino = float(np.sqrt(252) * (excess_returns.mean() / downside_returns.std())) if (not downside_returns.empty and downside_returns.std() > 0) else 0.0
        
        calmar = round(cagr / max_drawdown_pct, 2) if max_drawdown_pct > 0 else 0.0

        # Trade stats
        total_trades = len(trades)
        wins = [t for t in trades if t['pnl'] > 0]
        losses = [t for t in trades if t['pnl'] <= 0]
        win_rate = (len(wins) / total_trades * 100.0) if total_trades > 0 else 0.0

        gross_profit = sum(t['pnl'] for t in wins)
        gross_loss = abs(sum(t['pnl'] for t in losses))
        profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else (99.0 if gross_profit > 0 else 0.0)

        avg_return_pct = float(np.mean([t['return_pct'] for t in trades])) if trades else 0.0
        avg_win_pct = float(np.mean([t['return_pct'] for t in wins])) if wins else 0.0
        avg_loss_pct = float(np.mean([t['return_pct'] for t in losses])) if losses else 0.0
        avg_holding_days = float(np.mean([t['holding_days'] for t in trades])) if trades else 0.0

        return {
            "initial_capital": round(float(initial_val), 2),
            "final_equity": round(float(final_val), 2),
            "net_profit": round(float(net_profit), 2),
            "total_return_pct": round(float(total_return_pct), 2),
            "cagr_pct": round(float(cagr), 2),
            "max_drawdown_pct": round(float(max_drawdown_pct), 2),
            "sharpe_ratio": round(float(sharpe), 2),
            "sortino_ratio": round(float(sortino), 2),
            "calmar_ratio": round(float(calmar), 2),
            "total_trades": int(total_trades),
            "winning_trades": int(len(wins)),
            "losing_trades": int(len(losses)),
            "win_rate_pct": round(float(win_rate), 2),
            "profit_factor": round(float(profit_factor), 2),
            "avg_return_pct": round(float(avg_return_pct), 2),
            "avg_win_pct": round(float(avg_win_pct), 2),
            "avg_loss_pct": round(float(avg_loss_pct), 2),
            "avg_holding_days": round(float(avg_holding_days), 1)
        }

    def _calculate_monthly_returns(self, equity_curve: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Compute monthly return matrix for heatmaps"""
        if not equity_curve:
            return []
            
        df = pd.DataFrame(equity_curve)
        df['date'] = pd.to_datetime(df['date'])
        df = df.set_index('date')
        
        # Monthly resampled last equity
        monthly_eq = df['equity'].resample('ME').last()
        monthly_ret = monthly_eq.pct_change() * 100.0

        records = []
        for dt, ret in monthly_ret.items():
            if pd.notna(ret):
                records.append({
                    "year": int(dt.year),
                    "month": dt.strftime("%b"),
                    "return_pct": round(float(ret), 2)
                })
        return records

backtest_engine = BacktestEngine()
