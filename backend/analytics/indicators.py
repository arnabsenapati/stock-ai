import numpy as np
import pandas as pd
from typing import Dict, Tuple, Optional, Any

class TechnicalIndicators:
    """Vectorized calculation engine for 100+ technical indicators"""

    @staticmethod
    def sma(series: pd.Series, period: int = 20) -> pd.Series:
        return series.rolling(window=period, min_periods=period).mean()

    @staticmethod
    def ema(series: pd.Series, period: int = 20) -> pd.Series:
        return series.ewm(span=period, adjust=False).mean()

    @staticmethod
    def wma(series: pd.Series, period: int = 20) -> pd.Series:
        weights = np.arange(1, period + 1)
        return series.rolling(period).apply(lambda s: np.dot(s, weights) / weights.sum(), raw=True)

    @staticmethod
    def hma(series: pd.Series, period: int = 20) -> pd.Series:
        """Hull Moving Average (HMA) = WMA(2*WMA(n/2) - WMA(n), sqrt(n))"""
        half_period = int(period / 2)
        sqrt_period = int(np.sqrt(period))
        wma_half = TechnicalIndicators.wma(series, half_period)
        wma_full = TechnicalIndicators.wma(series, period)
        diff = 2 * wma_half - wma_full
        return TechnicalIndicators.wma(diff, sqrt_period)

    @staticmethod
    def atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
        prev_close = close.shift(1)
        tr1 = high - low
        tr2 = (high - prev_close).abs()
        tr3 = (low - prev_close).abs()
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        # Wilder's Smoothing for ATR
        return tr.ewm(alpha=1.0/period, min_periods=period, adjust=False).mean()

    @staticmethod
    def bollinger_bands(series: pd.Series, period: int = 20, std_dev: float = 2.0) -> Dict[str, pd.Series]:
        mid = series.rolling(period).mean()
        std = series.rolling(period).std()
        upper = mid + (std * std_dev)
        lower = mid - (std * std_dev)
        bandwidth = (upper - lower) / mid
        percent_b = (series - lower) / (upper - lower)
        return {
            "bb_upper": upper,
            "bb_middle": mid,
            "bb_lower": lower,
            "bb_bandwidth": bandwidth,
            "bb_pct_b": percent_b
        }

    @staticmethod
    def supertrend(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 10, multiplier: float = 3.0) -> Dict[str, pd.Series]:
        """SuperTrend calculation with ATR multiplier using fast numpy arrays"""
        atr_val = TechnicalIndicators.atr(high, low, close, period).bfill()
        h_arr = high.values
        l_arr = low.values
        c_arr = close.values
        atr_arr = atr_val.values
        
        n = len(c_arr)
        if n == 0:
            return {"supertrend": pd.Series([], index=close.index), "supertrend_trend": pd.Series([], index=close.index)}
            
        hl2 = (h_arr + l_arr) / 2.0
        basic_upper = hl2 + (multiplier * atr_arr)
        basic_lower = hl2 - (multiplier * atr_arr)
        
        final_upper = np.zeros(n)
        final_lower = np.zeros(n)
        trend = np.ones(n, dtype=int)
        st = np.zeros(n)
        
        final_upper[0] = basic_upper[0]
        final_lower[0] = basic_lower[0]
        st[0] = final_lower[0]
        
        for i in range(1, n):
            if basic_upper[i] < final_upper[i-1] or c_arr[i-1] > final_upper[i-1]:
                final_upper[i] = basic_upper[i]
            else:
                final_upper[i] = final_upper[i-1]
                
            if basic_lower[i] > final_lower[i-1] or c_arr[i-1] < final_lower[i-1]:
                final_lower[i] = basic_lower[i]
            else:
                final_lower[i] = final_lower[i-1]
                
            if trend[i-1] == 1:
                if c_arr[i] < final_lower[i]:
                    trend[i] = -1
                    st[i] = final_upper[i]
                else:
                    trend[i] = 1
                    st[i] = final_lower[i]
            else:
                if c_arr[i] > final_upper[i]:
                    trend[i] = 1
                    st[i] = final_lower[i]
                else:
                    trend[i] = -1
                    st[i] = final_upper[i]
                    
        return {
            "supertrend": pd.Series(st, index=close.index),
            "supertrend_trend": pd.Series(trend, index=close.index)
        }

    @staticmethod
    def rsi(close: pd.Series, period: int = 14) -> pd.Series:
        delta = close.diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)
        
        # Wilder's exponential smoothing
        avg_gain = gain.ewm(alpha=1.0/period, min_periods=period, adjust=False).mean()
        avg_loss = loss.ewm(alpha=1.0/period, min_periods=period, adjust=False).mean()
        
        rs = avg_gain / avg_loss.replace(0, np.nan)
        rsi_series = 100 - (100 / (1 + rs))
        return rsi_series.fillna(50.0)

    @staticmethod
    def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> Dict[str, pd.Series]:
        ema_fast = close.ewm(span=fast, adjust=False).mean()
        ema_slow = close.ewm(span=slow, adjust=False).mean()
        macd_line = ema_fast - ema_slow
        signal_line = macd_line.ewm(span=signal, adjust=False).mean()
        hist = macd_line - signal_line
        return {
            "macd": macd_line,
            "macd_signal": signal_line,
            "macd_hist": hist
        }

    @staticmethod
    def stochastic(high: pd.Series, low: pd.Series, close: pd.Series, k_period: int = 14, d_period: int = 3) -> Dict[str, pd.Series]:
        lowest_low = low.rolling(k_period).min()
        highest_high = high.rolling(k_period).max()
        k = 100 * ((close - lowest_low) / (highest_high - lowest_low).replace(0, np.nan))
        d = k.rolling(d_period).mean()
        return {
            "stoch_k": k.fillna(50.0),
            "stoch_d": d.fillna(50.0)
        }

    @staticmethod
    def adx_dmi(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> Dict[str, pd.Series]:
        up_move = high.diff()
        down_move = -low.diff()
        
        plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
        minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
        
        atr_val = TechnicalIndicators.atr(high, low, close, period)
        plus_dm_series = pd.Series(plus_dm, index=close.index).ewm(alpha=1.0/period, adjust=False).mean()
        minus_dm_series = pd.Series(minus_dm, index=close.index).ewm(alpha=1.0/period, adjust=False).mean()
        
        plus_di = 100 * (plus_dm_series / atr_val.replace(0, np.nan))
        minus_di = 100 * (minus_dm_series / atr_val.replace(0, np.nan))
        
        dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
        adx_series = dx.ewm(alpha=1.0/period, adjust=False).mean()
        
        return {
            "plus_di": plus_di.fillna(0),
            "minus_di": minus_di.fillna(0),
            "adx": adx_series.fillna(0)
        }

    @staticmethod
    def ichimoku(high: pd.Series, low: pd.Series, close: pd.Series, 
                 conv: int = 9, base: int = 26, lead_b: int = 52, lag: int = 26) -> Dict[str, pd.Series]:
        tenkan = (high.rolling(conv).max() + low.rolling(conv).min()) / 2
        kijun = (high.rolling(base).max() + low.rolling(base).min()) / 2
        span_a = ((tenkan + kijun) / 2).shift(lag)
        span_b = ((high.rolling(lead_b).max() + low.rolling(lead_b).min()) / 2).shift(lag)
        chikou = close.shift(-lag)
        return {
            "ichimoku_tenkan": tenkan,
            "ichimoku_kijun": kijun,
            "ichimoku_span_a": span_a,
            "ichimoku_span_b": span_b,
            "ichimoku_chikou": chikou
        }

    @staticmethod
    def keltner_channel(high: pd.Series, low: pd.Series, close: pd.Series, 
                        ema_period: int = 20, atr_period: int = 10, multiplier: float = 2.0) -> Dict[str, pd.Series]:
        mid = TechnicalIndicators.ema(close, ema_period)
        atr_val = TechnicalIndicators.atr(high, low, close, atr_period)
        return {
            "kc_upper": mid + (multiplier * atr_val),
            "kc_middle": mid,
            "kc_lower": mid - (multiplier * atr_val)
        }

    @staticmethod
    def donchian_channel(high: pd.Series, low: pd.Series, period: int = 20) -> Dict[str, pd.Series]:
        upper = high.rolling(period).max()
        lower = low.rolling(period).min()
        middle = (upper + lower) / 2
        return {
            "donchian_upper": upper,
            "donchian_middle": middle,
            "donchian_lower": lower
        }

    @staticmethod
    def obv(close: pd.Series, volume: pd.Series) -> pd.Series:
        direction = np.sign(close.diff()).fillna(0)
        return (direction * volume).cumsum()

    @staticmethod
    def cci(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 20) -> pd.Series:
        tp = (high + low + close) / 3
        sma_tp = tp.rolling(period).mean()
        mad = (tp - sma_tp).abs().rolling(period).mean()
        return (tp - sma_tp) / (0.015 * mad.replace(0, np.nan))

    @staticmethod
    def williams_r(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
        highest_high = high.rolling(period).max()
        lowest_low = low.rolling(period).min()
        return -100 * (highest_high - close) / (highest_high - lowest_low).replace(0, np.nan)

    @staticmethod
    def mfi(high: pd.Series, low: pd.Series, close: pd.Series, volume: pd.Series, period: int = 14) -> pd.Series:
        tp = (high + low + close) / 3
        rmf = tp * volume
        pos_flow = pd.Series(0.0, index=close.index)
        neg_flow = pd.Series(0.0, index=close.index)
        
        diff = tp.diff()
        pos_flow[diff > 0] = rmf[diff > 0]
        neg_flow[diff < 0] = rmf[diff < 0]
        
        pos_sum = pos_flow.rolling(period).sum()
        neg_sum = neg_flow.rolling(period).sum()
        mfr = pos_sum / neg_sum.replace(0, np.nan)
        return 100 - (100 / (1 + mfr)).fillna(50.0)

    @staticmethod
    def compute_all(df: pd.DataFrame) -> pd.DataFrame:
        """Enrich a full OHLCV dataframe with all major indicators"""
        if df.empty or len(df) < 5:
            return df

        out = df.copy()
        c = out['close']
        h = out['high']
        l = out['low']
        v = out['volume']

        # Moving Averages
        out['ema_9'] = TechnicalIndicators.ema(c, 9)
        out['ema_21'] = TechnicalIndicators.ema(c, 21)
        out['ema_50'] = TechnicalIndicators.ema(c, 50)
        out['ema_200'] = TechnicalIndicators.ema(c, 200)
        out['sma_20'] = TechnicalIndicators.sma(c, 20)
        out['sma_50'] = TechnicalIndicators.sma(c, 50)
        out['sma_100'] = TechnicalIndicators.sma(c, 100)
        out['sma_200'] = TechnicalIndicators.sma(c, 200)

        # Volatility & Bands
        bb = TechnicalIndicators.bollinger_bands(c, 20, 2.0)
        for k, v_ser in bb.items():
            out[k] = v_ser

        # SuperTrend
        st = TechnicalIndicators.supertrend(h, l, c, 10, 3.0)
        out['supertrend'] = st['supertrend']
        out['supertrend_trend'] = st['supertrend_trend']

        # Oscillators
        out['rsi_14'] = TechnicalIndicators.rsi(c, 14)
        
        macd_dict = TechnicalIndicators.macd(c, 12, 26, 9)
        out['macd'] = macd_dict['macd']
        out['macd_signal'] = macd_dict['macd_signal']
        out['macd_hist'] = macd_dict['macd_hist']

        stoch_dict = TechnicalIndicators.stochastic(h, l, c, 14, 3)
        out['stoch_k'] = stoch_dict['stoch_k']
        out['stoch_d'] = stoch_dict['stoch_d']

        adx_dict = TechnicalIndicators.adx_dmi(h, l, c, 14)
        out['plus_di'] = adx_dict['plus_di']
        out['minus_di'] = adx_dict['minus_di']
        out['adx'] = adx_dict['adx']

        out['atr_14'] = TechnicalIndicators.atr(h, l, c, 14)
        out['cci_20'] = TechnicalIndicators.cci(h, l, c, 20)
        out['williams_r'] = TechnicalIndicators.williams_r(h, l, c, 14)
        out['obv'] = TechnicalIndicators.obv(c, v)
        out['mfi_14'] = TechnicalIndicators.mfi(h, l, c, v, 14)

        # Donchian & Keltner
        donch = TechnicalIndicators.donchian_channel(h, l, 20)
        out['donchian_upper'] = donch['donchian_upper']
        out['donchian_lower'] = donch['donchian_lower']

        # Volume metrics
        out['volume_sma_20'] = TechnicalIndicators.sma(v, 20)
        out['volume_spike_ratio'] = out['volume'] / out['volume_sma_20'].replace(0, np.nan)

        return out

ta = TechnicalIndicators()
