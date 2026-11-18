'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const signedTenantContextPolicy = require('../src/signed-tenant-context-policy');

const DEFAULT_MANIFEST_PATH = path.join(__dirname, '..', 'docs', 'verification', 'SIGNED_TENANT_CONTEXT_ROUTE_MANIFEST.json');
const DEFAULT_INVENTORY_PATH = path.join(__dirname, '..', 'docs', 'API_INVENTORY.json');

const session = (key) => ({ bucket: 'signedAuthenticatedSessionRoutes', key });
const workOrderWrite = (key) => ({ bucket: 'signedWorkOrderWrites', key });
const evidenceWrite = (key) => ({ bucket: 'signedEvidenceWrites', key });
const workOrderRead = (key) => ({ bucket: 'signedWorkOrderSubresourceReads', key });
const rootChecks = (key) => ({ bucket: 'checks', key });

function routeKey(method, route) {
  return String(method || '').trim().toUpperCase() + ' ' + String(route || '').trim();
}

// Every assertion key below is an exact PASS label written only after its
// corresponding HTTP response and tenant-specific business result are checked
// by signed-tenant-context-postgres-gate.js. A missing mapping stays unverified.
const ROUTE_EVIDENCE = new Map([
  [routeKey('GET', '/api/v1/appointments'), {
    a: session('appointmentListTenantA'), b: session('appointmentListTenantB'),
    crossRead: [session('appointmentListTenantA'), session('appointmentListTenantB')]
  }],
  [routeKey('POST', '/api/v1/appointments'), {
    a: session('appointmentCreateTenantA'), b: session('appointmentCreateTenantB')
  }],
  [routeKey('GET', '/api/v1/appointments/{id}'), {
    a: session('appointmentDetailTenantA'), b: session('appointmentDetailTenantB')
  }],
  [routeKey('PATCH', '/api/v1/appointments/{id}'), {
    a: session('appointmentUpdateTenantA'), b: session('appointmentUpdateTenantB'),
    crossWrite: [session('appointmentCrossTenantUpdateDenied')]
  }],
  [routeKey('POST', '/api/v1/appointments/{id}/on-my-way'), {
    a: session('appointmentOnMyWayTenantA'), b: session('appointmentOnMyWayTenantB')
  }],
  [routeKey('POST', '/api/v1/appointments/{id}/reschedule'), {
    a: null, b: session('appointmentRescheduleManagerTenantB')
  }],
  [routeKey('POST', '/api/v1/appointments/{id}/unreachable'), {
    a: session('appointmentUnreachableTenantA'), b: session('appointmentUnreachableTenantB')
  }],

  [routeKey('GET', '/api/v1/assets'), {
    a: session('assetsTenantA'), b: session('assetsTenantB'),
    crossRead: [session('assetsTenantA'), session('assetsTenantB')]
  }],
  [routeKey('POST', '/api/v1/assets'), {
    a: session('assetsCreateTenantA'), b: session('assetsCreateTenantB'),
    crossWrite: [session('assetsCreateIgnoresClientTenantClaim')]
  }],
  [routeKey('PATCH', '/api/v1/assets/{id}'), {
    a: session('assetsUpdateTenantA'), b: session('assetsUpdateTenantB'),
    crossWrite: [session('assetsCrossTenantUpdateDenied')]
  }],
  [routeKey('POST', '/api/v1/assets/{id}/events'), {
    a: session('assetsEventTenantA'), b: session('assetsEventTenantB'),
    crossWrite: [session('assetsEventCrossTenantWriteDenied')]
  }],

  [routeKey('GET', '/api/v1/customers'), {
    a: session('customersTenantA'), b: session('customersTenantB'),
    crossRead: [session('customersTenantA'), session('customersTenantB')]
  }],
  [routeKey('POST', '/api/v1/customers'), {
    a: session('customersCreateTenantA'), b: session('customersCreateTenantB'),
    crossWrite: [session('customersCreateIgnoresClientTenantClaim')]
  }],
  [routeKey('PATCH', '/api/v1/customers/{id}'), {
    a: session('customersUpdateTenantA'), b: session('customersUpdateTenantB'),
    crossWrite: [session('customersCrossTenantUpdateDenied')]
  }],
  [routeKey('GET', '/api/v1/customers/{id}/service-line'), {
    a: session('customerServiceLineReadTenantA'), b: session('customerServiceLineReadTenantB')
  }],
  [routeKey('POST', '/api/v1/customers/{id}/service-line'), {
    a: session('customerServiceLineAssignTenantA'), b: session('customerServiceLineAssignTenantB'),
    crossWrite: [session('customerServiceLineCrossTenantAssignDenied')]
  }],

  [routeKey('PUT', '/api/v1/evidence-uploads/{id}/chunks/(\\d+)'), {
    a: evidenceWrite('chunkTenantA'), b: evidenceWrite('chunkTenantB'),
    crossWrite: [evidenceWrite('crossTenantChunkDenied')]
  }],
  [routeKey('POST', '/api/v1/evidence-uploads/{id}/complete'), {
    a: evidenceWrite('completeTenantA'), b: evidenceWrite('completeTenantB'),
    crossWrite: [evidenceWrite('crossTenantCompleteDenied')]
  }],

  [routeKey('POST', '/api/v1/faults'), {
    a: session('faultCreateTenantA'), b: session('faultCreateTenantB')
  }],
  [routeKey('POST', '/api/v1/faults/{id}/transition'), {
    a: session('faultTransitionTenantA'), b: session('faultTransitionTenantB')
  }],
  [routeKey('POST', '/api/v1/faults/{id}/unreachable'), {
    a: session('faultUnreachableTenantA'), b: session('faultUnreachableTenantB')
  }],
  [routeKey('POST', '/api/v1/faults/classify'), {
    a: session('faultClassificationTenantA'), b: session('faultClassificationTenantB'),
    crossRead: [session('faultClassificationForeignTenantHidden')]
  }],

  [routeKey('GET', '/api/v1/geofences'), {
    a: session('geofenceListTenantA'), b: session('geofenceListTenantB'),
    crossRead: [session('geofenceListTenantA'), session('geofenceListTenantB')]
  }],
  [routeKey('POST', '/api/v1/geofences'), {
    a: session('geofenceCreateTenantA'), b: session('geofenceCreateTenantB')
  }],
  [routeKey('POST', '/api/v1/geofences/{id}/technicians'), {
    a: session('geofenceAssignTechnicianTenantA'), b: session('geofenceAssignTechnicianTenantB'),
    crossWrite: [session('geofenceCrossTenantAssignmentDenied')]
  }],
  [routeKey('POST', '/api/v1/geofences/assert-access'), {
    a: session('geofenceAssertAccessTenantA'), b: session('geofenceAssertAccessTenantB')
  }],
  [routeKey('POST', '/api/v1/geofences/dynamic-events'), {
    a: session('dynamicGeofenceWriteTenantA'), b: session('dynamicGeofenceWriteTenantB')
  }],
  [routeKey('POST', '/api/v1/geofences/evaluate'), {
    a: session('geofenceEvaluationTenantA'), b: session('geofenceEvaluationTenantB'),
    crossRead: [session('geofenceEvaluationForeignTenantHidden')]
  }],
  [routeKey('GET', '/api/v1/geofences/role-polygons'), {
    a: session('geofenceRolePolygonsTenantA'), b: session('geofenceRolePolygonsTenantB'),
    crossRead: [session('geofenceRolePolygonsTenantA'), session('geofenceRolePolygonsTenantB')]
  }],
  [routeKey('GET', '/api/v1/map/viewport'), {
    a: session('mapViewportTenantA'), b: session('mapViewportTenantB'),
    crossRead: [session('mapViewportTenantA'), session('mapViewportTenantB')]
  }],

  [routeKey('GET', '/api/v1/sites'), {
    a: session('sitesTenantA'), b: session('sitesTenantB'),
    crossRead: [session('sitesTenantA'), session('sitesTenantB')]
  }],
  [routeKey('POST', '/api/v1/sites'), {
    a: session('sitesCreateTenantA'), b: session('sitesCreateTenantB'),
    crossWrite: [session('sitesCreateIgnoresClientTenantClaim')]
  }],
  [routeKey('PATCH', '/api/v1/sites/{id}'), {
    a: session('sitesUpdateTenantA'), b: session('sitesUpdateTenantB'),
    crossWrite: [session('sitesCrossTenantUpdateDenied')]
  }],

  [routeKey('GET', '/api/v1/technicians'), {
    a: session('technicianListTenantA'), b: session('technicianListTenantB'),
    crossRead: [session('technicianListTenantA'), session('technicianListTenantB')]
  }],
  [routeKey('POST', '/api/v1/technicians'), {
    a: session('technicianProfileTenantA'), b: session('technicianProfileTenantB')
  }],
  [routeKey('GET', '/api/v1/technicians/{id}/geofences'), {
    a: session('technicianGeofenceReadTenantA'), b: session('technicianGeofenceReadTenantB'),
    crossRead: [session('technicianGeofenceReadTenantA'), session('technicianGeofenceReadTenantB')]
  }],
  [routeKey('GET', '/api/v1/technicians/availability'), {
    a: session('technicianAvailabilityTenantA'), b: session('technicianAvailabilityTenantB')
  }],
  [routeKey('GET', '/api/v1/technicians/skills'), {
    a: session('technicianSkillsListTenantA'), b: session('technicianSkillsListTenantB'),
    crossRead: [session('technicianSkillsListTenantA'), session('technicianSkillsListTenantB')]
  }],
  [routeKey('POST', '/api/v1/technicians/skills'), {
    a: session('technicianSkillTenantA'), b: session('technicianSkillTenantB')
  }],
  [routeKey('GET', '/api/v1/technicians/trail'), {
    a: session('technicianTrailReadTenantA'), b: session('technicianTrailReadTenantB'),
    crossRead: [session('technicianTrailCrossTenantHidden')]
  }],
  [routeKey('POST', '/api/v1/technicians/trail'), {
    a: session('technicianTrailWriteTenantA'), b: session('technicianTrailWriteTenantB')
  }],
  [routeKey('GET', '/api/v1/technicians/trail.geojson'), {
    a: session('technicianTrailGeoJsonTenantA'), b: session('technicianTrailGeoJsonTenantB'),
    crossRead: [session('technicianTrailGeoJsonTenantA'), session('technicianTrailGeoJsonTenantB')]
  }],

  [routeKey('GET', '/api/v1/work-orders'), {
    a: rootChecks('signedWorkOrdersTenantA'), b: rootChecks('signedWorkOrdersTenantB'),
    crossRead: [rootChecks('signedWorkOrdersTenantA'), rootChecks('signedWorkOrdersTenantB')]
  }],
  [routeKey('POST', '/api/v1/work-orders'), {
    a: workOrderWrite('createTenantA'), b: workOrderWrite('createTenantB'),
    crossWrite: [workOrderWrite('createIgnoresClientTenantClaim')]
  }],
  [routeKey('GET', '/api/v1/work-orders/{id}'), {
    a: rootChecks('signedWorkOrderDetailTenantA'), b: rootChecks('signedWorkOrderDetailTenantB')
  }],
  [routeKey('PATCH', '/api/v1/work-orders/{id}'), {
    a: workOrderWrite('patchTenantA'), b: workOrderWrite('patchTenantB'),
    crossWrite: [workOrderWrite('crossTenantPatchDenied')]
  }],
  [routeKey('GET', '/api/v1/work-orders/{id}/attachments'), {
    a: workOrderRead('attachmentsTenantA'), b: workOrderRead('attachmentsTenantB'),
    crossRead: [workOrderRead('attachmentsForeignTenantDenied')]
  }],
  [routeKey('POST', '/api/v1/work-orders/{id}/attachments'), {
    a: evidenceWrite('directAttachmentTenantA'), b: evidenceWrite('directAttachmentTenantB'),
    crossWrite: [evidenceWrite('crossTenantDirectAttachmentDenied')]
  }],
  [routeKey('GET', '/api/v1/work-orders/{id}/changelog'), {
    a: workOrderRead('changelogTenantA'), b: workOrderRead('changelogTenantB'),
    crossRead: [workOrderRead('changelogForeignTenantDenied')]
  }],
  [routeKey('GET', '/api/v1/work-orders/{id}/comments'), {
    a: workOrderRead('commentsTenantA'), b: workOrderRead('commentsTenantB'),
    crossRead: [workOrderRead('commentsForeignTenantDenied')]
  }],
  [routeKey('POST', '/api/v1/work-orders/{id}/comments'), {
    a: workOrderWrite('commentTenantA'), b: workOrderWrite('commentTenantB'),
    crossWrite: [workOrderWrite('crossTenantCommentDenied')]
  }],
  [routeKey('GET', '/api/v1/work-orders/{id}/completion-assurance'), {
    a: workOrderRead('completionAssuranceTenantA'), b: workOrderRead('completionAssuranceTenantB'),
    crossRead: [workOrderRead('completionAssuranceForeignTenantDenied')]
  }],
  [routeKey('GET', '/api/v1/work-orders/{id}/completion-package'), {
    a: workOrderRead('completionPackageTenantA'), b: workOrderRead('completionPackageTenantB'),
    crossRead: [workOrderRead('completionPackageForeignTenantDenied')]
  }],
  [routeKey('GET', '/api/v1/work-orders/{id}/dispatch-candidates'), {
    a: workOrderRead('dispatchCandidatesTenantA'), b: workOrderRead('dispatchCandidatesTenantB'),
    crossRead: [workOrderRead('dispatchCandidatesForeignTenantDenied')]
  }],
  [routeKey('POST', '/api/v1/work-orders/{id}/evidence-uploads'), {
    a: evidenceWrite('initiateTenantA'), b: evidenceWrite('initiateTenantB')
  }],
  [routeKey('GET', '/api/v1/work-orders/{id}/first-time-right'), {
    a: workOrderRead('firstTimeRightTenantA'), b: workOrderRead('firstTimeRightTenantB'),
    crossRead: [workOrderRead('firstTimeRightForeignTenantDenied')]
  }],
  [routeKey('GET', '/api/v1/work-orders/{id}/handoff'), {
    a: workOrderRead('handoffTenantA'), b: workOrderRead('handoffTenantB'),
    crossRead: [workOrderRead('handoffForeignTenantDenied')]
  }],
  [routeKey('GET', '/api/v1/work-orders/{id}/operational-risk'), {
    a: workOrderRead('operationalRiskTenantA'), b: workOrderRead('operationalRiskTenantB'),
    crossRead: [workOrderRead('operationalRiskForeignTenantDenied')]
  }],
  [routeKey('GET', '/api/v1/work-orders/{id}/parts'), {
    a: workOrderRead('partsTenantA'), b: workOrderRead('partsTenantB'),
    crossRead: [workOrderRead('partsForeignTenantDenied')]
  }],
  [routeKey('GET', '/api/v1/work-orders/{id}/signoffs'), {
    a: workOrderRead('signoffsTenantA'), b: workOrderRead('signoffsTenantB'),
    crossRead: [workOrderRead('signoffsForeignTenantDenied')]
  }],
  [routeKey('GET', '/api/v1/work-orders/{id}/time-summary'), {
    a: workOrderRead('timeSummaryTenantA'), b: workOrderRead('timeSummaryTenantB'),
    crossRead: [workOrderRead('timeSummaryForeignTenantDenied')]
  }],
  [routeKey('GET', '/api/v1/work-orders/{id}/timeline'), {
    a: workOrderRead('timelineTenantA'), b: workOrderRead('timelineTenantB'),
    crossRead: [workOrderRead('timelineForeignTenantDenied')]
  }],
  [routeKey('POST', '/api/v1/work-orders/{id}/transition'), {
    a: workOrderWrite('transitionTenantA'), b: workOrderWrite('transitionTenantB'),
    crossWrite: [workOrderWrite('crossTenantTransitionDenied')]
  }],
  [routeKey('GET', '/api/v1/work-orders/{id}/verified-job-record'), {
    a: workOrderRead('verifiedJobRecordTenantA'), b: workOrderRead('verifiedJobRecordTenantB'),
    crossRead: [workOrderRead('verifiedJobRecordForeignTenantDenied')]
  }],
  [routeKey('GET', '/api/v1/work-orders/{id}/why-blocked'), {
    a: workOrderRead('whyBlockedTenantA'), b: workOrderRead('whyBlockedTenantB'),
    crossRead: [workOrderRead('whyBlockedForeignTenantDenied')]
  }],
  [routeKey('GET', '/api/v1/work-orders/{id}/work-pack'), {
    a: workOrderRead('workPackTenantA'), b: workOrderRead('workPackTenantB'),
    crossRead: [workOrderRead('workPackForeignTenantDenied')]
  }],
  [routeKey('POST', '/api/v1/work-orders/bulk'), {
    a: workOrderWrite('bulkTenantA'), b: workOrderWrite('bulkTenantB'),
    crossWrite: [workOrderWrite('crossTenantBulkFailedNotFound')]
  }]
]);

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function getBucket(checks, bucket) {
  if (bucket === 'checks') return checks;
  if (bucket === 'signedAuthenticatedSessionRoutes') return checks.signedAuthenticatedSessionRoutes;
  if (bucket === 'signedWorkOrderWrites') return checks.signedWorkOrderWrites;
  if (bucket === 'signedEvidenceWrites') return checks.signedEvidenceWrites;
  if (bucket === 'signedWorkOrderSubresourceReads') return checks.signedWorkOrderSubresourceReads;
  return null;
}

function assertionPass(checks, assertion) {
  if (!assertion) return false;
  const bucket = getBucket(checks, assertion.bucket);
  return Boolean(bucket && bucket[assertion.key] === 'PASS');
}

function allAssertionsPass(checks, assertions) {
  return Array.isArray(assertions) && assertions.length > 0
    && assertions.every(assertion => assertionPass(checks, assertion));
}

function validateCandidateResult(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('CANDIDATE_RESULT_INVALID');
  }
  if (candidate.schemaVersion !== 'opscore.signed-tenant-context-ci-proof.v1'
      || candidate.status !== 'PASS'
      || candidate.cleanup?.status !== 'PASS'
      || !candidate.cleanup.residue
      || Object.values(candidate.cleanup.residue).some(value => Number(value) !== 0)
      || candidate.checks?.tenantAHttpSession !== 'PASS'
      || candidate.checks?.tenantBHttpSession !== 'PASS'
      || candidate.checks?.rawGucTampering !== 'PASS_CANDIDATE_HTTP_ROUTE_PROBES'
      || candidate.checks?.workOrdersRawGucTamperingIgnored !== 'PASS_CANDIDATE_HTTP_ROUTE_PROBES') {
    throw new Error('CANDIDATE_RESULT_NOT_CLEAN_PASS');
  }
  const runtime = candidate.candidateRuntimeIdentity || {};
  if (!/^dpl_[A-Za-z0-9]+$/.test(String(runtime.deploymentId || ''))
      || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(String(runtime.sourceCommit || ''))
      || !/^[1-9][0-9]{0,14}$/.test(String(runtime.pipelineId || ''))
      || runtime.sourceRef !== 'main'
      || runtime.environment !== 'production'
      || runtime.readOnlyInspection !== true
      || Number(runtime.writeOperations) !== 0
      || runtime.holdActive !== true
      || runtime.releaseVerified !== false
      || runtime.releaseProofVerified !== false
      || runtime.currentUser !== 'opscore_runtime'
      || runtime.sessionUser !== 'opscore_runtime'
      || runtime.databaseName !== 'opscore_acceptance'
      || runtime.runtimeRole?.bypass_rls !== false) {
    throw new Error('CANDIDATE_RUNTIME_IDENTITY_NOT_ACCEPTABLE');
  }
  return runtime;
}

function buildSignedTenantContextProductionCoverage({
  candidate,
  manifest,
  inventory,
  manifestBytes,
  inventoryBytes,
  parentBranchId,
  expectedParentBranchId,
  expectedCommit,
  expectedPipelineId,
  expectedDeploymentId,
  databaseName = 'opscore_acceptance',
  testedAt = new Date().toISOString(),
  routeEvidenceMap = ROUTE_EVIDENCE
}) {
  const runtime = validateCandidateResult(candidate);
  const rawManifest = manifestBytes || Buffer.from(JSON.stringify(manifest));
  const rawInventory = inventoryBytes || Buffer.from(JSON.stringify(inventory));
  const checks = candidate.checks || {};
  const observations = Array.isArray(checks.candidateRouteObservations) ? checks.candidateRouteObservations : [];
  const manifestRoutes = Array.isArray(manifest && manifest.routes) ? manifest.routes : [];
  const inventoryRoutes = Array.isArray(inventory && inventory.routes) ? inventory.routes : [];
  const inventorySha256 = digest(rawInventory);
  const manifestSha256 = digest(rawManifest);
  const manifestKeys = new Set();
  const inventoryKeys = new Set(inventoryRoutes
    .filter(row => row && typeof row === 'object' && row.auth !== 'public')
    .map(row => routeKey(row.method, row.route)));
  let manifestBound = manifest.schemaVersion === 'opscore.signed-tenant-context-route-manifest.v1'
    && Number(manifest.routeCount) === 67
    && manifestRoutes.length === 67
    && Number(inventory.routeCount) === inventoryRoutes.length
    && inventoryRoutes.length > 0
    && manifest.routeInventorySha256 === inventorySha256;
  for (const route of manifestRoutes) {
    const key = routeKey(route && route.method, route && route.path);
    if (!route || typeof route !== 'object'
        || !['read', 'write'].includes(String(route.operation || ''))
        || manifestKeys.has(key)
        || !inventoryKeys.has(key)
        || !signedTenantContextPolicy.isSignedTenantContextRouteDefinition(route.method, route.path, route.operation)) {
      manifestBound = false;
    }
    manifestKeys.add(key);
  }
  const observationByKey = new Map();
  let observationsUnique = true;
  for (const row of observations) {
    if (!row || typeof row !== 'object') {
      observationsUnique = false;
      continue;
    }
    const key = routeKey(row.method, row.path);
    if (observationByKey.has(key) || !manifestKeys.has(key)) observationsUnique = false;
    observationByKey.set(key, row);
  }
  const rows = [];

  for (const route of manifestRoutes) {
    const key = routeKey(route.method, route.path);
    const spec = routeEvidenceMap.get(key);
    const observation = observationByKey.get(key);
    const tenantA = observation && observation.tenantA || {};
    const tenantB = observation && observation.tenantB || {};
    const proofA = Boolean(spec && assertionPass(checks, spec.a));
    const proofB = Boolean(spec && assertionPass(checks, spec.b));
    const ownProofsPass = proofA && proofB;
    const tenantAOwnPass = Boolean(observation
      && Number(tenantA.successful) > 0
      && Number(tenantA.signed) > 0
      && Number(tenantA.tamperApplied) >= Number(tenantA.successful)
      && proofA);
    const tenantBOwnPass = Boolean(observation
      && Number(tenantB.successful) > 0
      && Number(tenantB.signed) > 0
      && Number(tenantB.tamperApplied) >= Number(tenantB.successful)
      && proofB);
    const tamperPass = Boolean(tenantAOwnPass && tenantBOwnPass && ownProofsPass);
    const commonPass = Boolean(tenantAOwnPass && tenantBOwnPass && ownProofsPass);
    const crossRead = spec && allAssertionsPass(checks, spec.crossRead);
    const crossWrite = spec && allAssertionsPass(checks, spec.crossWrite);
    const routeRead = route.operation === 'read';
    const tenantARead = routeRead && tenantAOwnPass;
    const tenantBRead = routeRead && tenantBOwnPass;
    const tenantAWrite = !routeRead && tenantAOwnPass;
    const tenantBWrite = !routeRead && tenantBOwnPass;
    const crossTenantReadDenied = Boolean(routeRead && crossRead);
    const crossTenantWriteDenied = Boolean(!routeRead && crossWrite);
    const signedContextBound = commonPass;
    const sessionBound = commonPass;
    const transactionBound = Boolean(commonPass && tamperPass);
    const rawGucTamperDenied = tamperPass;
    const rowStatus = routeRead
      ? (tenantARead && tenantBRead && crossTenantReadDenied && signedContextBound && sessionBound && transactionBound && rawGucTamperDenied ? 'PASS' : 'NOT_VERIFIED')
      : (tenantAWrite && tenantBWrite && crossTenantWriteDenied && signedContextBound && sessionBound && transactionBound && rawGucTamperDenied ? 'PASS' : 'NOT_VERIFIED');
    rows.push({
      method: String(route.method).toUpperCase(),
      path: String(route.path),
      operation: String(route.operation),
      status: rowStatus,
      tenantARead,
      tenantBRead,
      tenantAWrite,
      tenantBWrite,
      crossTenantReadDenied,
      crossTenantWriteDenied,
      signedContextBound,
      sessionBound,
      transactionBound,
      rawGucTamperDenied,
      evidence: {
        observations: observation || null,
        tenantAAssertion: spec && spec.a || null,
        tenantBAssertion: spec && spec.b || null,
        crossTenantAssertions: spec && (routeRead ? spec.crossRead : spec.crossWrite) || []
      }
    });
  }

  const coveredRouteCount = rows.filter(row => row.status === 'PASS').length;
  const failedRouteCount = rows.length - coveredRouteCount;
  const exactIdentity = /^[a-f0-9]{40}$/i.test(String(expectedCommit || ''))
    && String(runtime.sourceCommit).toLowerCase() === String(expectedCommit).toLowerCase()
    && /^[1-9][0-9]{0,14}$/.test(String(expectedPipelineId || ''))
    && String(runtime.pipelineId) === String(expectedPipelineId)
    && /^dpl_[A-Za-z0-9]+$/.test(String(expectedDeploymentId || ''))
    && String(runtime.deploymentId) === String(expectedDeploymentId)
    && /^[a-z0-9-]{8,80}$/.test(String(parentBranchId || '').trim())
    && /^[a-z0-9-]{8,80}$/.test(String(expectedParentBranchId || '').trim())
    && String(parentBranchId) === String(expectedParentBranchId)
    && String(databaseName) === runtime.databaseName
    && manifestRoutes.length === 67;
  const inventoryBound = manifestBound
    && manifestKeys.size === 67
    && inventoryKeys.size > 0
    && manifest.routeInventorySha256 === inventorySha256;
  const complete = exactIdentity && inventoryBound && observationsUnique
    && coveredRouteCount === 67 && failedRouteCount === 0
    && rows.length === 67
    && observations.length === 67
    && observationByKey.size === 67
    && rows.every(row => row.status === 'PASS');

  return {
    schemaVersion: 'opscore.signed-tenant-context-production-coverage.v1',
    environment: 'production',
    status: complete ? 'PASS' : 'NOT_VERIFIED',
    databaseName: runtime.databaseName,
    expectedRouteCount: 67,
    coveredRouteCount,
    failedRouteCount,
    routeManifestSha256: manifestSha256,
    routeInventorySha256: inventorySha256,
    sourceCommitHint: String(runtime.sourceCommit).toLowerCase(),
    pipelineId: String(runtime.pipelineId),
    parentBranchId: String(parentBranchId || ''),
    deploymentId: String(runtime.deploymentId),
    testedAt,
    evidenceRebind: null,
    routes: rows,
    summary: {
      sourceManifestRouteCount: manifestRoutes.length,
      observationCount: observations.length,
      observationKeysUnique: observationsUnique,
      manifestBound,
      inventoryBound,
      mappedRouteCount: rows.filter(row => routeEvidenceMap.has(routeKey(row.method, row.path))).length,
      unmappedRoutes: rows.filter(row => !ROUTE_EVIDENCE.has(routeKey(row.method, row.path))).map(row => row.method + ' ' + row.path),
      routesNotVerified: rows.filter(row => row.status !== 'PASS').map(row => row.method + ' ' + row.path)
    }
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error('CLI_OPTION_VALUE_MISSING:' + key);
    options[key] = value;
    index += 1;
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const inputPath = path.resolve(String(options.input || ''));
  const outputPath = path.resolve(String(options.output || ''));
  if (!options.input || !options.output || !options['parent-branch-id']) {
    throw new Error('USAGE: --input <candidate-result.json> --output <coverage.json> --parent-branch-id <neon-branch-id>');
  }
  const manifestPath = path.resolve(options.manifest || DEFAULT_MANIFEST_PATH);
  const inventoryPath = path.resolve(options.inventory || DEFAULT_INVENTORY_PATH);
  const candidate = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const manifestBytes = fs.readFileSync(manifestPath);
  const inventoryBytes = fs.readFileSync(inventoryPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const inventory = JSON.parse(inventoryBytes.toString('utf8'));
  const result = buildSignedTenantContextProductionCoverage({
    candidate,
    manifest,
    inventory,
    manifestBytes,
    inventoryBytes,
    parentBranchId: options['parent-branch-id'],
    expectedCommit: options.commit || process.env.GITHUB_SHA || process.env.OPSC_RELEASE_CI_COMMIT,
    expectedPipelineId: options['pipeline-id'] || process.env.GITHUB_RUN_ID || process.env.OPSC_RELEASE_CI_PIPELINE_ID,
    expectedDeploymentId: options['deployment-id'] || process.env.OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID,
    expectedParentBranchId: options['expected-parent-branch-id'] || process.env.OPSC_PRODUCTION_NEON_BRANCH_ID,
    databaseName: options['database-name'] || process.env.OPSC_PRODUCTION_DATABASE_NAME || 'opscore_acceptance'
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify({
    status: result.status,
    expectedRouteCount: result.expectedRouteCount,
    coveredRouteCount: result.coveredRouteCount,
    failedRouteCount: result.failedRouteCount,
    outputPath
  }) + '\n');
  if (result.status !== 'PASS') process.exitCode = 2;
}


module.exports = {
  ROUTE_EVIDENCE,
  routeKey,
  validateCandidateResult,
  buildSignedTenantContextProductionCoverage,
  parseArgs,
  main
};
