import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional

class ChartTypeConverter:
    @staticmethod
    def to_heikin_ashi(df: pd.DataFrame) -> pd.DataFrame:
        """Convert standard OHLC dataframe into Heikin-Ashi candlestick dataframe"""
        if df.empty:
            return df

        ha_df = df.copy()
        ha_close = (df['open'] + df['high'] + df['low'] + df['close']) / 4
        
        ha_open = np.zeros(len(df))
        ha_open[0] = (df['open'].iloc[0] + df['close'].iloc[0]) / 2
        
        for i in range(1, len(df)):
            ha_open[i] = (ha_open[i-1] + ha_close.iloc[i-1]) / 2

        ha_high = np.maximum(df['high'].values, np.maximum(ha_open, ha_close.values))
        ha_low = np.minimum(df['low'].values, np.minimum(ha_open, ha_close.values))

        ha_df['open'] = ha_open
        ha_df['high'] = ha_high
        ha_df['low'] = ha_low
        ha_df['close'] = ha_close.values
        return ha_df

    @staticmethod
    def to_renko(df: pd.DataFrame, brick_size: Optional[float] = None, atr_period: int = 14) -> List[Dict[str, Any]]:
        """
        Convert OHLC dataframe to Renko bricks.
        If brick_size is None, dynamically computes from ATR.
        """
        if df.empty:
            return []

        # Calculate brick size from ATR if not given
        if brick_size is None or brick_size <= 0:
            tr = pd.concat([
                df['high'] - df['low'],
                (df['high'] - df['close'].shift(1)).abs(),
                (df['low'] - df['close'].shift(1)).abs()
            ], axis=1).max(axis=1)
            atr = tr.rolling(atr_period).mean().dropna()
            brick_size = float(round(atr.iloc[-1], 2)) if not atr.empty else 10.0
            if brick_size <= 0:
                brick_size = 5.0

        bricks = []
        prices = df['close'].values
        dates = df['date'].astype(str).values
        
        current_brick = prices[0]
        
        for i in range(1, len(prices)):
            price = prices[i]
            d = dates[i]
            diff = price - current_brick
            
            num_bricks = int(abs(diff) // brick_size)
            if num_bricks >= 1:
                direction = 1 if diff > 0 else -1
                for _ in range(num_bricks):
                    prev = current_brick
                    current_brick = prev + (direction * brick_size)
                    bricks.append({
                        "date": d,
                        "open": round(prev, 2),
                        "close": round(current_brick, 2),
                        "high": round(max(prev, current_brick), 2),
                        "low": round(min(prev, current_brick), 2),
                        "type": "up" if direction == 1 else "down",
                        "brick_size": brick_size
                    })

        return bricks

chart_converter = ChartTypeConverter()
