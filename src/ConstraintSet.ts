import config from './config';
import scope from './scope';
import { Constraint } from './constraints';
import { Handle, Var } from './things';

export default class ConstraintSet {
  private constraints: Constraint[] = [];

  add(constraint: Constraint) {
    const sig = constraint.signature;
    if (!this.constraints.find((c) => c.signature === sig)) {
      // only add if it's not a duplicate
      this.constraints.push(constraint);
    }
  }

  remove(constraintToRemove: Constraint) {
    this.constraints = this.constraints.filter((constraint) => constraint !== constraintToRemove);
  }

  clear() {
    this.constraints = [];
  }

  isEmpty() {
    return this.constraints.length === 0;
  }

  replaceHandle(oldHandle: Handle, newHandle: Handle) {
    const constraints = this.constraints;
    this.constraints = [];
    constraints.forEach((constraint) => {
      constraint.replaceHandle(oldHandle, newHandle);
      this.add(constraint);
    });
  }

  forEach(fn: (constraint: Constraint) => void) {
    this.constraints.forEach(fn);
  }

  relax(vars: Set<Var>) {
    this.forEach((c) => c.preRelax());
    const epsilon = scope.scale > 0 ? 1 / scope.scale : 1;
    const minWorthwhileErrorImprovement = config.minWorthwhileErrorImprovement * epsilon;
    let ans = false;
    for (const v of vars) {
      ans = this.relaxWithVar(v, epsilon, minWorthwhileErrorImprovement) || ans;
    }
    return ans;
  }

  private relaxWithVar(v: Var, epsilon: number, minWorthwhileErrorImprovement: number) {
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
    return this.constraints
      .map((c) => Math.pow(c.computeError(), 2))
      .reduce((e1, e2) => e1 + e2, 0);
  }
}
