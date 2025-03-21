import { pointDiff, pointDist, Position } from './helpers';
import * as display from './display';
import scope from './scope';

// Positions are in "world coordinates"
type Primitive =
  | { type: 'line'; a: Position; b: Position }
  | { type: 'arc'; a: Position; b: Position; c: Position; direction: 'cw' | 'ccw' };

let primitives: Primitive[] = [];

export function addLine(a: Position, b: Position) {
  primitives.push({ type: 'line', a, b });
}

export function addArc(a: Position, b: Position, c: Position, direction: 'cw' | 'ccw') {
  primitives.push({ type: 'arc', a, b, c, direction });
}

export function clear() {
  primitives = [];
}

export function rasterize() {
  // TODO: clip!
  // - reject primitives that are completely outside of the scope
  // - only add spots that are on the scope
  display.clearSpots();
  for (const p of primitives) {
    switch (p.type) {
      case 'line':
        line(scope.toDisplayPosition(p.a), scope.toDisplayPosition(p.b));
        break;
      case 'arc':
        arc(scope.toDisplayPosition(p.a), scope.toDisplayPosition(p.b), scope.toDisplayPosition(p.c), p.direction);
        break;
    }
  }
}

function shouldRejectLine(a: Position, b: Position) {
  // TODO
}

function line(a: Position, b: Position) {
  const delta = pointDiff(b, a);
  const dist = pointDist(a, b);
  // debugger;
  const d = display.getParam('spotSize') * 0.8;
  // debugger;
  for (let i = 0; i < dist; i += d) {
    const x = a.x + (delta.x * i) / dist;
    const y = a.y + (delta.y * i) / dist;
    display.addSpot(x, y);
  }
}

function arc(a: Position, b: Position, c: Position, direction: 'cw' | 'ccw') {
  // line(a, b);
  // line(b, c);
  // line(c, a);

  const theta1 = Math.atan2(a.y - c.y, a.x - c.x);
  const theta2 = Math.atan2(b.y - c.y, b.x - c.x);
  const radius = pointDist(c, a);
  const dTheta = direction === 'ccw' ? theta2 - theta1 : Math.PI * 2 - (theta2 - theta1);
  const circ = Math.abs(dTheta) * radius;
  const d = display.getParam('spotSize') * 0.8;
  const delta = theta2 - theta1;
  // console.log('r', radius, 'dTheta', dTheta, circ, d, circ / d);
  for (let i = 0; i < circ; i += d) {
    const angle = theta1 + (i / circ) * delta;
    const x = c.x + radius * Math.cos(angle);
    const y = c.y + radius * Math.sin(angle);
    display.addSpot(x, y);
  }
}
