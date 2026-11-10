'use strict';
const {now} = require('./security');
const {requireRole} = require('./rbac');

const CHECKS = [
  {code:'SITE_CUSTOMER_ORG_MISMATCH', sql:`SELECT s.id resource_id,s.customer_id related_id FROM sites s JOIN customers c ON c.id=s.customer_id WHERE s.organization_id<>c.organization_id AND s.organization_id=?`},
  {code:'WORK_ORDER_CUSTOMER_ORG_MISMATCH', sql:`SELECT w.id resource_id,w.customer_id related_id FROM work_orders w JOIN customers c ON c.id=w.customer_id WHERE w.organization_id<>c.organization_id AND w.organization_id=?`},
  {code:'WORK_ORDER_SITE_ORG_MISMATCH', sql:`SELECT w.id resource_id,w.site_id related_id FROM work_orders w JOIN sites s ON s.id=w.site_id WHERE w.organization_id<>s.organization_id AND w.organization_id=?`},
  {code:'WORK_ORDER_ASSIGNEE_NOT_MEMBER', sql:`SELECT w.id resource_id,w.assigned_to related_id FROM work_orders w WHERE w.assigned_to IS NOT NULL AND w.organization_id=? AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=w.assigned_to AND m.organization_id=w.organization_id)`},
  {code:'WORK_ORDER_CREATOR_NOT_MEMBER', sql:`SELECT w.id resource_id,w.created_by related_id FROM work_orders w WHERE w.organization_id=? AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=w.created_by AND m.organization_id=w.organization_id)`},
  {code:'ASSET_SITE_ORG_MISMATCH', sql:`SELECT a.id resource_id,a.site_id related_id FROM assets a JOIN sites s ON s.id=a.site_id WHERE a.organization_id<>s.organization_id AND a.organization_id=?`},
  {code:'ASSET_EVENT_ASSET_ORG_MISMATCH', sql:`SELECT e.id resource_id,e.asset_id related_id FROM asset_events e JOIN assets a ON a.id=e.asset_id WHERE e.organization_id<>a.organization_id AND e.organization_id=?`},
  {code:'ASSET_EVENT_WORK_ORDER_ORG_MISMATCH', sql:`SELECT e.id resource_id,e.work_order_id related_id FROM asset_events e JOIN work_orders w ON w.id=e.work_order_id WHERE e.organization_id<>w.organization_id AND e.organization_id=?`},
  {code:'COMMENT_WORK_ORDER_ORG_MISMATCH', sql:`SELECT c.id resource_id,c.work_order_id related_id FROM comments c JOIN work_orders w ON w.id=c.work_order_id WHERE c.organization_id<>w.organization_id AND c.organization_id=?`},
  {code:'COMMENT_ACTOR_NOT_MEMBER', sql:`SELECT c.id resource_id,c.actor_user_id related_id FROM comments c WHERE c.organization_id=? AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=c.actor_user_id AND m.organization_id=c.organization_id)`},
  {code:'APPOINTMENT_WORK_ORDER_ORG_MISMATCH', sql:`SELECT a.id resource_id,a.work_order_id related_id FROM appointments a JOIN work_orders w ON w.id=a.work_order_id WHERE a.organization_id<>w.organization_id AND a.organization_id=?`},
  {code:'APPOINTMENT_TECHNICIAN_NOT_MEMBER', sql:`SELECT a.id resource_id,a.technician_id related_id FROM appointments a WHERE a.technician_id IS NOT NULL AND a.organization_id=? AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=a.technician_id AND m.organization_id=a.organization_id)`},
  {code:'APPOINTMENT_CREATOR_NOT_MEMBER', sql:`SELECT a.id resource_id,a.created_by related_id FROM appointments a WHERE a.organization_id=? AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=a.created_by AND m.organization_id=a.organization_id)`},
  {code:'WORK_ORDER_PART_PART_ORG_MISMATCH', sql:`SELECT p.id resource_id,p.part_id related_id FROM work_order_parts p JOIN parts x ON x.id=p.part_id WHERE p.organization_id<>x.organization_id AND p.organization_id=?`},
  {code:'WORK_ORDER_PART_LOCATION_ORG_MISMATCH', sql:`SELECT p.id resource_id,p.location_id related_id FROM work_order_parts p JOIN inventory_locations l ON l.id=p.location_id WHERE p.organization_id<>l.organization_id AND p.organization_id=?`},
  {code:'WORK_ORDER_PART_WORK_ORDER_ORG_MISMATCH', sql:`SELECT p.id resource_id,p.work_order_id related_id FROM work_order_parts p JOIN work_orders w ON w.id=p.work_order_id WHERE p.organization_id<>w.organization_id AND p.organization_id=?`},
  {code:'INVOICE_CUSTOMER_ORG_MISMATCH', sql:`SELECT i.id resource_id,i.customer_id related_id FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.organization_id<>c.organization_id AND i.organization_id=?`},
  {code:'INVOICE_WORK_ORDER_ORG_MISMATCH', sql:`SELECT i.id resource_id,i.work_order_id related_id FROM invoices i JOIN work_orders w ON w.id=i.work_order_id WHERE i.organization_id<>w.organization_id AND i.organization_id=?`},
  {code:'CONTRACT_CUSTOMER_ORG_MISMATCH', sql:`SELECT c.id resource_id,c.customer_id related_id FROM contracts c JOIN customers x ON x.id=c.customer_id WHERE c.organization_id<>x.organization_id AND c.organization_id=?`},
  {code:'MAINTENANCE_ASSET_ORG_MISMATCH', sql:`SELECT m.id resource_id,m.asset_id related_id FROM maintenance_plans m JOIN assets a ON a.id=m.asset_id WHERE m.organization_id<>a.organization_id AND m.organization_id=?`}
];

function integrityGraph(db, ctx) {
  requireRole(ctx.role, 'read');
  const findings=[];
  for (const check of CHECKS) {
    const rows=db.prepare(check.sql).all(ctx.organizationId);
    for (const row of rows) findings.push({code:check.code,resourceId:row.resource_id,relatedId:row.related_id});
  }
  const counts={};
  for (const f of findings) counts[f.code]=(counts[f.code]||0)+1;
  return {
    schemaVersion:'opscore.cross-module-integrity.v1',
    organizationId:ctx.organizationId,
    checkedAt:now(),
    status:findings.length?'FAIL':'PASS',
    checks:CHECKS.length,
    violationCount:findings.length,
    counts,
    violations:findings.slice(0,500),
    truncated:findings.length>500
  };
}

module.exports={integrityGraph,CHECKS};
