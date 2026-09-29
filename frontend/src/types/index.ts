export interface CandleItem {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface IndicatorPoint {
  time: string;
  value: number;
  color?: string;
  trend?: number;
}

export interface RenkoBrick {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  type: 'up' | 'down';
  brick_size: number;
}

export interface ChartDataResponse {
  symbol: string;
  chart_type: 'candlestick' | 'heikin_ashi' | 'renko' | 'line';
  total_bars: number;
  latest: {
    close: number;
    open: number;
    high: number;
    low: number;
    volume: number;
    change_pct: number;
  };
  candles: CandleItem[];
  volume: IndicatorPoint[];
  delivery: IndicatorPoint[];
  indicators: {
    ema_9: IndicatorPoint[];
    ema_21: IndicatorPoint[];
    ema_50: IndicatorPoint[];
    ema_200: IndicatorPoint[];
    supertrend: IndicatorPoint[];
    bb_upper: IndicatorPoint[];
    bb_lower: IndicatorPoint[];
    rsi: IndicatorPoint[];
    macd: IndicatorPoint[];
    macd_signal: IndicatorPoint[];
    macd_hist: IndicatorPoint[];
  };
  renko_bricks: RenkoBrick[];
}

export interface BacktestMetrics {
  initial_capital: number;
  final_equity: number;
  net_profit: number;
  total_return_pct: number;
  cagr_pct: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate_pct: number;
  profit_factor: number;
  avg_return_pct: number;
  avg_win_pct: number;
  avg_loss_pct: number;
  avg_holding_days: number;
}

export interface TradeItem {
  symbol: string;
  entry_date: string;
  exit_date: string;
  entry_price: number;
  exit_price: number;
  qty: number;
  pnl: number;
  return_pct: number;
  holding_days: number;
  exit_reason: string;
}

export interface EquityPoint {
  date: string;
  equity: number;
  cash: number;
  invested: number;
  open_positions: number;
}

export interface MonthlyReturnItem {
  year: number;
  month: string;
  return_pct: number;
}

export interface BacktestResponse {
  metrics: BacktestMetrics;
  equity_curve: EquityPoint[];
  trades: TradeItem[];
  monthly_returns: MonthlyReturnItem[];
}

export interface ScreenerMatch {
  symbol: string;
  close: number;
  change_pct: number;
  volume: number;
  volume_ratio: number;
  delivery_pct: number;
  rsi: number;
  supertrend: string;
  supertrend_val?: number;
  sma_100?: number;
  dist_sma100_pct?: number;
  signal_type: 'BUY' | 'SELL' | 'NEUTRAL';
  signal_timing?: string;
  signal_date?: string;
  signal_details: string;
  date: string;
}

export interface ScreenerResponse {
  universe: string;
  scan_type: string;
  lookback_days?: number;
  signal_filter?: string;
  scanned_count: number;
  match_count: number;
  results: ScreenerMatch[];
}
