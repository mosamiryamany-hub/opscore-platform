const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const config = require('../src/config');
const target = path.resolve(config.sqlitePath);
const allowedRoot = path.resolve(process.cwd(), 'data');
if (process.env.NODE_ENV === 'production')
  throw new Error('RESET_DEMO_FORBIDDEN_IN_PRODUCTION');
if (target !== allowedRoot && !target.startsWith(allowedRoot + path.sep))
  throw new Error('RESET_DEMO_PATH_NOT_ALLOWED');
function ask(q) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(q, a => {
      rl.close();
      resolve(a.trim());
    });
  });
}
(async () => {
  const yes = process.argv.includes('--yes');
  if (!yes) {
    const answer = await ask(`This permanently deletes the LOCAL Demo database at ${ target }. Type RESET to continue: `);
    if (answer !== 'RESET') {
      console.error('Reset cancelled. No files changed.');
      process.exitCode = 1;
      return;
    }
  }
  for (const f of [
      target,
      `${ target }-wal`,
      `${ target }-shm`
    ]) {
    try {
      fs.unlinkSync(f);
    } catch (e) {
      if (e.code !== 'ENOENT')
        throw e;
    }
  }
  console.log(`Local demo database removed: ${ target }`);
  console.log('Run: npm run seed:demo');
})().catch(e => {
  console.error(e.message);
  process.exitCode = 1;
});
