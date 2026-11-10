'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {openDb}=require('../src/db');
const {Store}=require('../src/store');

test('red-team: technician from another tenant cannot be assigned to a tenant geofence',()=>{
 const db=openDb(':memory:'),store=new Store(db),t='2026-09-17T00:00:00.000Z';
 db.prepare('INSERT INTO organizations VALUES (?,?,?)').run('org_a','A',t);
 db.prepare('INSERT INTO organizations VALUES (?,?,?)').run('org_b','B',t);
 db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('u_a','a@example.com','hash','active',t);
 db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('u_b','b@example.com','hash','active',t);
 db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run('u_a','org_a','owner',t);
 db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run('u_b','org_b','member',t);
 const g=store.createGeofence({organizationId:'org_a',userId:'u_a',role:'owner'},{name:'A',geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]}});
 assert.throws(()=>store.assignTechnicianToGeofence({organizationId:'org_a',userId:'u_a',role:'owner'},{geofenceId:g.id,technicianId:'u_b'}),/TECHNICIAN_NOT_FOUND/);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM technician_geofences WHERE organization_id=?').get('org_a').n,0);
 db.close();
});
