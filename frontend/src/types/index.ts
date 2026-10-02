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
    sma_100?: IndicatorPoint[];
    ema_200: IndicatorPoint[];
    supertrend: IndicatorPoint[];
    bb_upper: IndicatorPoint[];
    bb_lower: IndicatorPoint[];
    rsi: IndicatorPoint[];
    macd: IndicatorPoint[];
    macd_signal: IndicatorPoint[];
    macd_hist: IndicatorPoint[];
  };
  strategy_signals?: Array<{
    time: string;
    position: 'aboveBar' | 'belowBar';
    color: string;
    shape: 'arrowUp' | 'arrowDown';
    text: string;
  }>;
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
  total_traded_value?: number;
  total_turnover?: number;
  winning_trades: number;
  losing_trades: number;
  win_rate_pct: number;
  profit_factor: number;
  avg_return_pct: number;
  avg_win_pct: number;
  avg_loss_pct: number;
  avg_holding_days: number;
  regime_filter_enabled?: boolean;
  regime_rule?: string;
  regime_index_symbol?: string;
  regime_blocked_days?: number;
  regime_filtered_entries?: number;
}

export interface TradeItem {
  symbol: string;
  entry_date: string;
  exit_date: string;
  entry_price: number;
  exit_price: number;
  qty: number;
  trade_value?: number;
  exit_value?: number;
  turnover?: number;
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
  regime?: 'BULL' | 'BEAR';
}

export interface MonthlyReturnItem {
  year: number;
  month: string;
  return_pct: number;
}

export interface BacktestResponse {
  execution_timing?: 'next_open' | 'same_close';
  compounding?: boolean;
  partial_tp_pct?: number | null;
  partial_tp_ratio?: number;
  breakeven_on_partial?: boolean;
  regime_filter?: boolean;
  regime_rule?: string;
  regime_index_symbol?: string;
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

export interface OptimizationTrial {
  trial_number: number;
  value: number;
  params: {
    stop_loss_pct?: number;
    take_profit_pct?: number;
    trailing_stop_pct?: number;
    risk_per_trade_pct?: number;
    max_positions?: number;
    enable_trailing_stop?: boolean;
    [key: string]: any;
  };
  metrics: {
    total_trades?: number;
    win_rate?: number;
    total_return_pct?: number;
    max_drawdown_pct?: number;
    sharpe_ratio?: number;
    cagr_pct?: number;
    profit_factor?: number;
    calmar_ratio?: number;
    [key: string]: any;
  };
}

export interface OptimizationStatusResponse {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  strategy_name: string;
  universe: string;
  study_name: string;
  target_metric: string;
  target_trials: number;
  completed_trials: number;
  progress_pct: number;
  best_value: number | null;
  best_params: Record<string, any>;
  best_metrics: Record<string, any>;
  recent_trials: OptimizationTrial[];
  error_message: string | null;
  started_at: string | null;
  last_updated_at: string | null;
  regime_filter?: boolean;
  regime_rule?: string;
  regime_index_symbol?: string;
}

export interface StrategyBasketProfile {
  strategy_name: string;
  universe: string;
  initial_capital: number;
  risk_per_trade_pct: number;
  stop_loss_pct: number | null;
  take_profit_pct: number | null;
  trailing_stop_pct: number | null;
  max_positions: number;
  compounding?: boolean;
  regime_filter?: boolean;
  regime_rule?: string;
  best_metric_name: string;
  best_metric_value: number;
  total_trades: number;
  win_rate: number;
  total_return_pct: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  cagr_pct: number;
  updated_at: string;
}

export interface SyncStatusResponse {
  is_syncing: boolean;
  is_up_to_date: boolean;
  days_behind: number;
  latest_expected_trading_day: string;
  current_db_date: string | null;
  morning_schedule_enabled: boolean;
  morning_schedule_time: string;
  auto_sync_on_open: boolean;
  last_sync_timestamp: string | null;
  last_sync_status: string;
  last_sync_summary: string | null;
  next_run_estimate: string;
  market_summary: {
    total_rows: number;
    total_symbols: number;
    min_date: string | null;
    max_date: string | null;
  };
  symbols_behind_count: number;
  symbols_behind: string[];
}
