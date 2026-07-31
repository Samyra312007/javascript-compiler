import { execSync } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cli = path.join(__dirname, '../../dist/cli.js');
const moduleDir = path.join(__dirname, '..', 'modules');

const fixtures = [
  'entry.js',
  'barrel.js',
  'cycle-a.js',
  'cjs.js',
  'node_modules/pkg/index.js',
  'side-effect.js',
  'lib.js'
];

let failures = 0;

for (const fixture of fixtures) {
  const file = path.join(moduleDir, fixture);
  try {
    execSync(`node ${cli} ${file} -o /tmp/module-test.xexe --target xsm`, { stdio: 'pipe' });
    console.log(`PASS  ${fixture}`);
  } catch (err: any) {
    failures++;
    console.log(`FAIL  ${fixture}`);
    if (err.stdout) console.log(err.stdout.toString());
    if (err.stderr) console.log(err.stderr.toString());
  }
}

const extra = path.join(__dirname, '..', 'test-features9.js');
try {
  execSync(`node ${cli} ${extra} -o /tmp/module-test.xexe --target xsm`, { stdio: 'pipe' });
  console.log('PASS  test-features9.js');
} catch (err: any) {
  failures++;
  console.log('FAIL  test-features9.js');
  if (err.stderr) console.log(err.stderr.toString());
}

if (failures > 0) {
  console.log(`\n${failures} module test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll module tests passed!');
