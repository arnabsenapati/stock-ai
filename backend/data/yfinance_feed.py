import yfinance as yf
import pandas as pd
import time
from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta
from backend.core.database import db
from backend.core.config import NIFTY_50_SYMBOLS, BENCHMARKS

def get_latest_expected_trading_day(now: Optional[datetime] = None) -> date:
    """
    Computes the most recent expected Indian market trading day.
    NSE/BSE trading hours: Mon-Fri 09:15 to 15:30 IST.
    EOD bars are finalized by 16:00 IST.
    """
    if now is None:
        now = datetime.now()
    today = now.date()
    weekday = today.weekday()  # 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun

    if weekday == 0:  # Monday
        if now.hour < 16:
            return today - timedelta(days=3)  # Friday
        return today
    elif weekday in (1, 2, 3, 4):  # Tuesday - Friday
        if now.hour < 16:
            return today - timedelta(days=1)  # Yesterday
        return today
    elif weekday == 5:  # Saturday
        return today - timedelta(days=1)  # Friday
    else:  # Sunday
        return today - timedelta(days=2)  # Friday

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

    def _clean_symbol(self, ticker: str) -> str:
        return ticker.replace(".NS", "").replace(".BO", "").upper()

    def fetch_symbol_history(
        self, 
        symbol: str, 
        period: str = "5y", 
        interval: str = "1d",
        start: Optional[str] = None,
        end: Optional[str] = None
    ) -> Optional[pd.DataFrame]:
        """Fetch historical data for a given symbol from Yahoo Finance"""
        ticker_str = self._normalize_ticker(symbol)
        clean_sym = self._clean_symbol(symbol)
        try:
            ticker = yf.Ticker(ticker_str)
            if start:
                df = ticker.history(start=start, end=end, interval=interval, auto_adjust=True)
            else:
                df = ticker.history(period=period, interval=interval, auto_adjust=True)
                
            if df is None or df.empty:
                return None
            
            df = df.reset_index()
            col_map = {
                'Date': 'date',
                'Open': 'open',
                'High': 'high',
                'Low': 'low',
                'Close': 'close',
                'Volume': 'volume'
            }
            df = df.rename(columns=col_map)
            df['symbol'] = clean_sym
            df['date'] = pd.to_datetime(df['date']).dt.date
            df['delivery_qty'] = (df['volume'] * 0.45).astype('int64')
            df['delivery_pct'] = 45.0
            
            db.save_symbol_data(clean_sym, df, source="yfinance")
            return df
        except Exception as e:
            print(f"Error fetching {symbol} from yfinance: {e}")
            return None

    def batch_download(self, symbols: List[str], period: str = "5y") -> Dict[str, Any]:
        """Download multiple symbols and save to DuckDB & Parquet"""
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

    def check_freshness(self, symbols: Optional[List[str]] = None) -> Dict[str, Any]:
        """Check if stored symbols are up to date with the latest market session"""
        if not symbols:
            symbols = db.get_all_stored_symbols()
        if not symbols:
            symbols = list(set(NIFTY_50_SYMBOLS + ["^NSEI"]))

        sym_dates = db.get_symbol_max_dates()
        expected_date = get_latest_expected_trading_day()
        summary = db.get_market_summary()
        current_db_date = summary.get("max_date")

        symbols_behind = []
        for s in symbols:
            s_date = sym_dates.get(s)
            if s_date is None or s_date < expected_date:
                symbols_behind.append(s)

        # Data lake is up to date if the latest market date has been reached in DB
        # and at least 85% of symbols have reached that date (accounting for data provider lag on select symbols)
        db_has_expected = current_db_date is not None and pd.to_datetime(current_db_date).date() >= expected_date
        tolerable_behind = max(2, int(len(symbols) * 0.15))
        is_up_to_date = db_has_expected and (len(symbols_behind) <= tolerable_behind)
        
        days_behind = 0
        if current_db_date:
            cur_d = pd.to_datetime(current_db_date).date()
            if cur_d < expected_date:
                days_behind = (expected_date - cur_d).days

        return {
            "is_up_to_date": is_up_to_date,
            "latest_expected_trading_day": str(expected_date),
            "current_db_date": current_db_date,
            "days_behind": days_behind,
            "total_checked": len(symbols),
            "behind_count": len(symbols_behind),
            "symbols_behind": symbols_behind[:15]
        }

    def incremental_sync(self, symbols: Optional[List[str]] = None, force: bool = False) -> Dict[str, Any]:
        """
        Download only missing recent daily data from last available date to today's date.
        Uses fast parallel batch fetching and atomic DuckDB upsert.
        """
        start_time = time.time()
        
        if not symbols:
            symbols = db.get_all_stored_symbols()
        if not symbols:
            symbols = list(set(NIFTY_50_SYMBOLS + ["^NSEI"]))
            
        # Ensure benchmark ^NSEI is included
        if "^NSEI" not in symbols:
            symbols.append("^NSEI")

        sym_dates = db.get_symbol_max_dates()
        expected_date = get_latest_expected_trading_day()

        # Identify which symbols need an update
        if force:
            symbols_to_sync = symbols
        else:
            symbols_to_sync = [
                s for s in symbols 
                if s not in sym_dates or sym_dates[s] < expected_date
            ]

        if not symbols_to_sync:
            msg = f"All {len(symbols)} tracked symbols are already up to date ({expected_date})."
            db.set_setting("last_sync_timestamp", datetime.now().isoformat())
            db.set_setting("last_sync_status", "success")
            db.set_setting("last_sync_summary", msg)
            return {
                "status": "already_up_to_date",
                "message": msg,
                "latest_date": str(expected_date),
                "symbols_updated": 0,
                "total_symbols": len(symbols),
                "rows_added": 0,
                "elapsed_sec": round(time.time() - start_time, 2)
            }

        # Calculate earliest start date needed across the target symbols
        known_dates = [sym_dates[s] for s in symbols_to_sync if s in sym_dates]
        if known_dates:
            min_last_date = min(known_dates)
            # Fetch from min_last_date to refresh the last bar and get subsequent new bars
            start_str = min_last_date.strftime("%Y-%m-%d")
        else:
            start_str = (date.today() - timedelta(days=730)).strftime("%Y-%m-%d")

        print(f"Starting incremental sync for {len(symbols_to_sync)} symbols from {start_str} to today...")

        tickers_map = {self._normalize_ticker(s): s for s in symbols_to_sync}
        tickers_list = list(tickers_map.keys())

        symbols_data: Dict[str, pd.DataFrame] = {}
        successful_symbols: List[str] = []
        failed_symbols: List[str] = []

        # 1. High-speed batch download
        try:
            batch_df = yf.download(
                tickers_list, 
                start=start_str, 
                group_by='ticker', 
                auto_adjust=True, 
                progress=False
            )
        except Exception as e:
            print(f"Batch yfinance download failed: {e}. Falling back to sequential download.")
            batch_df = None

        # 2. Parse batch results
        if batch_df is not None and not batch_df.empty:
            for t_str, sym in tickers_map.items():
                try:
                    if isinstance(batch_df.columns, pd.MultiIndex):
                        if t_str in batch_df.columns.levels[0]:
                            sub = batch_df[t_str].copy()
                        else:
                            sub = None
                    else:
                        sub = batch_df.copy()

                    if sub is not None and not sub.empty:
                        sub = sub.dropna(subset=['Close'])
                        if not sub.empty:
                            sub = sub.reset_index()
                            sub = sub.rename(columns={
                                'Date': 'date', 'Open': 'open', 'High': 'high', 
                                'Low': 'low', 'Close': 'close', 'Volume': 'volume'
                            })
                            sub['symbol'] = sym
                            sub['date'] = pd.to_datetime(sub['date']).dt.date
                            sub['delivery_qty'] = (sub['volume'] * 0.45).astype('int64')
                            sub['delivery_pct'] = 45.0
                            symbols_data[sym] = sub
                            successful_symbols.append(sym)
                            continue
                except Exception as ex:
                    print(f"Error parsing batch ticker {t_str}: {ex}")

        # 3. Fallback for any missing symbols
        missing_symbols = [s for s in symbols_to_sync if s not in symbols_data]
        for sym in missing_symbols:
            try:
                sym_start = sym_dates.get(sym, min_last_date if known_dates else date.today() - timedelta(days=730))
                s_df = self.fetch_symbol_history(sym, start=sym_start.strftime("%Y-%m-%d"))
                if s_df is not None and not s_df.empty:
                    successful_symbols.append(sym)
                else:
                    failed_symbols.append(sym)
            except Exception as e:
                print(f"Fallback fetch failed for {sym}: {e}")
                failed_symbols.append(sym)

        # 4. Save batch data into DuckDB and Parquet
        total_rows_added = 0
        if symbols_data:
            total_rows_added = db.save_batch_symbols_data(symbols_data, source="yfinance_incremental")

        # 5. Get updated horizon summary
        summary = db.get_market_summary()
        new_max_date = summary.get("max_date")
        new_min_date = summary.get("min_date")
        elapsed = round(time.time() - start_time, 2)

        status_msg = f"Incremental sync complete: {len(successful_symbols)} of {len(symbols_to_sync)} symbols updated up to {new_max_date} ({total_rows_added} rows merged in {elapsed}s)."
        print(status_msg)

        # Record settings
        db.set_setting("last_sync_timestamp", datetime.now().isoformat())
        db.set_setting("last_sync_status", "success" if not failed_symbols else "partial")
        db.set_setting("last_sync_summary", status_msg)

        return {
            "status": "success",
            "message": status_msg,
            "symbols_requested": len(symbols_to_sync),
            "symbols_updated": len(successful_symbols),
            "successful_symbols": successful_symbols,
            "failed_symbols": failed_symbols,
            "rows_added": total_rows_added,
            "min_date": new_min_date,
            "latest_date": new_max_date,
            "elapsed_sec": elapsed
        }

yf_feed = YFinanceFeed()
