#!/usr/bin/env node

import { Command } from 'commander';
import { Compiler, CompilerOptions } from './compiler.js';
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
  .action((inputFile, options) => {
    
    if (!fs.existsSync(inputFile)) {
      console.error(`Error: Input file '${inputFile}' not found`);
      process.exit(1);
    }
    
    const compilerOptions: CompilerOptions = {
      inputFile,
      outputFile: options.output,
      target: options.target,
      optimizations: options.optimizations,
      debug: options.debug,
      dumpAst: options.dumpAst,
      dumpTac: options.dumpTac,
      module: options.module
    };
    
    const compiler = new Compiler(compilerOptions);
    const success = compiler.compile();
    
    process.exit(success ? 0 : 1);
  });

program.parse(process.argv);