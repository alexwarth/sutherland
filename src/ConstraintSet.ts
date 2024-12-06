import { config } from './config';
import { Constraint } from './constraints';
import { Handle, Var } from './things';

export default class ConstraintSet {
  private readonly constraints: Constraint[] = [];

  add(constraint: Constraint) {
    const sig = constraint.signature;
    if (this.constraints.find((c) => c.signature === sig)) {
      // don't add it -- it's a duplicate!
      return;
    }
    this.constraints.push(constraint);
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

  relaxWithVar(v: Var) {
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

  replaceHandles(handleMap: Map<Handle, Handle | null>) {
    const constraintsToKeep: Constraint[] = [];
    const sigs = new Set<string>();
    while (this.constraints.length > 0) {
      const constraint = this.constraints.shift()!;
      if (!constraint.replaceHandles(handleMap)) {
        continue;
      }

      const sig = constraint.signature;
      if (sigs.has(sig)) {
        continue;
      }

      constraintsToKeep.push(constraint);
      sigs.add(sig);
    }

    this.constraints.push(...constraintsToKeep);
  }

  private computeError() {
    return this.constraints
      .map((c) => Math.pow(c.computeError(), 2))
      .reduce((e1, e2) => e1 + e2, 0);
  }
}
