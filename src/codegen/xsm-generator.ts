import { TACInstruction, TACOp } from '../ir/tac.js';
import { isTemp, isNumber, isStringLit } from '../optimizer/utils.js';
import { computeTempIntervals } from '../optimizer/dataflow.js';

// R0-R2 are reserved for the runtime call ABI.
// R3-R15 are assignable as temp "homes" via linear scan.
// R16-R19 are the scratch pool used for constants, spills, and variables.
const HOME_FIRST = 3;
const HOME_LAST = 15;
const SCRATCH_FIRST = 16;
const SCRATCH_LAST = 19;

export class XSMGenerator {
  private output: string[] = [];
  private stackPointer: number = 4096;
  private basePointer: number = 4096;
  private labels: Map<number, number> = new Map();
  private currentAddress: number = 2056;
  private symbolTable: any;
  private labelCounter: number = 0;
  private variableAddressMap: Map<string, number> = new Map();
  private nextVariableAddress: number = 4050;
  private functionStackOffsets: Map<string, number> = new Map();

  private tempHome: Map<string, number> = new Map();
  private tempSpilled: Set<string> = new Set();
  private scratchBusy: boolean[] = new Array(20).fill(false);
  private occupiedAt: Uint8Array[] = [];
  private currentIndex: number = 0;

  constructor(symbolTable: any) {
    this.symbolTable = symbolTable;
  }

  public generate(instructions: TACInstruction[]): string {
    this.output = [];
    this.tempHome.clear();
    this.tempSpilled.clear();
    this.scratchBusy.fill(false);
    this.occupiedAt = [];

    const intervals = computeTempIntervals(instructions);
    this.assignRegisterHomes(intervals);
    this.computeOccupancy(instructions, intervals);

    this.firstPass(instructions);
    this.secondPass(instructions);
    return this.output.join('\n');
  }

  private assignRegisterHomes(intervals: Map<string, { temp: string; defIndex: number; start: number; end: number }>): void {
    const sorted = [...intervals.values()].sort((a, b) => a.start - b.start || a.end - b.end);
    const regFree: boolean[] = new Array(20).fill(true);
    const active: { temp: string; end: number }[] = [];

    const expire = (start: number) => {
      for (let i = active.length - 1; i >= 0; i--) {
        if (active[i].end < start) {
          regFree[this.tempHome.get(active[i].temp)!] = true;
          active.splice(i, 1);
        }
      }
    };

    for (const iv of sorted) {
      expire(iv.start);
      let reg = -1;
      for (let r = HOME_FIRST; r <= HOME_LAST; r++) {
        if (regFree[r]) { reg = r; break; }
      }
      if (reg >= 0) {
        regFree[reg] = false;
        this.tempHome.set(iv.temp, reg);
        active.push({ temp: iv.temp, end: iv.end });
        active.sort((a, b) => a.end - b.end);
        continue;
      }
      // No free register: spill the active interval with the furthest end (or self).
      let spillIdx = -1;
      let maxEnd = -1;
      for (let i = 0; i < active.length; i++) {
        if (active[i].end > maxEnd) { maxEnd = active[i].end; spillIdx = i; }
      }
      if (spillIdx >= 0 && maxEnd > iv.end) {
        const victim = active[spillIdx];
        this.tempSpilled.add(victim.temp);
        reg = this.tempHome.get(victim.temp)!;
        this.tempHome.delete(victim.temp);
        active.splice(spillIdx, 1);
        this.tempHome.set(iv.temp, reg);
        active.push({ temp: iv.temp, end: iv.end });
        active.sort((a, b) => a.end - b.end);
      } else {
        this.tempSpilled.add(iv.temp);
      }
    }
  }

  private computeOccupancy(
    instructions: TACInstruction[],
    intervals: Map<string, { temp: string; defIndex: number; start: number; end: number }>,
  ): void {
    this.occupiedAt = new Array(instructions.length);
    for (let i = 0; i < instructions.length; i++) {
      const occ = new Uint8Array(20);
      for (const [t, r] of this.tempHome) {
        const iv = intervals.get(t);
        if (iv && iv.start <= i && i <= iv.end) occ[r] = 1;
      }
      this.occupiedAt[i] = occ;
    }
  }

  private firstPass(instructions: TACInstruction[]): void {
    let address = 2056;
    for (const inst of instructions) {
      if (inst.op === TACOp.LABEL && inst.label !== undefined) {
        this.labels.set(inst.label, address);
      } else {
        address += 2;
      }
    }
  }

  private secondPass(instructions: TACInstruction[]): void {
    instructions.forEach((inst, i) => {
      this.currentIndex = i;
      this.generateInstruction(inst);
    });
  }

  private generateInstruction(inst: TACInstruction): void {
    this.scratchBusy.fill(false);
    switch (inst.op) {
      case TACOp.ADD: this.generateAdd(inst); break;
      case TACOp.SUB: this.generateSub(inst); break;
      case TACOp.MUL: this.generateMul(inst); break;
      case TACOp.DIV: this.generateDiv(inst); break;
      case TACOp.MOD: this.generateMod(inst); break;
      case TACOp.POW: this.generatePow(inst); break;
      case TACOp.ASSIGN: this.generateAssign(inst); break;
      case TACOp.LABEL: this.generateLabel(inst); break;
      case TACOp.JUMP: this.generateJump(inst); break;
      case TACOp.COND_JUMP: this.generateCondJump(inst); break;
      case TACOp.RETURN: this.generateReturn(inst); break;
      case TACOp.CALL: this.generateCall(inst); break;
      case TACOp.PARAM: this.generateParam(inst); break;
      case TACOp.NEW: this.generateNew(inst); break;
      case TACOp.STORE: this.generateStore(inst); break;
      case TACOp.LOAD: this.generateLoad(inst); break;
      case TACOp.NOT: this.generateNot(inst); break;
      case TACOp.NEG: this.generateNeg(inst); break;
      case TACOp.INC: this.generateInc(inst); break;
      case TACOp.DEC: this.generateDec(inst); break;
      case TACOp.TYPEOF: this.generateTypeof(inst); break;
      case TACOp.DELETE: this.emit('MOV R0, 1'); break;
      case TACOp.SPREAD: break;
      case TACOp.STRICT_EQ:
      case TACOp.STRICT_NE:
      case TACOp.EQ:
      case TACOp.NE:
      case TACOp.LT:
      case TACOp.GT:
      case TACOp.LE:
      case TACOp.GE: this.generateComparison(inst); break;
      case TACOp.BIT_AND:
      case TACOp.BIT_OR:
      case TACOp.BIT_XOR:
      case TACOp.BIT_NOT:
      case TACOp.SHL:
      case TACOp.SHR:
      case TACOp.USHR: this.generateBitwise(inst); break;
      case TACOp.AND:
      case TACOp.OR: this.generateLogical(inst); break;
    }
  }

  // ===== Scratch / register management =====

  private allocateScratch(): number {
    const occ = this.occupiedAt[this.currentIndex] ?? new Uint8Array(20);
    for (let r = SCRATCH_FIRST; r <= SCRATCH_LAST; r++) {
      if (occ[r] === 0 && !this.scratchBusy[r]) {
        this.scratchBusy[r] = true;
        return r;
      }
    }
    throw new Error('Out of scratch registers');
  }

  private freeRegister(reg: number): void {
    if (reg >= SCRATCH_FIRST && reg <= SCRATCH_LAST) {
      this.scratchBusy[reg] = false;
    }
  }

  private resultRegister(inst: TACInstruction): number {
    const result = inst.result;
    if (result && isTemp(result)) {
      const home = this.tempHome.get(result);
      if (home !== undefined) return home;
    }
    return this.allocateScratch();
  }

  private getRegister(name: string): number {
    if (isTemp(name)) {
      const home = this.tempHome.get(name);
      if (home !== undefined) return home;
      const scratch = this.allocateScratch();
      const addr = this.getVariableAddress(name);
      this.emit(`MOV R${scratch}, [${addr}]`);
      return scratch;
    }
    if (isNumber(name)) {
      const scratch = this.allocateScratch();
      this.emit(`MOV R${scratch}, ${name}`);
      return scratch;
    }
    if (name === 'true') {
      const scratch = this.allocateScratch();
      this.emit(`MOV R${scratch}, 1`);
      return scratch;
    }
    if (name === 'false' || name === 'null' || name === 'undefined') {
      const scratch = this.allocateScratch();
      this.emit(`MOV R${scratch}, 0`);
      return scratch;
    }
    if (isStringLit(name)) {
      const scratch = this.allocateScratch();
      const strVal = name.replace(/^["']|["']$/g, '');
      this.emit(`MOV R${scratch}, ${strVal.length}`);
      this.emit(`ADD R${scratch}, 5000`);
      return scratch;
    }
    if (name === '[]' || name === '{}' || name.startsWith('func_') || name.startsWith('class_') || name.startsWith('/')) {
      const scratch = this.allocateScratch();
      this.emit(`MOV R${scratch}, 0`);
      return scratch;
    }
    const scratch = this.allocateScratch();
    const addr = this.getVariableAddress(name);
    this.emit(`MOV R${scratch}, [${addr}]`);
    return scratch;
  }

  private storeResult(inst: TACInstruction, reg: number): void {
    const result = inst.result;
    if (!result) {
      this.freeRegister(reg);
      return;
    }
    if (isTemp(result)) {
      const home = this.tempHome.get(result);
      if (home !== undefined) {
        if (home !== reg) this.emit(`MOV R${home}, R${reg}`);
      } else {
        const addr = this.getVariableAddress(result);
        this.emit(`MOV [${addr}], R${reg}`);
      }
      this.freeRegister(reg);
      return;
    }
    const addr = this.getVariableAddress(result);
    this.emit(`MOV [${addr}], R${reg}`);
    this.freeRegister(reg);
  }

  // ===== Instruction emission =====

  private generateCall(inst: TACInstruction): void {
    if (inst.arg1 === 'print') {
      const argReg = this.getRegister(inst.result || '');
      this.emit(`MOV R0, R${argReg}`);
      this.emit(`CALL print`);
      this.freeRegister(argReg);
    } else if (inst.arg1 === 'string_new' || inst.arg1 === 'object_new' ||
               inst.arg1 === 'array_new' || inst.arg1 === 'string_concat' ||
               inst.arg1 === 'typeof_runtime') {
      this.emit(`CALL ${inst.arg1}`);
      const reg = this.resultRegister(inst);
      this.emit(`MOV R${reg}, R0`);
      this.storeResult(inst, reg);
    } else {
      this.emit(`CALL ${inst.arg1}`);
      if (inst.result) {
        const reg = this.resultRegister(inst);
        this.emit(`MOV R${reg}, R0`);
        this.storeResult(inst, reg);
      }
    }
  }

  private generateNew(inst: TACInstruction): void {
    const typeName = inst.arg1;
    let runtimeFn = 'object_new';
    if (typeName === 'Array') runtimeFn = 'array_new';
    else if (typeName === 'String') runtimeFn = 'string_new';
    this.emit(`CALL ${runtimeFn}`);
    if (inst.result) {
      const reg = this.resultRegister(inst);
      this.emit(`MOV R${reg}, R0`);
      this.storeResult(inst, reg);
    }
  }

  private generateStore(inst: TACInstruction): void {
    const valReg = this.getRegister(inst.arg1 || '0');
    const parts = (inst.result || '').split('.');
    if (parts.length === 2) {
      const objReg = this.getRegister(parts[0]);
      const idxStr = parts[1];
      if (!isNaN(Number(idxStr))) {
        this.emit(`MOV R1, ${idxStr}`);
      } else {
        const idxAddr = this.getVariableAddress(idxStr);
        this.emit(`MOV R1, [${idxAddr}]`);
      }
      this.emit(`MOV R2, R${valReg}`);
      this.emit(`MOV R0, R${objReg}`);
      this.emit(`CALL object_set`);
      this.freeRegister(objReg);
    }
    this.freeRegister(valReg);
  }

  private generateLoad(inst: TACInstruction): void {
    const parts = (inst.arg1 || '').split('.');
    if (parts.length === 2) {
      const objReg = this.getRegister(parts[0]);
      const idxStr = parts[1];
      if (!isNaN(Number(idxStr))) {
        this.emit(`MOV R1, ${idxStr}`);
      } else {
        const idxAddr = this.getVariableAddress(idxStr);
        this.emit(`MOV R1, [${idxAddr}]`);
      }
      this.emit(`MOV R0, R${objReg}`);
      this.emit(`CALL object_get`);
      const resReg = this.resultRegister(inst);
      this.emit(`MOV R${resReg}, R0`);
      this.freeRegister(objReg);
      this.storeResult(inst, resReg);
    } else if (inst.arg1 && (inst.arg1.startsWith('"') || inst.arg1.startsWith("'"))) {
      const reg = this.resultRegister(inst);
      const strVal = inst.arg1.replace(/^["']|["']$/g, '');
      this.emit(`MOV R${reg}, ${strVal.length}`);
      this.emit(`ADD R${reg}, 5000`);
      this.storeResult(inst, reg);
    } else {
      const reg = this.getRegister(inst.arg1 || '');
      this.storeResult(inst, reg);
    }
  }

  private generateNot(inst: TACInstruction): void {
    const reg = this.getRegister(inst.arg1 || 'false');
    const resultReg = this.resultRegister(inst);
    const jumpTarget = this.currentAddress + 4;
    this.emit(`MOV R${resultReg}, 1`);
    this.emit(`CMP R${reg}, 0`);
    this.emit(`JZ ${jumpTarget}`);
    this.emit(`MOV R${resultReg}, 0`);
    this.freeRegister(reg);
    this.storeResult(inst, resultReg);
  }

  private generateNeg(inst: TACInstruction): void {
    const reg = this.getRegister(inst.arg1 || '0');
    const resultReg = this.resultRegister(inst);
    this.emit(`MOV R${resultReg}, 0`);
    this.emit(`SUB R${resultReg}, R${reg}`);
    this.freeRegister(reg);
    this.storeResult(inst, resultReg);
  }

  private generateInc(inst: TACInstruction): void {
    const reg = this.getRegister(inst.result || '0');
    this.emit(`ADD R${reg}, 1`);
    this.storeResult(inst, reg);
  }

  private generateDec(inst: TACInstruction): void {
    const reg = this.getRegister(inst.result || '0');
    this.emit(`SUB R${reg}, 1`);
    this.storeResult(inst, reg);
  }

  private generateTypeof(inst: TACInstruction): void {
    const reg = this.getRegister(inst.arg1 || 'undefined');
    this.emit(`MOV R0, R${reg}`);
    this.emit(`CALL typeof_runtime`);
    const resultReg = this.resultRegister(inst);
    this.emit(`MOV R${resultReg}, R0`);
    this.freeRegister(reg);
    this.storeResult(inst, resultReg);
  }

  private generateMod(inst: TACInstruction): void {
    const reg1 = this.getRegister(inst.arg1!);
    const reg2 = this.getRegister(inst.arg2!);
    const resultReg = this.resultRegister(inst);
    this.emit(`MOV R${resultReg}, R${reg1}`);
    this.emit(`MOD R${resultReg}, R${reg2}`);
    this.freeRegister(reg1);
    this.freeRegister(reg2);
    this.storeResult(inst, resultReg);
  }

  private generatePow(inst: TACInstruction): void {
    const reg1 = this.getRegister(inst.arg1!);
    const reg2 = this.getRegister(inst.arg2!);
    const resultReg = this.resultRegister(inst);
    this.emit(`MOV R${resultReg}, R${reg1}`);
    this.emit(`PUSH R${reg2}`);
    this.emit(`CALL pow`);
    this.emit(`POP R${resultReg}`);
    this.freeRegister(reg1);
    this.freeRegister(reg2);
    this.storeResult(inst, resultReg);
  }

  private generateParam(inst: TACInstruction): void {
    if (inst.arg1) {
      const reg = this.getRegister(inst.arg1);
      this.emit(`PUSH R${reg}`);
      this.freeRegister(reg);
    }
  }

  private generateAdd(inst: TACInstruction): void {
    const reg1 = this.getRegister(inst.arg1!);
    const reg2 = this.getRegister(inst.arg2!);
    const resultReg = this.resultRegister(inst);
    this.emit(`MOV R${resultReg}, R${reg1}`);
    this.emit(`ADD R${resultReg}, R${reg2}`);
    this.freeRegister(reg1);
    this.freeRegister(reg2);
    this.storeResult(inst, resultReg);
  }

  private generateSub(inst: TACInstruction): void {
    const reg1 = this.getRegister(inst.arg1!);
    const reg2 = this.getRegister(inst.arg2!);
    const resultReg = this.resultRegister(inst);
    this.emit(`MOV R${resultReg}, R${reg1}`);
    this.emit(`SUB R${resultReg}, R${reg2}`);
    this.freeRegister(reg1);
    this.freeRegister(reg2);
    this.storeResult(inst, resultReg);
  }

  private generateMul(inst: TACInstruction): void {
    const reg1 = this.getRegister(inst.arg1!);
    const reg2 = this.getRegister(inst.arg2!);
    const resultReg = this.resultRegister(inst);
    this.emit(`MOV R${resultReg}, R${reg1}`);
    this.emit(`MUL R${resultReg}, R${reg2}`);
    this.freeRegister(reg1);
    this.freeRegister(reg2);
    this.storeResult(inst, resultReg);
  }

  private generateDiv(inst: TACInstruction): void {
    const reg1 = this.getRegister(inst.arg1!);
    const reg2 = this.getRegister(inst.arg2!);
    const resultReg = this.resultRegister(inst);
    this.emit(`MOV R${resultReg}, R${reg1}`);
    this.emit(`DIV R${resultReg}, R${reg2}`);
    this.freeRegister(reg1);
    this.freeRegister(reg2);
    this.storeResult(inst, resultReg);
  }

  private generateAssign(inst: TACInstruction): void {
    if (inst.result === 'print') {
      const reg = this.getRegister(inst.arg1 || '0');
      this.emit(`MOV R0, R${reg}`);
      this.emit(`CALL print`);
      this.freeRegister(reg);
      return;
    }
    if (inst.arg1 && !isNaN(Number(inst.arg1))) {
      const reg = this.resultRegister(inst);
      this.emit(`MOV R${reg}, ${inst.arg1}`);
      this.storeResult(inst, reg);
    } else if (inst.arg1) {
      const reg = this.getRegister(inst.arg1);
      this.storeResult(inst, reg);
    }
  }

  private generateLabel(inst: TACInstruction): void {
    // labels are resolved to numeric addresses in firstPass; no code emitted
  }

  private generateJump(inst: TACInstruction): void {
    const address = this.labels.get(inst.label!);
    this.emit(`JMP ${address}`);
  }

  private generateCondJump(inst: TACInstruction): void {
    const reg = this.getRegister(inst.arg1!);
    const address = this.labels.get(inst.label!);
    if (inst.arg2 === 'false') {
      this.emit(`JZ R${reg}, ${address}`);
    } else {
      this.emit(`JNZ R${reg}, ${address}`);
    }
    this.freeRegister(reg);
  }

  private generateReturn(inst: TACInstruction): void {
    if (inst.arg1) {
      const reg = this.getRegister(inst.arg1);
      this.emit(`MOV [BP-2], R${reg}`);
      this.freeRegister(reg);
    }
    this.emit(`MOV BP, [SP]`);
    this.emit(`POP BP`);
    this.emit(`RET`);
  }

  private generateComparison(inst: TACInstruction): void {
    const reg1 = this.getRegister(inst.arg1!);
    const reg2 = this.getRegister(inst.arg2!);
    const resultReg = this.resultRegister(inst);

    let condition: string;
    switch (inst.op) {
      case TACOp.EQ:
      case TACOp.STRICT_EQ: condition = 'NE'; break;
      case TACOp.NE:
      case TACOp.STRICT_NE: condition = 'EQ'; break;
      case TACOp.LT: condition = 'GE'; break;
      case TACOp.GT: condition = 'LE'; break;
      case TACOp.LE: condition = 'GT'; break;
      case TACOp.GE: condition = 'LT'; break;
      default: condition = 'NE';
    }

    const jumpTarget = this.currentAddress + 4;
    this.emit(`MOV R${resultReg}, 0`);
    this.emit(`CMP R${reg1}, R${reg2}`);
    this.emit(`J${condition} ${jumpTarget}`);
    this.emit(`MOV R${resultReg}, 1`);

    this.freeRegister(reg1);
    this.freeRegister(reg2);
    this.storeResult(inst, resultReg);
  }

  private generateBitwise(inst: TACInstruction): void {
    if (inst.op === TACOp.BIT_NOT) {
      const reg1 = this.getRegister(inst.arg1!);
      const resultReg = this.resultRegister(inst);
      this.emit(`MOV R${resultReg}, R${reg1}`);
      this.emit(`NOT R${resultReg}`);
      this.freeRegister(reg1);
      this.storeResult(inst, resultReg);
      return;
    }
    const reg1 = this.getRegister(inst.arg1!);
    const reg2 = this.getRegister(inst.arg2!);
    const resultReg = this.resultRegister(inst);

    switch (inst.op) {
      case TACOp.BIT_AND:
        this.emit(`MOV R${resultReg}, R${reg1}`);
        this.emit(`AND R${resultReg}, R${reg2}`);
        break;
      case TACOp.BIT_OR:
        this.emit(`MOV R${resultReg}, R${reg1}`);
        this.emit(`OR R${resultReg}, R${reg2}`);
        break;
      case TACOp.BIT_XOR:
        this.emit(`MOV R${resultReg}, R${reg1}`);
        this.emit(`XOR R${resultReg}, R${reg2}`);
        break;
      case TACOp.SHL:
        this.emit(`MOV R${resultReg}, R${reg1}`);
        this.emit(`SHL R${resultReg}, R${reg2}`);
        break;
      case TACOp.SHR:
        this.emit(`MOV R${resultReg}, R${reg1}`);
        this.emit(`SHR R${resultReg}, R${reg2}`);
        break;
      case TACOp.USHR:
        this.emit(`MOV R${resultReg}, R${reg1}`);
        this.emit(`SHR R${resultReg}, R${reg2}`);
        break;
      default:
        this.freeRegister(reg1);
        this.freeRegister(reg2);
        this.freeRegister(resultReg);
        return;
    }

    this.freeRegister(reg1);
    this.freeRegister(reg2);
    this.storeResult(inst, resultReg);
  }

  private generateLogical(inst: TACInstruction): void {
    const reg1 = this.getRegister(inst.arg1!);
    const reg2 = this.getRegister(inst.arg2!);
    const resultReg = this.resultRegister(inst);

    if (inst.op === TACOp.AND) {
      this.emit(`MOV R${resultReg}, R${reg1}`);
      this.emit(`AND R${resultReg}, R${reg2}`);
    } else {
      this.emit(`MOV R${resultReg}, R${reg1}`);
      this.emit(`OR R${resultReg}, R${reg2}`);
    }

    this.freeRegister(reg1);
    this.freeRegister(reg2);
    this.storeResult(inst, resultReg);
  }

  private getVariableAddress(name: string): number {
    if (this.symbolTable && this.symbolTable.lookup) {
      const symbol = this.symbolTable.lookup(name);
      if (symbol && symbol.binding !== undefined) {
        return symbol.binding;
      }
    }
    if (!this.variableAddressMap.has(name)) {
      this.variableAddressMap.set(name, this.nextVariableAddress--);
    }
    return this.variableAddressMap.get(name)!;
  }

  private emit(code: string): void {
    this.output.push(code);
    this.currentAddress += 2;
  }
}
