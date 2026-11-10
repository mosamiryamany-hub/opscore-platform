import { api } from './api';
import { loadAuth } from './auth';
import {
  evidencePending,
  evidenceSetStatus,
  getLocalScope,
  markError,
  markFailed,
  pending,
  pendingCount,
  remove
} from './db';
import { clientEventId } from './id';

let flushInFlight = null;

function authScope(auth) {
  return `${auth?.userId || 'unknown'}:${auth?.organizationId || 'unknown'}`;
}

function retryableUploadError(error) {
  const status = Number(error?.status || 0);
  return !status || status === 408 || status === 425 || status === 429 || status === 401 || status >= 500;
}

async function flushEvidenceQueue(scope, auth) {
  const rows = await evidencePending(scope);
  let sent = 0;
  let failed = 0;
  let remaining = 0;

  for (const row of rows) {
    // A scope switch prevents any additional request from being started for the previous identity.
    if (getLocalScope() !== scope) break;
    try {
      await api.attachment(row.work_order_id, {
        fileName: row.file_name,
        mediaType: row.media_type,
        contentBase64: row.content_base64
      }, row.id, auth);
      await evidenceSetStatus(row.id, 'committed', null, scope);
      sent += 1;
    } catch (error) {
      const canRetry = retryableUploadError(error);
      const status = canRetry ? 'queued' : 'failed';
      await evidenceSetStatus(row.id, status, error?.message || 'EVIDENCE_UPLOAD_FAILED', scope);
      if (canRetry) remaining += 1;
      else failed += 1;
    }
  }
  remaining = Math.max(0, rows.length - sent - failed);
  return { sent, failed, remaining };
}

async function flushQueueOnce() {
  const scope = getLocalScope();
  const auth = await loadAuth();
  if (!auth?.token || authScope(auth) !== scope) {
    throw new Error('MOBILE_SYNC_AUTH_SCOPE_MISMATCH');
  }

  let failed = 0;
  let regularRemaining = 0;
  let regularSent = 0;
  let regularError = null;
  const rows = await pending(scope);
  const events = [];

  for (const row of rows) {
    try {
      events.push({
        clientEventId: row.client_event_id,
        operation: row.operation,
        entityId: row.entity_id,
        payload: JSON.parse(row.payload_json),
        createdAt: row.created_at
      });
    } catch {
      await markFailed(row, 'INVALID_LOCAL_PAYLOAD');
      failed += 1;
    }
  }

  if (events.length && getLocalScope() === scope) {
    const block = { blockId: clientEventId(), blockVersion: 1, events };
    try {
      const output = await api.sync(block, auth);
      const results = output.results || output.applied || [];
      for (const result of results) {
        const row = rows.find(item => item.client_event_id === result.clientEventId);
        if (!row) continue;
        if (result.status === 'applied' || result.status === 'duplicate') {
          await remove(result.clientEventId, scope);
          regularSent += 1;
        } else if (result.status === 'failed' && result.retryable === false) {
          await markFailed(row, result.errorCode || 'SYNC_EVENT_FAILED');
          failed += 1;
        } else if (result.status === 'failed') {
          await markError(result.clientEventId, result.errorCode || 'SYNC_EVENT_FAILED', scope);
        }
      }
    } catch (error) {
      regularError = error;
      for (const row of rows) {
        if (events.some(event => event.clientEventId === row.client_event_id)) {
          await markError(row.client_event_id, error?.message || 'SYNC_REQUEST_FAILED', scope);
        }
      }
    }
  }

  regularRemaining = await pendingCount(scope);

  // Evidence is retried from its encrypted local store, never by copying base64 bytes into sync_queue.
  let evidence = { sent: 0, failed: 0, remaining: 0 };
  let evidenceError = null;
  if (getLocalScope() === scope) {
    try {
      evidence = await flushEvidenceQueue(scope, auth);
    } catch (error) {
      evidenceError = error;
    }
  }

  const result = {
    sent: regularSent + evidence.sent,
    failed: failed + evidence.failed,
    remaining: regularRemaining + evidence.remaining,
    evidence
  };
  if (regularError) {
    regularError.syncResult = result;
    throw regularError;
  }
  if (evidenceError) throw evidenceError;
  return result;
}

export function flushQueue() {
  if (flushInFlight) return flushInFlight;
  flushInFlight = flushQueueOnce().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}
