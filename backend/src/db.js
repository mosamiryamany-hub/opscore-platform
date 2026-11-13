    throw new Error(`DB_SCHEMA_NEWER_THAN_CODE:${ storedVersion }:${ CURRENT_SCHEMA_VERSION }`);
  migrateSyncEvents(db, storedVersion);
  migrate13(db, storedVersion);
  migrate14(db, storedVersion);
  migrate15(db, storedVersion);
  migrate16(db, storedVersion);
  migrate17(db, storedVersion);
  migrate18(db, storedVersion);
  migrate19(db, storedVersion);
  migrate20(db, storedVersion);
  migrate21(db, storedVersion);
  migrate22(db, storedVersion);
  migrate23(db, storedVersion);
  migrate24(db, storedVersion);
  migrate25(db, storedVersion);
  migrate26(db, storedVersion);
  migrate27(db, storedVersion);
  migrate28(db, storedVersion);
  // Existing very old/imported databases may not have reached migration 15 yet.
  // Add the housekeeping index only after the shared limiter table exists.
  const rateBucketsTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='firewall_rate_buckets'").get();
  if (rateBucketsTable) db.exec('CREATE INDEX IF NOT EXISTS idx_firewall_rate_buckets_updated_at ON firewall_rate_buckets(updated_at)');
  addColumn(db, 'stripe_billing', 'last_event_created', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'stripe_events', 'event_created', 'INTEGER NOT NULL DEFAULT 0');
  // Backward-compatible local upgrade from the first 0.1 schema.
  addColumn(db, 'webhook_endpoints', 'secret_ciphertext', 'TEXT');
  addColumn(db, 'audit_log', 'previous_hash', 'TEXT NOT NULL DEFAULT \'\'');
  addColumn(db, 'audit_log', 'event_hash', 'TEXT NOT NULL DEFAULT \'\'');
  addColumn(db, 'work_orders', 'number', 'TEXT DEFAULT NULL');
  addColumn(db, 'work_orders', 'customer_id', 'TEXT REFERENCES customers(id) ON DELETE SET NULL');
  addColumn(db, 'work_orders', 'site_id', 'TEXT REFERENCES sites(id) ON DELETE SET NULL');
  addColumn(db, 'work_orders', 'team_name', 'TEXT');
  addColumn(db, 'work_orders', 'due_at', 'TEXT');
  addColumn(db, 'work_orders', 'completion_policy_id', 'TEXT');
  addColumn(db, 'work_orders', 'completion_policy_version', 'INTEGER');
  addColumn(db, 'completion_policies', 'version', 'INTEGER NOT NULL DEFAULT 1');
  addColumn(db, 'completion_policies', 'require_first_time_right', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'workflow_definitions', 'version', 'INTEGER NOT NULL DEFAULT 1');
  addColumn(db, 'workflow_transition_log', 'reason', 'TEXT');
  addColumn(db, 'workflow_transition_log', 'workflow_version', 'INTEGER');
  addColumn(db, 'workflow_transition_log', 'decision_hash', 'TEXT');
  addColumn(db, 'safety_acknowledgements', 'evidence_json', 'TEXT NOT NULL DEFAULT \'[]\'');
  addColumn(db, 'safety_acknowledgements', 'measurements_json', 'TEXT NOT NULL DEFAULT \'{}\'');
  addColumn(db, 'assets', 'site_id', 'TEXT REFERENCES sites(id) ON DELETE SET NULL');
  addColumn(db, 'assets', 'updated_at', 'TEXT');
  addColumn(db, 'work_orders', 'asset_id', 'TEXT REFERENCES assets(id) ON DELETE SET NULL');
  addColumn(db, 'parts', 'unit_cost', 'REAL');
  addColumn(db, 'appointments', 'checkin_latitude', 'REAL');
  addColumn(db, 'appointments', 'checkin_longitude', 'REAL');
  addColumn(db, 'appointments', 'checkin_accuracy_m', 'REAL');
  addColumn(db, 'appointments', 'checked_in_at', 'TEXT');
  addColumn(db, 'appointments', 'checked_in_by', 'TEXT REFERENCES users(id) ON DELETE SET NULL');
  db.prepare('UPDATE work_orders SET number = \'WO-\' || substr(id,4,8) WHERE number IS NULL OR number = \'\'').run();
  db.prepare('UPDATE assets SET updated_at = created_at WHERE updated_at IS NULL').run();
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_work_orders_number_org ON work_orders(organization_id, number); CREATE INDEX IF NOT EXISTS idx_work_orders_org_due ON work_orders(organization_id, due_at);`);
    addColumn(db, 'customer_signoffs', 'signature_image_png', 'TEXT');
  addColumn(db, 'customer_signoffs', 'signature_image_sha256', 'TEXT');
  db.exec(`PRAGMA user_version = ${ CURRENT_SCHEMA_VERSION }`);
  return db;
}
module.exports = {
  openDb,
  CURRENT_SCHEMA_VERSION