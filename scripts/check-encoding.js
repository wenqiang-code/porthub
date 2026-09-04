const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const args = process.argv.slice(2);
const checkLf = args.includes('--lf');
const selected = args.filter(arg => arg !== '--lf');
// Scan tracked source by default; explicit paths also cover task-owned new files before staging.
const files = selected.length ? selected : execFileSync('git', ['ls-files', '-z'])
  .toString().split('\0').filter(file => /\.(?:vue|[cm]?js|json|md|ps1|css|html)$/.test(file));
let failures = 0;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  try {
    const bytes = fs.readFileSync(file);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) throw new Error('UTF-8 BOM');
    if (/\uFFFD|\?{4,}|\u951f\u65a4\u62f7|\u70eb{3,}|\u00c3[\u0080-\u00bf]/u.test(text)) {
      throw new Error('possible damaged text');
    }
    if (checkLf && text.includes('\r')) throw new Error('expected LF line endings');
  } catch (error) {
    console.error(`${file}: ${error.message}`);
    failures++;
  }
}
console.log(`Encoding check: ${files.length} files, ${failures} failures`);
process.exitCode = failures ? 1 : 0;
