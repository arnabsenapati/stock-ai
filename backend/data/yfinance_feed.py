import yfinance as yf
import pandas as pd
from typing import List, Dict, Any, Optional
from datetime import datetime
from backend.core.database import db
from backend.core.config import NIFTY_50_SYMBOLS, BENCHMARKS

class YFinanceFeed:
    def __init__(self):
        pass

    def _normalize_ticker(self, symbol: str) -> str:
        symbol = symbol.strip().upper()
        if symbol.startswith("^"):
            return symbol
        if not (symbol.endswith(".NS") or symbol.endswith(".BO")):
            return f"{symbol}.NS"
        return symbol

    def fetch_symbol_history(self, symbol: str, period: str = "5y", interval: str = "1d") -> Optional[pd.DataFrame]:
        """Fetch historical data for a given symbol from Yahoo Finance"""
        ticker_str = self._normalize_ticker(symbol)
        clean_symbol = symbol.replace(".NS", "").replace(".BO", "").upper()
        try:
            ticker = yf.Ticker(ticker_str)
            df = ticker.history(period=period, interval=interval, auto_adjust=True)
            if df.empty:
                return None
            
            df = df.reset_index()
            # Standardize columns
            col_map = {
                'Date': 'date',
                'Open': 'open',
                'High': 'high',
                'Low': 'low',
                'Close': 'close',
                'Volume': 'volume'
            }
            df = df.rename(columns=col_map)
            df['symbol'] = clean_symbol
            df['date'] = pd.to_datetime(df['date']).dt.date
            
            # Simulated or placeholder delivery data if not from bhavcopy
            df['delivery_qty'] = (df['volume'] * 0.45).astype('int64')
            df['delivery_pct'] = 45.0
            
            # Save into DuckDB & Parquet
            db.save_symbol_data(clean_symbol, df, source="yfinance")
            return df
        except Exception as e:
            print(f"Error fetching {symbol} from yfinance: {e}")
            return None

    def batch_download(self, symbols: List[str], period: str = "5y") -> Dict[str, Any]:
        """Download multiple symbols sequentially or in batch and save to DuckDB"""
        success = []
        failed = []
        
        for sym in symbols:
            df = self.fetch_symbol_history(sym, period=period)
            if df is not None and not df.empty:
                success.append(sym)
            else:
                failed.append(sym)
                
        return {
            "total_requested": len(symbols),
            "success_count": len(success),
            "failed_count": len(failed),
            "successful_symbols": success,
            "failed_symbols": failed
        }

yf_feed = YFinanceFeed()
