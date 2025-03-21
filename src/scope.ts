import { Position } from './helpers';

let scale = 1;
const center: Position = { x: 0, y: 0 };

export default {
  reset() {
    scale = 1;
    this.centerAt({ x: 0, y: 0 });
  },

  get scale() {
    return scale;
  },
  set scale(newScale: number) {
    scale = newScale;
  },

  centerAt({ x, y }: Position) {
    center.x = x;
    center.y = y;
  },
  get center() {
    return center;
  },
  set center(newCenter) {
    this.centerAt(newCenter);
  },

  toDisplayPosition({ x, y }: Position) {
    const displayScale = (scale * 1024) / innerWidth;
    return {
      x: (x - center.x) * displayScale + 1024 / 2,
      y: (y - center.y) * displayScale + 1024 / 2,
    };
  },
  toScreenPosition({ x, y }: Position) {
    return {
      x: (x - center.x) * scale + innerWidth / 2,
      y: -(y - center.y) * scale + innerHeight / 2,
    };
  },
  fromScreenPosition({ x, y }: Position) {
    return {
      x: (x - innerWidth / 2) / scale + center.x,
      y: center.y - (y - innerHeight / 2) / scale,
    };
  },
};
