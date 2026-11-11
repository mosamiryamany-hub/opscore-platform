const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const required=['App.js','src/api.js','src/auth.js','src/db.js','src/id.js','src/sync.js','src/sync-result.js','app.json','package.json','eas.json','backend-patch/server.mobile-login.diff'];
let fail=0;function check(name,ok){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)fail++;}
for(const f of required)check(`file:${f}`,fs.existsSync(path.join(root,f)));
const app=fs.readFileSync(path.join(root,'App.js'),'utf8');const api=fs.readFileSync(path.join(root,'src/api.js'),'utf8');
check('appointment lookup uses technician-scoped API',/appointments\s*:\s*\(\s*params\s*=\s*\{\s*\}\s*\)/.test(api)&&api.includes('/api/v1/appointments'));
check('offline check-in requires a real appointment id',app.includes("appointment_checkin")&&app.includes('appointment.id'));check('queued field actions attempt immediate sync',app.includes('await enqueue(')&&app.includes('await flushQueue()'));
check('no fake GPS persistence claim',!app.includes('GPS uploaded')&&!app.includes('GPS persisted')&&!app.includes('mobile_checkin_latitude'));
check('GPS is persisted through appointment check-in only',app.includes('appointment_checkin')&&app.includes('appointmentId:appointment.id'));check('appointment check-in sync entity is the appointment id',app.includes("queue('appointment_checkin',{appointmentId:appointment.id")&&app.includes("},appointment.id);"));
check('mobile login contract present',api.includes("/api/v1/auth/mobile-login"));
check('today mission API wired',api.includes('/api/v1/field/today')&&app.includes('api.fieldToday'));
check('evidence storage is encrypted at rest',fs.readFileSync(path.join(root,'src/db.js'),'utf8').includes('content_ciphertext')&&fs.readFileSync(path.join(root,'src/local-crypto.js'),'utf8').includes('AES-GCM'));check('legacy evidence migration encrypts before dropping old table',fs.readFileSync(path.join(root,'src/db.js'),'utf8').includes('SELECT id,scope,work_order_id,file_name,media_type,content_base64,status,last_error,created_at,updated_at FROM evidence_local_v2')&&fs.readFileSync(path.join(root,'src/db.js'),'utf8').includes('encryptLocalEvidence(row.content_base64')&&fs.readFileSync(path.join(root,'src/db.js'),'utf8').includes('DROP TABLE IF EXISTS evidence_local_v2'));check('server-bound signoff challenge is required',fs.readFileSync(path.join(root,'src/signoff-assurance.js'),'utf8').includes('SERVER_SIGNOFF_CHALLENGE_REQUIRED'));check('sync retry is scheduled, not sleeping in flush loop',!fs.readFileSync(path.join(root,'src/sync.js'),'utf8').includes('setTimeout(r=>setTimeout')&&!fs.readFileSync(path.join(root,'src/sync.js'),'utf8').includes('const delayMs'));check('sync database access awaits expo sqlite handle',fs.readFileSync(path.join(root,'src/db.js'),'utf8').includes('operation(await getDb())'));check('sync result recovery contract wired',fs.existsSync(path.join(root,'src/sync-result.js'))&&fs.existsSync(path.join(root,'docs/REPRODUCIBLE_BUILDS.md')));check('sync center exposes queued failures',app.includes('last_error')&&app.includes('SyncCenter'));
check('on-my-way action wired',api.includes('/on-my-way')&&app.includes('api.onMyWay'));check('offline on-my-way uses its own sync operation',app.includes("queue('appointment_on_my_way',{},appointment.id)"));check('client event IDs use cryptographic randomness without Math.random',fs.readFileSync(path.join(root,'src/id.js'),'utf8').includes('crypto.getRandomValues')&&!fs.readFileSync(path.join(root,'src/id.js'),'utf8').includes('Math.random'));
check('completion package wired',api.includes('/completion-package')&&app.includes('api.completionPackage'));
check('mission cache wired for offline viewing',app.includes('saveMissionCache')&&app.includes('getMissionCache'));
check('safety acknowledgement is manual',app.includes('safetyAnswers')&&app.includes('Submit safety checklist')&&!app.includes('const answers=c.items.map(x=>({itemId:x.id,value:true}))'));
check('device navigation wired to external maps',app.includes('Linking.openURL')&&app.includes('site_latitude'));
check('mobile safety API wired',api.includes('/api/v1/safety-checklists')&&api.includes('/api/v1/safety-acknowledgements'));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));check(`version ${pkg.version}`,pkg.version==='0.1.16');
check('mobile package is private and cannot be published accidentally',pkg.private===true);
const cfg=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));check('app version matches package',cfg.expo.version===pkg.version);check('field check-in contract documented',fs.existsSync(path.join(root,'docs/FIELD_CHECKIN_CONTRACT.md')));

check('server-bound signoff API helpers wired',api.includes('/signoff-assurance/challenge')&&api.includes('/signoff-assurance/complete')&&app.includes('api.signoffChallenge')&&app.includes('api.signoffAssuranceComplete'));

const dbSource=fs.readFileSync(path.join(root,'src/db.js'),'utf8');
const authSource=fs.readFileSync(path.join(root,'src/auth.js'),'utf8');
const syncSource=fs.readFileSync(path.join(root,'src/sync.js'),'utf8');
const cryptoSource=fs.readFileSync(path.join(root,'src/local-crypto.js'),'utf8');
check('mobile identity scope uses explicit user and organization ids',authSource.includes('value?.userId || value?.user?.id')&&authSource.includes('value?.organizationId || value?.organization?.id'));
check('server mobile login includes explicit identity ids',fs.readFileSync(path.join(root,'../backend/src/server.js'),'utf8').includes('organizationId: out.organizationId || out.organization?.id'));
check('generic sync payloads and mission cache are encrypted',dbSource.includes('encryptPayloadText(payload, queueAad(scope, eventId))')&&dbSource.includes('encryptPayloadText(JSON.stringify(mission), missionAad(scope))')&&cryptoSource.includes("name: 'AES-GCM'"));
check('legacy plaintext attachment queue is migrated to encrypted evidence',dbSource.includes("WHERE operation='attachment'")&&dbSource.includes('migrateLegacyAttachmentEvents(db)')&&dbSource.includes('encryptLocalEvidence(payload.contentBase64, aad)'));
check('new photo capture does not enqueue base64 as generic attachment',app.includes('evidenceEnqueue({id:localId')&&!app.includes("queue('attachment'"));
check('evidence retry uses stable idempotency key and auth snapshot',syncSource.includes('api.attachment(row.work_order_id')&&syncSource.includes('}, row.id, auth)'));
check('failed queue retry SQL uses correct placeholder count',dbSource.includes("VALUES(?,?,?,?,?,?,?,'pending',?)"));
check('signout requests server token revocation',api.includes("request('/api/v1/auth/logout'")&&app.includes('remoteRevoked'));
check('request timeout aborts fetch even with caller signal',api.includes('signal: controller.signal')&&api.includes('externalSignal?.addEventListener'));
check('API base rejects credentials, paths, queries and non-HTTPS origins',api.includes('API_BASE_URL_MUST_BE_ORIGIN_ONLY')&&api.includes('parsed.username')&&api.includes("parsed.protocol !== 'https:'"));
check('successful non-JSON responses fail explicitly',api.includes('if (invalidJson)')&&api.includes("new Error('INVALID_SERVER_JSON')"));
check('AES key initialization is single-flight across concurrent operations',cryptoSource.includes('let keyPromise = null')&&cryptoSource.includes('if (!keyPromise)'));
check('offline boot seeds display identity from normalized secure auth',app.includes('setMe({user:a.user,organization:a.organization,role:a.role})')&&app.includes("e.status===401||e.status===403"));
check('photo preview does not retain Base64 field in component state',app.includes('setPhoto({uri:x.uri})'));

check('sync center displays backoff queue entries and reports full count',dbSource.includes('export async function pendingAll')&&dbSource.includes('export async function pendingCount')&&syncSource.includes('pendingCount(scope)'));



// Evaluate the final status only after every security and reliability assertion above has run.
process.exitCode = fail ? 1 : 0;
