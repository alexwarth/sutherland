import { pointDist, Position, TAU } from './helpers';

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

export function clear() {
  ctx.clearRect(0, 0, el.width, el.height);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  if (status.length > 0) {
    const fontSizeInPixels = 40;
    ctx.font = `${fontSizeInPixels}px Monaco`;
    const width = ctx.measureText(status).width;
    ctx.fillStyle = flickeryWhite();
    ctx.fillText(status, window.innerWidth - width - fontSizeInPixels, fontSizeInPixels);
  }
}

export function drawLine(a: Position, b: Position, strokeStyle = flickeryWhite()) {
  ctx.strokeStyle = strokeStyle;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

export function drawArc(c: Position, a: Position, b: Position, strokeStyle = flickeryWhite()) {
  ctx.beginPath();
  ctx.strokeStyle = strokeStyle;
  const theta1 = Math.atan2(a.y - c.y, a.x - c.x);
  const theta2 = Math.atan2(b.y - c.y, b.x - c.x);
  const fullCircle = Math.abs(theta1 - theta2) < 0.01;
  ctx.arc(c.x, c.y, pointDist(c, a), fullCircle ? 0 : theta1, fullCircle ? TAU : theta2);
  ctx.stroke();
}

export function drawText({ x, y }: Position, text: string, fillStyle = flickeryWhite()) {
  ctx.fillStyle = fillStyle;
  const fontSizeInPixels = 12;
  ctx.font = `${fontSizeInPixels}px Major Mono Display`;
  const labelWidth = ctx.measureText(text).width;
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
  const alpha = Math.random() * multiplier + baseAlpha;
  // const alpha = 0.75 * multiplier + baseAlpha;
  return `rgba(255, 255, 255, ${alpha})`;
}

let status = '';
let statusId = 0;

export function setStatus(newStatus: string) {
  status = newStatus;
  const id = ++statusId;
  setTimeout(() => {
    if (statusId === id) {
      status = '';
    }
  }, 2000);
}
