import { config } from './config';
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
    let ans = false;
    for (const v of vars) {
      ans = this.relaxWithVar(v) || ans;
    }
    return ans;
  }

  private relaxWithVar(v: Var) {
    const origValue = v.value;
    const errorToBeat = this.computeError() - config.minWorthwhileErrorImprovement;

    v.value = origValue + 1;
    const ePlus1 = this.computeError();

    v.value = origValue - 1;
    const eMinus1 = this.computeError();

    if (ePlus1 < Math.min(errorToBeat, eMinus1)) {
      v.value = origValue + 1;
      return true;
    } else if (eMinus1 < Math.min(errorToBeat, ePlus1)) {
      v.value = origValue - 1;
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
