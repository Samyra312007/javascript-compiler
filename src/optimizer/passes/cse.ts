import { TACInstruction, TACOp } from '../../ir/tac.js';
import { isTemp, isConstant, isOpaqueConstant, isPureExpression, isBinaryOp, isUnaryOp } from '../utils.js';
import type { PassResult } from './simplify.js';

export function commonSubexpressionElimination(instructions: TACInstruction[]): PassResult {
  let changed = false;
  const out: TACInstruction[] = [];
  const seen = new Map<string, string>();

  for (const inst of instructions) {
    if (inst.op === TACOp.LABEL) {
      seen.clear();
      out.push(inst);
      continue;
    }

    const eligible =
      isTemp(inst.result) &&
      isPureExpression(inst) &&
      (isBinaryOp(inst.op) || isUnaryOp(inst.op)) &&
      isSafeOperand(inst.arg1) &&
      (inst.arg2 === undefined || isSafeOperand(inst.arg2));

    if (eligible) {
      const key = `${inst.op}|${inst.arg1}|${inst.arg2 ?? ''}`;
      const prev = seen.get(key);
      if (prev !== undefined) {
        // Reuse the earlier result via a copy; DCE cleans up the now-redundant instruction.
        out.push({ op: TACOp.ASSIGN, result: inst.result, arg1: prev });
        changed = true;
        continue;
      }
      seen.set(key, inst.result!);
    }

    out.push(inst);
  }

  return { instructions: out, changed };
}

function isSafeOperand(s?: string): boolean {
  if (s === undefined) return true;
  if (isOpaqueConstant(s)) return true;
  if (isTemp(s)) return true;
  return false;
}
