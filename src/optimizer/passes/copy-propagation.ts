import { TACInstruction, TACOp } from '../../ir/tac.js';
import { isTemp } from '../utils.js';
import type { PassResult } from './simplify.js';

export function copyPropagation(instructions: TACInstruction[]): PassResult {
  let changed = false;
  const out: TACInstruction[] = [];
  const table = new Map<string, string>();

  const resolve = (s?: string): string | undefined => {
    if (s === undefined) return undefined;
    let cur = s;
    let guard = 0;
    while (isTemp(cur) && table.has(cur) && guard++ < 64) {
      cur = table.get(cur)!;
    }
    return cur;
  };

  for (const inst of instructions) {
    if (inst.op === TACOp.ASSIGN && isTemp(inst.result) && inst.arg1 !== undefined && isTemp(inst.arg1)) {
      table.set(inst.result!, resolve(inst.arg1)!);
    }

    const copy: TACInstruction = { ...inst };
    if (copy.arg1 !== undefined && isTemp(copy.arg1)) {
      const r = resolve(copy.arg1);
      if (r !== undefined && r !== copy.arg1) {
        copy.arg1 = r;
        changed = true;
      }
    }
    if (copy.arg2 !== undefined && isTemp(copy.arg2)) {
      const r = resolve(copy.arg2);
      if (r !== undefined && r !== copy.arg2) {
        copy.arg2 = r;
        changed = true;
      }
    }
    out.push(copy);
  }

  return { instructions: out, changed };
}
