// TODO: make this work when auto-solve is on
// right now it's creating too many worlds b/c we always tweak every variable's value +/- 1,
// most of the time only to change it back to the orig. value.

class World {
  private readonly values = new WeakMap<Var<any>, any>();
  private parentValueCache = new WeakRef(new WeakMap<Var<any>, any>());
  readonly children = new Set<World>();
  private sealed = false;

  constructor(readonly parent?: World) {}

  set<T>(v: Var<T>, newValue: T) {
    const oldValue = this.get(v);
    if (oldValue === newValue) {
      // no op
    } else if (this.sealed && this.values.has(v)) {
      // TODO: think about this
      // debugger;
      thisWorld = this.sprout();
      thisWorld.set(v, newValue);
    } else {
      this.values.set(v, newValue);
    }
  }

  get<T>(v: Var<T>): T {
    if (this.values.has(v)) {
      return this.values.get(v);
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
}

const topLevelWorld = new World();
let thisWorld = topLevelWorld;

export function sealThisWorld() {
  thisWorld.seal();
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
