'use strict';
const crypto=require('node:crypto');
const {id,now}=require('./security');
const {requireRole}=require('./rbac');
function clean(v){return String(v??'').trim()}
function pointOnSegment(point,a,b){const [x,y]=point,[x1,y1]=a,[x2,y2]=b;const cross=(x-x1)*(y2-y1)-(y-y1)*(x2-x1);if(Math.abs(cross)>1e-12)return false;return x>=Math.min(x1,x2)-1e-12&&x<=Math.max(x1,x2)+1e-12&&y>=Math.min(y1,y2)-1e-12&&y<=Math.max(y1,y2)+1e-12;}
function pointInRing(point,ring){let inside=false;const x=point[0],y=point[1];for(let i=0,j=ring.length-1;i<ring.length;j=i++){if(pointOnSegment(point,ring[j],ring[i]))return true;const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];const intersect=((yi>y)!==(yj>y))&&(x<((xj-xi)*(y-yi))/(yj-yi)+xi);if(intersect)inside=!inside;}return inside;}
function normalizeGeo(g){if(!g||g.type!=='Polygon'||!Array.isArray(g.coordinates)||!g.coordinates.length)throw new Error('GEOFENCE_GEOMETRY_INVALID');for(const ring of g.coordinates){if(!Array.isArray(ring)||ring.length<4)throw new Error('GEOFENCE_RING_INVALID');for(const pt of ring){if(!Array.isArray(pt)||pt.length<2||!Number.isFinite(Number(pt[0]))||!Number.isFinite(Number(pt[1]))||Number(pt[0])<-180||Number(pt[0])>180||Number(pt[1])<-90||Number(pt[1])>90)throw new Error('GEOFENCE_COORDINATE_INVALID');}}return g;}
function coversPoint(g,[lng,lat]){if(pointInRing([lng,lat],g.coordinates[0])){for(let i=1;i<g.coordinates.length;i++)if(pointInRing([lng,lat],g.coordinates[i]))return false;return true}return false}
function attach(Store){const p=Store.prototype;
p.createGeofence=function(ctx,d={}){requireRole(ctx.role,'write');const name=clean(d.name);if(!name||name.length>120)throw new Error('GEOFENCE_NAME_INVALID');let g;try{g=normalizeGeo(typeof d.geometry==='string'?JSON.parse(d.geometry):d.geometry)}catch(e){if(String(e.message).startsWith('GEOFENCE_'))throw e;throw new Error('GEOFENCE_GEOMETRY_INVALID')}const t=now(),gid=id('geo'),canon=JSON.stringify(g);this.db.prepare('INSERT INTO geofences(id,organization_id,name,geometry_json,enabled,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(gid,ctx.organizationId,name,canon,d.enabled===false?0:1,ctx.userId,t,t);return {id:gid,organizationId:ctx.organizationId,name,enabled:d.enabled!==false,geometry:g,geometrySha256:crypto.createHash('sha256').update(canon).digest('hex'),createdAt:t}};
p.listGeofences=function(ctx){requireRole(ctx.role,'read');return this.db.prepare('SELECT id,name,geometry_json,enabled,created_at,updated_at FROM geofences WHERE organization_id=? ORDER BY name').all(ctx.organizationId).map(r=>({...r,geometry:JSON.parse(r.geometry_json)}))};
p.evaluateGeofences=function(ctx,d={}){requireRole(ctx.role,'read');const lng=Number(d.longitude),lat=Number(d.latitude);if(!Number.isFinite(lng)||!Number.isFinite(lat)||lng<-180||lng>180||lat<-90||lat>90)throw new Error('GEOFENCE_POINT_INVALID');const rows=this.db.prepare('SELECT id,name,geometry_json FROM geofences WHERE organization_id=? AND enabled=TRUE ORDER BY name').all(ctx.organizationId);const matches=rows.filter(r=>coversPoint(JSON.parse(r.geometry_json),[lng,lat])).map(r=>({id:r.id,name:r.name,inside:true}));return {schemaVersion:'opscore.geofence.v1',organizationId:ctx.organizationId,point:{longitude:lng,latitude:lat},matches,insideAny:matches.length>0}};
p.assignTechnicianToGeofence=function(ctx,d={}){requireRole(ctx.role,'write');const geofenceId=clean(d.geofenceId),technicianId=clean(d.technicianId);if(!geofenceId||!technicianId)throw new Error('GEOFENCE_ASSIGNMENT_INPUT_INVALID');const g=this.db.prepare('SELECT id FROM geofences WHERE id=? AND organization_id=? AND enabled=TRUE').get(geofenceId,ctx.organizationId);if(!g)throw new Error('GEOFENCE_NOT_FOUND');const u=this.db.prepare('SELECT u.id FROM users u WHERE u.id=? AND EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=u.id AND m.organization_id=? )').get(technicianId,ctx.organizationId);if(!u)throw new Error('TECHNICIAN_NOT_FOUND');this.db.prepare('INSERT OR IGNORE INTO technician_geofences(organization_id,geofence_id,technician_id,created_by,created_at) VALUES(?,?,?,?,?)').run(ctx.organizationId,geofenceId,technicianId,ctx.userId,now());return this.listTechnicianGeofences(ctx,technicianId)};
p.listTechnicianGeofences=function(ctx,technicianId){requireRole(ctx.role,'read');const tid=clean(technicianId||ctx.userId);return this.db.prepare('SELECT g.id,g.name,g.geometry_json FROM technician_geofences tg JOIN geofences g ON g.id=tg.geofence_id AND g.organization_id=tg.organization_id WHERE tg.organization_id=? AND tg.technician_id=? AND g.enabled=TRUE ORDER BY g.name').all(ctx.organizationId,tid).map(r=>({...r,geometry:JSON.parse(r.geometry_json)}))};
p.checkTechnicianWithinGeofence=function(ctx,d={}){requireRole(ctx.role,'read');const technicianId=clean(d.technicianId||ctx.userId);const lng=Number(d.longitude),lat=Number(d.latitude);if(!Number.isFinite(lng)||!Number.isFinite(lat))throw new Error('GEOFENCE_POINT_INVALID');const rows=this.listTechnicianGeofences(ctx,technicianId);const matches=rows.filter(g=>coversPoint(g.geometry,[lng,lat])).map(g=>({id:g.id,name:g.name,inside:true}));return {schemaVersion:'opscore.technician-geofence.v1',organizationId:ctx.organizationId,technicianId,point:{longitude:lng,latitude:lat},matches,insideAny:matches.length>0}};
/** Technician breadcrumb trail — org-scoped GPS points for field path (multi-sector). */
function ensureTrailTable(db){
  if (db.engine === 'postgres') return;
  db.exec(`CREATE TABLE IF NOT EXISTS technician_location_trail (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    technician_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
    longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
    accuracy_m REAL CHECK(accuracy_m IS NULL OR accuracy_m >= 0),
    recorded_at TEXT NOT NULL,
    appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
    work_order_id TEXT REFERENCES work_orders(id) ON DELETE SET NULL,
    source TEXT NOT NULL DEFAULT 'device' CHECK(source IN ('device','checkin','sync')),
    client_event_id TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(organization_id, technician_id, recorded_at, latitude, longitude)
  );
  CREATE INDEX IF NOT EXISTS idx_tech_trail_org_tech_time ON technician_location_trail(organization_id, technician_id, recorded_at);
  CREATE INDEX IF NOT EXISTS idx_tech_trail_org_time ON technician_location_trail(organization_id, recorded_at);`);
}
p.recordTechnicianTrailPoint=function(ctx,d={}){
  requireRole(ctx.role,'write');
  ensureTrailTable(this.db);
  const technicianId=clean(d.technicianId||ctx.userId);
  const lat=Number(d.latitude), lng=Number(d.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180) throw new Error('TRAIL_COORDINATE_INVALID');
  const accuracy=d.accuracyMeters==null&&d.accuracy_m==null?null:Number(d.accuracyMeters??d.accuracy_m);
  if(accuracy!=null&&(!Number.isFinite(accuracy)||accuracy<0)) throw new Error('TRAIL_ACCURACY_INVALID');
  // Tenant membership: technician must belong to session organization.
  const mem=this.db.prepare('SELECT 1 FROM memberships WHERE organization_id=? AND user_id=?').get(ctx.organizationId,technicianId);
  if(!mem) throw new Error('TECHNICIAN_NOT_FOUND');
  const recordedAt=clean(d.recordedAt||d.recorded_at||now());
  const appointmentId=clean(d.appointmentId||'')||null;
  const workOrderId=clean(d.workOrderId||'')||null;
  if(appointmentId){
    const a=this.db.prepare('SELECT id FROM appointments WHERE id=? AND organization_id=?').get(appointmentId,ctx.organizationId);
    if(!a) throw new Error('NOT_FOUND');
  }
  if(workOrderId){
    const w=this.db.prepare('SELECT id FROM work_orders WHERE id=? AND organization_id=?').get(workOrderId,ctx.organizationId);
    if(!w) throw new Error('NOT_FOUND');
  }
  const source=['device','checkin','sync'].includes(clean(d.source)) ? clean(d.source) : 'device';
  const clientEventId=clean(d.clientEventId||d.client_event_id||'')||null;
  if(clientEventId){
    const prior=this.db.prepare('SELECT * FROM technician_location_trail WHERE organization_id=? AND client_event_id=?').get(ctx.organizationId,clientEventId);
    if(prior) return {schemaVersion:'opscore.tech-trail-point.v1',point:prior,idempotentReplay:true};
  }
  const tid=id('trl'), t=now();
  try{
    this.db.prepare('INSERT INTO technician_location_trail(id,organization_id,technician_id,latitude,longitude,accuracy_m,recorded_at,appointment_id,work_order_id,source,client_event_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(tid,ctx.organizationId,technicianId,lat,lng,accuracy,recordedAt,appointmentId,workOrderId,source,clientEventId,t);
  }catch(e){
    // UNIQUE natural key collision → treat as idempotent
    const hit=this.db.prepare('SELECT * FROM technician_location_trail WHERE organization_id=? AND technician_id=? AND recorded_at=? AND latitude=? AND longitude=?').get(ctx.organizationId,technicianId,recordedAt,lat,lng);
    if(hit) return {schemaVersion:'opscore.tech-trail-point.v1',point:hit,idempotentReplay:true};
    throw e;
  }
  return {schemaVersion:'opscore.tech-trail-point.v1',point:this.db.prepare('SELECT * FROM technician_location_trail WHERE id=?').get(tid)};
};
p.listTechnicianTrail=function(ctx,d={}){
  requireRole(ctx.role,'read');
  ensureTrailTable(this.db);
  const technicianId=clean(d.technicianId||'');
  const from=clean(d.from||d.since||'');
  const to=clean(d.to||d.until||'');
  const limit=Math.min(Math.max(Number(d.limit||500)||500,1),5000);
  let sql='SELECT * FROM technician_location_trail WHERE organization_id=?';
  const args=[ctx.organizationId];
  if(technicianId){sql+=' AND technician_id=?';args.push(technicianId);}
  if(from){sql+=' AND recorded_at>=?';args.push(from);}
  if(to){sql+=' AND recorded_at<=?';args.push(to);}
  sql+=' ORDER BY recorded_at ASC LIMIT ?';args.push(limit);
  const rows=this.db.prepare(sql).all(...args);
  return {schemaVersion:'opscore.tech-trail.v1',organizationId:ctx.organizationId,technicianId:technicianId||null,count:rows.length,points:rows};
};
p.getTechnicianTrailGeoJSON=function(ctx,d={}){
  const list=this.listTechnicianTrail(ctx,d);
  const byTech={};
  for(const pt of list.points){
    (byTech[pt.technician_id]=byTech[pt.technician_id]||[]).push([Number(pt.longitude),Number(pt.latitude)]);
  }
  const features=Object.entries(byTech).map(([tid,coords])=>({
    type:'Feature',
    properties:{technicianId:tid,pointCount:coords.length},
    geometry: coords.length===1 ? {type:'Point',coordinates:coords[0]} : {type:'LineString',coordinates:coords}
  }));
  return {schemaVersion:'opscore.tech-trail-geojson.v1',type:'FeatureCollection',features,count:list.count};
};

/**
 * Load operational geofence polygons for role isolation from:
 * 1) technician_geofences assignments (real table)
 * 2) operational_configs key geofence.role_polygons (GeoJSON FeatureCollection, optional)
 * No invented tables — operational_configs + existing geofences only.
 */
p.listRoleIsolationPolygons=function(ctx){
  requireRole(ctx.role,'read');
  const assigned=this.listTechnicianGeofences(ctx,ctx.userId);
  let configPolys=[];
  try{
    const row=this.db.prepare("SELECT config_value_json FROM operational_configs WHERE organization_id=? AND status='active' AND config_key='geofence.role_polygons' ORDER BY version DESC LIMIT 1").get(ctx.organizationId);
    if(row){
      const parsed=JSON.parse(row.config_value_json||'{}');
      const features=parsed.type==='FeatureCollection'? (parsed.features||[]) : (Array.isArray(parsed)?parsed:[]);
      for(const f of features){
        const roles=f.properties&&Array.isArray(f.properties.roles)?f.properties.roles:[];
        if(roles.length && !roles.includes(ctx.role) && ctx.role!=='admin' && ctx.role!=='owner') continue;
        if(f.geometry&&f.geometry.type==='Polygon') configPolys.push({id:f.id||f.properties&&f.properties.name||'config',name:(f.properties&&f.properties.name)||'role-polygon',geometry:f.geometry,source:'operational_configs'});
      }
    }
  }catch(_){ /* optional config */ }
  return {
    schemaVersion:'opscore.geo-isolation.v1',
    organizationId:ctx.organizationId,
    role:ctx.role,
    polygons:[
      ...assigned.map(g=>({id:g.id,name:g.name,geometry:g.geometry,source:'technician_geofences'})),
      ...configPolys
    ]
  };
};

/**
 * Dual gate: organization from ctx + point must fall inside at least one assigned/config polygon
 * when isolation is enforced (any polygon assigned OR config key present with enforce).
 * Admin/owner bypass spatial gate but still org-scoped by caller queries.
 */
p.assertGeoAccess=function(ctx,longitude,latitude,{enforceIfEmpty=false}={}){
  requireRole(ctx.role,'read');
  const lng=Number(longitude), lat=Number(latitude);
  if(!Number.isFinite(lng)||!Number.isFinite(lat)||lng<-180||lng>180||lat<-90||lat>90)
    throw Object.assign(new Error('GEOFENCE_POINT_INVALID'),{status:422});
  if(ctx.role==='admin'||ctx.role==='owner')
    return {allow:true,bypassed:true,role:ctx.role,point:{longitude:lng,latitude:lat}};
  const pack=this.listRoleIsolationPolygons(ctx);
  if(!pack.polygons.length){
    if(enforceIfEmpty){
      const e=new Error('GEO_SCOPE_EMPTY'); e.status=403; throw e;
    }
    return {allow:true,enforced:false,point:{longitude:lng,latitude:lat},matches:[]};
  }
  const matches=pack.polygons.filter(g=>coversPoint(g.geometry,[lng,lat]));
  if(!matches.length){
    const e=new Error('GEO_SCOPE_FORBIDDEN');
    e.status=403;
    e.details={point:{longitude:lng,latitude:lat},polygonCount:pack.polygons.length};
    throw e;
  }
  return {allow:true,enforced:true,point:{longitude:lng,latitude:lat},matches:matches.map(m=>({id:m.id,name:m.name,source:m.source}))};
};

/**
 * Filter work-order / appointment candidates by site coordinates against role polygons.
 * Expects rows with site_longitude/site_latitude or longitude/latitude.
 */
p.filterByGeoScope=function(ctx,rows){
  if(!Array.isArray(rows)||!rows.length) return rows;
  if(ctx.role==='admin'||ctx.role==='owner') return rows;
  const pack=this.listRoleIsolationPolygons(ctx);
  if(!pack.polygons.length) return rows;
  return rows.filter(r=>{
    const lng=Number(r.site_longitude??r.longitude??r.lng);
    const lat=Number(r.site_latitude??r.latitude??r.lat);
    if(!Number.isFinite(lng)||!Number.isFinite(lat)) return false;
    return pack.polygons.some(g=>coversPoint(g.geometry,[lng,lat]));
  });
};

/**
 * Dynamic geo-grid / bounding-box query (org-scoped).
 * Filters sites + appointment check-ins + trail points to visible viewport only.
 * Uses parameterized range predicates (R-Tree friendly when spatial indexes exist on lat/lon).
 */
p.listMapViewport=function(ctx,d={}){
  requireRole(ctx.role,'read');
  const bbox=Array.isArray(d.bbox)?d.bbox:null;
  const west=Number(d.west??d.minLng??(bbox?bbox[0]:undefined));
  const south=Number(d.south??d.minLat??(bbox?bbox[1]:undefined));
  const east=Number(d.east??d.maxLng??(bbox?bbox[2]:undefined));
  const north=Number(d.north??d.maxLat??(bbox?bbox[3]:undefined));
  if(![west,south,east,north].every(Number.isFinite))
    throw Object.assign(new Error('VIEWPORT_BBOX_INVALID'),{status:422});
  if(west<-180||east>180||south<-90||north>90||west>east||south>north)
    throw Object.assign(new Error('VIEWPORT_BBOX_INVALID'),{status:422});
  const limit=Math.min(Math.max(Number(d.limit||500)||500,1),2000);
  const sites=this.db.prepare(
    `SELECT id,name,latitude,longitude,customer_id,address FROM sites
     WHERE organization_id=? AND latitude IS NOT NULL AND longitude IS NOT NULL
       AND longitude>=? AND longitude<=? AND latitude>=? AND latitude<=?
     ORDER BY name LIMIT ?`
  ).all(ctx.organizationId, west, east, south, north, limit);
  const checkins=this.db.prepare(
    `SELECT a.id appointment_id,a.technician_id,a.checkin_latitude latitude,a.checkin_longitude longitude,
            a.checkin_accuracy_m accuracy_m,a.checked_in_at,a.work_order_id,a.status
     FROM appointments a
     WHERE a.organization_id=? AND a.checkin_latitude IS NOT NULL AND a.checkin_longitude IS NOT NULL
       AND a.checkin_longitude>=? AND a.checkin_longitude<=? AND a.checkin_latitude>=? AND a.checkin_latitude<=?
     ORDER BY a.checked_in_at DESC LIMIT ?`
  ).all(ctx.organizationId, west, east, south, north, limit);
  let trail=[];
  try{
    ensureTrailTable(this.db);
    trail=this.db.prepare(
      `SELECT id,technician_id,latitude,longitude,accuracy_m,recorded_at,work_order_id
       FROM technician_location_trail
       WHERE organization_id=? AND longitude>=? AND longitude<=? AND latitude>=? AND latitude<=?
       ORDER BY recorded_at DESC LIMIT ?`
    ).all(ctx.organizationId, west, east, south, north, limit);
  }catch(_){ trail=[]; }
  // Optional geo-scope filter for non-admin
  let payload={sites,checkins,trail};
  if(ctx.role!=='admin'&&ctx.role!=='owner'){
    const pack=this.listRoleIsolationPolygons(ctx);
    if(pack.polygons.length){
      const inside=(lng,lat)=>pack.polygons.some(g=>coversPoint(g.geometry,[lng,lat]));
      payload={
        sites:sites.filter(s=>inside(Number(s.longitude),Number(s.latitude))),
        checkins:checkins.filter(c=>inside(Number(c.longitude),Number(c.latitude))),
        trail:trail.filter(t=>inside(Number(t.longitude),Number(t.latitude)))
      };
    }
  }
  return {
    schemaVersion:'opscore.map-viewport.v1',
    organizationId:ctx.organizationId,
    bbox:{west,south,east,north},
    counts:{sites:payload.sites.length,checkins:payload.checkins.length,trail:payload.trail.length},
    ...payload
  };
};

}
module.exports={attach,normalizeGeo,coversPoint};
