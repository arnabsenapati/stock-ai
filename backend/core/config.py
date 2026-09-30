from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data_lake"
PARQUET_DIR = DATA_DIR / "parquet"
BHAVCOPY_DIR = DATA_DIR / "bhavcopy"
DUCKDB_PATH = DATA_DIR / "market_data.duckdb"
OPTUNA_DB_PATH = DATA_DIR / "optuna_studies.db"
PRESETS_DIR = DATA_DIR / "presets"

# Ensure directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
PARQUET_DIR.mkdir(parents=True, exist_ok=True)
BHAVCOPY_DIR.mkdir(parents=True, exist_ok=True)
PRESETS_DIR.mkdir(parents=True, exist_ok=True)

# Standard Indian Market Universes
NIFTY_50_SYMBOLS = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "BHARTIARTL", "ITC", 
    "SBIN", "LT", "HINDUNILVR", "BAJFINANCE", "M&M", "MARUTI", "SUNPHARMA", 
    "AXISBANK", "KOTAKBANK", "TATAMOTORS", "POWERGRID", "NTPC", "ULTRACEMCO", 
    "TITAN", "ONGC", "ADANIENT", "JSWSTEEL", "TATASTEEL", "COALINDIA", 
    "BAJAJFINSV", "NESTLEIND", "GRASIM", "TECHM", "WIPRO", "HCLTECH", 
    "HDFCLIFE", "SBILIFE", "BRITANNIA", "DRREDDY", "APOLLOHOSP", "CIPLA", 
    "EICHERMOT", "DIVISLAB", "BAJAJ-AUTO", "HEROMOTOCO", "TATACONSUM", "SHRIRAMFIN", 
    "BPCL", "INDUSINDBK", "BEL", "TRENT", "ADANIPORTS", "ASIANPAINT"
]

NIFTY_BANK_SYMBOLS = [
    "HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK", "INDUSINDBK",
    "BANKBARODA", "PNB", "AUBANK", "FEDERALBNK", "IDFCFIRSTB", "BANDHANBNK"
]

NIFTY_IT_SYMBOLS = [
    "TCS", "INFY", "HCLTECH", "WIPRO", "TECHM", "LTIM", "PERSISTENT", "COFORGE", "MPHASIS", "LTTS"
]

BENCHMARKS = {
    "NIFTY 50": "^NSEI",
    "BANK NIFTY": "^NSEBANK",
    "NIFTY IT": "^CNXIT"
}

POPULAR_UNIVERSES = {
    "Nifty 50": NIFTY_50_SYMBOLS,
    "Nifty Bank": NIFTY_BANK_SYMBOLS,
    "Nifty IT": NIFTY_IT_SYMBOLS,
}
