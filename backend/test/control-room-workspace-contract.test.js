'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('eight non-contact control rooms resolve to real operational API workspaces', () => {
  const rooms = read('web/control-room.js');
  const navigation = read('web/rooms.js');
  const html = read('web/control-room.html');
  const server = read('src/server.js');
  const expected = {
    dispatch: '/api/v1/dispatch-board',
    assurance: '/api/v1/work-orders?limit=100',
    inventory: '/api/v1/inventory',
    field: '/api/v1/field/live-snapshot',
    incident: '/api/v1/security-center',
    tenant: '/api/v1/security/authorization-decisions?limit=100',
    billing: '/api/v1/billing/providers',
    release: '/api/verify/release'
  };
  for (const [room, endpoint] of Object.entries(expected)) {
    assert.ok(rooms.includes(room + ':'));
    assert.ok(rooms.includes(endpoint));
    assert.ok(server.includes(endpoint.split('?')[0]), 'server route exists: ' + endpoint);
  }
  assert.match(navigation, /\/control-room\.html\?room=/);
  assert.match(html, /id="recordRows"/);
  assert.match(html, /id="searchRecords"/);
  assert.match(html, /id="sortRecords"/);
  assert.match(html, /id="auditTimeline"/);
  assert.match(html, /id="recordActions"/);
});

test('generic room displays only API-returned data and exposes only known server actions', () => {
  const js = read('web/control-room.js');
  assert.match(js, /credentials:'same-origin'/);
  assert.match(js, /cache:'no-store'/);
  assert.match(js, /No data loaded/);
  assert.match(js, /No mutation exposed in this workspace/);
  assert.ok(js.includes('/on-my-way'));
  assert.ok(js.includes('/work-order-parts/reserve'));
  assert.ok(js.includes('/first-time-right'));
  assert.ok(js.includes('/reconciliation/run?provider=local'));
  assert.doesNotMatch(js, /mock|demo data|placeholder records/i);
});

test('contact center agent room supports priority filtering, sorting, case context and audit history', () => {
  const html = read('web/contact-center-room.html');
  const js = read('web/contact-center-room.js');
  const server = read('src/server.js');
  assert.match(html, /id="ccrPriorityFilter"/);
  assert.match(html, /id="ccrSort"/);
  assert.match(html, /id="ccrAssignedOperator"/);
  assert.match(html, /id="ccrWaitClock"/);
  assert.match(html, /id="ccrEventTimeline"/);
  assert.match(js, /\/api\/v1\/contact-center\/handoffs/);
  assert.match(js, /\/api\/v1\/audit\?resourceId=/);
  assert.match(js, /CONTACT_CENTER_HUMAN_ASSIGNMENT_REQUIRED|canOperateSelected/);
  assert.match(server, /resourceId: url\.searchParams\.get\('resourceId'\)/);
});

test('language catalogue selection is not represented as production qualification', () => {
  const html = read('web/contact-center.html');
  const js = read('web/contact-center.js');
  assert.match(html, /id="languageQualification"/);
  assert.match(html, /data-i18n="messages\.qualificationNotice"/);
  assert.match(js, /qualifiedForProduction===true/);
  assert.match(js, /dataset\.qualification=qualified\?'qualified':'unverified'/);
  assert.match(js, /messages\.qualificationNotice/);
  assert.match(js, /qualifiedForProduction===true/);
});

test('Contact Center exposes explicit CRM, supervisor reassignment and employee audit contracts', () => {
  const server = read('src/server.js');
  const moduleSource = read('src/ai-contact-center.js');
  const html = read('web/contact-center-room.html');
  const client = read('web/contact-center-room.js');
  const css = read('web/contact-center-room.css');
  for (const route of [
    '/api/v1/contact-center/crm/customers',
    '/customer-profile',
    '/customer-link',
    '/reassign',
    '/api/v1/contact-center/supervisor/agents',
    '/api/v1/contact-center/supervisor/activity'
  ]) assert.ok(server.includes(route), 'server route exists: ' + route);
  for (const contract of ['listCrmCustomers','getConversationCustomer','linkConversationCustomer','listEligibleAgents','reassignHandoff']) {
    assert.ok(moduleSource.includes(contract), 'domain contract exists: ' + contract);
  }
  assert.match(moduleSource, /m\.organization_id=\?/);
  assert.match(moduleSource, /m\.role IN \('member','manager'\)/);
  assert.match(moduleSource, /contact_center_handoff_reassigned/);
  assert.match(server, /chain:activity\.chain/);
  assert.match(moduleSource, /contact_center_crm_customer_linked/);
  for (const id of ['ccrCrmProfile','ccrCrmSearch','ccrCrmResults','ccrAssignAgent','ccrAssignReason','ccrReassign','ccrSupervisorActivity','ccrActivityAgent','ccrSupervisorAuditIntegrity']) {
    assert.ok(html.includes('id="' + id + '"'), 'control exists: ' + id);
  }
  assert.match(client, /credentials: 'same-origin'/);
  assert.match(client, /customer-link/);
  assert.match(client, /\/reassign/);
  assert.match(client, /supervisor\/activity/);
  assert.match(css, /\[dir="rtl"\]/);
  assert.match(css, /@media\(max-width:700px\)/);
});
