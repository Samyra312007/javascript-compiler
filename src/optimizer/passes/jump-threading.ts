import { TACInstruction, TACOp } from '../../ir/tac.js';
import type { PassResult } from './simplify.js';

export function jumpThreading(instructions: TACInstruction[]): PassResult {
  let changed = false;
  let cur = instructions.slice();

  // Redirect jumps through labels whose block is a single unconditional jump.
  let threaded = true;
  while (threaded) {
    threaded = false;
    const redirect = (label: number | undefined): number | undefined => {
      if (label === undefined) return undefined;
      let target = label;
      const seen = new Set<number>();
      for (let guard = 0; guard < 64; guard++) {
        if (seen.has(target)) return target;
        seen.add(target);
        const next = nextNonLabel(cur, target);
        if (next !== null && next.op === TACOp.JUMP && next.label !== undefined) {
          target = next.label;
          continue;
        }
        return target;
      }
      return target;
    };

    for (let i = 0; i < cur.length; i++) {
      const inst = cur[i];
      if (inst.op === TACOp.JUMP || inst.op === TACOp.COND_JUMP) {
        const t = redirect(inst.label);
        if (t !== undefined && t !== inst.label) {
          cur = cur.slice();
          cur[i] = { ...inst, label: t };
          threaded = true;
          changed = true;
        }
      }
    }
  }

  // Remove fall-through jumps: JUMP/COND_JUMP whose target is the very next label.
  cur = cur.filter((inst, i) => {
    if (inst.op === TACOp.JUMP || inst.op === TACOp.COND_JUMP) {
      const next = cur[i + 1];
      if (next && next.op === TACOp.LABEL && next.label === inst.label) {
        changed = true;
        return false;
      }
    }
    return true;
  });

  return { instructions: cur, changed };
}

function nextNonLabel(instructions: TACInstruction[], label: number): TACInstruction | null {
  for (let i = 0; i < instructions.length; i++) {
    if (instructions[i].op === TACOp.LABEL && instructions[i].label === label) {
      for (let j = i + 1; j < instructions.length; j++) {
        if (instructions[j].op === TACOp.LABEL) continue;
        return instructions[j];
      }
      return null;
    }
  }
  return null;
}
