import os
import io
import zipfile
import requests
import pandas as pd
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any
from pathlib import Path
from backend.core.config import BHAVCOPY_DIR
from backend.core.database import db

class BhavcopyDownloader:
    def __init__(self, storage_dir: Path = BHAVCOPY_DIR):
        self.storage_dir = storage_dir
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        })

    def get_headers(self):
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": "https://www.nseindia.com/",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "en-US,en;q=0.9",
        }

    def download_udiff_bhavcopy(self, target_date: date) -> Optional[pd.DataFrame]:
        """
        Download the new NSE CM-UDiFF Bhavcopy:
        https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_YYYYMMDD_F_0000.csv.zip
        """
        date_str = target_date.strftime("%Y%m%d")
        url = f"https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{date_str}_F_0000.csv.zip"
        
        try:
            resp = self.session.get(url, headers=self.get_headers(), timeout=15)
            if resp.status_code == 200:
                with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
                    for filename in z.namelist():
                        if filename.endswith(".csv"):
                            with z.open(filename) as f:
                                df = pd.read_csv(f)
                                return self._process_udiff_df(df, target_date)
        except Exception as e:
            print(f"UDiFF Bhavcopy download failed for {date_str}: {e}")
            
        return None

    def download_legacy_bhavcopy(self, target_date: date) -> Optional[pd.DataFrame]:
        """
        Download legacy Bhavcopy format:
        https://nsearchives.nseindia.com/content/historical/EQUITIES/YYYY/MMM/cmDDMMMYYYYbhav.csv.zip
        """
        year = target_date.strftime("%Y")
        month = target_date.strftime("%b").upper()
        day = target_date.strftime("%d")
        url = f"https://nsearchives.nseindia.com/content/historical/EQUITIES/{year}/{month}/cm{day}{month}{year}bhav.csv.zip"
        
        try:
            resp = self.session.get(url, headers=self.get_headers(), timeout=15)
            if resp.status_code == 200:
                with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
                    for filename in z.namelist():
                        if filename.endswith(".csv"):
                            with z.open(filename) as f:
                                df = pd.read_csv(f)
                                return self._process_legacy_df(df, target_date)
        except Exception as e:
            print(f"Legacy Bhavcopy download failed for {target_date}: {e}")
            
        return None

    def _process_udiff_df(self, df: pd.DataFrame, target_date: date) -> pd.DataFrame:
        """Process new UDiFF CSV columns"""
        # Common UDiFF columns: TckrSymb, SctySrs, OpnPric, HghPric, LwPric, ClsPric, TtlTradgVol, etc.
        cols = {c.strip(): c.strip() for c in df.columns}
        
        # Look for series filter (EQ / BE)
        series_col = next((c for c in df.columns if 'srs' in c.lower() or 'series' in c.lower()), None)
        if series_col:
            df = df[df[series_col].astype(str).str.strip().isin(['EQ', 'BE'])]
            
        symbol_col = next((c for c in df.columns if 'symb' in c.lower() or 'symbol' in c.lower()), 'TckrSymb')
        open_col = next((c for c in df.columns if 'opn' in c.lower() or 'open' in c.lower()), 'OpnPric')
        high_col = next((c for c in df.columns if 'hgh' in c.lower() or 'high' in c.lower()), 'HghPric')
        low_col = next((c for c in df.columns if 'lw' in c.lower() or 'low' in c.lower()), 'LwPric')
        close_col = next((c for c in df.columns if 'cls' in c.lower() or 'close' in c.lower()), 'ClsPric')
        vol_col = next((c for c in df.columns if 'vol' in c.lower() or 'qty' in c.lower()), 'TtlTradgVol')
        
        res = pd.DataFrame()
        res['symbol'] = df[symbol_col].astype(str).str.strip()
        res['date'] = target_date
        res['open'] = pd.to_numeric(df[open_col], errors='coerce')
        res['high'] = pd.to_numeric(df[high_col], errors='coerce')
        res['low'] = pd.to_numeric(df[low_col], errors='coerce')
        res['close'] = pd.to_numeric(df[close_col], errors='coerce')
        res['volume'] = pd.to_numeric(df[vol_col], errors='coerce').fillna(0).astype('int64')
        res['delivery_qty'] = 0
        res['delivery_pct'] = 0.0
        return res

    def _process_legacy_df(self, df: pd.DataFrame, target_date: date) -> pd.DataFrame:
        """Process legacy bhavcopy format"""
        df.columns = [c.strip().upper() for c in df.columns]
        if 'SERIES' in df.columns:
            df = df[df['SERIES'].isin(['EQ', 'BE'])]
            
        res = pd.DataFrame()
        res['symbol'] = df['SYMBOL'].astype(str).str.strip()
        res['date'] = target_date
        res['open'] = pd.to_numeric(df['OPEN'], errors='coerce')
        res['high'] = pd.to_numeric(df['HIGH'], errors='coerce')
        res['low'] = pd.to_numeric(df['LOW'], errors='coerce')
        res['close'] = pd.to_numeric(df['CLOSE'], errors='coerce')
        res['volume'] = pd.to_numeric(df['TOTTRDQTY'], errors='coerce').fillna(0).astype('int64')
        res['delivery_qty'] = 0
        res['delivery_pct'] = 0.0
        return res

    def ingest_bhavcopy_for_date(self, target_date: date) -> bool:
        """Attempt downloading modern UDiFF, fallback to legacy, then save to DB"""
        df = self.download_udiff_bhavcopy(target_date)
        if df is None or df.empty:
            df = self.download_legacy_bhavcopy(target_date)
            
        if df is not None and not df.empty:
            # Group by symbol and write to database
            for symbol, group in df.groupby('symbol'):
                db.save_symbol_data(symbol, group, source="nse_bhavcopy")
            return True
        return False

    def ingest_custom_csv(self, file_path: str) -> Dict[str, Any]:
        """Import user CSV (AmiBroker or custom EOD export)"""
        df = pd.read_csv(file_path)
        df.columns = [c.strip().lower() for c in df.columns]
        
        # Identify symbol
        if 'symbol' not in df.columns and 'ticker' in df.columns:
            df['symbol'] = df['ticker']
            
        imported_symbols = []
        for symbol, group in df.groupby('symbol'):
            db.save_symbol_data(symbol, group, source="custom_import")
            imported_symbols.append(symbol)
            
        return {
            "status": "success",
            "imported_symbols_count": len(imported_symbols),
            "symbols": imported_symbols
        }

bhavcopy_hub = BhavcopyDownloader()
