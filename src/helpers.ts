export interface Position {
  x: number;
  y: number;
}

let nextId = 0;
export function generateId() {
  return nextId++;
}

export const TAU = Math.PI * 2;

export function pointDist(a: Position, b: Position) {
  return Math.sqrt(pointDist2(a, b));
}

export function pointDist2(a: Position, b: Position) {
  return Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2);
}

export function pointDiff(a: Position, b: Position) {
  return { x: a.x - b.x, y: a.y - b.y };
}

// from https://stackoverflow.com/questions/849211/shortest-distance-between-a-point-and-a-line-segment

export function pointDistToLineSegment(p: Position, v: Position, w: Position) {
  return Math.sqrt(pointDistToSegment2(p, v, w));
}

function pointDistToSegment2(p: Position, v: Position, w: Position) {
  const l = pointDist2(v, w);
  if (l == 0) {
    return pointDist2(p, v);
  }

  const t = Math.max(0, Math.min(((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l, 1));
  return pointDist2(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}
