export function classifySyncResults(rows, out) {
  const byId = new Map(rows.map(r => [
    r.client_event_id,
    r
  ]));
  return (out?.results || out?.applied || []).map(result => ({
    clientEventId: result.clientEventId,
    row: byId.get(result.clientEventId) || null,
    action: result.status === 'applied' || result.status === 'duplicate' ? 'remove' : result.status === 'failed' && result.retryable === false ? 'dead_letter' : 'retry'
  }));
}
