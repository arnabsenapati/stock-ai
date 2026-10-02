import threading
import time
import json
import re
from pathlib import Path
from typing import Dict, Any, Optional, List
import pandas as pd
import optuna

from backend.core.config import OPTUNA_DB_PATH, PRESETS_DIR, POPULAR_UNIVERSES, NIFTY_50_SYMBOLS
from backend.core.database import db
from backend.backtester.engine import BacktestEngine
from backend.backtester.strategy_dsl import StrategyEvaluator

# Suppress verbose Optuna logging in production terminal
optuna.logging.set_verbosity(optuna.logging.WARNING)

def sanitize_name(name: str) -> str:
    """Sanitize strategy or universe string for clean study names and file keys"""
    return re.sub(r'[^a-zA-Z0-9_-]', '_', name.strip().lower())

class OptunaStrategyOptimizer:
    """
    Stateful Bayesian Optimization Worker with pause/resume support,
    persistent SQLite study checkpoints, and DuckDB profile storage.
    """
    def __init__(self):
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self._pause_requested = False
        self._stop_requested = False
        
        # State
        self.status: str = "idle" # "idle", "running", "paused", "completed", "error"
        self.strategy_name: str = ""
        self.universe: str = ""
        self.strategy_code: str = ""
        self.target_metric: str = "sharpe_ratio"
        self.target_trials: int = 200
        self.completed_trials: int = 0
        self.best_value: Optional[float] = None
        self.best_params: Dict[str, Any] = {}
        self.best_metrics: Dict[str, Any] = {}
        self.recent_trials: List[Dict[str, Any]] = []
        self.error_message: Optional[str] = None
        self.started_at: Optional[str] = None
        self.last_updated_at: Optional[str] = None
        self.regime_filter: bool = False
        self.regime_index_symbol: str = "^NSEI"
        self.regime_rule: str = "sma_200"
        self.compounding: bool = True
        self.initial_capital: float = 100000.0
        self.execution_timing: str = "next_open"
        self._regime_map: Optional[Dict[Any, bool]] = None
        
        # Cache of prepared symbol data for rapid portfolio evaluations
        self._symbol_data_cache: Dict[str, pd.DataFrame] = {}

    def get_study_name(self, strategy_name: str, universe: str, regime_filter: bool = False, regime_rule: str = "sma_200") -> str:
        s_key = sanitize_name(strategy_name)
        u_key = sanitize_name(universe)
        if regime_filter:
            r_key = sanitize_name(regime_rule or "sma_200")
            return f"{s_key}__{u_key}__regime_{r_key}"
        return f"{s_key}__{u_key}"

    def get_storage_url(self) -> str:
        # SQLite storage URL
        db_path = OPTUNA_DB_PATH.as_posix()
        return f"sqlite:///{db_path}"

    def get_status(self, strategy_name: Optional[str] = None, universe: Optional[str] = None,
                   regime_filter: Optional[bool] = None, regime_rule: Optional[str] = None) -> Dict[str, Any]:
        """Returns the live or persisted state of the optimization engine"""
        with self._lock:
            # If actively running, report live status
            if self.status == "running":
                study_name = self.get_study_name(self.strategy_name, self.universe, self.regime_filter, self.regime_rule) if self.strategy_name else ""
                return {
                    "status": self.status,
                    "strategy_name": self.strategy_name,
                    "universe": self.universe,
                    "study_name": study_name,
                    "target_metric": self.target_metric,
                    "target_trials": self.target_trials,
                    "completed_trials": self.completed_trials,
                    "progress_pct": round((self.completed_trials / max(1, self.target_trials)) * 100, 1),
                    "best_value": round(self.best_value, 2) if self.best_value is not None else None,
                    "best_params": self.best_params,
                    "best_metrics": self.best_metrics,
                    "recent_trials": self.recent_trials[-15:],
                    "error_message": self.error_message,
                    "started_at": self.started_at,
                    "last_updated_at": self.last_updated_at,
                    "regime_filter": self.regime_filter,
                    "regime_rule": self.regime_rule,
                    "regime_index_symbol": self.regime_index_symbol
                }

            # Check if there is a saved study in SQLite for the specified strategy & universe
            target_strat = strategy_name or self.strategy_name
            target_univ = universe or self.universe
            target_regime = regime_filter if regime_filter is not None else self.regime_filter
            target_rule = regime_rule or self.regime_rule or "sma_200"
            if target_strat and target_univ:
                study_name = self.get_study_name(target_strat, target_univ, target_regime, target_rule)
                storage_url = self.get_storage_url()
                try:
                    study = optuna.load_study(study_name=study_name, storage=storage_url)
                    n_trials = len(study.trials)
                    if n_trials > 0:
                        self.strategy_name = target_strat
                        self.universe = target_univ
                        self.regime_filter = target_regime
                        self.regime_rule = target_rule
                        self.completed_trials = n_trials
                        if study.best_trial:
                            self.best_value = study.best_value
                            self.best_params = study.best_params
                            self.best_metrics = study.best_trial.user_attrs

                        recent = []
                        for t in study.trials[-15:]:
                            recent.append({
                                "trial_number": t.number + 1,
                                "value": round(t.value or 0.0, 2),
                                "params": t.params,
                                "metrics": t.user_attrs
                            })
                        self.recent_trials = recent

                        effective_target = max(self.target_trials, n_trials)
                        return {
                            "status": "completed" if (self.status == "completed" and n_trials >= self.target_trials) else "paused",
                            "strategy_name": target_strat,
                            "universe": target_univ,
                            "study_name": study_name,
                            "target_metric": self.target_metric,
                            "target_trials": effective_target,
                            "completed_trials": n_trials,
                            "progress_pct": round((n_trials / max(1, effective_target)) * 100, 1),
                            "best_value": round(self.best_value, 2) if self.best_value is not None else None,
                            "best_params": self.best_params,
                            "best_metrics": self.best_metrics,
                            "recent_trials": recent,
                            "error_message": None,
                            "started_at": self.started_at,
                            "last_updated_at": self.last_updated_at,
                            "regime_filter": target_regime,
                            "regime_rule": target_rule,
                            "regime_index_symbol": study.user_attrs.get("regime_index_symbol", "^NSEI")
                        }
                except Exception:
                    pass

            study_name = self.get_study_name(target_strat or self.strategy_name, target_univ or self.universe, target_regime, target_rule) if (target_strat or self.strategy_name) else ""
            return {
                "status": self.status,
                "strategy_name": target_strat or self.strategy_name,
                "universe": target_univ or self.universe,
                "study_name": study_name,
                "target_metric": self.target_metric,
                "target_trials": self.target_trials,
                "completed_trials": self.completed_trials,
                "progress_pct": round((self.completed_trials / max(1, self.target_trials)) * 100, 1),
                "best_value": round(self.best_value, 2) if self.best_value is not None else None,
                "best_params": self.best_params,
                "best_metrics": self.best_metrics,
                "recent_trials": self.recent_trials[-15:],
                "error_message": self.error_message,
                "started_at": self.started_at,
                "last_updated_at": self.last_updated_at,
                "regime_filter": target_regime,
                "regime_rule": target_rule,
                "regime_index_symbol": self.regime_index_symbol
            }

    def prepare_data(self, universe: str, strategy_code: str, execution_timing: str = "next_open",
                     start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict[str, pd.DataFrame]:
        """
        Pre-computes indicator signals for all universe stocks ONCE.
        This allows trial backtests to run in milliseconds.
        """
        if universe in POPULAR_UNIVERSES:
            symbols = POPULAR_UNIVERSES[universe]
        else:
            symbols = NIFTY_50_SYMBOLS

        symbol_data = {}
        for sym in symbols:
            df = db.get_symbol_data(sym, start_date, end_date)
            if not df.empty and len(df) >= 30:
                try:
                    buy_sig, sell_sig = StrategyEvaluator.evaluate(strategy_code, df)
                    df_copy = df.copy()
                    if execution_timing == "next_open":
                        df_copy['buy_signal'] = buy_sig.shift(1).fillna(False)
                        df_copy['sell_signal'] = sell_sig.shift(1).fillna(False)
                    else:
                        df_copy['buy_signal'] = buy_sig
                        df_copy['sell_signal'] = sell_sig
                    symbol_data[sym] = df_copy
                except Exception as e:
                    # Skip problematic symbol
                    continue

        if not symbol_data:
            raise ValueError(f"No valid historical data found for universe: {universe}")

        return symbol_data

    def start_optimization(self,
                           strategy_name: str,
                           universe: str,
                           strategy_code: str,
                           target_trials: int = 200,
                           target_metric: str = "sharpe_ratio",
                           initial_capital: float = 100000.0,
                           execution_timing: str = "next_open",
                           compounding: bool = True,
                           regime_filter: bool = False,
                           regime_index_symbol: str = "^NSEI",
                           regime_rule: str = "sma_200",
                           param_ranges: Optional[Dict[str, Any]] = None,
                           start_date: Optional[str] = None,
                           end_date: Optional[str] = None):
        """Starts or resumes an optimization task in a background worker thread"""
        with self._lock:
            if self.status == "running":
                raise RuntimeError("An optimization run is already in progress. Please pause or wait for it to complete.")

            self.strategy_name = strategy_name
            self.universe = universe
            self.strategy_code = strategy_code
            self.target_metric = target_metric
            self.target_trials = target_trials
            self.initial_capital = initial_capital
            self.execution_timing = execution_timing
            self.compounding = compounding
            self.regime_filter = regime_filter
            self.regime_index_symbol = regime_index_symbol or "^NSEI"
            self.regime_rule = regime_rule or "sma_200"
            self.error_message = None
            self._pause_requested = False
            self._stop_requested = False
            self.started_at = time.strftime('%Y-%m-%d %H:%M:%S')

        # Precompute signal cache and regime map
        try:
            self._symbol_data_cache = self.prepare_data(
                universe=universe,
                strategy_code=strategy_code,
                execution_timing=execution_timing,
                start_date=start_date,
                end_date=end_date
            )
            if self.regime_filter:
                temp_engine = BacktestEngine(
                    regime_filter=True,
                    regime_index_symbol=self.regime_index_symbol,
                    regime_rule=self.regime_rule
                )
                self._regime_map = temp_engine._get_regime_map()
            else:
                self._regime_map = {}
        except Exception as e:
            with self._lock:
                self.status = "error"
                self.error_message = str(e)
            raise e

        # Spawn background runner thread
        self.status = "running"
        self._thread = threading.Thread(
            target=self._run_optimization_loop,
            args=(strategy_name, universe, initial_capital, execution_timing, compounding,
                  self.regime_filter, self.regime_index_symbol, self.regime_rule, param_ranges or {}),
            daemon=True
        )
        self._thread.start()

    def pause_optimization(self):
        """Signals the background optimization worker to pause gracefully at the next trial"""
        with self._lock:
            if self.status != "running":
                return {"message": f"Optimization is currently {self.status}, not running."}
            self._pause_requested = True
            return {"message": "Pause requested. Optimization will pause after the current trial commits."}

    def resume_optimization(self, strategy_name: Optional[str] = None, universe: Optional[str] = None,
                            strategy_code: Optional[str] = None, execution_timing: str = "next_open",
                            regime_filter: Optional[bool] = None, regime_index_symbol: Optional[str] = None,
                            regime_rule: Optional[str] = None):
        """Resumes a paused optimization task, reloading data cache if necessary"""
        target_strat = strategy_name or self.strategy_name
        target_univ = universe or self.universe
        target_code = strategy_code or self.strategy_code
        target_regime = regime_filter if regime_filter is not None else self.regime_filter
        target_rule = regime_rule or self.regime_rule or "sma_200"
        target_index = regime_index_symbol or self.regime_index_symbol or "^NSEI"

        if not target_strat or not target_univ:
            raise RuntimeError("Strategy and Universe must be specified to resume optimization.")

        # Ensure signal cache is populated
        if not self._symbol_data_cache:
            if not target_code:
                raise RuntimeError("Strategy formula code is required to compute stock signals.")
            self._symbol_data_cache = self.prepare_data(target_univ, target_code, execution_timing)

        if target_regime and not self._regime_map:
            temp_engine = BacktestEngine(
                regime_filter=True,
                regime_index_symbol=target_index,
                regime_rule=target_rule
            )
            self._regime_map = temp_engine._get_regime_map()

        with self._lock:
            self.strategy_name = target_strat
            self.universe = target_univ
            self.strategy_code = target_code
            self.regime_filter = target_regime
            self.regime_rule = target_rule
            self.regime_index_symbol = target_index
            self._pause_requested = False
            self._stop_requested = False
            self.status = "running"

        self._thread = threading.Thread(
            target=self._run_optimization_loop,
            args=(self.strategy_name, self.universe, self.initial_capital, execution_timing, self.compounding,
                  self.regime_filter, self.regime_index_symbol, self.regime_rule, {}),
            daemon=True
        )
        self._thread.start()
        return {"message": f"Optimization resumed for {self.strategy_name} on {self.universe}."}

    def _run_optimization_loop(self,
                               strategy_name: str,
                               universe: str,
                               initial_capital: float,
                               execution_timing: str,
                               compounding: bool,
                               regime_filter: bool,
                               regime_index_symbol: str,
                               regime_rule: str,
                               ranges: Dict[str, Any]):
        """Background execution loop running Optuna trials step-by-step"""
        study_name = self.get_study_name(strategy_name, universe, regime_filter, regime_rule)
        storage_url = self.get_storage_url()

        # Load or create study in SQLite
        study = optuna.create_study(
            study_name=study_name,
            storage=storage_url,
            direction="maximize",
            load_if_exists=True,
            sampler=optuna.samplers.TPESampler(seed=42)
        )
        study.set_user_attr("regime_filter", regime_filter)
        study.set_user_attr("regime_index_symbol", regime_index_symbol)
        study.set_user_attr("regime_rule", regime_rule)
        study.set_user_attr("compounding", compounding)
        study.set_user_attr("execution_timing", execution_timing)

        # Sync completed trials from persistent study
        with self._lock:
            self.completed_trials = len(study.trials)
            if self.target_trials <= self.completed_trials:
                self.target_trials = self.completed_trials + 100
            if len(study.trials) > 0 and study.best_trial is not None:
                self.best_value = study.best_value
                self.best_params = study.best_params
                self.best_metrics = study.best_trial.user_attrs

        # Objective definition
        def objective(trial: optuna.Trial) -> float:
            # Sample parameters
            sl_min = ranges.get('sl_min', 2.0)
            sl_max = ranges.get('sl_max', 15.0)
            tp_min = ranges.get('tp_min', 5.0)
            tp_max = ranges.get('tp_max', 35.0)
            risk_min = ranges.get('risk_min', 5.0)
            risk_max = ranges.get('risk_max', 25.0)
            pos_min = ranges.get('pos_min', 4)
            pos_max = ranges.get('pos_max', 12)

            stop_loss = trial.suggest_float("stop_loss_pct", sl_min, sl_max, step=0.5)
            take_profit = trial.suggest_float("take_profit_pct", tp_min, tp_max, step=0.5)
            risk_per_trade = trial.suggest_float("risk_per_trade_pct", risk_min, risk_max, step=2.5)
            max_positions = trial.suggest_int("max_positions", pos_min, pos_max, step=1)
            
            # Trailing stop configuration
            ts_mode = ranges.get('ts_mode', 'auto')
            ts_min = float(ranges.get('ts_min', 2.0))
            ts_max = float(ranges.get('ts_max', 10.0))
            trailing_stop = None
            if ts_mode == 'disabled':
                enable_ts = False
            elif ts_mode == 'always_on':
                enable_ts = True
                trailing_stop = trial.suggest_float("trailing_stop_pct", ts_min, ts_max, step=0.5)
            else: # 'auto'
                enable_ts = trial.suggest_categorical("enable_trailing_stop", [True, False])
                if enable_ts:
                    trailing_stop = trial.suggest_float("trailing_stop_pct", ts_min, ts_max, step=0.5)

            # Construct engine with trial parameters
            engine = BacktestEngine(
                initial_capital=initial_capital,
                max_positions=max_positions,
                risk_per_trade_pct=risk_per_trade,
                stop_loss_pct=stop_loss,
                take_profit_pct=take_profit,
                trailing_stop_pct=trailing_stop,
                slippage_pct=0.05,
                brokerage_pct=0.10,
                execution_timing=execution_timing,
                compounding=compounding,
                regime_filter=regime_filter,
                regime_index_symbol=regime_index_symbol,
                regime_rule=regime_rule,
                regime_map=self._regime_map
            )

            # Fast simulate using precomputed signals
            sim_res = engine._simulate_portfolio(self._symbol_data_cache)
            metrics = sim_res.get("metrics", {})

            # Metric extraction
            total_trades = metrics.get("total_trades", 0)
            win_rate = metrics.get("win_rate", 0.0)
            total_return = metrics.get("total_return_pct", 0.0)
            max_dd = metrics.get("max_drawdown_pct", 0.0)
            sharpe = metrics.get("sharpe_ratio", 0.0)
            cagr = metrics.get("cagr_pct", 0.0)
            profit_factor = metrics.get("profit_factor", 0.0)
            calmar = metrics.get("calmar_ratio", 0.0)

            # Store in trial metadata
            trial.set_user_attr("total_trades", total_trades)
            trial.set_user_attr("win_rate", round(win_rate, 2))
            trial.set_user_attr("total_return_pct", round(total_return, 2))
            trial.set_user_attr("max_drawdown_pct", round(max_dd, 2))
            trial.set_user_attr("sharpe_ratio", round(sharpe, 2))
            trial.set_user_attr("cagr_pct", round(cagr, 2))
            trial.set_user_attr("profit_factor", round(profit_factor, 2))
            trial.set_user_attr("calmar_ratio", round(calmar, 2))

            # Penalty for statistically insignificant trades
            if total_trades < 5:
                return -999.0

            # Target metric selection
            if self.target_metric == "cagr_pct":
                return float(cagr)
            elif self.target_metric == "total_return_pct":
                return float(total_return)
            elif self.target_metric == "calmar_ratio":
                return float(calmar)
            elif self.target_metric == "profit_factor":
                return float(profit_factor)
            else:
                return float(sharpe)

        try:
            while not self._pause_requested and not self._stop_requested:
                if self.completed_trials >= self.target_trials:
                    with self._lock:
                        self.status = "completed"
                    break

                # Optimize 1 trial at a time to allow instantaneous, checkpointed pausing
                study.optimize(objective, n_trials=1)

                # Update live state
                latest_trial = study.trials[-1]
                with self._lock:
                    self.completed_trials = len(study.trials)
                    self.best_value = study.best_value
                    self.best_params = study.best_params
                    self.best_metrics = study.best_trial.user_attrs
                    self.last_updated_at = time.strftime('%Y-%m-%d %H:%M:%S')

                    # Keep rolling record of recent trials
                    self.recent_trials.append({
                        "trial_number": latest_trial.number + 1,
                        "value": round(latest_trial.value or 0.0, 2),
                        "params": latest_trial.params,
                        "metrics": latest_trial.user_attrs
                    })
                    if len(self.recent_trials) > 50:
                        self.recent_trials = self.recent_trials[-50:]

            # After exiting loop, check if pause was requested
            with self._lock:
                if self._pause_requested:
                    self.status = "paused"
                elif self._stop_requested:
                    self.status = "idle"
                elif self.completed_trials >= self.target_trials:
                    self.status = "completed"

        except Exception as e:
            with self._lock:
                self.status = "error"
                self.error_message = str(e)

    def reset_study(self, strategy_name: str, universe: str, regime_filter: bool = False, regime_rule: str = "sma_200"):
        """Deletes persistent study to start fresh if requested"""
        study_name = self.get_study_name(strategy_name, universe, regime_filter, regime_rule)
        storage_url = self.get_storage_url()
        try:
            optuna.delete_study(study_name=study_name, storage=storage_url)
        except Exception:
            pass

        with self._lock:
            self.status = "idle"
            self.completed_trials = 0
            self.best_value = None
            self.best_params = {}
            self.best_metrics = {}
            self.recent_trials = []
            self.error_message = None

        return {"message": f"Study {study_name} has been reset."}

    def apply_best_profile(self, strategy_name: str, universe: str, regime_filter: bool = False, regime_rule: str = "sma_200") -> Dict[str, Any]:
        """
        Loads the best trial from the Optuna study, saves it permanently to DuckDB and JSON,
        and returns the active profile dictionary.
        """
        study_name = self.get_study_name(strategy_name, universe, regime_filter, regime_rule)
        storage_url = self.get_storage_url()

        try:
            study = optuna.load_study(study_name=study_name, storage=storage_url)
        except Exception as e:
            raise ValueError(f"No optimization study found for {strategy_name} on {universe}: {e}")

        if not study.trials or study.best_trial is None:
            raise ValueError(f"No completed trials found in study {study_name}")

        best_t = study.best_trial
        best_p = best_t.params
        best_m = best_t.user_attrs

        trailing_stop = None
        if best_p.get("enable_trailing_stop"):
            trailing_stop = best_p.get("trailing_stop_pct")

        effective_regime_filter = study.user_attrs.get("regime_filter", regime_filter)
        effective_regime_rule = study.user_attrs.get("regime_rule", regime_rule)
        effective_compounding = study.user_attrs.get("compounding", getattr(self, "compounding", True))

        profile = {
            "strategy_name": strategy_name,
            "universe": universe,
            "initial_capital": 100000.0,
            "risk_per_trade_pct": float(best_p.get("risk_per_trade_pct", 10.0)),
            "stop_loss_pct": float(best_p.get("stop_loss_pct", 5.0)),
            "take_profit_pct": float(best_p.get("take_profit_pct", 18.0)),
            "trailing_stop_pct": float(trailing_stop) if trailing_stop is not None else None,
            "max_positions": int(best_p.get("max_positions", 10)),
            "compounding": effective_compounding,
            "regime_filter": effective_regime_filter,
            "regime_rule": effective_regime_rule,
            "best_metric_name": self.target_metric,
            "best_metric_value": float(best_t.value or 0.0),
            "total_trades": int(best_m.get("total_trades", 0)),
            "win_rate": float(best_m.get("win_rate", 0.0)),
            "total_return_pct": float(best_m.get("total_return_pct", 0.0)),
            "max_drawdown_pct": float(best_m.get("max_drawdown_pct", 0.0)),
            "sharpe_ratio": float(best_m.get("sharpe_ratio", 0.0)),
            "cagr_pct": float(best_m.get("cagr_pct", 0.0)),
        }

        # 1. Save to DuckDB
        db.save_strategy_basket_profile(profile)

        # 2. Save to JSON preset file
        json_file = PRESETS_DIR / f"{study_name}.json"
        with open(json_file, "w", encoding="utf-8") as f:
            json.dump(profile, f, indent=2)

        return profile

# Singleton optimizer instance
strategy_optimizer = OptunaStrategyOptimizer()
