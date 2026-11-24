'use strict';

const { createSelfHostedReleaseProof } = require('../src/self-hosted-release-proof');

const result = createSelfHostedReleaseProof(process.env);
process.stdout.write(JSON.stringify(result, null, 2) + '\n');

if (result.status !== 'PASS') {
  process.exitCode = 1;
}
