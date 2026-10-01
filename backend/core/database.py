import duckdb
import pandas as pd
from pathlib import Path
from typing import Optional, List, Dict, Any
from backend.core.config import DUCKDB_PATH, PARQUET_DIR

class DatabaseManager:
    def __init__(self, db_path: Path = DUCKDB_PATH):
        self.db_path = str(db_path)
        self._init_db()

    def get_connection(self):
        return duckdb.connect(self.db_path)

    def _init_db(self):
        with self.get_connection() as con:
            con.execute("""
                CREATE TABLE IF NOT EXISTS eod_prices (
                    symbol VARCHAR,
                    date DATE,
                    open DOUBLE,
                    high DOUBLE,
                    low DOUBLE,
                    close DOUBLE,
                    volume BIGINT,
                    delivery_qty BIGINT,
                    delivery_pct DOUBLE,
                    PRIMARY KEY (symbol, date)
                );
                CREATE INDEX IF NOT EXISTS idx_eod_symbol_date ON eod_prices(symbol, date);

                CREATE TABLE IF NOT EXISTS strategy_basket_profiles (
                    strategy_name VARCHAR,
                    universe VARCHAR,
                    initial_capital DOUBLE,
                    risk_per_trade_pct DOUBLE,
                    stop_loss_pct DOUBLE,
                    take_profit_pct DOUBLE,
                    trailing_stop_pct DOUBLE,
                    max_positions INT,
                    compounding BOOLEAN DEFAULT TRUE,
                    regime_filter BOOLEAN DEFAULT FALSE,
                    regime_rule VARCHAR DEFAULT 'sma_200',
                    best_metric_name VARCHAR,
                    best_metric_value DOUBLE,
                    total_trades INT,
                    win_rate DOUBLE,
                    total_return_pct DOUBLE,
                    max_drawdown_pct DOUBLE,
                    sharpe_ratio DOUBLE,
                    cagr_pct DOUBLE,
                    updated_at TIMESTAMP,
                    PRIMARY KEY (strategy_name, universe)
                );
            """)
            try:
                con.execute("ALTER TABLE strategy_basket_profiles ADD COLUMN compounding BOOLEAN DEFAULT TRUE;")
            except Exception:
                pass
            try:
                con.execute("ALTER TABLE strategy_basket_profiles ADD COLUMN regime_filter BOOLEAN DEFAULT FALSE;")
            except Exception:
                pass
            try:
                con.execute("ALTER TABLE strategy_basket_profiles ADD COLUMN regime_rule VARCHAR DEFAULT 'sma_200';")
            except Exception:
                pass

    def save_symbol_data(self, symbol: str, df: pd.DataFrame, source: str = "yfinance"):
        """Save OHLCV dataframe for a symbol to DuckDB and Parquet cache"""
        if df.empty:
            return

        clean_df = df.copy()
        clean_df['symbol'] = symbol.upper()
        
        # Ensure column names are standardized
        clean_df.columns = [str(c).lower().strip() for c in clean_df.columns]
        
        if 'date' not in clean_df.columns and isinstance(clean_df.index, pd.DatetimeIndex):
            clean_df['date'] = clean_df.index.date
        elif 'date' in clean_df.columns:
            clean_df['date'] = pd.to_datetime(clean_df['date']).dt.date
            
        for col in ['open', 'high', 'low', 'close']:
            if col in clean_df.columns:
                clean_df[col] = pd.to_numeric(clean_df[col], errors='coerce')

        if 'volume' in clean_df.columns:
            clean_df['volume'] = pd.to_numeric(clean_df['volume'], errors='coerce').fillna(0).astype('int64')
        else:
            clean_df['volume'] = 0

        if 'delivery_qty' not in clean_df.columns:
            clean_df['delivery_qty'] = 0
        else:
            clean_df['delivery_qty'] = pd.to_numeric(clean_df['delivery_qty'], errors='coerce').fillna(0).astype('int64')

        if 'delivery_pct' not in clean_df.columns:
            clean_df['delivery_pct'] = 0.0
        else:
            clean_df['delivery_pct'] = pd.to_numeric(clean_df['delivery_pct'], errors='coerce').fillna(0.0)

        required_cols = ['symbol', 'date', 'open', 'high', 'low', 'close', 'volume', 'delivery_qty', 'delivery_pct']
        clean_df = clean_df[required_cols].dropna(subset=['open', 'high', 'low', 'close', 'date'])
        clean_df = clean_df.drop_duplicates(subset=['symbol', 'date'])

        # Write to DuckDB with primary key upsert
        with self.get_connection() as con:
            con.register("incoming_df", clean_df)
            con.execute("""
                INSERT OR REPLACE INTO eod_prices
                SELECT symbol, date, open, high, low, close, volume, delivery_qty, delivery_pct
                FROM incoming_df
            """)

            # Export the FULL merged multi-year history to the Parquet cache
            parquet_file = PARQUET_DIR / f"{symbol.upper()}.parquet"
            full_df = con.execute("SELECT * FROM eod_prices WHERE symbol = ? ORDER BY date", [symbol.upper()]).df()
            full_df.to_parquet(parquet_file, index=False)

    def get_symbol_data(self, symbol: str, start_date: Optional[str] = None, end_date: Optional[str] = None) -> pd.DataFrame:
        """Fetch historical data for a symbol sorted by date ascending"""
        symbol = symbol.upper()
        # Fast path: check parquet cache first
        parquet_file = PARQUET_DIR / f"{symbol}.parquet"
        if parquet_file.exists():
            df = pd.read_parquet(parquet_file)
            df['date'] = pd.to_datetime(df['date'])
            if start_date:
                df = df[df['date'] >= pd.to_datetime(start_date)]
            if end_date:
                df = df[df['date'] <= pd.to_datetime(end_date)]
            return df.sort_values('date').reset_index(drop=True)

        query = "SELECT * FROM eod_prices WHERE symbol = ?"
        params = [symbol]
        if start_date:
            query += " AND date >= ?"
            params.append(start_date)
        if end_date:
            query += " AND date <= ?"
            params.append(end_date)
        query += " ORDER BY date ASC"

        with self.get_connection() as con:
            df = con.execute(query, params).df()
            if not df.empty:
                df['date'] = pd.to_datetime(df['date'])
            return df

    def get_all_stored_symbols(self) -> List[str]:
        """Returns list of distinct symbols currently in the database or parquet cache"""
        with self.get_connection() as con:
            res = con.execute("SELECT DISTINCT symbol FROM eod_prices ORDER BY symbol").fetchall()
            db_symbols = [r[0] for r in res]
            
        parquet_symbols = [p.stem for p in PARQUET_DIR.glob("*.parquet")]
        all_symbols = sorted(list(set(db_symbols + parquet_symbols)))
        return all_symbols

    def get_market_summary(self) -> Dict[str, Any]:
        """Returns row count, symbol count, and date ranges"""
        with self.get_connection() as con:
            res = con.execute("""
                SELECT 
                    COUNT(*) as total_rows,
                    COUNT(DISTINCT symbol) as total_symbols,
                    MIN(date) as min_date,
                    MAX(date) as max_date
                FROM eod_prices
            """).fetchone()
            
            return {
                "total_rows": res[0] or 0,
                "total_symbols": res[1] or 0,
                "min_date": str(res[2]) if res[2] else None,
                "max_date": str(res[3]) if res[3] else None
            }

    def save_strategy_basket_profile(self, profile: Dict[str, Any]):
        """Upsert an optimized strategy-basket parameter preset"""
        with self.get_connection() as con:
            con.execute("""
                INSERT OR REPLACE INTO strategy_basket_profiles (
                    strategy_name, universe, initial_capital, risk_per_trade_pct,
                    stop_loss_pct, take_profit_pct, trailing_stop_pct, max_positions,
                    compounding, regime_filter, regime_rule,
                    best_metric_name, best_metric_value, total_trades, win_rate,
                    total_return_pct, max_drawdown_pct, sharpe_ratio, cagr_pct, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, [
                profile.get("strategy_name"),
                profile.get("universe"),
                float(profile.get("initial_capital", 100000.0)),
                float(profile.get("risk_per_trade_pct", 10.0)),
                float(profile["stop_loss_pct"]) if profile.get("stop_loss_pct") is not None else None,
                float(profile["take_profit_pct"]) if profile.get("take_profit_pct") is not None else None,
                float(profile["trailing_stop_pct"]) if profile.get("trailing_stop_pct") is not None else None,
                int(profile.get("max_positions", 10)),
                bool(profile.get("compounding", True)),
                bool(profile.get("regime_filter", False)),
                str(profile.get("regime_rule", "sma_200")),
                profile.get("best_metric_name", "sharpe_ratio"),
                float(profile.get("best_metric_value", 0.0)),
                int(profile.get("total_trades", 0)),
                float(profile.get("win_rate", 0.0)),
                float(profile.get("total_return_pct", 0.0)),
                float(profile.get("max_drawdown_pct", 0.0)),
                float(profile.get("sharpe_ratio", 0.0)),
                float(profile.get("cagr_pct", 0.0))
            ])

    def get_strategy_basket_profile(self, strategy_name: str, universe: str) -> Optional[Dict[str, Any]]:
        """Retrieve optimized preset for strategy + basket pair"""
        with self.get_connection() as con:
            res = con.execute("""
                SELECT 
                    strategy_name, universe, initial_capital, risk_per_trade_pct,
                    stop_loss_pct, take_profit_pct, trailing_stop_pct, max_positions,
                    compounding, regime_filter, regime_rule,
                    best_metric_name, best_metric_value, total_trades, win_rate,
                    total_return_pct, max_drawdown_pct, sharpe_ratio, cagr_pct,
                    strftime(updated_at, '%Y-%m-%d %H:%M:%S') as updated_at
                FROM strategy_basket_profiles
                WHERE strategy_name = ? AND universe = ?
            """, [strategy_name, universe]).fetchone()
            
            if not res:
                return None
            
            return {
                "strategy_name": res[0],
                "universe": res[1],
                "initial_capital": res[2],
                "risk_per_trade_pct": res[3],
                "stop_loss_pct": res[4],
                "take_profit_pct": res[5],
                "trailing_stop_pct": res[6],
                "max_positions": res[7],
                "compounding": bool(res[8]) if res[8] is not None else True,
                "regime_filter": bool(res[9]) if res[9] is not None else False,
                "regime_rule": res[10] or "sma_200",
                "best_metric_name": res[11],
                "best_metric_value": res[12],
                "total_trades": res[13],
                "win_rate": res[14],
                "total_return_pct": res[15],
                "max_drawdown_pct": res[16],
                "sharpe_ratio": res[17],
                "cagr_pct": res[18],
                "updated_at": res[19]
            }

    def list_strategy_basket_profiles(self) -> List[Dict[str, Any]]:
        """List all saved strategy-basket presets"""
        with self.get_connection() as con:
            rows = con.execute("""
                SELECT 
                    strategy_name, universe, initial_capital, risk_per_trade_pct,
                    stop_loss_pct, take_profit_pct, trailing_stop_pct, max_positions,
                    compounding, regime_filter, regime_rule,
                    best_metric_name, best_metric_value, total_trades, win_rate,
                    total_return_pct, max_drawdown_pct, sharpe_ratio, cagr_pct,
                    strftime(updated_at, '%Y-%m-%d %H:%M:%S') as updated_at
                FROM strategy_basket_profiles
                ORDER BY updated_at DESC
            """).fetchall()

            return [{
                "strategy_name": r[0],
                "universe": r[1],
                "initial_capital": r[2],
                "risk_per_trade_pct": r[3],
                "stop_loss_pct": r[4],
                "take_profit_pct": r[5],
                "trailing_stop_pct": r[6],
                "max_positions": r[7],
                "compounding": bool(r[8]) if r[8] is not None else True,
                "regime_filter": bool(r[9]) if r[9] is not None else False,
                "regime_rule": r[10] or "sma_200",
                "best_metric_name": r[11],
                "best_metric_value": r[12],
                "total_trades": r[13],
                "win_rate": r[14],
                "total_return_pct": r[15],
                "max_drawdown_pct": r[16],
                "sharpe_ratio": r[17],
                "cagr_pct": r[18],
                "updated_at": r[19]
            } for r in rows]

db = DatabaseManager()
