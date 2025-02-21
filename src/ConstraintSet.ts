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

  relax(vars: Set<Var<number>>) {
    this.forEach((c) => c.preRelax());
    const epsilon = scope.scale > 0 ? 1 / scope.scale : 1;
    const minWorthwhileErrorImprovement = config().minWorthwhileErrorImprovement * epsilon;
    let ans = false;
    for (const v of vars) {
      ans = this.relaxWithVar(v, epsilon, minWorthwhileErrorImprovement) || ans;
    }
    return ans;
  }

  private relaxWithVar(v: Var<number>, epsilon: number, minWorthwhileErrorImprovement: number) {
    const origValue = v.value;
    const errorToBeat = this.computeError() - minWorthwhileErrorImprovement;

    v.value = origValue + epsilon;
    const ePlusEpsilon = this.computeError();

    v.value = origValue - epsilon;
    const eMinusEpsilon = this.computeError();

    if (ePlusEpsilon < Math.min(errorToBeat, eMinusEpsilon)) {
      v.value = origValue + epsilon;
      return true;
    } else if (eMinusEpsilon < Math.min(errorToBeat, ePlusEpsilon)) {
      v.value = origValue - epsilon;
      return true;
    } else {
      v.value = origValue;
      return false;
    }
  }

  private computeError() {
    let e = 0;
    this.constraints.forEach((c) => {
      e += c.computeError() ** 2;
    });
    return e;
  }
}
