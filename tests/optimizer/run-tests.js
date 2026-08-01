import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { Lexer } from '../../dist/lexer/lexer.js';
import { Parser } from '../../dist/parser/parser.js';
import { TACGenerator } from '../../dist/ir/tac.js';
import { optimizeTAC } from '../../dist/optimizer/index.js';
import { interpret } from './interpreter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const fixturesDir = path.join(__dirname, 'fixtures');

function generateTAC(source) {
  const lexer = new Lexer(source);
  const tokens = lexer.scanTokens();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const tacGen = new TACGenerator();
  return tacGen.generate(ast);
}

function runFixture(file) {
  const source = fs.readFileSync(file, 'utf-8');
  const baseline = generateTAC(source);
  const optimized = optimizeTAC(baseline);

  const baseOut = interpret(baseline);
  const optOut = interpret(optimized);

  const baseJson = JSON.stringify({ output: baseOut.output, result: baseOut.result });
  const optJson = JSON.stringify({ output: optOut.output, result: optOut.result });

  const name = path.basename(file);
  if (baseJson !== optJson) {
    console.log(`FAIL  ${name} (semantic mismatch)`);
    console.log(`  baseline TAC:  ${baseline.length} instrs`);
    console.log(`  optimized TAC: ${optimized.length} instrs`);
    console.log(`  baseline output: ${baseJson}`);
    console.log(`  optimized output: ${optJson}`);
    return false;
  }

  try {
    execSync(`node ${path.join(repoRoot, 'dist/cli.js')} ${file} -o /tmp/opt-test.xexe --target xsm -O`, { stdio: 'pipe' });
  } catch (err) {
    console.log(`FAIL  ${name} (compile with -O)`);
    if (err.stderr) console.log(err.stderr.toString());
    return false;
  }

  console.log(`PASS  ${name} (${baseline.length} -> ${optimized.length} instructions)`);
  return true;
}

const fixtures = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.js')).sort();
if (fixtures.length === 0) {
  console.error('No fixtures found');
  process.exit(1);
}

let failures = 0;
for (const f of fixtures) {
  const ok = runFixture(path.join(fixturesDir, f));
  if (!ok) failures++;
}

console.log(`\n${fixtures.length - failures}/${fixtures.length} optimizer tests passed`);
if (failures > 0) {
  process.exit(1);
}
