import { TACInstruction } from '../ir/tac.js';
import { constantFolding } from './passes/simplify.js';
import { constantPropagation } from './passes/constant-propagation.js';
import { copyPropagation } from './passes/copy-propagation.js';
import { commonSubexpressionElimination } from './passes/cse.js';
import { deadCodeElimination } from './passes/dce.js';
import { jumpThreading } from './passes/jump-threading.js';
import { loopInvariantCodeMotion } from './passes/licm.js';
import type { PassResult } from './passes/simplify.js';

export interface OptimizeOptions {
  licm?: boolean;
}

export function optimizeTAC(instructions: TACInstruction[], options?: OptimizeOptions): TACInstruction[] {
  let cur = instructions.slice();
  let changed = true;
  let iterations = 0;
  const maxIterations = 10;

  while (changed && iterations < maxIterations) {
    changed = false;
    let r: PassResult;

    r = constantFolding(cur);
    cur = r.instructions;
    changed = r.changed || changed;

    r = constantPropagation(cur);
    cur = r.instructions;
    changed = r.changed || changed;

    r = constantFolding(cur);
    cur = r.instructions;
    changed = r.changed || changed;

    r = copyPropagation(cur);
    cur = r.instructions;
    changed = r.changed || changed;

    r = commonSubexpressionElimination(cur);
    cur = r.instructions;
    changed = r.changed || changed;

    if (options?.licm !== false) {
      r = loopInvariantCodeMotion(cur);
      cur = r.instructions;
      changed = r.changed || changed;
    }

    r = jumpThreading(cur);
    cur = r.instructions;
    changed = r.changed || changed;

    r = deadCodeElimination(cur);
    cur = r.instructions;
    changed = r.changed || changed;

    iterations++;
  }

  return cur;
}
