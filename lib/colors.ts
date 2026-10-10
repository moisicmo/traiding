import type { Competitor } from './paper-bot'

// Colores de los gráficos. En un archivo aparte para que también los lean las páginas del servidor
// (un componente 'use client' no puede exportar valores normales a una página del servidor).
export const COLORS = {
  bg: '#0f1218',
  grid: '#1c212b',
  muted: '#8a93a6',
  text: '#e6e8ec',
  up: '#26a69a',
  down: '#ef5350',
  sma20: '#f5c542',
  sma50: '#4c8dff',
}

// Un color por competidor (líneas del gráfico y marquitas); "no tocar" en gris
export const COMPETITOR_COLORS: Record<Competitor | 'hold', string> = {
  learn: '#ffffff',
  learn2: '#e879f9',
  trendplus: '#7c83ff',
  trend: COLORS.sma50,
  poc: '#b98bff',
  fib: '#ff9f43',
  smc: '#ff6fae',
  rsi: '#2ec4b6',
  boll: '#f25f5c',
  turtle: '#8bd450',
  trend1d: '#9ec5ff',
  turtle1d: '#2f8f4e',
  hybrid: '#d4ff3a',
  half: '#ff8a65',
  half1d: '#ffc2a8',
  golden: '#c49a6c',
  rebal: '#5ad1ff',
  hold: COLORS.muted,
}
export const REAL_COLOR = '#f0b90b' // 💰 el bot real (amarillo Binance)
