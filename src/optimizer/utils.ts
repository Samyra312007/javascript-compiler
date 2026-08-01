import { TACInstruction, TACOp } from '../ir/tac.js';

const TEMP_RE = /^t\d+$/;

export function isTemp(name?: string): boolean {
  return !!name && TEMP_RE.test(name);
}

export function isNumber(name?: string): boolean {
  return !!name && name !== '' && !isNaN(Number(name));
}

export function isBool(name?: string): boolean {
  return name === 'true' || name === 'false';
}

export function isStringLit(name?: string): boolean {
  return !!name && (name.startsWith('"') || name.startsWith("'"));
}

export function isSpecialConst(name?: string): boolean {
  return name === 'null' || name === 'undefined' || name === 'true' || name === 'false';
}

export function isConstant(name?: string): boolean {
  return isNumber(name) || isBool(name) || isStringLit(name);
}

export function isOpaqueConstant(name?: string): boolean {
  if (!name) return false;
  return isConstant(name) || isSpecialConst(name) ||
    name.startsWith('param_') || name.startsWith('func_') || name.startsWith('class_') ||
    name === '[]' || name === '{}' || name.startsWith('/');
}

const PURE_OPS = new Set<TACOp>([
  TACOp.ADD, TACOp.SUB, TACOp.MUL, TACOp.DIV, TACOp.MOD, TACOp.POW,
  TACOp.EQ, TACOp.NE, TACOp.STRICT_EQ, TACOp.STRICT_NE, TACOp.LT, TACOp.GT, TACOp.LE, TACOp.GE,
  TACOp.AND, TACOp.OR, TACOp.NOT,
  TACOp.BIT_AND, TACOp.BIT_OR, TACOp.BIT_XOR, TACOp.BIT_NOT, TACOp.SHL, TACOp.SHR, TACOp.USHR,
  TACOp.NEG, TACOp.TYPEOF,
]);

export function isPureOp(op: TACOp): boolean {
  return PURE_OPS.has(op);
}

export function isPureInstruction(inst: TACInstruction): boolean {
  if (inst.op === TACOp.ASSIGN) {
    return isTemp(inst.result) && inst.result !== 'print';
  }
  return isPureOp(inst.op);
}

export function isPureExpression(inst: TACInstruction): boolean {
  return isPureOp(inst.op);
}

export function isTruthy(name?: string): boolean {
  if (name === 'true') return true;
  if (name === 'false' || name === 'null' || name === 'undefined') return false;
  if (isNumber(name)) return Number(name) !== 0;
  return false;
}

export function isBinaryOp(op: TACOp): boolean {
  switch (op) {
    case TACOp.ADD: case TACOp.SUB: case TACOp.MUL: case TACOp.DIV: case TACOp.MOD: case TACOp.POW:
    case TACOp.EQ: case TACOp.NE: case TACOp.STRICT_EQ: case TACOp.STRICT_NE:
    case TACOp.LT: case TACOp.GT: case TACOp.LE: case TACOp.GE:
    case TACOp.AND: case TACOp.OR:
    case TACOp.BIT_AND: case TACOp.BIT_OR: case TACOp.BIT_XOR:
    case TACOp.SHL: case TACOp.SHR: case TACOp.USHR:
      return true;
    default:
      return false;
  }
}

export function isUnaryOp(op: TACOp): boolean {
  return op === TACOp.NOT || op === TACOp.NEG || op === TACOp.BIT_NOT || op === TACOp.TYPEOF;
}

export function defName(inst: TACInstruction): string | null {
  switch (inst.op) {
    case TACOp.LABEL:
    case TACOp.STORE:
    case TACOp.PARAM:
    case TACOp.SPREAD:
    case TACOp.JUMP:
    case TACOp.COND_JUMP:
    case TACOp.RETURN:
      return null;
    default:
      return inst.result ?? null;
  }
}

export function usedNames(inst: TACInstruction): string[] {
  const out: string[] = [];
  const add = (s?: string) => {
    if (s && !isOpaqueConstant(s)) out.push(s);
  };
  switch (inst.op) {
    case TACOp.ADD: case TACOp.SUB: case TACOp.MUL: case TACOp.DIV: case TACOp.MOD: case TACOp.POW:
    case TACOp.EQ: case TACOp.NE: case TACOp.STRICT_EQ: case TACOp.STRICT_NE:
    case TACOp.LT: case TACOp.GT: case TACOp.LE: case TACOp.GE:
    case TACOp.AND: case TACOp.OR:
    case TACOp.BIT_AND: case TACOp.BIT_OR: case TACOp.BIT_XOR:
    case TACOp.SHL: case TACOp.SHR: case TACOp.USHR:
      add(inst.arg1); add(inst.arg2); break;
    case TACOp.ASSIGN:
      add(inst.arg1); break;
    case TACOp.NOT: case TACOp.NEG: case TACOp.BIT_NOT: case TACOp.TYPEOF: case TACOp.DELETE:
    case TACOp.NEW: case TACOp.CALL: case TACOp.LOAD:
      add(inst.arg1); break;
    case TACOp.STORE: {
      add(inst.arg1);
      const parts = (inst.result || '').split('.');
      if (parts.length === 2) add(parts[0]);
      break;
    }
    case TACOp.PARAM: case TACOp.SPREAD:
      add(inst.arg1); break;
    case TACOp.COND_JUMP:
      add(inst.arg1); break;
    case TACOp.RETURN:
      add(inst.arg1); break;
    case TACOp.INC: case TACOp.DEC:
      add(inst.result); break;
    default:
      break;
  }
  return out;
}
