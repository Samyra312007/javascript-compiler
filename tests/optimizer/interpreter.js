import { TACOp } from '../../dist/ir/tac.js';
import { isNumber, isStringLit } from '../../dist/optimizer/utils.js';

export function interpret(instructions, opts) {
  const env = new Map();
  const output = [];
  const paramStack = [];
  const maxSteps = (opts && opts.maxSteps) || 1000000;
  const labelIndex = new Map();
  instructions.forEach((inst, i) => {
    if (inst.op === TACOp.LABEL && inst.label !== undefined) labelIndex.set(inst.label, i);
  });

  let pc = 0;
  let steps = 0;
  let result;
  let resultSet = false;

  const val = (s) => {
    if (s === undefined) return undefined;
    if (isNumber(s)) return Number(s);
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null') return null;
    if (s === 'undefined') return undefined;
    if (isStringLit(s)) return s.replace(/^["']|["']$/g, '');
    if (s === '[]') return { __opaque: 'array' };
    if (s === '{}') return { __opaque: 'object' };
    if (s.startsWith('func_') || s.startsWith('class_') || s.startsWith('/')) return { __opaque: s };
    if (s.startsWith('param_')) return undefined;
    return env.get(s);
  };

  const truthy = (v) => {
    if (v === false || v === 0 || v === null || v === undefined || v === '') return false;
    return true;
  };

  const jumpTo = (label) => {
    const t = labelIndex.get(label);
    if (t === undefined) throw new Error(`Unknown label ${label}`);
    return t;
  };

  while (pc < instructions.length && steps < maxSteps) {
    const inst = instructions[pc];
    steps++;
    switch (inst.op) {
      case TACOp.LABEL:
        pc++;
        break;
      case TACOp.ASSIGN:
        if (inst.result === 'print') {
          output.push(val(inst.arg1));
          pc++;
          break;
        }
        env.set(inst.result, val(inst.arg1));
        pc++;
        break;
      case TACOp.JUMP:
        pc = jumpTo(inst.label);
        break;
      case TACOp.COND_JUMP: {
        const v = truthy(val(inst.arg1));
        const jumpWhenFalse = inst.arg2 === 'false';
        pc = jumpWhenFalse ? (!v ? jumpTo(inst.label) : pc + 1) : (v ? jumpTo(inst.label) : pc + 1);
        break;
      }
      case TACOp.RETURN:
        if (inst.arg1 !== undefined) result = val(inst.arg1);
        resultSet = true;
        pc = instructions.length;
        break;
      case TACOp.ADD:
      case TACOp.SUB:
      case TACOp.MUL:
      case TACOp.DIV:
      case TACOp.MOD:
      case TACOp.POW: {
        const a = val(inst.arg1);
        const b = val(inst.arg2);
        let r;
        switch (inst.op) {
          case TACOp.ADD: r = a + b; break;
          case TACOp.SUB: r = a - b; break;
          case TACOp.MUL: r = a * b; break;
          case TACOp.DIV: r = b === 0 ? 0 : Math.trunc(a / b); break;
          case TACOp.MOD: r = b === 0 ? 0 : a % b; break;
          default: r = Math.pow(a, b); break;
        }
        if (inst.result) env.set(inst.result, r);
        pc++;
        break;
      }
      case TACOp.EQ:
      case TACOp.NE:
      case TACOp.STRICT_EQ:
      case TACOp.STRICT_NE:
      case TACOp.LT:
      case TACOp.GT:
      case TACOp.LE:
      case TACOp.GE: {
        const a = val(inst.arg1);
        const b = val(inst.arg2);
        let r;
        switch (inst.op) {
          case TACOp.EQ:
          case TACOp.STRICT_EQ: r = a === b; break;
          case TACOp.NE:
          case TACOp.STRICT_NE: r = a !== b; break;
          case TACOp.LT: r = a < b; break;
          case TACOp.GT: r = a > b; break;
          case TACOp.LE: r = a <= b; break;
          default: r = a >= b; break;
        }
        if (inst.result) env.set(inst.result, r);
        pc++;
        break;
      }
      case TACOp.AND:
      case TACOp.OR: {
        const a = val(inst.arg1);
        const b = val(inst.arg2);
        const r = inst.op === TACOp.AND ? (a & b) : (a | b);
        if (inst.result) env.set(inst.result, r);
        pc++;
        break;
      }
      case TACOp.NOT: {
        if (inst.result) env.set(inst.result, truthy(val(inst.arg1)) ? 0 : 1);
        pc++;
        break;
      }
      case TACOp.NEG: {
        if (inst.result) env.set(inst.result, -val(inst.arg1));
        pc++;
        break;
      }
      case TACOp.BIT_AND:
      case TACOp.BIT_OR:
      case TACOp.BIT_XOR: {
        const a = val(inst.arg1);
        const b = val(inst.arg2);
        let r;
        if (inst.op === TACOp.BIT_AND) r = a & b;
        else if (inst.op === TACOp.BIT_OR) r = a | b;
        else r = a ^ b;
        if (inst.result) env.set(inst.result, r);
        pc++;
        break;
      }
      case TACOp.BIT_NOT: {
        if (inst.result) env.set(inst.result, ~val(inst.arg1));
        pc++;
        break;
      }
      case TACOp.SHL:
      case TACOp.SHR:
      case TACOp.USHR: {
        const a = val(inst.arg1);
        const b = val(inst.arg2);
        let r;
        if (inst.op === TACOp.SHL) r = a << b;
        else if (inst.op === TACOp.SHR) r = a >> b;
        else r = a >>> b;
        if (inst.result) env.set(inst.result, r);
        pc++;
        break;
      }
      case TACOp.INC:
      case TACOp.DEC: {
        const a = val(inst.result);
        if (inst.result) env.set(inst.result, inst.op === TACOp.INC ? a + 1 : a - 1);
        pc++;
        break;
      }
      case TACOp.TYPEOF: {
        const v = val(inst.arg1);
        const t = v === null ? 'object' : typeof v;
        if (inst.result) env.set(inst.result, t);
        pc++;
        break;
      }
      case TACOp.DELETE: {
        if (inst.result) env.set(inst.result, true);
        pc++;
        break;
      }
      case TACOp.PARAM: {
        paramStack.push(val(inst.arg1));
        pc++;
        break;
      }
      case TACOp.CALL: {
        if (inst.arg1 === 'print') {
          output.push(paramStack.length > 0 ? paramStack.pop() : undefined);
          if (inst.result) env.set(inst.result, undefined);
        } else if (inst.arg1 === 'push' || inst.arg1 === 'setProperty' ||
                   inst.arg1 === 'array_new' || inst.arg1 === 'object_new' ||
                   inst.arg1 === 'string_new' || inst.arg1 === 'string_concat' ||
                   inst.arg1 === 'typeof_runtime') {
          if (inst.result) env.set(inst.result, { __opaque: inst.arg1 });
        } else if (inst.arg1 === 'object_get' || inst.arg1 === 'array_get') {
          if (inst.result) env.set(inst.result, undefined);
        } else {
          if (inst.result) env.set(inst.result, { __opaque: inst.arg1 });
        }
        pc++;
        break;
      }
      case TACOp.NEW: {
        if (inst.result) env.set(inst.result, { __opaque: inst.arg1 || 'object' });
        pc++;
        break;
      }
      case TACOp.STORE: {
        pc++;
        break;
      }
      case TACOp.LOAD: {
        if (inst.result) env.set(inst.result, val(inst.arg1));
        pc++;
        break;
      }
      case TACOp.SPREAD:
      default:
        pc++;
        break;
    }
  }

  return { output, steps, result: resultSet ? result : undefined };
}
