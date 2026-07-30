import * as fs from 'fs';
import { spawnSync } from 'child_process';

export class X86Writer {
  private asmLines: string[] = [];
  private runtimeStubs: string = '';

  public addCodeLines(lines: string[]): void {
    this.asmLines = lines;
  }

  public setRuntimeStubs(stubs: string): void {
    this.runtimeStubs = stubs;
  }

  public writeToFile(outputFile: string): void {
    const fullAsm = this.asmLines.join('\n') + '\n' + this.runtimeStubs;
    fs.writeFileSync(outputFile, fullAsm, 'utf-8');
  }

  public assemble(input: string, output: string): boolean {
    const result = spawnSync('nasm', ['-f', 'elf64', '-o', output, input], {
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    if (result.status !== 0) {
      console.error('Assembly failed:', result.stderr);
      return false;
    }
    return true;
  }

  public link(objFile: string, output: string): boolean {
    const result = spawnSync('ld', ['-o', output, objFile], {
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    if (result.status !== 0) {
      console.error('Linking failed:', result.stderr);
      return false;
    }
    return true;
  }
}
