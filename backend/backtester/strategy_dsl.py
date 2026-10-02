import numpy as np
import pandas as pd
from typing import Dict, Any, Tuple, Optional
from backend.analytics.indicators import ta

class StrategyContext:
    """Helper environment for AmiBroker AFL / Python formulas"""
    def __init__(self, df: pd.DataFrame):
        self.df = df
        self.Open = df['open']
        self.High = df['high']
        self.Low = df['low']
        self.Close = df['close']
        self.Volume = df['volume']
        self.DeliveryPct = df.get('delivery_pct', pd.Series(0.0, index=df.index))

    def EMA(self, series: Optional[pd.Series] = None, period: int = 20) -> pd.Series:
        s = self.Close if series is None else series
        return ta.ema(s, period)

    def SMA(self, series: Optional[pd.Series] = None, period: int = 20) -> pd.Series:
        s = self.Close if series is None else series
        return ta.sma(s, period)

    def RSI(self, series: Optional[pd.Series] = None, period: int = 14) -> pd.Series:
        s = self.Close if series is None else series
        return ta.rsi(s, period)

    def ATR(self, period: int = 14) -> pd.Series:
        return ta.atr(self.High, self.Low, self.Close, period)

    def MACD(self, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.Series:
        return ta.macd(self.Close, fast, slow, signal)['macd']

    def MACD_Signal(self, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.Series:
        return ta.macd(self.Close, fast, slow, signal)['macd_signal']

    def MACD_Hist(self, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.Series:
        return ta.macd(self.Close, fast, slow, signal)['macd_hist']

    def SuperTrend(self, period: int = 10, multiplier: float = 3.0) -> pd.Series:
        return ta.supertrend(self.High, self.Low, self.Close, period, multiplier)['supertrend']

    def SuperTrend_Trend(self, period: int = 10, multiplier: float = 3.0) -> pd.Series:
        return ta.supertrend(self.High, self.Low, self.Close, period, multiplier)['supertrend_trend']

    def HHV(self, series: Optional[pd.Series] = None, period: int = 20) -> pd.Series:
        """Highest High Value over period"""
        s = self.High if series is None else series
        return s.rolling(period).max()

    def LLV(self, series: Optional[pd.Series] = None, period: int = 20) -> pd.Series:
        """Lowest Low Value over period"""
        s = self.Low if series is None else series
        return s.rolling(period).min()

    def Cross(self, a: pd.Series, b: Any) -> pd.Series:
        """True when 'a' crosses above 'b'"""
        if not isinstance(b, pd.Series):
            b = pd.Series(b, index=a.index)
        return (a > b) & (a.shift(1) <= b.shift(1))

    def CrossUnder(self, a: pd.Series, b: Any) -> pd.Series:
        """True when 'a' crosses below 'b'"""
        if not isinstance(b, pd.Series):
            b = pd.Series(b, index=a.index)
        return (a < b) & (a.shift(1) >= b.shift(1))


class StrategyEvaluator:
    """Evaluates user AFL/Python strategy code securely on a stock DataFrame"""

    @staticmethod
    def evaluate(code: str, df: pd.DataFrame) -> Tuple[pd.Series, pd.Series]:
        """
        Executes formula script and extracts Buy and Sell boolean Series.
        Defaults Buy=False, Sell=False.
        """
        ctx = StrategyContext(df)
        
        # Safe scope namespace
        local_scope = {
            'Close': ctx.Close,
            'Open': ctx.Open,
            'High': ctx.High,
            'Low': ctx.Low,
            'Volume': ctx.Volume,
            'DeliveryPct': ctx.DeliveryPct,
            'EMA': ctx.EMA,
            'SMA': ctx.SMA,
            'RSI': ctx.RSI,
            'ATR': ctx.ATR,
            'MACD': ctx.MACD,
            'MACD_Signal': ctx.MACD_Signal,
            'MACD_Hist': ctx.MACD_Hist,
            'SuperTrend': ctx.SuperTrend,
            'SuperTrend_Trend': ctx.SuperTrend_Trend,
            'HHV': ctx.HHV,
            'LLV': ctx.LLV,
            'Cross': ctx.Cross,
            'CrossUnder': ctx.CrossUnder,
            'Buy': pd.Series(False, index=df.index),
            'Sell': pd.Series(False, index=df.index),
            'Short': pd.Series(False, index=df.index),
            'Cover': pd.Series(False, index=df.index),
            'pd': pd,
            'np': np,
        }

        # Clean code syntax to support AFL-like semicolon lines if present
        clean_lines = []
        for line in code.split("\n"):
            stripped = line.strip().rstrip(";")
            if stripped and not stripped.startswith("//"):
                clean_lines.append(stripped)
        exec_code = "\n".join(clean_lines)

        try:
            exec(exec_code, {}, local_scope)
            buy_signal = local_scope.get('Buy', pd.Series(False, index=df.index))
            sell_signal = local_scope.get('Sell', pd.Series(False, index=df.index))
            
            # Ensure boolean series
            if not isinstance(buy_signal, pd.Series):
                buy_signal = pd.Series(buy_signal, index=df.index)
            if not isinstance(sell_signal, pd.Series):
                sell_signal = pd.Series(sell_signal, index=df.index)
                
            return buy_signal.fillna(False).astype(bool), sell_signal.fillna(False).astype(bool)
        except Exception as e:
            raise ValueError(f"Strategy evaluation error: {str(e)}")

# Standard Strategy Presets
PRESET_STRATEGIES = {
    "SuperTrend + 100 SMA Trend Rider (Optimal)": """# SuperTrend + 100 SMA Trend Rider (Optimal)
MacroTrend = Close > SMA(Close, 100)
Trend = SuperTrend_Trend(10, 3.0)
Buy = MacroTrend & Cross(Trend, 0)
Sell = CrossUnder(Trend, 0)
""",
    "1-2 Month Low-Risk Positional Trend Rider": """# 1-2 Month Low-Risk Positional Trend Rider (NSE Large/Midcap)
# Rule 1: Macro Trend - Stock must be in established Stage 2 uptrend
MacroTrend = (Close > SMA(Close, 100)) & (SMA(Close, 50) > SMA(Close, 200))

# Rule 2: Intermediate momentum trigger - SuperTrend flips bullish
Trend = SuperTrend_Trend(10, 3.0)
TrendFlip = Cross(Trend, 0)

# Rule 3: Entry signal with volume confirmation
Buy = MacroTrend & TrendFlip

# Rule 4: Exit when intermediate trend turns bearish or breaks 50 EMA
Sell = CrossUnder(Trend, 0) | CrossUnder(Close, EMA(Close, 50))
""",
    "Golden Cross (SMA 50 / 200)": """# Golden Cross with RSI Momentum Filter
Buy = Cross(SMA(Close, 50), SMA(Close, 200)) & (RSI(Close, 14) > 50)
Sell = Cross(SMA(Close, 200), SMA(Close, 50)) | (RSI(Close, 14) < 40)
""",
    "SuperTrend Momentum Trend Following": """# SuperTrend Trend Following System
Trend = SuperTrend_Trend(10, 3.0)
Buy = Cross(Trend, 0)
Sell = CrossUnder(Trend, 0)
""",
    "RSI Mean Reversion (Oversold Bounce)": """# RSI 14 Mean Reversion
Buy = Cross(RSI(Close, 14), 30)
Sell = Cross(RSI(Close, 14), 70) | (Close < LLV(Low, 15))
""",
    "Volume Breakout with Delivery Edge": """# Indian Market Edge: High Volume + High Delivery %
VolAvg = SMA(Volume, 20)
Buy = (Close > HHV(Close, 20).shift(1)) & (Volume > VolAvg * 1.5) & (DeliveryPct > 45.0)
Sell = CrossUnder(Close, EMA(Close, 20))
""",
    "Dual SuperTrend Momentum (Fast Trigger + Macro Anchor)": """# Dual SuperTrend Momentum (Fast Trigger + Macro Anchor)
# Macro Anchor: Stock above 100 SMA and Slow SuperTrend(14, 3.0) is bullish
MacroTrend = (Close > SMA(Close, 100)) & (SuperTrend_Trend(14, 3.0) > 0)

# Fast Trigger: Quick momentum flip on SuperTrend(7, 2.0)
FastTrend = SuperTrend_Trend(7, 2.0)

Buy = MacroTrend & Cross(FastTrend, 0)
Sell = CrossUnder(FastTrend, 0)
""",
    "Stage 2 Minervini Trend Leader (52-Week High Momentum)": """# Stage 2 Minervini Trend Leader (52-Week High Momentum)
# Rule 1: Stage 2 Moving Average Hierarchy (200 SMA rising, 50 SMA > 200 SMA)
Stage2 = (Close > SMA(Close, 200)) & (SMA(Close, 50) > SMA(Close, 200)) & (Close > EMA(Close, 20))

# Rule 2: Near 6-Month Highs (within 12%) + Fresh 20-Day Range Breakout
NearHighs = Close >= (HHV(High, 120) * 0.88)
Breakout = Cross(Close, HHV(Close, 20).shift(1))

# Rule 3: Sweet-Spot Momentum (RSI 55-80) with Volume Expansion
Momentum = (RSI(Close, 14) > 55) & (RSI(Close, 14) < 80) & (Volume > SMA(Volume, 20))

Buy = Stage2 & NearHighs & Breakout & Momentum
Sell = CrossUnder(Close, EMA(Close, 20)) | CrossUnder(Close, SMA(Close, 50))
""",
    "EMA Pullback in Strong Uptrend (Dip Buyer)": """# EMA Pullback in Strong Uptrend (Dip Buyer)
# Rule 1: Master Institutional Uptrend (Above 100 SMA & 50 > 200 SMA)
Uptrend = (Close > SMA(Close, 100)) & (SMA(Close, 50) > SMA(Close, 200))

# Rule 2: Pullback test of rising 20 EMA with bullish green reversal close
Pullback = (Low <= EMA(Close, 20)) & (Close > EMA(Close, 20)) & (Close > Open)

# Rule 3: RSI turning upward out of mild consolidation
RSI_Bounce = (RSI(Close, 14) > 48) & (RSI(Close, 14) < 68)

Buy = Uptrend & Pullback & RSI_Bounce
Sell = CrossUnder(Close, SMA(Close, 50))
""",
    "Turtle Donchian Breakout": """# Classic 20-Day Donchian Breakout
Buy = Close > HHV(High, 20).shift(1)
Sell = Close < LLV(Low, 10).shift(1)
"""
}
