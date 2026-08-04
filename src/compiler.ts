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
import { bundle, hasModuleSyntax } from './modules/bundler.js';
import { optimizeTAC } from './optimizer/index.js';
import { applyPeephole } from './codegen/peephole.js';
import { Diagnostics, DiagnosticSeverity } from './diagnostics.js';
import { isTypeScriptFile, stripTypeScript } from './tooling/typescript.js';
import { generateSourceMap } from './tooling/sourcemap.js';

export interface CompilerOptions {
  inputFile: string;
  outputFile?: string;
  target: 'xsm' | 'x86';
  optimizations: boolean;
  debug: boolean;
  dumpAst?: boolean;
  dumpTac?: boolean;
  module?: boolean;
  lint?: boolean;
  quiet?: boolean;
}

export class Compiler {
  private options: CompilerOptions;
  private diagnostics: Diagnostics;

  constructor(options: CompilerOptions) {
    this.options = options;
    this.diagnostics = new Diagnostics();
  }

  public getDiagnostics(): Diagnostics {
    return this.diagnostics;
  }

  public compile(): boolean {
    this.diagnostics = new Diagnostics();
    const inputFile = this.options.inputFile;

    if (!fs.existsSync(inputFile)) {
      this.diagnostics.error(inputFile, `Input file '${inputFile}' not found`);
      this.printDiagnostics();
      return false;
    }

    try {
      let sourceCode = fs.readFileSync(inputFile, 'utf-8');
      this.diagnostics.setSource(inputFile, sourceCode);

      // TypeScript -> JavaScript type-stripping transpile
      const isTS = isTypeScriptFile(inputFile);
      if (isTS) {
        if (this.options.debug) console.log('Phase 0: Stripping TypeScript types...');
        const { code } = stripTypeScript(sourceCode);
        if (this.options.debug) console.log(`TypeScript stripped: ${code.split('\n').length} lines (from ${sourceCode.split('\n').length})`);
        sourceCode = code;
      }

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
      const parser = new Parser(tokens, inputFile);
      let ast = parser.parse();

      for (const d of parser.diagnostics) {
        this.diagnostics.add(d);
      }
      const syntaxErrors = parser.diagnostics.length;

      let bundled = false;
      if (this.options.module || hasModuleSyntax(ast)) {
        if (this.options.debug) console.log('Detected module syntax; bundling...');
        const bundleResult = bundle(this.options.inputFile);
        if (!bundleResult.program) {
          bundleResult.errors.forEach(err => this.diagnostics.error(inputFile, err));
          this.printDiagnostics();
          return false;
        }
        ast = bundleResult.program;
        bundled = true;
      }

      if (this.options.debug && this.options.dumpAst) {
        console.log('AST:');
        console.log(JSON.stringify(ast, null, 2));
      }

      if (this.options.debug) console.log('Phase 3: Semantic Analysis...');
      const typeChecker = new TypeChecker();
      const semanticPass = typeChecker.check(ast);

      for (const err of typeChecker.getErrors()) {
        this.diagnostics.error(inputFile, err.message, err.line);
      }
      for (const warn of typeChecker.getWarnings()) {
        this.diagnostics.warn(inputFile, warn.message, warn.line);
      }

      if (syntaxErrors > 0 || !semanticPass) {
        this.printDiagnostics();
        return false;
      }

      if (this.options.lint) {
        this.printDiagnostics();
        if (this.options.debug) console.log('Lint complete (no code generation).');
        // treat warnings as lint failures (exit nonzero), like most linters
        return this.diagnostics.count(DiagnosticSeverity.Warning) === 0;
      }

      if (this.options.debug) console.log('Phase 4: IR Generation...');
      const tacGen = new TACGenerator();
      let tac = tacGen.generate(ast);

      if (this.options.optimizations) {
        if (this.options.debug) console.log(`Phase 4b: Optimizing TAC (${tac.length} instructions)...`);
        const optimized = optimizeTAC(tac);
        if (this.options.debug) console.log(`Phase 4b: Optimization complete (${optimized.length} instructions, removed ${tac.length - optimized.length})`);
        tac = optimized;
      }

      if (this.options.debug && this.options.dumpTac) {
        console.log('TAC:');
        tac.forEach(inst => console.log(`  ${JSON.stringify(inst)}`));
      }

      if (this.options.debug) console.log('Phase 5: Code Generation...');

      let success: boolean;
      if (this.options.target === 'x86') {
        success = this.generateX86(tac, typeChecker);
      } else {
        success = this.generateXSM(tac, typeChecker);
      }

      if (!success) return false;

      if (isTS) {
        this.writeTranspileOutputs(sourceCode, inputFile);
      }

      this.printDiagnostics();
      return true;
    } catch (error) {
      this.diagnostics.error(inputFile, error instanceof Error ? error.message : String(error));
      this.printDiagnostics();
      return false;
    }
  }

  private writeTranspileOutputs(strippedCode: string, inputFile: string): void {
    const baseName = path.basename(inputFile, path.extname(inputFile));
    const outDir = this.options.outputFile ? path.dirname(this.options.outputFile) : '.';
    const jsFile = path.join(outDir, baseName + '.js');
    const mapFile = path.join(outDir, baseName + '.js.map');

    fs.writeFileSync(jsFile, strippedCode, 'utf-8');

    const map = generateSourceMap({
      generatedFile: baseName + '.js',
      sourceFile: path.basename(inputFile),
      source: fs.readFileSync(inputFile, 'utf-8'),
      generatedLines: strippedCode.split('\n').length
    });
    fs.writeFileSync(mapFile, JSON.stringify(map), 'utf-8');

    // append sourceMappingURL comment
    fs.writeFileSync(jsFile, strippedCode + `\n//# sourceMappingURL=${baseName}.js.map\n`, 'utf-8');

    if (this.options.debug) {
      console.log(`Transpiled JS written to ${jsFile}`);
      console.log(`Source map written to ${mapFile}`);
    }
  }

  private printDiagnostics(): void {
    if (this.options.quiet) return;
    const render = this.diagnostics.render();
    if (render) {
      console.error(render);
      console.error('');
    }
    const errs = this.diagnostics.count(DiagnosticSeverity.Error);
    const warns = this.diagnostics.count(DiagnosticSeverity.Warning);
    if (errs) console.error(`Compilation failed with ${errs} error${errs === 1 ? '' : 's'} and ${warns} warning${warns === 1 ? '' : 's'}.`);
  }

  private generateXSM(tac: any[], typeChecker: TypeChecker): boolean {
    const xsmGen = new XSMGenerator(typeChecker.getSymbolTable());
    let xsmCode = xsmGen.generate(tac);
    if (this.options.optimizations) {
      xsmCode = applyPeephole(xsmCode.split('\n')).join('\n');
    }

    if (this.options.debug) console.log('Phase 6: Writing Output...');
    const outputFile = this.options.outputFile ||
      path.basename(this.options.inputFile, path.extname(this.options.inputFile)) + '.xexe';

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
    let asmCode = x86Gen.generate(tac);
    if (this.options.optimizations) {
      asmCode = applyPeephole(asmCode.split('\n')).join('\n');
    }

    if (this.options.debug) console.log('Phase 6: Writing Output...');
    const baseName = path.basename(this.options.inputFile, path.extname(this.options.inputFile));
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