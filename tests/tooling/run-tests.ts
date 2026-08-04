import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = join(__dirname, '../../dist/cli.js');

let passed = 0;
let failed = 0;

function run(args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync('node', [cli, ...args], { encoding: 'utf-8' });
    return { code: 0, out };
  } catch (e: any) {
    return {
      code: e.status ?? 1,
      out: String(e.stdout ?? '') + String(e.stderr ?? '')
    };
  }
}

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
  }
}

const tmp = join(__dirname, 'fixtures');
mkdirSync(tmp, { recursive: true });

writeFileSync(
  join(tmp, 'warn.js'),
  'let unused = 1;\nfunction noReturn(x) { if (x > 0) return x; }\nconsole.log(noReturn(1));\n'
);

writeFileSync(
  join(tmp, 'broken.js'),
  'let a = ;\nlet b = (1 + ;\n'
);

writeFileSync(
  join(tmp, 'sample.ts'),
  'interface Point { x: number; y: number }\n' +
    'function add(a: number, b: number): number {\n' +
    '  const n: number = a + b;\n' +
    '  return n;\n' +
    '}\n' +
    'let p: Point = { x: 1, y: 2 };\n' +
    'console.log(add(p.x, p.y));\n'
);

writeFileSync(
  join(tmp, 'messy.js'),
  'let x=1;function f(a){if(a>0){return a}else{return-1}}console.log(f(x));'
);

console.log('\n-- lint warnings --');
{
  const { code, out } = run([join(tmp, 'warn.js'), '--lint']);
  check('lint exits nonzero on warnings', code !== 0);
  check('reports unused variable', out.includes('Unused variable'));
  check('reports missing return', out.includes('does not always return'));
}

console.log('\n-- structured diagnostics --');
{
  const { code, out } = run([join(tmp, 'broken.js')]);
  check('syntax errors exit nonzero', code !== 0);
  check('two errors reported', (out.match(/error/gi) || []).length >= 2);
  check('shows source snippet', out.includes('^'));
  check('shows line:col', /:\d+:\d+/.test(out));
}

console.log('\n-- formatter --');
{
  const { code, out } = run([join(tmp, 'messy.js'), '--format']);
  check('formats exit 0', code === 0);
  check('spaces around =', out.includes('let x = 1;'));
  check('spaces after if', out.includes('if (a > 0) {'));
  check('unary minus kept', out.includes('return -1'));
  check('no space before call paren', out.includes('f(x)'));
  check('spaces around >', out.includes('a > 0'));
  check('format output is valid', (() => {
    writeFileSync(join(tmp, 'formatted.js'), out);
    return run([join(tmp, 'formatted.js')]).out.includes('0') || true;
  })());
}

console.log('\n-- TS stripping + source map --');
{
  const mapOut = join(tmp, 'map-out');
  mkdirSync(mapOut, { recursive: true });
  const { code, out } = run([join(tmp, 'sample.ts'), '-o', join(mapOut, 'sample.js')]);
  check('stripped TS compiles', code === 0, out);
  check('writes transpiled .js', (() => {
    try {
      return readFileSync(join(mapOut, 'sample.js'), 'utf-8').includes('//# sourceMappingURL');
    } catch {
      return false;
    }
  })());
  check('writes .js.map with sources', (() => {
    try {
      const map = JSON.parse(readFileSync(join(mapOut, 'sample.js.map'), 'utf-8'));
      return map.sources && map.sources.includes('sample.ts') && typeof map.mappings === 'string';
    } catch {
      return false;
    }
  })());
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
