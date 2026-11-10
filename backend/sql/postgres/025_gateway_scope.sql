-- Tenant-scoped circuit breaker state. Existing deployments must migrate gateway state explicitly before enabling this constraint.
ALTER TABLE gateway_circuit_states ADD COLUMN IF NOT EXISTS organization_id TEXT;
UPDATE gateway_circuit_states SET organization_id='__global__' WHERE organization_id IS NULL;
ALTER TABLE gateway_circuit_states ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE gateway_circuit_states DROP CONSTRAINT IF EXISTS gateway_circuit_states_pkey;
ALTER TABLE gateway_circuit_states ADD PRIMARY KEY (organization_id,gateway_name);
