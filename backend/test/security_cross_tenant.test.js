const test=require('node:test'); const assert=require('node:assert/strict'); const crypto=require('node:crypto'); const fs=require('node:fs'); const os=require('node:os'); const path=require('node:path');
const {Store}=require('../src/store');
function fixture(){const p=path.join(os.tmpdir(),`opscore-${crypto.randomUUID()}.db`);const old=process.env.SQLITE_PATH;process.env.SQLITE_PATH=p;delete require.cache[require.resolve('../src/config')];delete require.cache[require.resolve('../src/db')];const d=require('../src/db').openDb();if(old===undefined)delete process.env.SQLITE_PATH;else process.env.SQLITE_PATH=old;return {d,p};}
function close(f){f.d.close();for(const p of [f.p,`${f.p}-shm`,`${f.p}-wal`]){try{fs.unlinkSync(p)}catch{}}}

// Regression test for a fixed vulnerability: an org owner/admin could previously
// generate a password-reset token for ANY user id in the system, including users
// belonging to a completely different organization, because createPasswordReset
// looked users up by id alone with no membership/organization check. That token
// could then be redeemed via /api/v1/auth/password-reset to take over the victim's
// account across tenants. Fixed by requiring the target user to be a member of the
// caller's organization.
test('admin cannot mint a password-reset token for a user in another organization',()=>{
  const f=fixture(),s=new Store(f.d,{sessionTtlHours:24});
  s.bootstrap({orgName:'Tenant A',email:'admin-a@example.com',password:'Admin-A-strong-2026'});
  const adminA=s.login('admin-a@example.com','Admin-A-strong-2026');
  // Create a second, unrelated organization owner (victim in Tenant B).
  const {id,now,hashPassword}=require('../src/security');
  const orgB=id('org'),userB=id('usr'),t=now();
  f.d.prepare('INSERT INTO organizations VALUES (?,?,?)').run(orgB,'Tenant B',t);
  f.d.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(userB,'victim-b@example.com',hashPassword('Victim-B-strong-2026'),'active',t);
  f.d.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(userB,orgB,'owner',t);

  // Tenant A's admin must not be able to target Tenant B's user id.
  assert.throws(()=>s.createPasswordReset(adminA,userB),/NOT_FOUND/);

  // Sanity check: the same admin CAN reset a password for a real member of their own org.
  const inv=s.inviteMember(adminA,{email:'member-a@example.com',role:'member'});
  const accepted=s.acceptInvitation(inv.inviteToken,{password:'Member-A-strong-2026'});
  const reset=s.createPasswordReset(adminA,accepted.userId);
  assert.equal(reset.userId,accepted.userId);
  close(f);
});

test('admin cannot assign a user from another organization into their own org unit hierarchy',()=>{
  const f=fixture(),s=new Store(f.d,{sessionTtlHours:24});
  s.bootstrap({orgName:'Tenant A',email:'admin-a2@example.com',password:'Admin-A2-strong-2026'});
  const adminA=s.login('admin-a2@example.com','Admin-A2-strong-2026');
  const unit=s.createOrgUnit(adminA,{name:'Field Ops',unitType:'team'});

  const {id,now,hashPassword}=require('../src/security');
  const orgB=id('org'),userB=id('usr'),t=now();
  f.d.prepare('INSERT INTO organizations VALUES (?,?,?)').run(orgB,'Tenant B',t);
  f.d.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(userB,'victim-b2@example.com',hashPassword('Victim-B2-strong-2026'),'active',t);
  f.d.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(userB,orgB,'owner',t);

  assert.throws(()=>s.assignUserToUnit(adminA,{unitId:unit.id,userId:userB,unitRole:'member'}),/INVALID_ORG_UNIT/);
  close(f);
});



test('appointment update cannot cross tenant',()=>{const {id,now,hashPassword}=require('../src/security');const f=fixture(),s=new Store(f.d,{sessionTtlHours:24});try{s.bootstrap({orgName:'Tenant A',email:'admin-appt-a@example.com',password:'Admin-A-strong-2026'});const a=s.login('admin-appt-a@example.com','Admin-A-strong-2026');const inv=s.inviteMember(a,{email:'tech-appt-a@example.com',role:'member'});s.acceptInvitation(inv.inviteToken,{password:'Tech-A-strong-2026'});const tech=s.login('tech-appt-a@example.com','Tech-A-strong-2026');const wA=s.createWorkOrder(a,{title:'A'});const appt=s.createAppointment(a,{workOrderId:wA.id,technicianId:tech.userId,startAt:'2030-01-02T10:00:00Z',endAt:'2030-01-02T11:00:00Z'});const orgB=id('org'),userB=id('usr'),t=now();f.d.prepare('INSERT INTO organizations VALUES (?,?,?)').run(orgB,'Tenant B',t);f.d.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(userB,'admin-appt-b@example.com',hashPassword('Admin-B-strong-2026'),'active',t);f.d.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(userB,orgB,'owner',t);const b={organizationId:orgB,userId:userB,role:'owner'};assert.throws(()=>s.updateAppointment(b,appt.id,{status:'cancelled'}),/NOT_FOUND/);assert.equal(s.getAppointment(a,appt.id).status,'scheduled');}finally{close(f)}});
