import { TACInstruction, TACOp } from '../ir/tac.js';

export class XSMGenerator {
  private output: string[] = [];
  private registers: boolean[] = new Array(20).fill(false);
  private stackPointer: number = 4096;
  private basePointer: number = 4096;
  private labels: Map<number, number> = new Map();
  private currentAddress: number = 2056;
  private symbolTable: any;
  private tempToRegister: Map<string, number> = new Map();
  private labelCounter: number = 0;

  constructor(symbolTable: any) {
    this.symbolTable = symbolTable;
  }

  public generate(instructions: TACInstruction[]): string {
    this.output = [];
    this.registers.fill(false);
    this.tempToRegister.clear();
    this.firstPass(instructions);
    this.secondPass(instructions);
    return this.output.join('\n');
  }

  private firstPass(instructions: TACInstruction[]): void {
    let address = 2056;
    for (const inst of instructions) {
      if (inst.op === TACOp.LABEL && inst.label !== undefined) {
        this.labels.set(inst.label, address);
      }
      address += 2;
    }
  }

  private secondPass(instructions: TACInstruction[]): void {
    for (const inst of instructions) {
      this.generateInstruction(inst);
    }
  }

  private generateInstruction(inst: TACInstruction): void {
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
      case TACOp.DELETE: break;
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

  private generateCall(inst: TACInstruction): void {
    if (inst.arg1 === 'print') {
      const argReg = this.getRegister(inst.result || '');
      this.emit(`MOV R0, R${argReg}`);
      this.emit(`CALL print`);
      this.freeRegister(argReg);
    } else {
      this.emit(`CALL ${inst.arg1}`);
    }
  }

  private generateNew(inst: TACInstruction): void {
    this.emit(`CALL ${inst.arg1}_new`);
  }

  private generateStore(inst: TACInstruction): void {
    const valReg = this.getRegister(inst.arg1 || '0');
    const parts = (inst.result || '').split('.');
    if (parts.length === 2) {
      const objReg = this.getRegister(parts[0]);
      this.emit(`MOV [R${objReg}], R${valReg}`);
      this.freeRegister(objReg);
    }
    this.freeRegister(valReg);
  }

  private generateLoad(inst: TACInstruction): void {
    const reg = this.allocateRegister();
    const parts = (inst.arg1 || '').split('.');
    if (parts.length === 2) {
      const objReg = this.getRegister(parts[0]);
      this.emit(`MOV R${reg}, [R${objReg}]`);
      this.freeRegister(objReg);
    } else {
      const address = this.getVariableAddress(inst.arg1 || '');
      this.emit(`MOV R${reg}, [${address}]`);
    }
    if (inst.result && inst.result.startsWith('t')) {
      this.mapTempToRegister(inst.result, reg);
    } else if (inst.result) {
      const address = this.getVariableAddress(inst.result);
      this.emit(`MOV [${address}], R${reg}`);
      this.freeRegister(reg);
    }
  }

  private generateNot(inst: TACInstruction): void {
    const reg = this.getRegister(inst.arg1 || 'false');
    const resultReg = this.allocateRegister();
    this.emit(`MOV R${resultReg}, 0`);
    this.emit(`CMP R${reg}, 0`);
    this.emit(`JZ R${reg}, L${this.getLabelForComparison()}`);
    this.emit(`MOV R${resultReg}, 1`);
    this.emit(`LABEL L${this.getLabelForComparison()}:`);
    this.freeRegister(reg);
    if (inst.result && inst.result.startsWith('t')) {
      this.mapTempToRegister(inst.result, resultReg);
    } else if (inst.result) {
      const address = this.getVariableAddress(inst.result);
      this.emit(`MOV [${address}], R${resultReg}`);
      this.freeRegister(resultReg);
    }
  }

  private generateNeg(inst: TACInstruction): void {
    const reg = this.getRegister(inst.arg1 || '0');
    const resultReg = this.allocateRegister();
    this.emit(`MOV R${resultReg}, 0`);
    this.emit(`SUB R${resultReg}, R${reg}`);
    this.freeRegister(reg);
    if (inst.result && inst.result.startsWith('t')) {
      this.mapTempToRegister(inst.result, resultReg);
    } else if (inst.result) {
      const address = this.getVariableAddress(inst.result);
      this.emit(`MOV [${address}], R${resultReg}`);
      this.freeRegister(resultReg);
    }
  }

  private generateInc(inst: TACInstruction): void {
    const reg = this.getRegister(inst.result || '0');
    this.emit(`ADD R${reg}, 1`);
  }

  private generateDec(inst: TACInstruction): void {
    const reg = this.getRegister(inst.result || '0');
    this.emit(`SUB R${reg}, 1`);
  }

  private generateTypeof(inst: TACInstruction): void {
    const reg = this.getRegister(inst.arg1 || 'undefined');
    const resultReg = this.allocateRegister();
    this.emit(`MOV R${resultReg}, R${reg}`);
    this.freeRegister(reg);
    if (inst.result && inst.result.startsWith('t')) {
      this.mapTempToRegister(inst.result, resultReg);
    } else if (inst.result) {
      const address = this.getVariableAddress(inst.result);
      this.emit(`MOV [${address}], R${resultReg}`);
      this.freeRegister(resultReg);
    }
  }

  private generateMod(inst: TACInstruction): void {
    const reg1 = this.getRegister(inst.arg1!);
    const reg2 = this.getRegister(inst.arg2!);
    const resultReg = this.allocateRegister();
    this.emit(`MOV R${resultReg}, R${reg1}`);
    this.emit(`MOD R${resultReg}, R${reg2}`);
    this.freeRegister(reg1);
    this.freeRegister(reg2);
    if (inst.result && inst.result.startsWith('t')) {
      this.mapTempToRegister(inst.result, resultReg);
    } else if (inst.result) {
      const address = this.getVariableAddress(inst.result);
      this.emit(`MOV [${address}], R${resultReg}`);
      this.freeRegister(resultReg);
    }
  }

  private generatePow(inst: TACInstruction): void {
    const reg1 = this.getRegister(inst.arg1!);
    const reg2 = this.getRegister(inst.arg2!);
    const resultReg = this.allocateRegister();
    this.emit(`MOV R${resultReg}, R${reg1}`);
    this.emit(`PUSH R${reg2}`);
    this.emit(`CALL pow`);
    this.emit(`POP R${resultReg}`);
    this.freeRegister(reg1);
    this.freeRegister(reg2);
    if (inst.result && inst.result.startsWith('t')) {
      this.mapTempToRegister(inst.result, resultReg);
    } else if (inst.result) {
      const address = this.getVariableAddress(inst.result);
      this.emit(`MOV [${address}], R${resultReg}`);
      this.freeRegister(resultReg);
    }
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
    const resultReg = this.allocateRegister();
    this.emit(`MOV R${resultReg}, R${reg1}`);
    this.emit(`ADD R${resultReg}, R${reg2}`);
    this.freeRegister(reg1);
    this.freeRegister(reg2);
    this.storeResult(inst, resultReg);
  }

  private generateSub(inst: TACInstruction): void {
    const reg1 = this.getRegister(inst.arg1!);
    const reg2 = this.getRegister(inst.arg2!);
    const resultReg = this.allocateRegister();
    this.emit(`MOV R${resultReg}, R${reg1}`);
    this.emit(`SUB R${resultReg}, R${reg2}`);
    this.freeRegister(reg1);
    this.freeRegister(reg2);
    this.storeResult(inst, resultReg);
  }

  private generateMul(inst: TACInstruction): void {
    const reg1 = this.getRegister(inst.arg1!);
    const reg2 = this.getRegister(inst.arg2!);
    const resultReg = this.allocateRegister();
    this.emit(`MOV R${resultReg}, R${reg1}`);
    this.emit(`MUL R${resultReg}, R${reg2}`);
    this.freeRegister(reg1);
    this.freeRegister(reg2);
    this.storeResult(inst, resultReg);
  }

  private generateDiv(inst: TACInstruction): void {
    const reg1 = this.getRegister(inst.arg1!);
    const reg2 = this.getRegister(inst.arg2!);
    const resultReg = this.allocateRegister();
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
      const reg = this.allocateRegister();
      this.emit(`MOV R${reg}, ${inst.arg1}`);
      this.storeResult(inst, reg);
    } else if (inst.arg1) {
      const reg = this.getRegister(inst.arg1);
      this.storeResult(inst, reg);
    }
  }

  private generateLabel(inst: TACInstruction): void {
    if (inst.label !== undefined) {
      this.emit(`L${inst.label}:`);
    }
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
    const resultReg = this.allocateRegister();

    let condition: string;
    switch (inst.op) {
      case TACOp.EQ:
      case TACOp.STRICT_EQ: condition = 'EQ'; break;
      case TACOp.NE:
      case TACOp.STRICT_NE: condition = 'NE'; break;
      case TACOp.LT: condition = 'LT'; break;
      case TACOp.GT: condition = 'GT'; break;
      case TACOp.LE: condition = 'LE'; break;
      case TACOp.GE: condition = 'GE'; break;
      default: condition = 'EQ';
    }

    this.emit(`MOV R${resultReg}, 0`);
    this.emit(`CMP R${reg1}, R${reg2}`);
    this.emit(`J${condition} L${this.getLabelForComparison()}`);
    this.emit(`MOV R${resultReg}, 1`);
    this.emit(`LABEL L${this.getLabelForComparison()}:`);

    this.freeRegister(reg1);
    this.freeRegister(reg2);
    this.storeResult(inst, resultReg);
  }

  private generateBitwise(inst: TACInstruction): void {
    const reg1 = this.getRegister(inst.arg1!);
    const reg2 = this.getRegister(inst.arg2!);
    const resultReg = this.allocateRegister();

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
      case TACOp.BIT_NOT:
        this.emit(`MOV R${resultReg}, R${reg1}`);
        this.emit(`NOT R${resultReg}`);
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
    }

    this.freeRegister(reg1);
    this.freeRegister(reg2);
    this.storeResult(inst, resultReg);
  }

  private generateLogical(inst: TACInstruction): void {
    const reg1 = this.getRegister(inst.arg1!);
    const reg2 = this.getRegister(inst.arg2!);
    const resultReg = this.allocateRegister();

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

  private storeResult(inst: TACInstruction, reg: number): void {
    if (inst.result && inst.result.startsWith('t')) {
      this.mapTempToRegister(inst.result, reg);
    } else if (inst.result) {
      const address = this.getVariableAddress(inst.result);
      this.emit(`MOV [${address}], R${reg}`);
      this.freeRegister(reg);
    }
  }

  private allocateRegister(): number {
    for (let i = 0; i < 20; i++) {
      if (!this.registers[i]) {
        this.registers[i] = true;
        return i;
      }
    }
    throw new Error('Out of registers');
  }

  private freeRegister(reg: number): void {
    if (reg >= 0 && reg < 20) {
      this.registers[reg] = false;
    }
  }

  private getRegister(temp: string): number {
    if (temp.startsWith('t')) {
      const reg = this.tempToRegister.get(temp);
      if (reg !== undefined) return reg;
    }
    const reg = this.allocateRegister();
    if (!temp.startsWith('t')) {
      const address = this.getVariableAddress(temp);
      this.emit(`MOV R${reg}, [${address}]`);
    }
    return reg;
  }

  private mapTempToRegister(temp: string, reg: number): void {
    this.tempToRegister.set(temp, reg);
  }

  private getVariableAddress(name: string): number {
    if (this.symbolTable && this.symbolTable.lookup) {
      const symbol = this.symbolTable.lookup(name);
      if (symbol && symbol.binding !== undefined) {
        return symbol.binding;
      }
    }
    return 4096 + (name.charCodeAt(0) - 97);
  }

  private getLabelForComparison(): number {
    return this.labelCounter++;
  }

  private emit(code: string): void {
    this.output.push(code);
    this.currentAddress += 2;
  }
}