import Vec from './vec';

export function distToPoint(line: { a: Position; b: Position }, point: Position) {
  return Vec.dist(point, closestPoint(line, point));
}

export function closestPoint(line: { a: Position; b: Position }, point: Position, strict = true) {
  const { a, b } = line;
  const ab = Vec.sub(b, a);
  const ap = Vec.sub(point, a);

  // Special case for when a === b, w/o which we get NaNs.
  if (isZero(ab.x) && isZero(ab.y)) {
    // TODO: revise
    return a;
  }

  // Calculate the projection of AP onto AB
  const projection = Vec.dot(ap, ab) / Vec.dot(ab, ab);

  // Check if the projection is outside the line segment
  if (strict && projection <= 0) {
    return a;
  } else if (strict && projection >= 1) {
    return b;
  } else {
    return Vec.add(a, Vec.mulS(ab, projection));
  }
}

function isZero(n: number) {
  return Math.abs(n) < Number.EPSILON;
}
