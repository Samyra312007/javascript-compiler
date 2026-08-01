import { TACInstruction, TACOp } from '../../ir/tac.js';
import { isTemp, isConstant, isSpecialConst, isNumber, isStringLit } from '../utils.js';
import type { PassResult } from './simplify.js';

export function constantPropagation(instructions: TACInstruction[]): PassResult {
  let changed = false;
  const out: TACInstruction[] = [];
  const table = new Map<string, string>();

  const resolve = (s?: string): string | undefined => {
    if (s === undefined) return undefined;
    if (isTemp(s)) {
      const v = table.get(s);
      if (v !== undefined) return v;
    }
    return s;
  };

  for (const inst of instructions) {
    // Track constant definitions of temps (single-assignment, so never invalidated).
    if (inst.op === TACOp.ASSIGN && isTemp(inst.result)) {
      const a = resolve(inst.arg1);
      if (a !== undefined && (isConstant(a) || isSpecialConst(a))) {
        table.set(inst.result!, a);
      }
    }

    const copy: TACInstruction = { ...inst };
    if (copy.arg1 !== undefined) {
      const a = resolve(copy.arg1);
      if (a !== undefined && a !== copy.arg1 && isConstant(a)) {
        copy.arg1 = a;
        changed = true;
      }
    }
    if (copy.arg2 !== undefined) {
      const b = resolve(copy.arg2);
      if (b !== undefined && b !== copy.arg2 && isConstant(b)) {
        copy.arg2 = b;
        changed = true;
      }
    }

    // Resolve statically-decided conditional jumps.
    if (copy.op === TACOp.COND_JUMP && copy.arg1 !== undefined) {
      const cond = resolve(copy.arg1);
      if (cond !== undefined && isConstant(cond) && !isStringLit(cond)) {
        const truthy = cond === 'true' || (isNumber(cond) && Number(cond) !== 0);
        const jumpWhenFalse = copy.arg2 === 'false';
        const willJump = jumpWhenFalse ? !truthy : truthy;
        if (willJump) {
          out.push({ op: TACOp.JUMP, label: copy.label });
          changed = true;
          continue;
        } else {
          changed = true;
          continue; // condition never taken -> remove
        }
      }
    }

    out.push(copy);
  }

  return { instructions: out, changed };
}
