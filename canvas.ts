import { TAU } from './src/helpers';
import Vec from './src/lib/vec';
import { Position } from './src/types';

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
  ctx.lineWidth = 2;
}

export function drawLine(a: Position, b: Position, strokeStyle = flickeryWhite()) {
  ctx.strokeStyle = strokeStyle;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

export function drawArc(
  a: Position,
  b: Position | null,
  c: Position,
  strokeStyle = flickeryWhite(),
) {
  ctx.beginPath();

  if (b) {
    ctx.strokeStyle = strokeStyle;
    const theta1 = Math.atan2(a.y - c.y, a.x - c.x);
    const theta2 = Math.atan2(b.y - c.y, b.x - c.x);
    ctx.arc(c.x, c.y, Vec.dist(c, a), theta1, theta2);
    ctx.stroke();
  }

  ctx.strokeStyle = flickeryWhite('light');
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(a.x, a.y);
  if (b) {
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

export function drawCircle(pos: Position, r: number, strokeStyle = flickeryWhite()) {
  ctx.strokeStyle = strokeStyle;
  ctx.beginPath();
  circle(pos, r);
  ctx.closePath();
  ctx.stroke();
}

export function fillCircle(pos: Position, r: number, fillStyle = flickeryWhite()) {
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  circle(pos, r);
  ctx.closePath();
  ctx.fill();
}

function circle({ x, y }: Position, r: number) {
  ctx.arc(x, y, r, 0, TAU);
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
    baseAlpha = 0.9;
    multiplier = 0.1;
  }
  const alpha = Math.random() * multiplier + baseAlpha;
  return `rgba(255, 255, 255, ${alpha})`;
}
