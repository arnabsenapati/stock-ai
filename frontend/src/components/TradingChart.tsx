'use client';

import React, { useEffect, useRef, useState } from 'react';
import { 
  createChart, 
  CandlestickSeries, 
  LineSeries, 
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  ColorType
} from 'lightweight-charts';
import { ChartDataResponse, CandleItem } from '../types';
import { Eye, EyeOff, Layers, BarChart2, Activity } from 'lucide-react';

interface TradingChartProps {
  data: ChartDataResponse | null;
  loading: boolean;
  chartType: 'candlestick' | 'heikin_ashi' | 'renko' | 'line';
  onChartTypeChange: (type: 'candlestick' | 'heikin_ashi' | 'renko' | 'line') => void;
}

export default function TradingChart({ 
  data, 
  loading, 
  chartType, 
  onChartTypeChange 
}: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const oscContainerRef = useRef<HTMLDivElement>(null);

  const [activeOverlays, setActiveOverlays] = useState({
    ema9: true,
    ema21: true,
    ema50: false,
    ema200: true,
    supertrend: true,
    bollinger: false
  });

  const [activeOscillator, setActiveOscillator] = useState<'rsi' | 'macd' | 'none'>('rsi');
  const [hoverData, setHoverData] = useState<{
    date?: string;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
    rsi?: number;
  }>({});

  useEffect(() => {
    if (!chartContainerRef.current || !data || data.candles.length === 0) return;

    // Clean any existing canvas
    chartContainerRef.current.innerHTML = '';
    if (oscContainerRef.current) oscContainerRef.current.innerHTML = '';

    const width = chartContainerRef.current.clientWidth;
    const priceHeight = activeOscillator === 'none' ? 520 : 380;

    // 1. Create Main Price Chart
    const mainChart: IChartApi = createChart(chartContainerRef.current, {
      width: width,
      height: priceHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#0d1117' },
        textColor: '#8b949e',
        fontSize: 12
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' }
      },
      crosshair: {
        vertLine: { color: '#58a6ff', width: 1, style: 1 },
        horzLine: { color: '#58a6ff', width: 1, style: 1 }
      },
      timeScale: {
        borderColor: '#30363d',
        timeVisible: true
      },
      rightPriceScale: {
        borderColor: '#30363d',
        autoScale: true
      }
    });

    // Add Candlestick Series
    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350'
    });

    const candleData = data.candles.map(c => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    }));
    candleSeries.setData(candleData);

    // Add Volume Series at bottom of price pane
    const volumeSeries = mainChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume_scale'
    });
    mainChart.priceScale('volume_scale').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 }
    });
    volumeSeries.setData(data.volume);

    // Add Overlays
    if (activeOverlays.ema9 && data.indicators.ema_9.length > 0) {
      const s = mainChart.addSeries(LineSeries, { color: '#38bdf8', lineWidth: 1, title: 'EMA 9' });
      s.setData(data.indicators.ema_9);
    }
    if (activeOverlays.ema21 && data.indicators.ema_21.length > 0) {
      const s = mainChart.addSeries(LineSeries, { color: '#fb923c', lineWidth: 1, title: 'EMA 21' });
      s.setData(data.indicators.ema_21);
    }
    if (activeOverlays.ema50 && data.indicators.ema_50.length > 0) {
      const s = mainChart.addSeries(LineSeries, { color: '#818cf8', lineWidth: 2, title: 'EMA 50' });
      s.setData(data.indicators.ema_50);
    }
    if (activeOverlays.ema200 && data.indicators.ema_200.length > 0) {
      const s = mainChart.addSeries(LineSeries, { color: '#e879f9', lineWidth: 2, title: 'EMA 200' });
      s.setData(data.indicators.ema_200);
    }
    if (activeOverlays.bollinger && data.indicators.bb_upper.length > 0) {
      const u = mainChart.addSeries(LineSeries, { color: 'rgba(148, 163, 184, 0.6)', lineWidth: 1, title: 'BB Upper' });
      const l = mainChart.addSeries(LineSeries, { color: 'rgba(148, 163, 184, 0.6)', lineWidth: 1, title: 'BB Lower' });
      u.setData(data.indicators.bb_upper);
      l.setData(data.indicators.bb_lower);
    }
    if (activeOverlays.supertrend && data.indicators.supertrend.length > 0) {
      const stSeries = mainChart.addSeries(LineSeries, { color: '#10b981', lineWidth: 2, title: 'SuperTrend' });
      stSeries.setData(data.indicators.supertrend.map(p => ({
        time: p.time,
        value: p.value
      })));
    }

    // 2. Create Secondary Oscillator Pane (RSI or MACD)
    let oscChart: IChartApi | null = null;
    if (activeOscillator !== 'none' && oscContainerRef.current) {
      oscChart = createChart(oscContainerRef.current, {
        width: width,
        height: 160,
        layout: {
          background: { type: ColorType.Solid, color: '#0d1117' },
          textColor: '#8b949e',
          fontSize: 11
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.05)' }
        },
        timeScale: {
          borderColor: '#30363d',
          timeVisible: true
        },
        rightPriceScale: {
          borderColor: '#30363d'
        }
      });

      if (activeOscillator === 'rsi' && data.indicators.rsi.length > 0) {
        const rsiSeries = oscChart.addSeries(LineSeries, { color: '#a78bfa', lineWidth: 2, title: 'RSI(14)' });
        rsiSeries.setData(data.indicators.rsi);

        // Add 70 & 30 reference lines
        const upper = oscChart.addSeries(LineSeries, { color: 'rgba(239, 68, 68, 0.5)', lineWidth: 1, lineStyle: 2 });
        const lower = oscChart.addSeries(LineSeries, { color: 'rgba(34, 197, 94, 0.5)', lineWidth: 1, lineStyle: 2 });
        upper.setData(data.candles.map(c => ({ time: c.time, value: 70 })));
        lower.setData(data.candles.map(c => ({ time: c.time, value: 30 })));
      } else if (activeOscillator === 'macd' && data.indicators.macd.length > 0) {
        const macdSeries = oscChart.addSeries(LineSeries, { color: '#38bdf8', lineWidth: 1, title: 'MACD' });
        const sigSeries = oscChart.addSeries(LineSeries, { color: '#f43f5e', lineWidth: 1, title: 'Signal' });
        const histSeries = oscChart.addSeries(HistogramSeries, { title: 'Histogram' });

        macdSeries.setData(data.indicators.macd);
        sigSeries.setData(data.indicators.macd_signal);
        histSeries.setData(data.indicators.macd_hist);
      }

      // Synchronize time scales
      mainChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range && oscChart) {
          oscChart.timeScale().setVisibleLogicalRange(range);
        }
      });
      oscChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) {
          mainChart.timeScale().setVisibleLogicalRange(range);
        }
      });
    }

    // Crosshair tooltip updates
    mainChart.subscribeCrosshairMove(param => {
      if (!param.time || !param.seriesData) return;
      const bar = param.seriesData.get(candleSeries) as any;
      if (bar) {
        setHoverData({
          date: String(param.time),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close
        });
      }
    });

    // Fit content
    mainChart.timeScale().fitContent();

    // Resize listener
    const handleResize = () => {
      if (chartContainerRef.current) {
        const newWidth = chartContainerRef.current.clientWidth;
        mainChart.applyOptions({ width: newWidth });
        if (oscChart && oscContainerRef.current) {
          oscChart.applyOptions({ width: newWidth });
        }
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      mainChart.remove();
      if (oscChart) oscChart.remove();
    };
  }, [data, activeOverlays, activeOscillator, chartType]);

  const toggleOverlay = (key: keyof typeof activeOverlays) => {
    setActiveOverlays(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const currentBar = hoverData.close ? hoverData : (data?.latest ? {
    open: data.latest.open,
    high: data.latest.high,
    low: data.latest.low,
    close: data.latest.close,
    volume: data.latest.volume,
    date: data.candles[data.candles.length - 1]?.time
  } : {});

  const changePct = currentBar.close && currentBar.open 
    ? (((currentBar.close - currentBar.open) / currentBar.open) * 100).toFixed(2)
    : '0.00';
  const isUp = parseFloat(changePct) >= 0;

  return (
    <div className="flex flex-col flex-1 bg-[#0d1117] rounded-xl border border-zinc-800 overflow-hidden shadow-2xl">
      {/* Top Chart Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-[#161b22] border-b border-zinc-800 gap-2">
        {/* Symbol Info & Price Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-white tracking-wide">{data?.symbol || 'NSE'}</span>
            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">NSE EOD</span>
          </div>
          {currentBar.close && (
            <div className="flex items-center gap-3 font-mono text-sm">
              <span className="text-zinc-200 font-semibold">₹{currentBar.close.toFixed(2)}</span>
              <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${isUp ? 'bg-emerald-950/80 text-emerald-400' : 'bg-rose-950/80 text-rose-400'}`}>
                {isUp ? '+' : ''}{changePct}%
              </span>
              <span className="text-xs text-zinc-400 hidden sm:inline">
                O: <span className="text-zinc-200">{currentBar.open?.toFixed(2)}</span> | 
                H: <span className="text-zinc-200">{currentBar.high?.toFixed(2)}</span> | 
                L: <span className="text-zinc-200">{currentBar.low?.toFixed(2)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Chart Types & Overlays */}
        <div className="flex items-center gap-2">
          {/* Chart Type Toggle */}
          <div className="flex items-center bg-[#0d1117] rounded-lg p-0.5 border border-zinc-800 text-xs">
            {(['candlestick', 'heikin_ashi', 'renko'] as const).map(type => (
              <button
                key={type}
                onClick={() => onChartTypeChange(type)}
                className={`px-2.5 py-1 rounded transition-all capitalize font-medium ${
                  chartType === type 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {type === 'heikin_ashi' ? 'Heikin-Ashi' : type === 'renko' ? 'Renko' : 'Candles'}
              </button>
            ))}
          </div>

          {/* Indicator Overlays Selector */}
          <div className="flex items-center gap-1.5 bg-[#0d1117] px-2 py-1 rounded-lg border border-zinc-800 text-xs">
            <span className="text-zinc-500 flex items-center gap-1 mr-1">
              <Layers className="w-3.5 h-3.5" /> Overlays:
            </span>
            <button 
              onClick={() => toggleOverlay('ema9')}
              className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors ${activeOverlays.ema9 ? 'bg-sky-950 text-sky-400 border border-sky-800' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              EMA 9
            </button>
            <button 
              onClick={() => toggleOverlay('ema21')}
              className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors ${activeOverlays.ema21 ? 'bg-orange-950 text-orange-400 border border-orange-800' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              EMA 21
            </button>
            <button 
              onClick={() => toggleOverlay('ema50')}
              className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors ${activeOverlays.ema50 ? 'bg-indigo-950 text-indigo-400 border border-indigo-800' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              EMA 50
            </button>
            <button 
              onClick={() => toggleOverlay('ema200')}
              className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors ${activeOverlays.ema200 ? 'bg-fuchsia-950 text-fuchsia-400 border border-fuchsia-800' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              EMA 200
            </button>
            <button 
              onClick={() => toggleOverlay('supertrend')}
              className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors ${activeOverlays.supertrend ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              SuperTrend
            </button>
            <button 
              onClick={() => toggleOverlay('bollinger')}
              className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors ${activeOverlays.bollinger ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Bollinger
            </button>
          </div>

          {/* Lower Pane Oscillator Toggle */}
          <div className="flex items-center bg-[#0d1117] rounded-lg p-0.5 border border-zinc-800 text-xs">
            {(['rsi', 'macd', 'none'] as const).map(osc => (
              <button
                key={osc}
                onClick={() => setActiveOscillator(osc)}
                className={`px-2 py-1 rounded uppercase font-mono font-medium transition-all ${
                  activeOscillator === osc 
                    ? 'bg-zinc-700 text-zinc-100' 
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {osc}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="relative flex-1 w-full bg-[#0d1117]">
        {loading && (
          <div className="absolute inset-0 bg-[#0d1117]/80 backdrop-blur-sm z-30 flex items-center justify-center">
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Computing 100+ Indicators & Rendering Canvas...
            </div>
          </div>
        )}

        <div ref={chartContainerRef} className="w-full" />
        {activeOscillator !== 'none' && (
          <div className="border-t border-zinc-800/80">
            <div className="px-3 py-1 bg-[#12161f] text-[11px] text-zinc-400 font-mono uppercase tracking-wider">
              {activeOscillator === 'rsi' ? 'RSI (14, Wilder Smooth)' : 'MACD (12, 26, 9)'}
            </div>
            <div ref={oscContainerRef} className="w-full" />
          </div>
        )}
      </div>
    </div>
  );
}
