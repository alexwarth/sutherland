import { config } from './config';
import { easeOutQuint, pointDist, Position } from './helpers';

export let el: HTMLCanvasElement;
export let ctx: CanvasRenderingContext2D;

export function init(_el: HTMLCanvasElement) {
  el = _el;
  ctx = el.getContext('2d')!;

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

let status = '';
let statusTimeMillis = 0;

export function setStatus(newStatus: string) {
  status = newStatus;
  statusTimeMillis = Date.now();
}

export function clear() {
  ctx.clearRect(0, 0, el.width, el.height);
  ctx.lineWidth = config.lineWidth;
  ctx.lineCap = 'round';

  if (status.length > 0) {
    const fontSizeInPixels = 40;
    ctx.font = `${fontSizeInPixels}px Monaco`;
    const width = ctx.measureText(status).width;
    const statusAgeMillis = Date.now() - statusTimeMillis;
    if (statusAgeMillis > config.statusTimeMillis) {
      status = '';
    } else {
      const alpha = 1 - easeOutQuint(statusAgeMillis / config.statusTimeMillis);
      ctx.fillStyle = `rgba(255,222,33,${alpha})`;
      ctx.fillText(
        status,
        (innerWidth - width) / 2,
        innerHeight - fontSizeInPixels
      );
    }
  }
}

function identity(pos: Position) {
  return pos;
}

export function drawLine(
  a: Position,
  b: Position,
  strokeStyle = flickeryWhite(),
  transform = identity
) {
  ctx.strokeStyle = strokeStyle;
  ctx.beginPath();
  const ta = transform(a);
  const tb = transform(b);
  ctx.moveTo(ta.x, ta.y);
  ctx.lineTo(tb.x, tb.y);
  ctx.stroke();
}

export function drawArc(
  c: Position,
  a: Position,
  b: Position,
  strokeStyle = flickeryWhite(),
  transform = identity
) {
  const ta = transform(a);
  const tb = transform(b);
  const tc = transform(c);
  ctx.beginPath();
  ctx.strokeStyle = strokeStyle;
  const theta1 = Math.atan2(ta.y - tc.y, ta.x - tc.x);
  const theta2 = Math.atan2(tb.y - tc.y, tb.x - tc.x);
  ctx.arc(tc.x, tc.y, pointDist(tc, ta), theta1, theta2);
  ctx.stroke();
}

export function drawText(
  pos: Position,
  text: string,
  fillStyle = flickeryWhite(),
  transform = identity
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
  baseAlpha *= config.baseAlphaMultiplier;
  const alpha = config.flicker
    ? Math.random() * multiplier + baseAlpha
    : 0.75 * multiplier + baseAlpha;
  return `rgba(255,255,255,${alpha})`;
}
