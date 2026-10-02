// ===== Análisis automático de los últimos 2 meses =====
// Usa velas de 1 día (sin importar la temporalidad que estés viendo)
// y aplica las mismas ideas que se leen a ojo en el gráfico.
// Usa REST, symbol, toBar, fmt y coinName de app.js.

const DAYS = 60;
const GREEN = '#26a69a', RED = '#ef5350', GRAY = '#8a93a6';
let lastAnalysis = null; // lo que encontró el último análisis
let highlights = null;   // lo que está dibujado ahora en el gráfico

const day = (b) => new Date(b.time * 1000).toLocaleDateString('es', { day: 'numeric', month: 'short' });
const pct = (a, b) => ((b - a) / a) * 100;
const signed = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

// Promedio de cierre de las `period` velas que terminan en la posición i
function smaAt(data, i, period) {
  if (i < period - 1) return null;
  let sum = 0;
  for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
  return sum / period;
}

async function analyze() {
  const box = document.getElementById('analysis');
  box.innerHTML = '<p>Analizando…</p>';
  document.getElementById('modal').hidden = false;

  // Pedimos 1000 días (el máximo de Binance): los últimos 60 para el análisis
  // y todo el resto para buscar situaciones parecidas en el pasado
  const res = await fetch(`${REST}/klines?symbol=${symbol}&interval=1d&limit=1000`);
  const all = (await res.json()).map(toBar);
  const start = all.length - DAYS;
  const days = all.slice(start);
  const last = all.length - 1;
  const price = all[last].close;

  const sections = [
    summary(days, price),
    trend(all, last),
    stairs(days),
    yellowLine(all, start, last, price),
    volumeInsight(days),
  ];
  const odds = probabilities(all);

  // Guardamos lo encontrado para poder dibujarlo en el gráfico
  const [, , stairsS, yellowS, volumeS] = sections;
  const markers = [
    ...yellowS.touches.map((t) => ({
      time: t.bar.time, position: 'belowBar', color: '#f5c542', shape: 'arrowUp', text: t.result === 'rebotó' ? '✓ rebotó' : t.result === 'siguió bajando' ? '✗ cayó' : '?',
    })),
    ...volumeS.top.map((b) => ({
      time: b.time, position: 'aboveBar', color: '#4c8dff', shape: 'circle', text: 'Vol. alto',
    })),
  ].sort((a, b) => a.time - b.time);
  lastAnalysis = {
    boxes: stairsS.boxes, markers, odds,
    from: days[0].time, to: days[days.length - 1].time, price,
  };

  box.innerHTML = `
    <h2>${coinName()}: últimos 2 meses</h2>
    <p class="muted">Del ${day(days[0])} al ${day(days[days.length - 1])} · cada vela = 1 día</p>
    ${sections.map((s) => `<h3>${s.title}</h3>${s.html}`).join('')}
    <h3>${odds.title}</h3>${odds.html}
    <h3>🧠 ¿Qué pensaría un trader?</h3>
    <div class="verdict">${verdict(sections)}</div>
    <button id="showOnChart" class="show">👁 Ver en el gráfico</button>
    <p class="muted">Esto es una lectura automática con reglas simples, no una predicción ni un consejo financiero.</p>
  `;
}

// 1. ¿Cuánto subió o bajó?
function summary(days, price) {
  const first = days[0].open;
  const change = pct(first, price);
  let maxBar = days[0], minBar = days[0];
  for (const b of days) {
    if (b.high > maxBar.high) maxBar = b;
    if (b.low < minBar.low) minBar = b;
  }
  const fromMax = pct(maxBar.high, price);

  const word = Math.abs(change) < 3 ? 'casi no se movió' : change > 0 ? `<b class="up">subió ${signed(change)}</b>` : `<b class="down">bajó ${signed(change)}</b>`;
  return {
    title: '📈 Resumen',
    change,
    html: `
      <p>Empezó en <b>${fmt(first)}</b> y hoy está en <b>${fmt(price)}</b>: ${word}.</p>
      <ul>
        <li>Lo más alto: <b>${fmt(maxBar.high)}</b> (${day(maxBar)})</li>
        <li>Lo más bajo: <b>${fmt(minBar.low)}</b> (${day(minBar)})</li>
        <li>Hoy está a <b>${signed(fromMax)}</b> de su punto más alto.</li>
      </ul>`,
  };
}

// 2. Tendencia: ¿hacia dónde van las líneas?
function trend(all, last) {
  const s20 = smaAt(all, last, 20), s50 = smaAt(all, last, 50);
  const s50before = smaAt(all, last - 10, 50);
  const slope = pct(s50before, s50); // cuánto se movió la azul en 10 días

  let kind, html;
  if (s20 > s50 && slope > 1) {
    kind = 'up';
    html = `La <b>azul</b> va subiendo y la <b>amarilla</b> está por encima de ella. <b class="up">Tendencia alcista</b>: lo reciente va mejor que lo de antes.`;
  } else if (s20 < s50 && slope < -1) {
    kind = 'down';
    html = `La <b>azul</b> va bajando y la <b>amarilla</b> está por debajo de ella. <b class="down">Tendencia bajista</b>: lo reciente va peor que lo de antes.`;
  } else {
    kind = 'flat';
    html = `Las líneas no van en una dirección clara (la azul casi plana o cruzándose con la amarilla). <b>Sin tendencia clara</b>.`;
  }
  return {
    title: '🧭 Tendencia (las líneas)',
    kind,
    html: `<p>${html}</p><p class="muted">Amarilla (20 días): ${fmt(s20)} · Azul (50 días): ${fmt(s50)} · La azul se movió ${signed(slope)} en 10 días.</p>`,
  };
}

// 3. Escalera: partimos los 60 días en 4 tramos y vemos si cada tramo llega más alto y más bajo que el anterior
function stairs(days) {
  const size = Math.floor(days.length / 4);
  const blocks = [];
  for (let i = 0; i < 4; i++) {
    const part = days.slice(i * size, i === 3 ? days.length : (i + 1) * size);
    blocks.push({
      from: part[0], to: part[part.length - 1],
      high: Math.max(...part.map((b) => b.high)),
      low: Math.min(...part.map((b) => b.low)),
    });
  }
  let higher = 0, lower = 0;
  for (let i = 1; i < 4; i++) {
    if (blocks[i].high > blocks[i - 1].high && blocks[i].low > blocks[i - 1].low) higher++;
    if (blocks[i].high < blocks[i - 1].high && blocks[i].low < blocks[i - 1].low) lower++;
  }

  let kind, text;
  if (higher >= 2) {
    kind = 'up';
    text = 'Sube en <b>escalones</b> 🪜: cada tramo llega más alto y sus caídas se quedan más arriba que antes. Es la forma típica de una subida sana: sube, descansa, sube.';
  } else if (lower >= 2) {
    kind = 'down';
    text = 'Baja en <b>escalones</b>: cada tramo llega más bajo y sus rebotes no alcanzan lo de antes.';
  } else {
    kind = 'flat';
    text = 'No forma una escalera clara: los tramos se pisan entre sí, va más bien <b>de lado</b>.';
  }
  // Color del cuadro: verde si el tramo quedó más arriba que el anterior, rojo si más abajo, gris si no está claro
  const boxes = blocks.map((b, i) => {
    const prev = blocks[i - 1];
    const color = !prev ? GRAY
      : b.high > prev.high && b.low > prev.low ? GREEN
      : b.high < prev.high && b.low < prev.low ? RED
      : GRAY;
    return { from: b.from.time, to: b.to.time, high: b.high, low: b.low, color, label: `Tramo ${i + 1}` };
  });
  const list = blocks.map((b, i) => `<li><b>Tramo ${i + 1}</b> (${day(b.from)} – ${day(b.to)}): entre <b>${fmt(b.low)}</b> y <b>${fmt(b.high)}</b></li>`).join('');
  return {
    title: '🪜 La forma del movimiento', kind, boxes,
    html: `<p>${text}</p><ul>${list}</ul><p class="muted">En el gráfico: cuadro verde = ese tramo quedó más arriba que el anterior, rojo = más abajo, gris = no está claro.</p>`,
  };
}

// 4. La línea amarilla como "piso": ¿cuántas veces la tocó y rebotó?
function yellowLine(all, start, last, price) {
  const touches = [];
  for (let i = start; i <= last; i++) {
    const s20 = smaAt(all, i, 20);
    const b = all[i];
    // "Tocar" = la vela bajó hasta la amarilla pero cerró cerca o encima de ella
    if (b.low <= s20 * 1.005 && b.close >= s20 * 0.99) {
      const later = all[i + 5];
      touches.push({ bar: b, result: later ? (later.close > b.close ? 'rebotó' : 'siguió bajando') : 'todavía no se sabe' });
      i += 5; // no contar la misma caída varias veces
    }
  }

  const s20 = smaAt(all, last, 20);
  const dist = pct(s20, price);
  let position, kind;
  if (Math.abs(dist) <= 2) {
    kind = 'touching';
    position = `Ahora mismo el precio está <b>tocando la amarilla</b> (${signed(dist)}). Es un momento clave: si rebota, la subida puede seguir; si la atraviesa hacia abajo, se está cansando.`;
  } else if (dist > 0) {
    kind = dist > 6 ? 'far' : 'above';
    position = `El precio está <b>${signed(dist)} por encima</b> de la amarilla.${dist > 6 ? ' Está bastante lejos: subió rápido y suele volver a acercarse a la línea.' : ''}`;
  } else {
    kind = 'below';
    position = `El precio está <b class="down">${signed(dist)} por debajo</b> de la amarilla: perdió ese "piso", señal de debilidad.`;
  }

  const list = touches.length
    ? `<ul>${touches.map((t) => `<li>${day(t.bar)}: la tocó y ${t.result}</li>`).join('')}</ul>`
    : '<p>En estos 2 meses no bajó a tocarla.</p>';
  return { title: '🟡 La línea amarilla como piso', kind, touches, html: `<p>${position}</p><p>Veces que la tocó:</p>${list}` };
}

// 5. Volumen: ¿los días con más gente fueron de subida o de bajada?
function volumeInsight(days) {
  const top = [...days].sort((a, b) => b.volume - a.volume).slice(0, 3);
  const ups = top.filter((b) => b.close > b.open).length;
  const text = ups >= 2
    ? 'La mayoría de los días con <b>más movimiento</b> fueron de <b class="up">subida</b>: cuando sube, sube con mucha gente comprando. Eso hace la subida más "seria".'
    : 'La mayoría de los días con <b>más movimiento</b> fueron de <b class="down">bajada</b>: cuando cae, mucha gente vende a la vez.';
  const list = top.map((b) => `<li>${day(b)}: ${b.close > b.open ? '🟢 subió' : '🔴 bajó'} ${signed(pct(b.open, b.close))}</li>`).join('');
  return { title: '📊 Volumen (las barras de abajo)', kind: ups >= 2 ? 'up' : 'down', top, html: `<p>${text}</p><ul>${list}</ul>` };
}

// 6. Probabilidades según el histórico
// Describimos la situación de hoy con 2 preguntas simples, buscamos en los ~1000 días
// anteriores los días con la MISMA situación y contamos qué pasó 7 días después.
const AHEAD = 7;  // cuántos días hacia adelante miramos
const FLAT = 2;   // moverse menos de ±2% cuenta como "quedó casi igual"

function situation(all, i) {
  const s20 = smaAt(all, i, 20), s50 = smaAt(all, i, 50);
  const dist = pct(s20, all[i].close);
  return {
    trend: s20 > s50 ? 'alcista' : 'bajista',
    place: Math.abs(dist) <= 2 ? 'tocando' : dist > 0 ? 'encima' : 'debajo',
  };
}

const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

function probabilities(all) {
  const last = all.length - 1;
  const now = situation(all, last);
  const placeText = { tocando: 'tocando la amarilla', encima: 'por encima de la amarilla', debajo: 'por debajo de la amarilla' };

  const changes = [];  // cuánto se movió 7 días después, en los días parecidos
  const allChanges = []; // lo mismo pero para cualquier día (para comparar)
  for (let i = 49; i + AHEAD <= last; i++) {
    const change = pct(all[i].close, all[i + AHEAD].close);
    allChanges.push(change);
    const s = situation(all, i);
    if (s.trend === now.trend && s.place === now.place) changes.push(change);
  }

  const n = changes.length;
  const ups = changes.filter((c) => c > FLAT), downs = changes.filter((c) => c < -FLAT);
  const pUp = n ? (ups.length / n) * 100 : 0;
  const pDown = n ? (downs.length / n) * 100 : 0;
  const pFlat = n ? 100 - pUp - pDown : 0;
  const medUp = median(ups), medDown = median(downs);
  const baseUp = (allChanges.filter((c) => c > FLAT).length / allChanges.length) * 100;

  const bar = (label, p, color, extra) => `
    <div class="odds-row">
      <span>${label}</span>
      <div class="odds-bar"><div style="width:${p}%;background:${color}"></div></div>
      <b>${p.toFixed(0)}%</b>
    </div>${extra ? `<p class="muted odds-extra">${extra}</p>` : ''}`;

  const years = ((last - 49) / 365).toFixed(1);
  const html = n < 15
    ? `<p>Hoy la tendencia es <b>${now.trend}</b> y el precio está <b>${placeText[now.place]}</b>, pero en el pasado casi no hubo días así (${n}). No hay suficientes casos para sacar una probabilidad.</p>`
    : `
      <p>Hoy la tendencia es <b>${now.trend}</b> y el precio está <b>${placeText[now.place]}</b>.
      En los últimos ${years} años hubo <b>${n} días</b> en esa misma situación. Esto pasó <b>${AHEAD} días después</b>:</p>
      ${bar('🟢 Subió', pUp, GREEN, ups.length ? `Cuando subió, lo normal fue ${signed(medUp)}` : '')}
      ${bar('⚪ Casi igual', pFlat, GRAY, `Se movió menos de ±${FLAT}%`)}
      ${bar('🔴 Bajó', pDown, RED, downs.length ? `Cuando bajó, lo normal fue ${signed(medDown)}` : '')}
      <p class="muted">Para comparar: tomando <i>cualquier</i> día, subió más de ${FLAT}% el ${baseUp.toFixed(0)}% de las veces.
      Si el número de arriba es parecido, la situación de hoy no da mucha ventaja.</p>
      ${n < 40 ? '<p class="muted">⚠️ Son pocos casos: tómalo con pinzas.</p>' : ''}
      <p class="muted">Ojo: días seguidos se parecen mucho entre sí, así que en realidad son menos "casos distintos" de lo que parece. El pasado no garantiza el futuro.</p>`;

  return { title: '🎲 ¿Qué pasó antes en situaciones parecidas?', html, n, pUp, pDown, pFlat, medUp, medDown };
}

// Conclusión juntando todo
function verdict(sections) {
  const [, trendS, stairsS, yellowS] = sections;
  const bullish = trendS.kind === 'up' && stairsS.kind !== 'down';

  if (bullish && yellowS.kind === 'touching')
    return '<i>"Viene subiendo y ahora bajó a tocar la amarilla. Espero: si rebota, compro. Si cierra varios días por debajo, mejor no."</i>';
  if (bullish && yellowS.kind === 'far')
    return '<i>"La tendencia es buena, pero subió muy rápido. Comprar ahora es comprar caro. Prefiero esperar a que descanse y se acerque a la amarilla."</i>';
  if (bullish && yellowS.kind === 'below')
    return '<i>"Venía subiendo, pero perdió la amarilla. Puede ser el fin de la subida. Espero a que la recupere antes de comprar."</i>';
  if (bullish)
    return '<i>"La tendencia está a favor. Si ya tengo, lo mantengo. Si quiero comprar, espero un descanso hacia la amarilla para entrar más barato."</i>';
  if (trendS.kind === 'down')
    return '<i>"La tendencia va en contra. No compro hasta que la amarilla vuelva a cruzar por encima de la azul."</i>';
  return '<i>"No hay una dirección clara. Cuando el precio va de lado es fácil perder plata. Mejor espero a que elija un camino."</i>';
}

// ===== Dibujar en el gráfico =====
// La librería no trae rectángulos, así que ponemos un canvas transparente encima
// y convertimos fecha → posición X y precio → posición Y con las funciones del gráfico.
const overlay = document.createElement('canvas');
overlay.className = 'overlay';
chartEl.appendChild(overlay);

function drawHighlights() {
  const dpr = window.devicePixelRatio || 1;
  const w = chartEl.clientWidth, h = chartEl.clientHeight;
  if (overlay.width !== w * dpr || overlay.height !== h * dpr) {
    overlay.width = w * dpr;
    overlay.height = h * dpr;
  }
  const ctx = overlay.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!highlights) return;

  // Solo dibujar dentro del área de velas (no encima de los números de los ejes)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w - chart.priceScale('right').width(), h - chart.timeScale().height());
  ctx.clip();

  const ts = chart.timeScale();
  const half = ts.options().barSpacing / 2 + 2;
  for (const b of highlights.boxes) {
    const x1 = ts.timeToCoordinate(b.from), x2 = ts.timeToCoordinate(b.to);
    const y1 = candles.priceToCoordinate(b.high), y2 = candles.priceToCoordinate(b.low);
    if ([x1, x2, y1, y2].includes(null)) continue;

    const x = x1 - half, y = y1 - 4, bw = x2 - x1 + half * 2, bh = y2 - y1 + 8;
    ctx.fillStyle = b.color + '18';
    ctx.fillRect(x, y, bw, bh);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, bw, bh);
    ctx.setLineDash([]);
    // Etiqueta con fondo para que se lea encima de las velas
    ctx.font = '600 12px system-ui, sans-serif';
    const tw = ctx.measureText(b.label).width;
    ctx.fillStyle = '#0f1218';
    const ly = y + bh + 3; // debajo del cuadro, para no tapar las marcas de arriba
    ctx.fillRect(x, ly, tw + 12, 18);
    ctx.strokeRect(x, ly, tw + 12, 18);
    ctx.fillStyle = b.color;
    ctx.fillText(b.label, x + 6, ly + 13);
  }
  drawOdds(ctx, half);
  ctx.restore();
}

// Columna a la derecha de la última vela: 3 zonas (sube / igual / baja) con su probabilidad.
// La altura de cada zona es el movimiento "normal" que tuvo en el pasado.
function drawOdds(ctx, half) {
  const o = highlights.odds;
  if (!o || o.n < 15) return;
  const ts = chart.timeScale();
  const lastX = ts.timeToCoordinate(highlights.to);
  if (lastX === null) return;

  const x = lastX + half + 4;
  const w = ts.options().barSpacing * AHEAD;
  const p = highlights.price;
  const zones = [
    { top: p * (1 + o.medUp / 100), bottom: p * (1 + FLAT / 100), color: GREEN, text: `↑ ${o.pUp.toFixed(0)}% sube`, sub: o.medUp ? signed(o.medUp) : '' },
    { top: p * (1 + FLAT / 100), bottom: p * (1 - FLAT / 100), color: GRAY, text: `= ${o.pFlat.toFixed(0)}%`, sub: '' },
    { top: p * (1 - FLAT / 100), bottom: p * (1 + o.medDown / 100), color: RED, text: `↓ ${o.pDown.toFixed(0)}% baja`, sub: o.medDown ? signed(o.medDown) : '' },
  ];

  for (const z of zones) {
    const y1 = candles.priceToCoordinate(z.top), y2 = candles.priceToCoordinate(z.bottom);
    if (y1 === null || y2 === null) continue;
    ctx.fillStyle = z.color + '30';
    ctx.fillRect(x, y1, w, y2 - y1);
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = z.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y1, w, y2 - y1);
    ctx.setLineDash([]);

    ctx.fillStyle = z.color === GRAY ? '#e6e8ec' : z.color;
    ctx.font = '700 12px system-ui, sans-serif';
    const mid = (y1 + y2) / 2;
    ctx.fillText(z.text, x + 6, z.sub ? mid - 2 : mid + 4);
    if (z.sub) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(`normal ${z.sub}`, x + 6, mid + 12);
    }
  }
  ctx.fillStyle = '#8a93a6';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(`próximos ${AHEAD} días`, x + 2, candles.priceToCoordinate(zones[0].top) - 6);
}

// Redibuja en cada cuadro de animación mientras haya marcas (así siguen al gráfico al moverlo o hacer zoom)
function loop() {
  drawHighlights();
  if (highlights) requestAnimationFrame(loop);
}

async function showOnChart() {
  document.getElementById('modal').hidden = true;
  const data = lastAnalysis;
  // El análisis es con velas de 1 día, así que cambiamos el gráfico a 1d
  interval = '1d';
  document.getElementById('interval').value = '1d';
  await start();

  highlights = data;
  candles.setMarkers(data.markers);
  // Mostramos los 60 días + espacio vacío a la derecha para la columna de probabilidades
  const firstIdx = bars.findIndex((b) => b.time === data.from);
  chart.timeScale().setVisibleLogicalRange({ from: firstIdx - 3, to: bars.length - 1 + AHEAD + 6 });
  document.getElementById('clearMarks').hidden = false;
  requestAnimationFrame(loop);
}

function clearHighlights() {
  highlights = null;
  candles.setMarkers([]);
  document.getElementById('clearMarks').hidden = true;
  drawHighlights();
}

document.getElementById('clearMarks').onclick = clearHighlights;
document.getElementById('analysis').onclick = (e) => {
  if (e.target.id === 'showOnChart') showOnChart();
};
document.getElementById('analyze').onclick = () =>
  analyze().catch(() => (document.getElementById('analysis').innerHTML = '<p>No se pudo conectar con Binance. Intenta de nuevo.</p>'));
document.getElementById('closeModal').onclick = () => (document.getElementById('modal').hidden = true);
document.getElementById('modal').onclick = (e) => {
  if (e.target.id === 'modal') e.target.hidden = true;
};
