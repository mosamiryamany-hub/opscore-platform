const {openDb} = require('../src/db');
const config = require('../src/config');
const {Store} = require('../src/store');
const {id, now, hashPassword} = require('../src/security');
if (process.env.NODE_ENV === 'production')
  throw new Error('DEMO_SEED_FORBIDDEN_IN_PRODUCTION');
if (String(config.databaseEngine || '').toLowerCase() !== 'sqlite' || config.databaseUrl) {
  throw new Error('DEMO_SEED_REQUIRES_LOCAL_SQLITE_ONLY');
}
function requiredDemoSecret(name) {
  const value = String(process.env[name] || '');
  if (value.length < 12) throw new Error(`${name}_REQUIRED`);
  return value;
}
const DEMO_ADMIN_PASSWORD = requiredDemoSecret('OPSC_DEMO_PASSWORD_ADMIN');
const DEMO_DISPATCHER_PASSWORD = requiredDemoSecret('OPSC_DEMO_PASSWORD_DISPATCHER');
const DEMO_TECHNICIAN_PASSWORD = requiredDemoSecret('OPSC_DEMO_PASSWORD_TECHNICIAN');
const DEMO_VIEWER_PASSWORD = requiredDemoSecret('OPSC_DEMO_PASSWORD_VIEWER');
const db = openDb();
try {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c)
    throw new Error('DATABASE_NOT_EMPTY');
  const s = new Store(db, { sessionTtlHours: 24 });
  const {orgId, userId} = s.bootstrap({
    orgName: 'Demo Organization (non-production)',
    email: 'admin@demo.opscore.invalid',
    password: DEMO_ADMIN_PASSWORD
  });
  const users = [
    [
      'dispatcher@demo.opscore.invalid',
      DEMO_DISPATCHER_PASSWORD,
      'manager'
    ],
    [
      'tech@demo.opscore.invalid',
      DEMO_TECHNICIAN_PASSWORD,
      'member'
    ],
    [
      'viewer@demo.opscore.invalid',
      DEMO_VIEWER_PASSWORD,
      'viewer'
    ]
  ];
  for (const [em, pw, role] of users) {
    const uid = id('usr'), t = now();
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(uid, em, hashPassword(pw), 'active', t);
    db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(uid, orgId, role, t);
  }
  const owner = {
    organizationId: orgId,
    userId,
    role: 'owner',
    email: 'admin@demo.opscore.invalid'
  };
  const c = s.createCustomer(owner, {
    name: 'Demo Customer',
    email: 'customer@demo.opscore.invalid',
    phone: '+1-555-0100',
    externalRef: 'DEMO-CUST-001'
  });
  const site = s.createSite(owner, {
    name: 'Demo Site',
    customerId: c.id,
    latitude: 29.9792,
    longitude: 31.1342
  });
  const asset = s.createAsset(owner, {
    name: 'Demo Asset',
    assetType: 'site',
    externalRef: 'DEMO-ASSET-001',
    siteId: site.id
  });
  const wo = s.createWorkOrder(owner, {
    title: 'Demo Work Order',
    description: 'Explicitly seeded non-production scenario',
    siteId: site.id,
    customerId: c.id,
    priority: 'high'
  });
  console.log('Demo seed created successfully.');
  console.log(`URL: http://127.0.0.1:${config.port}`);
  console.log('Demo credentials were supplied via OPSC_DEMO_PASSWORD_* environment variables; passwords are not printed.');
  console.log(`Demo records: customer=${ c.id } site=${ site.id } asset=${ asset.id } workOrder=${ wo.id }`);
} finally {
  db.close();
}
