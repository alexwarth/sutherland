export const TAU = Math.PI * 2;

/** Returns the equivalent angle in the range [0, 2pi) */
export function normalizeAngle(angle: number) {
  return ((angle % TAU) + TAU) % TAU;
}

export function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

let nextId = 0;
export function generateId() {
  return nextId++;
}

/**
 * Assigns a value to one of the properties on `window` to make it available
 * for debugging via the console. If `valueOrValueFn` is a function, it calls
 * that function w/ the old value for the property and stores the result.
 * Otherwise it stores the value.
 */
export function forDebugging<T>(
  property: string,
  valueOrValueFn: T | ((oldValue?: T) => T)
) {
  let value: T;
  if (typeof valueOrValueFn === 'function') {
    const valueFn = valueOrValueFn as (oldValue?: T) => T;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oldValue = (window as any)[property] as T | undefined;
    value = valueFn(oldValue);
  } else {
    value = valueOrValueFn;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any)[property] = value;
}

/** Helper functions for dealing with `Set`s. */
export const sets = {
  overlap<T>(s1: Set<T>, s2: Set<T>) {
    for (const x of s1) {
      if (s2.has(x)) {
        return true;
      }
    }
    return false;
  },
  union<T>(s1: Set<T>, s2: Set<T>) {
    return new Set<T>([...s1, ...s2]);
  },
  map<S, T>(s: Set<S>, fn: (x: S) => T) {
    return new Set([...s].map(fn));
  },
};
