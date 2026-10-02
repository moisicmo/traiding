// ===== Configuración =====
// API pública de Binance: no necesita cuenta ni API key para leer precios.
// Docs: https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints
const REST = 'https://api.binance.com/api/v3';
const WS = 'wss://stream.binance.com:9443/ws';
const FEE = 0.001; // Binance cobra ~0.1% por operación
const START_USDT = 1000;

let symbol = 'BTCUSDT';
let interval = '1h';
let lastPrice = null;
let socket = null;

// ===== Gráfico =====
const chartEl = document.getElementById('chart');
const chart = LightweightCharts.createChart(chartEl, {
  autoSize: true,
  layout: { background: { color: '#0f1218' }, textColor: '#8a93a6' },
  grid: { vertLines: { color: '#1c212b' }, horzLines: { color: '#1c212b' } },
  timeScale: { timeVisible: true, secondsVisible: false },
});

const candles = chart.addCandlestickSeries({
  upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
  wickUpColor: '#26a69a', wickDownColor: '#ef5350',
});

const volume = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

// Medias móviles: el indicador más básico para ver la tendencia
const sma20 = chart.addLineSeries({ color: '#f5c542', lineWidth: 1, title: 'SMA 20' });
const sma50 = chart.addLineSeries({ color: '#4c8dff', lineWidth: 1, title: 'SMA 50' });

let bars = [];

// Convierte una vela de Binance [openTime, open, high, low, close, volume, ...] a nuestro formato
function toBar(k) {
  return {
    time: k[0] / 1000,
    open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
  };
}

function sma(data, period) {
  const out = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    out.push({ time: data[i].time, value: sum / period });
  }
  return out;
}

function volumeBar(b) {
  return { time: b.time, value: b.volume, color: b.close >= b.open ? '#26a69a55' : '#ef535055' };
}

function drawAll() {
  candles.setData(bars);
  volume.setData(bars.map(volumeBar));
  sma20.setData(sma(bars, 20));
  sma50.setData(sma(bars, 50));
}

async function loadHistory() {
  const res = await fetch(`${REST}/klines?symbol=${symbol}&interval=${interval}&limit=500`);
  bars = (await res.json()).map(toBar);
  drawAll();
  chart.timeScale().fitContent();
}

async function load24h() {
  const res = await fetch(`${REST}/ticker/24hr?symbol=${symbol}`);
  const t = await res.json();
  const pct = +t.priceChangePercent;
  const el = document.getElementById('change');
  el.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% 24h`;
  el.className = pct >= 0 ? 'up' : 'down';
}

// WebSocket: Binance nos empuja cada actualización de la vela en tiempo real
function connectLive() {
  if (socket) socket.close();
  socket = new WebSocket(`${WS}/${symbol.toLowerCase()}@kline_${interval}`);
  socket.onmessage = (msg) => {
    const k = JSON.parse(msg.data).k;
    const bar = toBar([k.t, k.o, k.h, k.l, k.c, k.v]);

    if (bars.length && bars[bars.length - 1].time === bar.time) bars[bars.length - 1] = bar;
    else bars.push(bar);

    candles.update(bar);
    volume.update(volumeBar(bar));
    const s20 = sma(bars.slice(-20), 20), s50 = sma(bars.slice(-50), 50);
    if (s20.length) sma20.update(s20[0]);
    if (s50.length) sma50.update(s50[0]);

    setPrice(bar.close);
  };
}

function setPrice(p) {
  lastPrice = p;
  document.getElementById('price').textContent = fmt(p);
  document.title = `${fmt(p)} ${symbol}`;
  renderWallet();
}

async function start() {
  if (typeof clearHighlights === 'function') clearHighlights(); // definida en analysis.js
  bars = [];
  lastPrice = null;
  document.getElementById('coinLabel').textContent = coinName();
  await Promise.all([loadHistory(), load24h()]);
  setPrice(bars[bars.length - 1].close);
  connectLive();
}

// ===== Simulador de trading (paper trading) =====
// Guarda el estado en el navegador para que no se pierda al recargar.
function loadWallet() {
  try {
    return JSON.parse(localStorage.getItem('wallet')) ?? newWallet();
  } catch {
    return newWallet();
  }
}
function newWallet() {
  return { usdt: START_USDT, coins: {}, history: [] };
}
function saveWallet() {
  try { localStorage.setItem('wallet', JSON.stringify(wallet)); } catch {}
}

let wallet = loadWallet();
const coinName = () => symbol.replace('USDT', '');

function buy() {
  const amount = +document.getElementById('amount').value;
  if (!lastPrice || amount <= 0) return;
  if (amount > wallet.usdt) return alert('No tienes suficiente USDT');

  const qty = (amount * (1 - FEE)) / lastPrice;
  wallet.usdt -= amount;
  const pos = wallet.coins[symbol] ?? { qty: 0, cost: 0 };
  pos.qty += qty;
  pos.cost += amount; // cuánto USDT has metido en total (para calcular ganancia)
  wallet.coins[symbol] = pos;
  log(`Compra ${qty.toFixed(6)} ${coinName()} a ${fmt(lastPrice)}`);
}

function sell() {
  const pos = wallet.coins[symbol];
  if (!lastPrice || !pos || pos.qty <= 0) return;

  const received = pos.qty * lastPrice * (1 - FEE);
  const profit = received - pos.cost;
  wallet.usdt += received;
  log(`Venta ${pos.qty.toFixed(6)} ${coinName()} a ${fmt(lastPrice)} → ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} USDT`);
  delete wallet.coins[symbol];
}

function log(text) {
  wallet.history.unshift(`${new Date().toLocaleString()} · ${text}`);
  saveWallet();
  renderWallet();
}

function renderWallet() {
  const pos = wallet.coins[symbol];
  const posValue = pos && lastPrice ? pos.qty * lastPrice : 0;

  // Valor total: USDT + todas las monedas (las otras con su último costo como aproximación)
  const others = Object.entries(wallet.coins)
    .filter(([s]) => s !== symbol)
    .reduce((sum, [, p]) => sum + p.cost, 0);
  const total = wallet.usdt + posValue + others;
  const pnl = total - START_USDT;

  document.getElementById('usdt').textContent = wallet.usdt.toFixed(2);
  document.getElementById('coin').textContent = pos ? pos.qty.toFixed(6) : '0';
  document.getElementById('total').textContent = `${total.toFixed(2)} USDT`;
  const pnlEl = document.getElementById('pnl');
  pnlEl.textContent = `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} (${((pnl / START_USDT) * 100).toFixed(2)}%)`;
  pnlEl.className = pnl >= 0 ? 'up' : 'down';

  document.getElementById('history').innerHTML = wallet.history
    .slice(0, 30)
    .map((h) => `<li>${h}</li>`)
    .join('');
}

const fmt = (n) => n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 4 : 2 });

// ===== Eventos =====
document.getElementById('symbol').onchange = (e) => { symbol = e.target.value; start(); };
document.getElementById('interval').onchange = (e) => { interval = e.target.value; start(); };
document.getElementById('buy').onclick = buy;
document.getElementById('sell').onclick = sell;
document.getElementById('reset').onclick = () => {
  if (confirm('¿Reiniciar con 1000 USDT?')) { wallet = newWallet(); saveWallet(); renderWallet(); }
};

start();
