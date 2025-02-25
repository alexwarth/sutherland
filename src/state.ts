import * as canvas from './canvas';
import { pointDist, Position } from './helpers';

// TODO: make this work when auto-solve is on
// right now it's creating too many worlds b/c we always tweak every variable's value +/- 1,
// most of the time only to change it back to the orig. value.

class World {
  private writes = new WeakMap<Var<any>, any>();
  private parentValueCache = new WeakRef(new WeakMap<Var<any>, any>());
  readonly children = new Set<World>();
  private sealed = false;

  constructor(readonly parent?: World) {}

  set<T>(v: Var<T>, newValue: T) {
    const oldValue = this.get(v);
    if (oldValue === newValue) {
      // no op
    } else if (this.sealed && this.writes.has(v)) {
      thisWorld = this.sprout();
      thisWorld.set(v, newValue);
    } else {
      this.writes.set(v, newValue);
    }
  }

  get<T>(v: Var<T>): T {
    if (this.writes.has(v)) {
      return this.writes.get(v);
    }

    let cache = this.parentValueCache.deref();
    if (cache?.has(v)) {
      return this.parentValueCache.deref()!.get(v);
    }

    const value = this.parent?.get(v);
    if (!cache) {
      cache = new WeakMap();
      this.parentValueCache = new WeakRef(cache);
    }
    cache.set(v, value);
    return value!;
  }

  private sprout() {
    this.seal(); // don't want any more changes here after we have children
    const child = new World(this);
    this.children.add(child);
    return child;
  }

  seal() {
    this.sealed = true;
  }

  // for rendering

  x = -100;
  y = -100;
  depth = 0;
  breadth = 0;
  rand = Math.random() * 100;

  updateRenderingInfo() {
    if (this.children.size === 0) {
      this.depth = 1;
      this.breadth = 1;
    } else {
      [...this.children].forEach((c) => c.updateRenderingInfo());
      this.breadth = [...this.children].map((c) => c.breadth).reduce((b1, b2) => b1 + b2, 0);
      this.depth =
        1 + [...this.children].map((c) => c.depth).reduce((d1, d2) => Math.max(d1, d2), 0);
    }
  }

  render(x0: number, y0: number, xStep: number, yStep: number) {
    this.x = x0;
    this.y = y0;
    let y = y0;
    for (const w of this.children) {
      w.render(x0 + xStep, y, xStep, yStep);
      canvas.drawLine({ x: x0, y: y0 }, { x: x0 + xStep, y }, 'cornflowerblue');
      y += w.breadth * yStep;
    }
    this.renderCircle('cornflowerblue');
  }

  renderCircle(color: string) {
    canvas.drawCircle(this.x, this.y, 6 + 0.5 * Math.sin(Date.now() / 300 + this.rand), color);
  }
}

const topLevelWorld = new World();
let thisWorld = topLevelWorld;

export function sealThisWorld() {
  thisWorld.seal();
}

export function updateWorldRenderingInfo() {
  topLevelWorld.updateRenderingInfo();
}

export function renderWorlds() {
  topLevelWorld.render(20, 20, (innerWidth - 40) / (topLevelWorld.depth - 1), 20);
  thisWorld.renderCircle('yellow');
}

export function maybeTimeTravelToWorldAt(p: Position) {
  let bestWorld: World | null = null;
  let bestDist = Infinity;
  const tooFar = 20;
  visit(topLevelWorld);
  if (bestWorld) {
    thisWorld = bestWorld;
    // console.log(thisWorld);
  }

  function visit(w: World) {
    const d = pointDist(p, w);
    if (d < tooFar && d < bestDist) {
      bestWorld = w;
      bestDist = d;
    }
    w.children.forEach(visit);
  }
}

export class Var<T> {
  constructor(value: T) {
    this.value = value;
  }

  get value(): T {
    return thisWorld.get(this);
  }

  set value(newValue: T) {
    thisWorld.set(this, newValue);
  }
}

export class WorldlessVar<T> extends Var<T> {
  constructor(private _value: T) {
    super(_value);
  }

  override get value() {
    return this._value;
  }

  override set value(newValue: T) {
    this._value = newValue;
  }
}

export class List<T> {
  private readonly _first = new Var<ListNode<T> | null>(null);

  get first() {
    return this._first.value;
  }

  set first(newFirst: ListNode<T> | null) {
    this._first.value = newFirst;
  }

  constructor(...xs: T[]) {
    for (let idx = xs.length - 1; idx >= 0; idx--) {
      this.unshift(xs[idx]);
    }
  }

  clear() {
    this.first = null;
  }

  isEmpty() {
    return this.first === null;
  }

  includes(t: T) {
    let ans = false;
    this.forEach((x) => {
      if (x === t) {
        ans = true;
      }
    });
    return ans;
  }

  find(pred: (x: T) => boolean) {
    let ans: T | undefined;
    this.forEach((x) => {
      if (ans === undefined && pred(x)) {
        ans = x;
      }
    });
    return ans;
  }

  unshift(x: T) {
    this.first = new ListNode(x, this.first);
  }

  pop() {
    if (this.first == null) {
      throw new Error();
    }
    const ans = this.first.value;
    this.first = this.first.next;
    return ans;
  }

  filter(pred: (x: T) => boolean) {
    const ans = new List<T>();
    this.forEach((x) => {
      if (pred(x)) {
        ans.unshift(x);
      }
    });
    return ans.reversed();
  }

  map<S>(fn: (x: T) => S): List<S> {
    const ans = new List<S>();
    this.forEach((x) => {
      ans.unshift(fn(x));
    });
    return ans.reversed();
  }

  reversed() {
    const ans = new List<T>();
    this.forEach((x) => ans.unshift(x));
    return ans;
  }

  replace(oldValue: T, newValue: T) {
    let curr = this.first;
    while (curr) {
      if (curr.value === oldValue) {
        curr.value = newValue;
      }
      curr = curr.next;
    }
  }

  removeAll(pred: (x: T) => boolean) {
    let last: ListNode<T> | null = null;
    let curr = this.first;
    this.first = null;
    while (curr) {
      const next = curr.next;
      curr.next = null;
      if (!pred(curr.value)) {
        if (last) {
          last.next = curr;
        } else {
          this.first = curr;
        }
        last = curr;
      }
      curr = next;
    }
  }

  forEach(fn: (x: T) => void) {
    let curr = this.first;
    while (curr) {
      fn(curr.value);
      curr = curr.next;
    }
  }

  withDo<S>(ys: List<S>, fn: (x: T, y: S) => void) {
    let curr = this.first;
    ys.forEach((y) => {
      if (!curr) {
        throw new Error('withDo() requires the two lists to have the same length');
      }
      fn(curr.value, y);
      curr = curr.next;
    });
    if (curr) {
      throw new Error('withDo() requires the two lists to have the same length');
    }
  }

  *[Symbol.iterator]() {
    let curr = this.first;
    while (curr) {
      yield curr.value;
      curr = curr.next;
    }
  }

  // every(pred: (x: T) => boolean) {
  //   for (const x of this) {
  //     if (!pred(x)) {
  //       return false;
  //     }
  //   }
  //   return true;
  // }

  // some(pred: (x: T) => boolean) {
  //   for (const x of this) {
  //     if (pred(x)) {
  //       return true;
  //     }
  //   }
  //   return false;
  // }

  // reduce<S>(fn: (prev: S, next: T) => S, z: S) {
  //   let ans = z;
  //   for (const x of this) {
  //     ans = fn(ans, x);
  //   }
  //   return ans;
  // }

  toArray() {
    const ans: T[] = [];
    this.forEach((x) => ans.push(x));
    return ans;
  }

  toString() {
    return this.toArray().toString();
  }
}

class ListNode<T> {
  private readonly _value: Var<T>;
  private readonly _next: Var<ListNode<T> | null>;

  constructor(value: T, next: ListNode<T> | null) {
    this._value = new Var(value);
    this._next = new Var(next);
  }

  get value() {
    return this._value.value;
  }

  set value(newValue: T) {
    this._value.value = newValue;
  }

  get next() {
    return this._next.value;
  }

  set next(newNext: ListNode<T> | null) {
    this._next.value = newNext;
  }
}

// let l = new List<number>();
// l.unshift(4);
// l.unshift(3);
// l.unshift(2);
// l.unshift(1);
// l.removeAll((x) => x % 2 === 0);
// console.log(l.toString());

// l = new List<number>();
// l.unshift(4);
// l.unshift(3);
// l.unshift(2);
// l.unshift(1);
// l.removeAll((x) => x % 2 !== 0);
// console.log(l.toString());

// l = new List<number>();
// l.unshift(4);
// l.unshift(3);
// l.unshift(2);
// l.unshift(1);
// l.removeAll((x) => x > 3);
// console.log(l.toString());

// l = new List<number>();
// l.unshift(4);
// l.unshift(3);
// l.unshift(2);
// l.unshift(1);
// l.removeAll((x) => x < 3);
// console.log(l.toString());

// l = new List<number>();
// l.unshift(4);
// l.unshift(3);
// l.unshift(2);
// l.unshift(1);
// for (const x of l) {
//   console.log(x);
// }

(window as any).tlw = topLevelWorld;
(window as any).nws = () => {
  return f(topLevelWorld);
  function f(w: World) {
    let n = 1;
    for (const child of w.children) {
      n += f(child);
    }
    return n;
  }
};

(window as any).rew = () => {
  if (thisWorld.parent) {
    thisWorld = thisWorld.parent;
    return true;
  } else {
    return false;
  }
};

(window as any).ff = () => {
  if (thisWorld.children.size > 0) {
    [thisWorld] = thisWorld.children;
    return true;
  } else {
    return false;
  }
};
