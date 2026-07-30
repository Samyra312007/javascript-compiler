import { TACInstruction, TACOp } from '../ir/tac.js';

export class X86Generator {
  private output: string[] = [];
  private dataOutput: string[] = [];
  private labels: Map<number, number> = new Map();
  private labelCounter: number = 0;
  private stackOffset: number = 0;
  private tempToStackSlot: Map<string, number> = new Map();
  private varToStackSlot: Map<string, number> = new Map();
  private nextStackSlot: number = 8;
  private stringLiterals: Map<string, string> = new Map();
  private stringCounter: number = 0;
  private symbolTable: any;

  constructor(symbolTable: any) {
    this.symbolTable = symbolTable;
  }

  public generate(instructions: TACInstruction[]): string {
    this.output = [];
    this.dataOutput = [];
    this.labels.clear();
    this.tempToStackSlot.clear();
    this.varToStackSlot.clear();
    this.stringLiterals.clear();
    this.nextStackSlot = 8;
    this.stackOffset = 0;

    this.collectLabels(instructions);
    this.emitPrologue();
    this.emitMainBody(instructions);
    this.emitEpilogue();

    return this.buildOutput();
  }

  private collectLabels(instructions: TACInstruction[]): void {
    let address = 0;
    for (const inst of instructions) {
      if (inst.op === TACOp.LABEL && inst.label !== undefined) {
        this.labels.set(inst.label, address);
      } else {
        address++;
      }
    }
  }

  private emitPrologue(): void {
    this.output.push('section .text');
    this.output.push('global _start');
    this.output.push('_start:');
    this.output.push('  push rbp');
    this.output.push('  mov rbp, rsp');
    this.stackOffset = 8;

    this.output.push('  sub rsp, 4096');
    this.stackOffset += 4096;

    this.output.push('  call main');
    this.output.push('  mov rdi, rax');
    this.output.push('  mov rax, 60');
    this.output.push('  syscall');
    this.output.push('');
  }

  private emitEpilogue(): void {
    this.output.push('  mov rsp, rbp');
    this.output.push('  pop rbp');
    this.output.push('  ret');
    this.output.push('');
  }

  private buildOutput(): string {
    const dataSection = this.buildDataSection();
    return dataSection + '\n' + this.output.join('\n');
  }

  private buildDataSection(): string {
    const lines: string[] = ['section .data'];
    for (const [key, label] of this.stringLiterals) {
      lines.push(`${label}: db "${this.escapeString(key)}", 0`);
    }
    if (this.dataOutput.length > 0) {
      for (const line of this.dataOutput) {
        lines.push(line);
      }
    }
    return lines.join('\n');
  }

  private escapeString(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r');
  }

  private emitMainBody(instructions: TACInstruction[]): void {
    for (const inst of instructions) {
      this.emitInstruction(inst);
    }
  }

  private emitInstruction(inst: TACInstruction): void {
    switch (inst.op) {
      case TACOp.ADD: this.emitAdd(inst); break;
      case TACOp.SUB: this.emitSub(inst); break;
      case TACOp.MUL: this.emitMul(inst); break;
      case TACOp.DIV: this.emitDiv(inst); break;
      case TACOp.MOD: this.emitMod(inst); break;
      case TACOp.POW: this.emitCallRuntime(inst, 'pow'); break;
      case TACOp.EQ:
      case TACOp.NE:
      case TACOp.STRICT_EQ:
      case TACOp.STRICT_NE:
      case TACOp.LT:
      case TACOp.GT:
      case TACOp.LE:
      case TACOp.GE: this.emitComparison(inst); break;
      case TACOp.AND:
      case TACOp.OR: this.emitLogical(inst); break;
      case TACOp.NOT: this.emitNot(inst); break;
      case TACOp.BIT_AND:
      case TACOp.BIT_OR:
      case TACOp.BIT_XOR:
      case TACOp.BIT_NOT:
      case TACOp.SHL:
      case TACOp.SHR:
      case TACOp.USHR: this.emitBitwise(inst); break;
      case TACOp.ASSIGN: this.emitAssign(inst); break;
      case TACOp.LOAD: this.emitLoad(inst); break;
      case TACOp.STORE: this.emitStore(inst); break;
      case TACOp.LABEL: this.emitLabel(inst); break;
      case TACOp.JUMP: this.emitJump(inst); break;
      case TACOp.COND_JUMP: this.emitCondJump(inst); break;
      case TACOp.CALL: this.emitCall(inst); break;
      case TACOp.PARAM: this.emitParam(inst); break;
      case TACOp.RETURN: this.emitReturn(inst); break;
      case TACOp.INC: this.emitInc(inst); break;
      case TACOp.DEC: this.emitDec(inst); break;
      case TACOp.NEG: this.emitNeg(inst); break;
      case TACOp.TYPEOF: this.emitTypeof(inst); break;
      case TACOp.DELETE: this.emitDelete(inst); break;
      case TACOp.NEW: this.emitNew(inst); break;
      case TACOp.SPREAD: break;
    }
  }

  private getVarSlot(name: string): number {
    if (!this.varToStackSlot.has(name)) {
      const slot = this.nextStackSlot;
      this.nextStackSlot += 8;
      this.varToStackSlot.set(name, slot);
    }
    return this.varToStackSlot.get(name)!;
  }

  private getTempSlot(temp: string): number {
    if (!this.tempToStackSlot.has(temp)) {
      const slot = this.nextStackSlot;
      this.nextStackSlot += 8;
      this.tempToStackSlot.set(temp, slot);
    }
    return this.tempToStackSlot.get(temp)!;
  }

  private loadToReg(name: string, reg: string): void {
    if (name.startsWith('t')) {
      const slot = this.getTempSlot(name);
      this.output.push(`  mov ${reg}, [rbp-${slot}]`);
    } else if (!isNaN(Number(name))) {
      this.output.push(`  mov ${reg}, ${name}`);
    } else if (name === 'true') {
      this.output.push(`  mov ${reg}, 1`);
    } else if (name === 'false' || name === 'null' || name === 'undefined') {
      this.output.push(`  xor ${reg}, ${reg}`);
    } else if (name.startsWith('"') || name.startsWith("'")) {
      const lbl = this.getStringLiteral(name.replace(/^["']|["']$/g, ''));
      this.output.push(`  lea ${reg}, [rel ${lbl}]`);
    } else {
      const slot = this.getVarSlot(name);
      this.output.push(`  mov ${reg}, [rbp-${slot}]`);
    }
  }

  private storeFromReg(name: string, reg: string): void {
    if (name.startsWith('t')) {
      const slot = this.getTempSlot(name);
      this.output.push(`  mov [rbp-${slot}], ${reg}`);
    } else {
      const slot = this.getVarSlot(name);
      this.output.push(`  mov [rbp-${slot}], ${reg}`);
    }
  }

  private getStringLiteral(value: string): string {
    if (!this.stringLiterals.has(value)) {
      const label = `str_${this.stringCounter++}`;
      this.stringLiterals.set(value, label);
    }
    return this.stringLiterals.get(value)!;
  }

  private emitAdd(inst: TACInstruction): void {
    this.loadToReg(inst.arg1!, 'rax');
    this.loadToReg(inst.arg2!, 'rbx');
    this.output.push('  add rax, rbx');
    this.storeFromReg(inst.result!, 'rax');
  }

  private emitSub(inst: TACInstruction): void {
    this.loadToReg(inst.arg1!, 'rax');
    this.loadToReg(inst.arg2!, 'rbx');
    this.output.push('  sub rax, rbx');
    this.storeFromReg(inst.result!, 'rax');
  }

  private emitMul(inst: TACInstruction): void {
    this.loadToReg(inst.arg1!, 'rax');
    this.loadToReg(inst.arg2!, 'rbx');
    this.output.push('  imul rax, rbx');
    this.storeFromReg(inst.result!, 'rax');
  }

  private emitDiv(inst: TACInstruction): void {
    this.loadToReg(inst.arg1!, 'rax');
    this.loadToReg(inst.arg2!, 'rbx');
    this.output.push('  xor rdx, rdx');
    this.output.push('  idiv rbx');
    this.storeFromReg(inst.result!, 'rax');
  }

  private emitMod(inst: TACInstruction): void {
    this.loadToReg(inst.arg1!, 'rax');
    this.loadToReg(inst.arg2!, 'rbx');
    this.output.push('  xor rdx, rdx');
    this.output.push('  idiv rbx');
    this.storeFromReg(inst.result!, 'rdx');
  }

  private emitComparison(inst: TACInstruction): void {
    this.loadToReg(inst.arg1!, 'rax');
    this.loadToReg(inst.arg2!, 'rbx');
    this.output.push('  cmp rax, rbx');

    let setcc: string;
    switch (inst.op) {
      case TACOp.EQ:
      case TACOp.STRICT_EQ: setcc = 'sete'; break;
      case TACOp.NE:
      case TACOp.STRICT_NE: setcc = 'setne'; break;
      case TACOp.LT: setcc = 'setl'; break;
      case TACOp.GT: setcc = 'setg'; break;
      case TACOp.LE: setcc = 'setle'; break;
      case TACOp.GE: setcc = 'setge'; break;
      default: setcc = 'sete';
    }

    this.output.push(`  ${setcc} al`);
    this.output.push('  movzx rax, al');
    this.storeFromReg(inst.result!, 'rax');
  }

  private emitLogical(inst: TACInstruction): void {
    const labelNum = this.labelCounter++;
    this.loadToReg(inst.arg1!, 'rax');
    this.output.push('  test rax, rax');

    if (inst.op === TACOp.AND) {
      this.output.push(`  jz .L${labelNum}`);
      this.loadToReg(inst.arg2!, 'rax');
    } else {
      this.output.push(`  jnz .L${labelNum}`);
      this.loadToReg(inst.arg2!, 'rax');
    }
    this.output.push(`.L${labelNum}:`);
    this.storeFromReg(inst.result!, 'rax');
  }

  private emitNot(inst: TACInstruction): void {
    this.loadToReg(inst.arg1!, 'rax');
    this.output.push('  test rax, rax');
    this.output.push('  setz al');
    this.output.push('  movzx rax, al');
    this.storeFromReg(inst.result!, 'rax');
  }

  private emitBitwise(inst: TACInstruction): void {
    if (inst.op === TACOp.BIT_NOT) {
      this.loadToReg(inst.arg1!, 'rax');
      this.output.push('  not rax');
      this.storeFromReg(inst.result!, 'rax');
      return;
    }
    this.loadToReg(inst.arg1!, 'rax');
    this.loadToReg(inst.arg2!, 'rbx');
    switch (inst.op) {
      case TACOp.BIT_AND: this.output.push('  and rax, rbx'); break;
      case TACOp.BIT_OR: this.output.push('  or rax, rbx'); break;
      case TACOp.BIT_XOR: this.output.push('  xor rax, rbx'); break;
      case TACOp.SHL: this.output.push('  mov rcx, rbx'); this.output.push('  shl rax, cl'); break;
      case TACOp.SHR:
      case TACOp.USHR: this.output.push('  mov rcx, rbx'); this.output.push('  shr rax, cl'); break;
    }
    this.storeFromReg(inst.result!, 'rax');
  }

  private emitAssign(inst: TACInstruction): void {
    if (inst.result === 'print') {
      this.emitPrint(inst);
      return;
    }
    if (inst.arg1 && !isNaN(Number(inst.arg1))) {
      this.output.push(`  mov rax, ${inst.arg1}`);
      this.storeFromReg(inst.result!, 'rax');
    } else if (inst.arg1) {
      this.loadToReg(inst.arg1, 'rax');
      this.storeFromReg(inst.result!, 'rax');
    }
  }

  private emitPrint(inst: TACInstruction): void {
    this.loadToReg(inst.arg1!, 'rdi');
    this.output.push('  call print_number');
    this.loadToReg(inst.arg1!, 'rdi');
    this.output.push('  call print_newline');
  }

  private emitLoad(inst: TACInstruction): void {
    if (inst.arg1) {
      this.loadToReg(inst.arg1, 'rax');
    }
    if (inst.result) {
      this.storeFromReg(inst.result, 'rax');
    }
  }

  private emitStore(inst: TACInstruction): void {
    if (inst.arg1) {
      this.loadToReg(inst.arg1, 'rax');
    }
    if (inst.result) {
      this.storeFromReg(inst.result, 'rax');
    }
  }

  private emitLabel(inst: TACInstruction): void {
    if (inst.label !== undefined) {
      this.output.push(`.L${inst.label}:`);
    }
  }

  private emitJump(inst: TACInstruction): void {
    const addr = this.labels.get(inst.label!);
    this.output.push(`  jmp .L${addr}`);
  }

  private emitCondJump(inst: TACInstruction): void {
    const addr = this.labels.get(inst.label!);
    this.loadToReg(inst.arg1!, 'rax');
    this.output.push('  test rax, rax');
    if (inst.arg2 === 'false') {
      this.output.push(`  jz .L${addr}`);
    } else {
      this.output.push(`  jnz .L${addr}`);
    }
  }

  private emitCall(inst: TACInstruction): void {
    if (inst.arg1 === 'print') {
      return;
    }
    this.output.push(`  call ${inst.arg1}`);
    if (inst.result) {
      this.storeFromReg(inst.result, 'rax');
    }
  }

  private emitParam(inst: TACInstruction): void {
    this.loadToReg(inst.arg1!, 'rdi');
  }

  private emitReturn(inst: TACInstruction): void {
    if (inst.arg1) {
      this.loadToReg(inst.arg1, 'rax');
    }
    this.emitEpilogue();
  }

  private emitInc(inst: TACInstruction): void {
    this.loadToReg(inst.result!, 'rax');
    this.output.push('  inc rax');
    this.storeFromReg(inst.result!, 'rax');
  }

  private emitDec(inst: TACInstruction): void {
    this.loadToReg(inst.result!, 'rax');
    this.output.push('  dec rax');
    this.storeFromReg(inst.result!, 'rax');
  }

  private emitNeg(inst: TACInstruction): void {
    this.loadToReg(inst.arg1!, 'rax');
    this.output.push('  neg rax');
    this.storeFromReg(inst.result!, 'rax');
  }

  private emitTypeof(inst: TACInstruction): void {
    this.loadToReg(inst.arg1!, 'rdi');
    this.output.push('  call typeof_runtime');
    this.storeFromReg(inst.result!, 'rax');
  }

  private emitDelete(inst: TACInstruction): void {
    this.output.push('  mov rax, 1');
    this.storeFromReg(inst.result!, 'rax');
  }

  private emitNew(inst: TACInstruction): void {
    this.output.push('  mov rax, 0');
    this.storeFromReg(inst.result!, 'rax');
  }

  private emitCallRuntime(inst: TACInstruction, fn: string): void {
    this.loadToReg(inst.arg1!, 'rdi');
    this.loadToReg(inst.arg2!, 'rsi');
    this.output.push(`  call ${fn}`);
    this.storeFromReg(inst.result!, 'rax');
  }

  public getRuntimeStubs(): string {
    return `
print_number:
  mov r15, rdi
  cmp rdi, 0
  jge .Lpos
  push rdi
  mov rdi, 45
  push r15
  mov rax, 1
  mov rdi, 1
  lea rsi, [rsp]
  mov rdx, 1
  syscall
  pop r15
  pop rdi
  neg rdi
.Lpos:
  mov rax, 0
  mov r14, 10
.Ldiv:
  xor rdx, rdx
  div r14
  push rdx
  inc rax
  cmp rdi, 0
  jnz .Ldiv

.Lprint:
  pop rdi
  add dil, 48
  mov [rsp-8], dil
  mov rax, 1
  mov rdi, 1
  lea rsi, [rsp-8]
  mov rdx, 1
  syscall
  dec r15
  jnz .Lprint
  ret

print_newline:
  push 10
  mov rax, 1
  mov rdi, 1
  lea rsi, [rsp]
  mov rdx, 1
  syscall
  pop rax
  ret

typeof_runtime:
  mov rax, 3
  ret
`;
  }
}
