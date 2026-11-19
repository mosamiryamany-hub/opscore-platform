'use strict';

const { main } = require('../scripts/build-signed-tenant-context-production-coverage');

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(String(error && (error.code || error.message) || error).slice(0, 1000) + '\\n');
  process.exitCode = 1;
}
