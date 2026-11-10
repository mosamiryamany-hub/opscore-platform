'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { openDb } = require('../src/db');
const { Store } = require('../src/store');
const { makeBlock, verifyBlock } = require('../src/sync-atomic-journal');

function fixture() {
  const p = path.join(os.tmpdir(), `opscore-e2e-${crypto.randomUUID()}.db`);
  const db = openDb(p);
  const filesDir = path.join(os.tmpdir(), `opscore-e2e-files-${crypto.randomUUID()}`);
  const prev = process.env.OPSC_REPOSITORY_PATH;
  process.env.OPSC_REPOSITORY_PATH = filesDir;
  return { db, p, filesDir, prev };
}
function close(f) {
  f.db.close();
  for (const x of [f.p, `${f.p}-shm`, `${f.p}-wal`]) try { fs.unlinkSync(x); } catch {}
  try { fs.rmSync(f.filesDir, { recursive: true, force: true }); } catch {}
  if (f.prev === undefined) delete process.env.OPSC_REPOSITORY_PATH;
  else process.env.OPSC_REPOSITORY_PATH = f.prev;
}

test('E2E coherence: work order remains one consistent operational truth across field, workflow, outbox, audit and commercial surfaces', () => {
  const f = fixture();
  const s = new Store(f.db, { sessionTtlHours: 24 });
  try {
    s.bootstrap({ orgName: 'Coherence Org', email: 'owner@example.com', password: 'Strong-pass-2026' });
    const owner = s.login('owner@example.com', 'Strong-pass-2026');
    s.upsertTechnician(owner, { userId: owner.userId, latitude: 24.7136, longitude: 46.6753, active: true });

    const customer = s.createCustomer(owner, { name: 'Coherence Customer', email: 'coherence@example.com' });
    const site = s.createSite(owner, { customerId: customer.id, name: 'Coherence Site', address: '1 Test Street', latitude: 24.7136, longitude: 46.6753 });
    const wo = s.createWorkOrder(owner, { title: 'Critical coherence WO', customerId: customer.id, siteId: site.id, priority: 'high' });

    assert.equal(wo.status, 'open');
    assert.equal(wo.customer_id, customer.id);
    assert.equal(wo.site_id, site.id);

    const start = new Date(Date.now() + 60_000);
    const end = new Date(start.getTime() + 60 * 60_000);
    const appt = s.createAppointment(owner, {
      workOrderId: wo.id,
      technicianId: owner.userId,
      startAt: start.toISOString(),
      endAt: end.toISOString()
    });
    assert.equal(appt.work_order_id, wo.id);
    assert.equal(appt.technician_id, owner.userId);

    const events = [
      { clientEventId: 'e2e-status-1', entityId: wo.id, operation: 'status_update', payload: { status: 'in_progress' } },
      { clientEventId: 'e2e-checkin-1', entityId: appt.id, operation: 'appointment_checkin', payload: { appointmentId: appt.id, latitude: 24.7136, longitude: 46.6753, accuracyMeters: 15 } },
      { clientEventId: 'e2e-evidence-1', entityId: wo.id, operation: 'attachment', payload: { fileName: 'field-proof.txt', mediaType: 'text/plain', contentBase64: Buffer.from('field proof', 'utf8').toString('base64') } },
      { clientEventId: 'e2e-signoff-1', entityId: wo.id, operation: 'signoff', payload: { signerName: 'Customer Representative', acknowledgement: 'Accepted after field work' } }
    ];
    const block = makeBlock(events, owner.userId, 'e2e-coherence-block-1');
    assert.equal(verifyBlock(block), true);

    const syncResult = s.applySyncEvents(owner, block.events, { blockId: block.blockId, blockHash: block.blockHash, blockVersion: 1, events: block.events });
    assert.equal(syncResult.failed.length, 0, JSON.stringify(syncResult.failed));
    assert.equal(syncResult.applied.length, 4);

    const afterField = s.getWorkOrder(owner, wo.id);
    assert.equal(afterField.status, 'in_progress');
    assert.equal(afterField.assigned_to, owner.userId);
    assert.ok(afterField.attachments.some(x => x.file_name === 'field-proof.txt'));
    assert.equal(s.listSignoffs(owner, wo.id).length, 1);

    const checkin = f.db.prepare('SELECT status,checked_in_at,checkin_latitude,checkin_longitude,checkin_accuracy_m FROM appointments WHERE id=?').get(appt.id);
    assert.equal(checkin.status, 'en_route');
    assert.equal(Number(checkin.checkin_accuracy_m), 15);

    const completed = s.updateWorkOrder(owner, wo.id, { status: 'completed', reason: 'All required closeout evidence present' });
    assert.equal(completed.status, 'completed');

    const assurance = s.completionAssurance(owner, wo.id);
    assert.equal(assurance.ready, true, JSON.stringify(assurance));

    const completion = s.completionPackage(owner, wo.id);
    assert.equal(completion.workOrder.id, wo.id);
    assert.equal(completion.workOrder.status, 'completed');
    assert.equal(completion.appointment.id, appt.id);
    assert.equal(completion.signoffs.length, 1);
    assert.equal(completion.attachments.length, 1);
    assert.equal(completion.checkIn.by, owner.userId);

    const evidence = s.evidencePackage(owner, wo.id);
    assert.equal(evidence.integrity.allAttachmentsVerified, true);
    assert.equal(evidence.attachments.length, 1);

    const timeline = s.workOrderTimeline(owner, wo.id);
    const types = new Set(timeline.events.map(x => x.type));
    for (const required of ['created', 'scheduled', 'updated', 'field_checkin', 'attachment_added', 'customer_signoff']) assert.ok(types.has(required), required);

    const audit = s.auditLog(owner, { resourceType: 'work_order', resourceId: wo.id }).entries;
    assert.ok(audit.some(x => x.action === 'create'));
    assert.ok(audit.some(x => x.action === 'update'));
    const appointmentAudit = s.auditLog(owner, { resourceType: 'appointment', resourceId: appt.id }).entries;
    assert.ok(appointmentAudit.some(x => x.action === 'field_checkin'));
    assert.ok(audit.some(x => x.action === 'customer_signoff'));

    const outbox = s.listOutbox(owner, 200);
    assert.ok(outbox.some(x => x.event_key === 'sync:' + owner.userId + ':e2e-status-1'));
    assert.ok(outbox.some(x => x.event_key === 'sync:' + owner.userId + ':e2e-checkin-1'));
    assert.ok(outbox.some(x => x.event_key === 'sync:' + owner.userId + ':e2e-evidence-1'));
    assert.ok(outbox.some(x => x.event_key === 'sync:' + owner.userId + ':e2e-signoff-1'));

    const jobs = f.db.prepare("SELECT job_type,entity_id,status FROM operational_jobs WHERE organization_id=? ORDER BY created_at").all(owner.organizationId);
    assert.equal(jobs.length, 4);
    assert.ok(jobs.every(x => x.job_type === 'field_event_observation' && x.status === 'queued'));

    const blockRow = f.db.prepare('SELECT block_id,block_hash,event_count FROM sync_blocks WHERE organization_id=? AND actor_user_id=? AND block_id=?').get(owner.organizationId, owner.userId, block.blockId);
    assert.equal(blockRow.event_count, 4);
    assert.equal(blockRow.block_hash, block.blockHash);

    // A replay is a duplicate, not a second mutation.
    const replay = s.applySyncEvents(owner, block.events, { blockId: block.blockId, blockHash: block.blockHash, blockVersion: 1, events: block.events });
    assert.equal(replay.failed.length, 0);
    assert.equal(replay.duplicated, undefined);
    assert.equal(replay.applied.length, 4);
    assert.equal(replay.results.every(x => x.status === 'duplicate'), true);

    // The same block identity may never represent different content.
    const tampered = events.map(x => ({ ...x, payload: { ...x.payload } }));
    tampered[0].payload.status = 'blocked';
    assert.throws(() => s.applySyncEvents(owner, tampered, { blockId: block.blockId, blockHash: block.blockHash, blockVersion: 1, events: tampered }), /SYNC_BLOCK_HASH_MISMATCH/);

    const invoice = s.createInvoice(owner, { customerId: customer.id, currency: 'SAR', lines: [{ description: 'Field work', quantity: 1, unitPrice: 250 }] });
    assert.equal(invoice.customer_id, customer.id);
    const commercial = s.workOrderValue(owner, wo.id);
    assert.ok(commercial && typeof commercial === 'object');
    assert.ok(Number.isFinite(Number(commercial.revenue)));

    const finalState = s.getWorkOrder(owner, wo.id);
    assert.equal(finalState.status, 'completed');
    assert.equal(finalState.id, completion.workOrder.id);
    assert.equal(finalState.customer_id, customer.id);
    assert.equal(finalState.site_id, site.id);
  } finally {
    close(f);
  }
});
