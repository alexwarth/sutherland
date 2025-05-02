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

export function clear(fillStyle: string) {
  ctx.clearRect(0, 0, el.width, el.height);
  ctx.fillStyle = fillStyle;
  ctx.fillRect(0, 0, el.width, el.height);
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
) {
  const oldLineWidth = ctx.lineWidth;
  if (a.x === b.x && a.y === b.y) {
    ctx.lineWidth *= 2;
  }
  ctx.strokeStyle = strokeStyle;
  ctx.beginPath();
  const ta = transform(a);
  const tb = transform(b);
  ctx.moveTo(ta.x, ta.y);
  ctx.lineTo(tb.x, tb.y);
  ctx.stroke();
  ctx.lineWidth = oldLineWidth;
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
  fontSize = 12,
) {
  ctx.fillStyle = fillStyle;
  const fontSizeInPixels = fontSize;
  ctx.font = `${fontSizeInPixels}px monospace`;
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
