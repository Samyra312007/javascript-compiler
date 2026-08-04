#!/usr/bin/env node

import { Command } from 'commander';
import { Compiler, CompilerOptions } from './compiler.js';
import { formatJS } from './tooling/formatter.js';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

program
  .name('tsjs-compiler')
  .description('TypeScript/JavaScript to XSM Machine Code Compiler')
  .version('1.0.0');

program
  .argument('<input-file>', 'Input JavaScript file')
  .option('-o, --output <file>', 'Output file path')
  .option('--target <arch>', 'Target architecture (xsm|x86)', 'xsm')
  .option('-O, --optimizations', 'Enable optimizations', false)
  .option('--debug', 'Enable debug output', false)
  .option('--dump-ast', 'Dump AST to console', false)
  .option('--dump-tac', 'Dump TAC to console', false)
  .option('--module', 'Force module bundling (auto-detected otherwise)', false)
  .option('--watch', 'Watch the input file and recompile on changes', false)
  .option('--lint', 'Run lexer/parser/semantic analysis only; report diagnostics', false)
  .option('--format [out]', 'Format the input source (optionally write to <out>)')
  .option('--quiet', 'Suppress diagnostics output', false)
  .action((inputFile, options) => {

    if (!fs.existsSync(inputFile)) {
      console.error(`Error: Input file '${inputFile}' not found`);
      process.exit(1);
    }

    const runOnce = (): number => {
      if (options.format !== undefined) {
        const source = fs.readFileSync(inputFile, 'utf-8');
        const formatted = formatJS(source);
        if (typeof options.format === 'string') {
          fs.writeFileSync(options.format, formatted, 'utf-8');
          console.log(`Formatted output written to ${options.format}`);
        } else {
          process.stdout.write(formatted + '\n');
        }
        return 0;
      }

      const compilerOptions: CompilerOptions = {
        inputFile,
        outputFile: options.output,
        target: options.target,
        optimizations: options.optimizations,
        debug: options.debug,
        dumpAst: options.dumpAst,
        dumpTac: options.dumpTac,
        module: options.module,
        lint: options.lint,
        quiet: options.quiet
      };

      const compiler = new Compiler(compilerOptions);
      return compiler.compile() ? 0 : 1;
    };

    if (options.watch) {
      console.log(`Watching ${inputFile} for changes... (Ctrl+C to stop)`);
      let timer: NodeJS.Timeout | null = null;
      const run = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          console.log(`\n[${new Date().toLocaleTimeString()}] Recompiling...`);
          runOnce();
        }, 150);
      };
      fs.watch(inputFile, run);
      fs.watch(path.dirname(path.resolve(inputFile)), (event, filename) => {
        if (filename && path.resolve(path.dirname(path.resolve(inputFile)), filename) === path.resolve(inputFile)) {
          run();
        }
      });
      runOnce();
      // keep process alive
      process.stdin.resume();
    } else {
      const code = runOnce();
      process.exit(code);
    }
  });

program.parse(process.argv);
