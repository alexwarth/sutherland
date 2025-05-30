import config from './config';
import { pointDist, Position, TAU } from './helpers';

export let el: HTMLCanvasElement;
export let ctx: CanvasRenderingContext2D;

let initialized = false;

export function init(_el: HTMLCanvasElement) {
  el = _el;
  ctx = el.getContext('2d')!;
  updateCanvasSize();
  initialized = true;
}

export function withGlobalAlpha(alpha: number, fn: () => void) {
  const oldAlpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  try {
    fn();
  } finally {
    ctx.globalAlpha = oldAlpha;
  }
}

function updateCanvasSize() {
  el.width = innerWidth;
  el.height = innerHeight;

  // setup the canvas for device-independent pixels
  if (devicePixelRatio !== 1) {
    const oldW = el.width;
    const oldH = el.height;
    el.width = oldW * devicePixelRatio;
    el.height = oldH * devicePixelRatio;
    el.style.width = oldW + 'px';
    el.style.height = oldH + 'px';
    ctx.scale(devicePixelRatio, devicePixelRatio);
  }
}

window.addEventListener('resize', updateCanvasSize);

export function clear() {
  ctx.clearRect(0, 0, el.width, el.height);
  ctx.lineWidth = config().lineWidth;
  ctx.lineCap = 'round';
}

function identity(pos: Position) {
  return pos;
}

export function drawPoint(p: Position, fillStyle = flickeryWhite(), transform = identity) {
  const tp = transform(p);
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.arc(tp.x, tp.y, ctx.lineWidth * 2, 0, TAU);
  ctx.fill();
}

export function drawLine(
  a: Position,
  b: Position,
  strokeStyle = flickeryWhite(),
  transform = identity,
  marginPx = 0,
  dashed = false,
) {
  const oldLineWidth = ctx.lineWidth;
  if (a.x === b.x && a.y === b.y) {
    ctx.lineWidth *= 2;
  }
  ctx.strokeStyle = strokeStyle;
  ctx.beginPath();
  if (dashed) {
    ctx.setLineDash([5, 10]);
  }
  const ta = { ...transform(a) };
  const tb = { ...transform(b) };
  let reallyDraw = true;
  if (marginPx > 0) {
    const d = pointDist(ta, tb);
    if (d > 2 * marginPx) {
      const theta = Math.atan2(tb.y - ta.y, tb.x - ta.x);
      ta.x += marginPx * Math.cos(theta);
      ta.y += marginPx * Math.sin(theta);
      tb.x -= marginPx * Math.cos(theta);
      tb.y -= marginPx * Math.sin(theta);
    } else {
      reallyDraw = false;
    }
  }
  if (reallyDraw) {
    ctx.moveTo(ta.x, ta.y);
    ctx.lineTo(tb.x, tb.y);
  }
  ctx.stroke();
  if (dashed) {
    ctx.setLineDash([]);
  }
  ctx.lineWidth = oldLineWidth;
}

export function drawDancingLine(
  a: Position,
  b: Position,
  rand: number,
  strokeStyle = flickeryWhite(),
  transform = identity,
) {
  a = transform(a);
  b = transform(b);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const angle = Math.atan2(dy, dx) + Math.PI / 2;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const dist = Math.sqrt(dx ** 2 + dy ** 2);
  const mag = (dist * Math.sin(rand + Date.now() / 300)) / 20;
  ctx.strokeStyle = strokeStyle;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.bezierCurveTo(
    a.x + dx / 3 + mag * cos,
    a.y + dy / 3 + mag * sin,
    b.x - dx / 3 - mag * cos,
    b.y - dy / 3 - mag * sin,
    b.x,
    b.y,
  );
  ctx.stroke();
}

export function drawArc(
  c: Position,
  a: Position,
  b: Position,
  direction: 'cw' | 'ccw',
  strokeStyle = flickeryWhite(),
  transform = identity,
) {
  const ta = transform(direction === 'cw' ? a : b);
  const tb = transform(direction === 'cw' ? b : a);
  const tc = transform(c);
  const theta1 = Math.atan2(ta.y - tc.y, ta.x - tc.x);
  const theta2 = Math.atan2(tb.y - tc.y, tb.x - tc.x);
  const thetasAreEqual = Math.abs(theta2 - theta1) < 0.05;
  const radius = pointDist(tc, direction === 'cw' ? ta : tb);
  ctx.strokeStyle = strokeStyle;
  ctx.beginPath();
  ctx.arc(tc.x, tc.y, radius, theta1, thetasAreEqual ? theta1 + TAU : theta2);
  ctx.stroke();
}

export function drawArcControlPoint(pos: Position, next = true) {
  ctx.strokeStyle = flickeryAccentColor(next ? 'bold' : 'light');
  ctx.beginPath();
  const radius = 10;
  ctx.arc(pos.x, pos.y, radius, 0, TAU);
  ctx.stroke();
}

export function drawCircle(x: number, y: number, radius: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

export function drawText(
  pos: Position,
  text: string,
  fillStyle = flickeryWhite(),
  transform = identity,
) {
  ctx.fillStyle = fillStyle;
  const fontSizeInPixels = 12;
  ctx.font = `${fontSizeInPixels}px Major Mono Display`;
  const labelWidth = ctx.measureText(text).width;
  const { x, y } = transform(pos);
  ctx.fillText(text, x - labelWidth / 2, y + fontSizeInPixels / 2);
}

export function flickeryWhite(weight: 'light' | 'normal' | 'bold' = 'normal') {
  let baseAlpha: number;
  let multiplier: number;
  if (weight === 'normal') {
    baseAlpha = 0.35;
    multiplier = 0.3;
  } else if (weight === 'light') {
    baseAlpha = 0.1;
    multiplier = 0.05;
  } else {
    baseAlpha = 0.7;
    multiplier = 0.1;
  }
  baseAlpha *= config().baseAlphaMultiplier;
  const alpha = config().flicker
    ? Math.random() * multiplier + baseAlpha
    : 0.75 * multiplier + baseAlpha;
  return `rgba(255,255,255,${alpha})`;
}

export function flickeryAccentColor(weight: 'light' | 'normal' | 'bold' = 'normal') {
  let baseAlpha: number;
  let multiplier: number;
  if (weight === 'normal') {
    baseAlpha = 0.35;
    multiplier = 0.3;
  } else if (weight === 'light') {
    baseAlpha = 0.25;
    multiplier = 0.05;
  } else {
    baseAlpha = 0.7;
    multiplier = 0.1;
  }
  baseAlpha *= config().baseAlphaMultiplier;
  // const rand = Math.random();
  const rand = 1;
  const alpha = config().flicker ? rand * multiplier + baseAlpha : 0.75 * multiplier + baseAlpha;
  // const alpha = 1;
  return `rgba(255,255,0,${alpha})`;
  // return `rgba(0,0,255,${alpha})`;
  // return `rgba(50,50,255,${alpha})`;
  // return `rgba(255,0,0,${alpha})`;
}
