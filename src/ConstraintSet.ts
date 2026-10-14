import config from './config';
import scope from './scope';
import { Constraint } from './constraints';
import { Handle } from './things';
import { List, Var } from './state';

export default class ConstraintSet {
  private readonly _constraints = new Var(new List<Constraint>());

  get constraints() {
    return this._constraints.value;
  }

  set constraints(newConstraints: List<Constraint>) {
    this._constraints.value = newConstraints;
  }

  add(constraint: Constraint) {
    const sig = constraint.signature;
    if (!this.constraints.find((c) => c.signature === sig)) {
      // only add if it's not a duplicate
      this.constraints.unshift(constraint);
    }
  }

  remove(constraintToRemove: Constraint) {
    this.constraints = this.constraints.filter((constraint) => constraint !== constraintToRemove);
  }

  clear() {
    this.constraints = new List();
  }

  isEmpty() {
    return this.constraints.isEmpty();
  }

  replaceHandle(oldHandle: Handle, newHandle: Handle) {
    const constraints = this.constraints;
    this.constraints = new List();
    constraints.forEach((constraint) => {
      constraint.replaceHandle(oldHandle, newHandle);
      this.add(constraint);
    });
  }

  forEach(fn: (constraint: Constraint) => void) {
    this.constraints.forEach(fn);
  }

  forEachVar(fn: (v: Var<any>) => void) {
    this.constraints.forEach((c) => c.forEachVar(fn));
  }

  relax(vars: Set<Var<number>>) {
    this.forEach((c) => c.preRelax());
    const epsilon = scope.scale > 0 ? 1 / scope.scale : 1;
    let ans = false;
    for (const v of vars) {
      ans = this.relaxWithVar(v, epsilon) || ans;
    }
    return ans;
  }

  totalSquaredError() {
    return this.computeError();
  }

  probeRelaxationDeltas(vars: Iterable<Var<number>>) {
    this.forEach((c) => c.preRelax());
    const epsilon = scope.scale > 0 ? 1 / scope.scale : 1;
    const deltas = new Map<Var<number>, number>();
    for (const v of vars) {
      deltas.set(v, this.relaxationStep(v, epsilon));
    }
    return deltas;
  }

  private relaxWithVar(v: Var<number>, epsilon: number) {
    const step = this.relaxationStep(v, epsilon);
    if (step !== 0) {
      v.value += step;
      return true;
    }
    return false;
  }

  // Try a step of epsilon (one pixel). If that's too big to help (both +epsilon and
  // -epsilon make things worse), try half of it, and so on, down to about a thousandth
  // of a pixel. We have to go that small because when vars are chained together by
  // constraints, each one can only move once its neighbor has moved, and it needs a
  // step about half the size of the one its neighbor just took.
  private relaxationStep(v: Var<number>, epsilon: number) {
    for (let n = 0; n < 10; n++) {
      const step = this.relaxationStepOfSize(v, epsilon);
      if (step !== 0) {
        return step;
      }
      epsilon /= 2;
    }
    return 0;
  }

  private relaxationStepOfSize(v: Var<number>, epsilon: number) {
    // The error is a sum of squares, so the improvement we can expect from a step of
    // epsilon shrinks like epsilon^2 -- the threshold has to shrink the same way.
    const minWorthwhileErrorImprovement = config().minWorthwhileErrorImprovement * epsilon ** 2;

    const origValue = v.value;
    const errorToBeat = this.computeError() - minWorthwhileErrorImprovement;

    v.value = origValue + epsilon;
    const ePlusEpsilon = this.computeError();

    v.value = origValue - epsilon;
    const eMinusEpsilon = this.computeError();

    v.value = origValue;

    if (ePlusEpsilon < Math.min(errorToBeat, eMinusEpsilon)) {
      return epsilon;
    } else if (eMinusEpsilon < Math.min(errorToBeat, ePlusEpsilon)) {
      return -epsilon;
    }
    return 0;
  }

  private computeError() {
    let e = 0;
    this.constraints.forEach((c) => {
      e += c.computeError() ** 2;
    });
    return e;
  }
}
