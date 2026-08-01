import { TACInstruction, TACOp } from '../../ir/tac.js';
import { isNumber, isBool, isTemp, isStringLit, isTruthy, isBinaryOp, isUnaryOp } from '../utils.js';

export interface PassResult {
  instructions: TACInstruction[];
  changed: boolean;
}

export function constantFolding(instructions: TACInstruction[]): PassResult {
  let changed = false;
  const out: TACInstruction[] = [];

  for (const inst of instructions) {
    let folded = false;
    if (isBinaryOp(inst.op) && inst.arg1 !== undefined && inst.arg2 !== undefined) {
      if (isNumber(inst.arg1) && isNumber(inst.arg2)) {
        const a = Number(inst.arg1);
        const b = Number(inst.arg2);
        let value: number | null = null;
        switch (inst.op) {
          case TACOp.ADD: value = a + b; break;
          case TACOp.SUB: value = a - b; break;
          case TACOp.MUL: value = a * b; break;
          case TACOp.DIV: if (b !== 0) value = Math.trunc(a / b); break;
          case TACOp.MOD: if (b !== 0) value = a % b; break;
          case TACOp.POW: value = Math.pow(a, b); break;
          case TACOp.EQ: case TACOp.STRICT_EQ: value = a === b ? 1 : 0; break;
          case TACOp.NE: case TACOp.STRICT_NE: value = a !== b ? 1 : 0; break;
          case TACOp.LT: value = a < b ? 1 : 0; break;
          case TACOp.GT: value = a > b ? 1 : 0; break;
          case TACOp.LE: value = a <= b ? 1 : 0; break;
          case TACOp.GE: value = a >= b ? 1 : 0; break;
          case TACOp.AND: value = a & b; break;
          case TACOp.OR: value = a | b; break;
          case TACOp.BIT_AND: value = a & b; break;
          case TACOp.BIT_OR: value = a | b; break;
          case TACOp.BIT_XOR: value = a ^ b; break;
          case TACOp.SHL: value = a << b; break;
          case TACOp.SHR: value = a >> b; break;
          case TACOp.USHR: value = a >>> b; break;
          default: break;
        }
        if (value !== null) {
          if (inst.result) {
            out.push({ op: TACOp.ASSIGN, result: inst.result, arg1: String(value) });
          }
          folded = true;
        }
      } else if (isBool(inst.arg1) && isBool(inst.arg2)) {
        const a = inst.arg1 === 'true';
        const b = inst.arg2 === 'true';
        let value: boolean | null = null;
        switch (inst.op) {
          case TACOp.EQ: case TACOp.STRICT_EQ: value = a === b; break;
          case TACOp.NE: case TACOp.STRICT_NE: value = a !== b; break;
          case TACOp.AND: value = a && b; break;
          case TACOp.OR: value = a || b; break;
          default: break;
        }
        if (value !== null) {
          if (inst.result) out.push({ op: TACOp.ASSIGN, result: inst.result, arg1: value ? 'true' : 'false' });
          folded = true;
        }
      }
    } else if (isUnaryOp(inst.op)) {
      if (inst.op === TACOp.NOT && inst.arg1 !== undefined) {
        if (isBool(inst.arg1) || isNumber(inst.arg1)) {
          if (inst.result) {
            out.push({ op: TACOp.ASSIGN, result: inst.result, arg1: isTruthy(inst.arg1) ? 'false' : 'true' });
          }
          folded = true;
        }
      } else if (inst.op === TACOp.NEG && inst.arg1 !== undefined && isNumber(inst.arg1)) {
        if (inst.result) out.push({ op: TACOp.ASSIGN, result: inst.result, arg1: String(-Number(inst.arg1)) });
        folded = true;
      } else if (inst.op === TACOp.BIT_NOT && inst.arg1 !== undefined && isNumber(inst.arg1)) {
        if (inst.result) out.push({ op: TACOp.ASSIGN, result: inst.result, arg1: String(~Number(inst.arg1)) });
        folded = true;
      }
    } else if (inst.op === TACOp.ASSIGN) {
      if (inst.arg1 !== undefined && inst.result !== undefined && inst.arg1 === inst.result && isTemp(inst.result)) {
        folded = true; // self-assign of a temp is a no-op
      }
    }

    if (folded) {
      changed = true;
      continue;
    }

    // Algebraic identities (only when the result is a temp to stay conservative).
    if (!folded && isTemp(inst.result) && isBinaryOp(inst.op)) {
      const r = inst.result!;
      const a = inst.arg1!;
      const b = inst.arg2!;
      let replacement: TACInstruction | null = null;
      if ((inst.op === TACOp.ADD || inst.op === TACOp.SUB) && b === '0') {
        replacement = { op: TACOp.ASSIGN, result: r, arg1: a };
      } else if (inst.op === TACOp.MUL && b === '1') {
        replacement = { op: TACOp.ASSIGN, result: r, arg1: a };
      } else if (inst.op === TACOp.DIV && b === '1') {
        replacement = { op: TACOp.ASSIGN, result: r, arg1: a };
      } else if (inst.op === TACOp.MUL && b === '0' && !isStringLit(a)) {
        replacement = { op: TACOp.ASSIGN, result: r, arg1: '0' };
      } else if (inst.op === TACOp.SUB && a === b) {
        replacement = { op: TACOp.ASSIGN, result: r, arg1: '0' };
      }
      if (replacement) {
        out.push(replacement);
        changed = true;
        continue;
      }
    }

    out.push(inst);
  }

  return { instructions: out, changed };
}
