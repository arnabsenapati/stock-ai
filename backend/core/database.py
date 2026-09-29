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
            """)

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

db = DatabaseManager()
