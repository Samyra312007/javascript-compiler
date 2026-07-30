import * as fs from 'fs';
import * as path from 'path';
import { Lexer } from './lexer/lexer.js';
import { Parser } from './parser/parser.js';
import { TypeChecker } from './semantic/type-checker.js';
import { TACGenerator } from './ir/tac.js';
import { XSMGenerator } from './codegen/xsm-generator.js';
import { XEXEWriter } from './codegen/xexe-writer.js';
import { X86Generator } from './codegen/x86-generator.js';
import { X86Writer } from './codegen/x86-writer.js';
import { XSMRuntime } from './codegen/xsm-runtime.js';

export interface CompilerOptions {
  inputFile: string;
  outputFile?: string;
  target: 'xsm' | 'x86';
  optimizations: boolean;
  debug: boolean;
  dumpAst?: boolean;
  dumpTac?: boolean;
}

export class Compiler {
  private options: CompilerOptions;

  constructor(options: CompilerOptions) {
    this.options = options;
  }

  public compile(): boolean {
    try {
      const sourceCode = fs.readFileSync(this.options.inputFile, 'utf-8');
      
      if (this.options.debug) console.log('Phase 1: Lexical Analysis...');
      const lexer = new Lexer(sourceCode);
      const tokens = lexer.scanTokens();
      
      if (this.options.debug) {
        console.log(`Tokens: ${tokens.length} generated`);
        if (this.options.dumpAst) {
          console.log('Token dump:');
          tokens.forEach(t => console.log(`  ${t.type}: ${t.lexeme}`));
        }
      }
      
      if (this.options.debug) console.log('Phase 2: Syntax Analysis...');
      const parser = new Parser(tokens);
      const ast = parser.parse();
      
      if (this.options.debug && this.options.dumpAst) {
        console.log('AST:');
        console.log(JSON.stringify(ast, null, 2));
      }
      
      if (this.options.debug) console.log('Phase 3: Semantic Analysis...');
      const typeChecker = new TypeChecker();
      const semanticPass = typeChecker.check(ast);
      
      if (!semanticPass) {
        console.error('Semantic errors found:');
        typeChecker.getErrors().forEach(err => {
          console.error(`  Error at line ${err.line}: ${err.message}`);
        });
        return false;
      }
      
      if (this.options.debug) console.log('Phase 4: IR Generation...');
      const tacGen = new TACGenerator();
      const tac = tacGen.generate(ast);
      
      if (this.options.debug && this.options.dumpTac) {
        console.log('TAC:');
        tac.forEach(inst => console.log(`  ${JSON.stringify(inst)}`));
      }
      
      if (this.options.debug) console.log('Phase 5: Code Generation...');
      
      if (this.options.target === 'x86') {
        return this.generateX86(tac, typeChecker);
      } else {
        return this.generateXSM(tac, typeChecker);
      }
      
    } catch (error) {
      console.error('Compilation failed:', error);
      return false;
    }
  }

  private generateXSM(tac: any[], typeChecker: TypeChecker): boolean {
    const xsmGen = new XSMGenerator(typeChecker.getSymbolTable());
    const xsmCode = xsmGen.generate(tac);
    
    if (this.options.debug) console.log('Phase 6: Writing Output...');
    const outputFile = this.options.outputFile || 
      path.basename(this.options.inputFile, '.js') + '.xexe';
    
    const runtimeInit = XSMRuntime.getRuntimeInit();
    const allLines = [...runtimeInit, ...xsmCode.split('\n')];
    
    const writer = new XEXEWriter();
    writer.addCodeLines(allLines);
    writer.writeToFile(outputFile);
    
    console.log(`Compilation successful! Output written to ${outputFile}`);
    return true;
  }

  private generateX86(tac: any[], typeChecker: TypeChecker): boolean {
    const x86Gen = new X86Generator(typeChecker.getSymbolTable());
    const asmCode = x86Gen.generate(tac);
    
    if (this.options.debug) console.log('Phase 6: Writing Output...');
    const baseName = path.basename(this.options.inputFile, '.js');
    const asmFile = this.options.outputFile || baseName + '.s';
    const objFile = baseName + '.o';
    const exeFile = baseName;
    
    const writer = new X86Writer();
    writer.addCodeLines(asmCode.split('\n'));
    writer.setRuntimeStubs(x86Gen.getRuntimeStubs());
    writer.writeToFile(asmFile);
    
    console.log(`Assembly written to ${asmFile}`);
    
    if (this.options.target === 'x86') {
      if (writer.assemble(asmFile, objFile)) {
        if (writer.link(objFile, exeFile)) {
          console.log(`Executable written to ${exeFile}`);
          try { fs.unlinkSync(objFile); } catch {}
        }
      }
    }
    
    return true;
  }
}