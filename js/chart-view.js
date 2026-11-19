// Draws the captain's log's chart (js/cartography.js works out what goes where) on a canvas: on the log's sheet, and
// as the picture Save chart makes. Nothing here keeps state.
import { chartRings, chartXY } from './cartography.js';

const rgb = c => `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
const ringLabel = d => `${d.toLocaleString('en-US')} ly`;

// The chart `size` across, at (ox, oy) on `g`. `chart` from chartOf, `edge` from chartEdge; `colorOf(i)` is a star's
// colour as [r, g, b] from 0 to 1, `titleOf(i)` its name; `selected` a star to ring; `unit` scales the lines and type
// (1 on the sheet, about 2.5 on the picture). Returns the dots, in canvas pixels, for taps: [{ x, y, star }].
export function drawChart(g, chart, { size, ox = 0, oy = 0, edge, colorOf, titleOf, selected = -1, unit = 1, labels = 12 }) {
  const pad = 26 * unit, mid = size / 2;
  const at = s => { const [x, y] = chartXY(s, edge, size, pad); return [ox + x, oy + y]; };
  const byStar = new Map(chart.stars.map(s => [s.star, s]));
  const place = i => (i === 0 ? [ox + mid, oy + mid] : at(byStar.get(i)));
  g.save();
  // The rings, with their distances along the top.
  g.lineWidth = unit;
  g.font = `500 ${10 * unit}px "Chakra Petch", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  for (const d of chartRings(edge)) {
    const r = at({ x: d, y: 0 })[1];
    g.strokeStyle = 'rgba(140, 180, 255, 0.22)';
    g.setLineDash([3 * unit, 4 * unit]);
    g.beginPath(); g.arc(ox + mid, oy + mid, oy + mid - r, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(147, 160, 184, 0.9)';
    g.fillText(ringLabel(d), ox + mid, r - 2 * unit);
  }
  // Which way is which, at the edge.
  g.fillStyle = 'rgba(114, 127, 151, 1)';
  g.font = `600 ${9 * unit}px "Chakra Petch", sans-serif`;
  g.textBaseline = 'top';
  g.fillText('TOWARD THE GALACTIC CENTRE', ox + mid, oy + 4 * unit);
  g.textBaseline = 'bottom';
  g.fillText('TOWARD THE RIM', ox + mid, oy + size - 4 * unit);
  // The flights, oldest faintest, the latest brightest.
  const n = chart.legs.length;
  chart.legs.forEach(([a, b], k) => {
    const [x1, y1] = place(a), [x2, y2] = place(b);
    g.strokeStyle = `rgba(255, 181, 74, ${(0.18 + 0.6 * ((k + 1) / n) ** 2).toFixed(3)})`;
    g.lineWidth = (k === n - 1 ? 1.6 : 1) * unit;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  });
  // Home.
  g.fillStyle = '#ffd27a';
  g.beginPath(); g.arc(ox + mid, oy + mid, 3.5 * unit, 0, Math.PI * 2); g.fill();
  g.font = `600 ${11 * unit}px "Chakra Petch", sans-serif`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText('Sol', ox + mid + 7 * unit, oy + mid);
  // The stars, the farthest drawn first so a near one sits on top.
  const dots = [];
  const order = [...chart.stars].sort((p, q) => q.ly - p.ly);
  for (const s of order) {
    const [x, y] = at(s);
    g.fillStyle = rgb(colorOf(s.star));
    g.beginPath(); g.arc(x, y, (s.star === selected ? 4.5 : 3) * unit, 0, Math.PI * 2); g.fill();
    if (s.star === selected) {
      g.strokeStyle = '#86d8ff'; g.lineWidth = 1.5 * unit;
      g.beginPath(); g.arc(x, y, 9 * unit, 0, Math.PI * 2); g.stroke();
    }
    dots.push({ x, y, star: s.star });
  }
  // Names, for the chosen star and then the most visited and farthest, where they fit without overlapping.
  g.font = `500 ${10.5 * unit}px "IBM Plex Sans", sans-serif`;
  const boxes = [[ox + mid - 4 * unit, oy + mid - 8 * unit, ox + mid + 30 * unit, oy + mid + 8 * unit]];
  const wanted = [...chart.stars].sort((p, q) => (q.star === selected) - (p.star === selected) || q.visits - p.visits || q.ly - p.ly);
  let named = 0;
  for (const s of wanted) {
    if (named >= labels && s.star !== selected) break;
    const [x, y] = at(s);
    const t = titleOf(s.star), w = g.measureText(t).width, h = 12 * unit;
    const right = x + 6 * unit + w < ox + size - 2 * unit;
    const bx = right ? x + 6 * unit : x - 6 * unit - w;
    const box = [bx, y - h / 2, bx + w, y + h / 2];
    if (s.star !== selected && boxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    boxes.push(box);
    g.textAlign = 'left';
    // A dark edge round each name keeps it readable where it crosses a ring or a flight.
    g.strokeStyle = 'rgba(5, 7, 13, 0.85)'; g.lineWidth = 3 * unit; g.lineJoin = 'round';
    g.strokeText(t, bx, y);
    g.fillStyle = s.star === selected ? '#e8edf6' : 'rgba(232, 237, 246, 0.78)';
    g.fillText(t, bx, y);
    named++;
  }
  g.restore();
  return dots;
}
