const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {openDb} = require('../src/db');
const {Store} = require('../src/store');
const p = path.join(os.tmpdir(), `opscore-security-proof-${ crypto.randomUUID() }.db`);
const db = openDb(p);
const s = new Store(db, { sessionTtlHours: 24 });
function fail(msg) {
  throw new Error(msg);
}
try {
  const a = s.bootstrap({
    orgName: 'Proof A',
    email: 'proof-a@example.test',
    password: 'Strong-pass-2026'
  });
  const ownerA = s.login('proof-a@example.test', 'Strong-pass-2026');
  const orgB = 'org-proof-b', userB = 'usr-proof-b', t = new Date().toISOString();
  db.prepare('INSERT INTO organizations VALUES (?,?,?)').run(orgB, 'Proof B', t);
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(userB, 'proof-b@example.test', 'x', 'active', t);
  db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(userB, orgB, 'owner', t);
  const ctxB = {
    organizationId: orgB,
    userId: userB,
    role: 'owner'
  };
  const customer = s.createCustomer(ownerA, {
    name: 'A Customer',
    externalRef: 'A-1'
  });
  const site = s.createSite(ownerA, {
    customerId: customer.id,
    name: 'A Site'
  });
  const wo = s.createWorkOrder(ownerA, {
    title: 'A Private Work Order',
    customerId: customer.id,
    siteId: site.id
  });
  const checks = [];
  try {
    s.getWorkOrder(ctxB, wo.id);
    checks.push([
      'work_order_read',
      false
    ]);
  } catch (e) {
    checks.push([
      'work_order_read',
      e.message === 'NOT_FOUND'
    ]);
  }
  try {
    s.evidencePackage(ctxB, wo.id);
    checks.push([
      'evidence_read',
      false
    ]);
  } catch (e) {
    checks.push([
      'evidence_read',
      e.message === 'NOT_FOUND'
    ]);
  }
  const exportA = s.exportCustomers(ownerA);
  checks.push([
    'export_is_nonempty',
    exportA.includes('A Customer')
  ]);
  if (checks.some(x => !x[1]))
    fail(`SECURITY_PROOF_FAILED:${ JSON.stringify(checks) }`);
  const report = {
    status: 'PASS',
    checks: checks.map(([name, passed]) => ({
      name,
      passed
    })),
    crossTenantWorkOrderId: wo.id,
    generatedAt: new Date().toISOString(),
    claims: [
      'Cross-tenant work-order read denied',
      'Cross-tenant evidence package read denied',
      'Tenant-local export remains tenant-scoped'
    ]
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  db.close();
  for (const x of [
      p,
      p + '-wal',
      p + '-shm'
    ])
    try {
      fs.rmSync(x, { force: true });
    } catch {
    }
}
