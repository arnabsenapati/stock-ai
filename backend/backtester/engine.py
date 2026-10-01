import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional
from datetime import datetime
from backend.core.database import db
from backend.backtester.strategy_dsl import StrategyEvaluator
from backend.analytics.indicators import ta

class BacktestEngine:
    def __init__(self,
                 initial_capital: float = 100000.0,
                 max_positions: int = 10,
                 risk_per_trade_pct: float = 10.0,
                 stop_loss_pct: Optional[float] = None,
                 take_profit_pct: Optional[float] = None,
                 trailing_stop_pct: Optional[float] = None,
                 slippage_pct: float = 0.05,
                 brokerage_pct: float = 0.10,
                 execution_timing: str = "next_open", # 'next_open' or 'same_close'
                 compounding: bool = True,
                 partial_tp_pct: Optional[float] = None,
                 partial_tp_ratio: float = 50.0,
                 breakeven_on_partial: bool = False,
                 regime_filter: bool = False,
                 regime_index_symbol: str = "^NSEI",
                 regime_rule: str = "sma_200"):
        self.initial_capital = initial_capital
        self.max_positions = max_positions
        self.risk_per_trade_pct = risk_per_trade_pct
        self.stop_loss_pct = stop_loss_pct
        self.take_profit_pct = take_profit_pct
        self.trailing_stop_pct = trailing_stop_pct
        self.slippage_pct = slippage_pct / 100.0
        self.brokerage_pct = brokerage_pct / 100.0
        self.execution_timing = execution_timing
        self.compounding = compounding
        self.partial_tp_pct = partial_tp_pct
        self.partial_tp_ratio = partial_tp_ratio
        self.breakeven_on_partial = breakeven_on_partial
        self.regime_filter = regime_filter
        self.regime_index_symbol = regime_index_symbol.upper() if regime_index_symbol else "^NSEI"
        self.regime_rule = regime_rule or "sma_200"

    def _get_regime_map(self) -> Dict[Any, bool]:
        """
        Builds date -> bool mapping for the benchmark index.
        True = Bullish regime (normal entries permitted)
        False = Bearish regime (cash protection mode: no new buys permitted)
        """
        if not self.regime_filter:
            return {}
        try:
            index_df = db.get_symbol_data(self.regime_index_symbol)
            if index_df.empty:
                index_df = db.get_symbol_data("^NSEI")
            if index_df.empty or len(index_df) < 20:
                return {}

            index_df = index_df.sort_values('date').reset_index(drop=True)
            if self.regime_rule == "sma_50":
                ma = ta.sma(index_df['close'], 50)
                bullish_series = (index_df['close'] > ma) if ma is not None else pd.Series(True, index=index_df.index)
            elif self.regime_rule == "sma_100":
                ma = ta.sma(index_df['close'], 100)
                bullish_series = (index_df['close'] > ma) if ma is not None else pd.Series(True, index=index_df.index)
            elif self.regime_rule == "sma_200":
                ma = ta.sma(index_df['close'], 200)
                bullish_series = (index_df['close'] > ma) if ma is not None else pd.Series(True, index=index_df.index)
            elif self.regime_rule == "supertrend":
                st = ta.supertrend(index_df['high'], index_df['low'], index_df['close'], 10, 3.0)
                bullish_series = (st['supertrend_trend'] > 0)
            else:
                bullish_series = pd.Series(True, index=index_df.index)

            reg_map = {}
            for d, b in zip(index_df['date'], bullish_series):
                d_key = d.date() if hasattr(d, 'date') else pd.to_datetime(d).date()
                reg_map[d_key] = bool(b) if pd.notnull(b) else True
            return reg_map
        except Exception as e:
            print(f"Error computing market regime map: {e}")
            return {}

    def run_single_stock(self, symbol: str, strategy_code: str, 
                         start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict[str, Any]:
        """Backtest a single stock strategy"""
        df = db.get_symbol_data(symbol, start_date, end_date)
        if df.empty or len(df) < 30:
            raise ValueError(f"Insufficient data for symbol {symbol}. Found {len(df)} rows.")

        buy_signals, sell_signals = StrategyEvaluator.evaluate(strategy_code, df)
        df = df.copy()
        if self.execution_timing == "next_open":
            df['buy_signal'] = buy_signals.shift(1).fillna(False)
            df['sell_signal'] = sell_signals.shift(1).fillna(False)
        else:
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
                    df = df.copy()
                    if self.execution_timing == "next_open":
                        df['buy_signal'] = buy_sig.shift(1).fillna(False)
                        df['sell_signal'] = sell_sig.shift(1).fillna(False)
                    else:
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
        regime_map = self._get_regime_map() if self.regime_filter else {}
        regime_blocked_days = 0
        regime_filtered_entries = 0

        for current_date in all_dates:
            is_bullish_regime = regime_map.get(current_date, True) if self.regime_filter else True
            if not is_bullish_regime:
                regime_blocked_days += 1

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
                
                # Check Partial Take Profit (Scale Out)
                if (not pos.get('partial_booked', False)
                    and self.partial_tp_pct is not None
                    and pos['qty'] >= 2):
                    partial_th = pos['entry_price'] * (1.0 + self.partial_tp_pct / 100.0)
                    if high_price >= partial_th:
                        p_exit_px = max(bar['open'], partial_th)
                        p_qty = max(1, int(round(pos['qty'] * (self.partial_tp_ratio / 100.0))))
                        if p_qty < pos['qty']:
                            eff_part_px = p_exit_px * (1.0 - self.slippage_pct)
                            gross_part = eff_part_px * p_qty
                            part_costs = gross_part * self.brokerage_pct
                            net_part = gross_part - part_costs
                            
                            cost_share = pos['total_cost'] * (p_qty / pos['qty'])
                            part_pnl = net_part - cost_share
                            part_pnl_pct = (part_pnl / cost_share) * 100.0
                            
                            cash += net_part
                            pos['qty'] -= p_qty
                            pos['total_cost'] -= cost_share
                            pos['partial_booked'] = True
                            if self.breakeven_on_partial:
                                pos['be_active'] = True
                                
                            part_holding_days = (current_date - pos['entry_date']).days
                            part_trade_val = round(float(pos['entry_price'] * p_qty), 2)
                            part_exit_val = round(float(eff_part_px * p_qty), 2)
                            
                            trades_log.append({
                                "symbol": sym,
                                "entry_date": str(pos['entry_date']),
                                "exit_date": str(current_date),
                                "entry_price": round(float(pos['entry_price']), 2),
                                "exit_price": round(float(eff_part_px), 2),
                                "qty": int(p_qty),
                                "trade_value": part_trade_val,
                                "exit_value": part_exit_val,
                                "turnover": round(float(part_trade_val + part_exit_val), 2),
                                "pnl": round(float(part_pnl), 2),
                                "return_pct": round(float(part_pnl_pct), 2),
                                "holding_days": int(part_holding_days),
                                "exit_reason": f"Partial TP ({int(self.partial_tp_ratio)}%)"
                            })

                exit_price = None
                exit_reason = None

                # Check Stop Loss (Breakeven or Standard)
                if pos.get('be_active', False):
                    be_threshold = pos['entry_price']
                    if low_price <= be_threshold:
                        exit_price = min(bar['open'], be_threshold)
                        exit_reason = "Breakeven Stop"
                elif self.stop_loss_pct is not None:
                    sl_threshold = pos['entry_price'] * (1.0 - self.stop_loss_pct / 100.0)
                    if low_price <= sl_threshold:
                        exit_price = min(bar['open'], sl_threshold) # conservative execution
                        exit_reason = "Stop Loss"

                # Check Take Profit
                if exit_price is None and self.take_profit_pct is not None:
                    tp_threshold = pos['entry_price'] * (1.0 + self.take_profit_pct / 100.0)
                    if high_price >= tp_threshold:
                        exit_price = max(bar['open'], tp_threshold)
                        exit_reason = "Runner Take Profit" if pos.get('partial_booked', False) else "Take Profit"

                # Check Trailing Stop
                if exit_price is None and self.trailing_stop_pct is not None:
                    ts_threshold = pos['highest_price'] * (1.0 - self.trailing_stop_pct / 100.0)
                    if low_price <= ts_threshold:
                        exit_price = min(bar['open'], ts_threshold)
                        exit_reason = "Trailing Stop"

                # Check Sell Signal
                if exit_price is None and sell_signal:
                    if self.execution_timing == "next_open":
                        exit_price = bar['open']
                        exit_reason = "Runner Exit (Next Open)" if pos.get('partial_booked', False) else "Sell Signal (Next Open)"
                    else:
                        exit_price = close_price
                        exit_reason = "Runner Exit (EOD Close)" if pos.get('partial_booked', False) else "Sell Signal (EOD Close)"

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
                    trade_val = round(float(pos['entry_price'] * pos['qty']), 2)
                    exit_val = round(float(eff_exit_price * pos['qty']), 2)
                    turnover = round(float(trade_val + exit_val), 2)

                    trades_log.append({
                        "symbol": sym,
                        "entry_date": str(pos['entry_date']),
                        "exit_date": str(current_date),
                        "entry_price": round(float(pos['entry_price']), 2),
                        "exit_price": round(float(eff_exit_price), 2),
                        "qty": int(pos['qty']),
                        "trade_value": trade_val,
                        "exit_value": exit_val,
                        "turnover": turnover,
                        "pnl": round(float(pnl), 2),
                        "return_pct": round(float(pnl_pct), 2),
                        "holding_days": int(holding_days),
                        "exit_reason": exit_reason
                    })
                    symbols_to_close.append(sym)

            for sym in symbols_to_close:
                del open_positions[sym]

            # 2. Check for new buy entries (Subject to Market Regime Defense)
            available_slots = self.max_positions - len(open_positions)
            min_cash_threshold = min(5000.0, self.initial_capital * 0.05)
            
            if is_bullish_regime:
                if available_slots > 0 and cash >= min_cash_threshold:
                    candidate_buys = []
                    for sym in symbol_dfs.keys():
                        if sym in open_positions:
                            continue
                        sym_table = date_indexed[sym]
                        if current_date in sym_table.index:
                            bar = sym_table.loc[current_date]
                            if bar.get('buy_signal', False):
                                entry_px = bar['open'] if self.execution_timing == "next_open" else bar['close']
                                candidate_buys.append((sym, entry_px))

                    if candidate_buys:
                        if self.compounding:
                            # Dynamic equity sizing: cash + current market value of open positions
                            current_invested = 0.0
                            for open_sym, pos in open_positions.items():
                                sym_t = date_indexed.get(open_sym)
                                if sym_t is not None and current_date in sym_t.index:
                                    px = sym_t.loc[current_date]['open'] if self.execution_timing == "next_open" else sym_t.loc[current_date]['close']
                                else:
                                    px = pos['entry_price']
                                current_invested += px * pos['qty']
                            base_capital = max(cash + current_invested, 0.0)
                        else:
                            base_capital = self.initial_capital

                        target_budget = base_capital * (self.risk_per_trade_pct / 100.0)
                        min_trade_budget = min(2000.0, self.initial_capital * 0.02)

                        # Allocate capital among available candidates
                        for sym, price in candidate_buys[:available_slots]:
                            alloc_budget = min(cash, target_budget)
                            if alloc_budget < min_trade_budget:
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
                                        "initial_qty": qty,
                                        "total_cost": total_cost,
                                        "highest_price": eff_entry_price,
                                        "partial_booked": False,
                                        "be_active": False
                                    }
            else:
                # Bearish Regime: Cash Protection Active -> Count blocked entries
                for sym in symbol_dfs.keys():
                    if sym in open_positions:
                        continue
                    sym_table = date_indexed[sym]
                    if current_date in sym_table.index:
                        bar = sym_table.loc[current_date]
                        if bar.get('buy_signal', False):
                            regime_filtered_entries += 1

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
                "open_positions": len(open_positions),
                "regime": "BULL" if is_bullish_regime else "BEAR"
            })

        # Calculate performance statistics
        metrics = self._calculate_metrics(equity_curve, trades_log, regime_blocked_days, regime_filtered_entries)
        monthly_matrix = self._calculate_monthly_returns(equity_curve)

        return {
            "execution_timing": self.execution_timing,
            "compounding": self.compounding,
            "partial_tp_pct": self.partial_tp_pct,
            "partial_tp_ratio": self.partial_tp_ratio,
            "breakeven_on_partial": self.breakeven_on_partial,
            "regime_filter": self.regime_filter,
            "regime_rule": self.regime_rule,
            "regime_index_symbol": self.regime_index_symbol,
            "metrics": metrics,
            "equity_curve": equity_curve,
            "trades": trades_log,
            "monthly_returns": monthly_matrix
        }

    def _calculate_metrics(self, equity_curve: List[Dict[str, Any]], trades: List[Dict[str, Any]],
                           regime_blocked_days: int = 0, regime_filtered_entries: int = 0) -> Dict[str, Any]:
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
        total_trade_value = sum(t.get('trade_value', t['entry_price'] * t['qty']) for t in trades)
        total_turnover = sum(t.get('turnover', (t['entry_price'] + t['exit_price']) * t['qty']) for t in trades)

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
            "total_traded_value": round(float(total_trade_value), 2),
            "total_turnover": round(float(total_turnover), 2),
            "winning_trades": int(len(wins)),
            "losing_trades": int(len(losses)),
            "win_rate_pct": round(float(win_rate), 2),
            "profit_factor": round(float(profit_factor), 2),
            "avg_return_pct": round(float(avg_return_pct), 2),
            "avg_win_pct": round(float(avg_win_pct), 2),
            "avg_loss_pct": round(float(avg_loss_pct), 2),
            "avg_holding_days": round(float(avg_holding_days), 1),
            "regime_filter_enabled": self.regime_filter,
            "regime_rule": self.regime_rule if self.regime_filter else None,
            "regime_index_symbol": self.regime_index_symbol if self.regime_filter else None,
            "regime_blocked_days": int(regime_blocked_days) if self.regime_filter else 0,
            "regime_filtered_entries": int(regime_filtered_entries) if self.regime_filter else 0
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
