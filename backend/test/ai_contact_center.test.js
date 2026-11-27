'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { openDb, CURRENT_SCHEMA_VERSION } = require('../src/db');
const cc = require('../src/ai-contact-center');

const env = {
  OPSC_CONTACT_CENTER_ENABLED: 'true',
  OPSC_CONTACT_CENTER_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
  OPSC_CONTACT_CENTER_ENCRYPTION_KEY_ID: 'test-v1',
  OPSC_CONTACT_CENTER_MIN_CONFIDENCE: '0.76',
  AI_PROVIDER: 'openai'
};
function setup() {
  const db = openDb(':memory:');
  const stamp = new Date().toISOString();
  db.prepare('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)').run('org_a','Tenant A',stamp);
  db.prepare('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)').run('org_b','Tenant B',stamp);
  db.prepare('INSERT INTO users (id,email,password_hash,status,created_at) VALUES (?,?,?,?,?)').run('user_a','a@example.test','not-a-real-hash','active',stamp);
  db.prepare('INSERT INTO users (id,email,password_hash,status,created_at) VALUES (?,?,?,?,?)').run('user_agent','agent@example.test','not-a-real-hash','active',stamp);
  db.prepare('INSERT INTO users (id,email,password_hash,status,created_at) VALUES (?,?,?,?,?)').run('user_peer','peer@example.test','not-a-real-hash','active',stamp);
  db.prepare('INSERT INTO users (id,email,password_hash,status,created_at) VALUES (?,?,?,?,?)').run('user_b','b@example.test','not-a-real-hash','active',stamp);
  db.prepare('INSERT INTO memberships (user_id,organization_id,role,created_at) VALUES (?,?,?,?)').run('user_a','org_a','member',stamp);
  db.prepare('INSERT INTO memberships (user_id,organization_id,role,created_at) VALUES (?,?,?,?)').run('user_agent','org_a','manager',stamp);
  db.prepare('INSERT INTO memberships (user_id,organization_id,role,created_at) VALUES (?,?,?,?)').run('user_peer','org_a','member',stamp);
  db.prepare('INSERT INTO memberships (user_id,organization_id,role,created_at) VALUES (?,?,?,?)').run('user_b','org_b','member',stamp);
  return { db, ctx:{organizationId:'org_a',userId:'user_a',role:'member'}, peer:{organizationId:'org_a',userId:'user_peer',role:'member'}, agent:{organizationId:'org_a',userId:'user_agent',role:'manager'}, other:{organizationId:'org_b',userId:'user_b',role:'member'} };
}
test('catalog has 105 unique target languages and never claims qualification without acceptance evidence', () => {
  const summary = cc.languageSummary();
  assert.equal(summary.sourceRows,105);
  assert.equal(summary.uniqueLanguageCodes,105);
  for (const code of ['ms','sw','hy','uz','my','ml','es','sr','te']) {
    assert.equal(cc.getLanguage(code), null, `${code} must not be supported in the 105-locale runtime`);
  }
  assert.deepEqual(summary.duplicateRows,[]);
  assert.equal(summary.qualifiedForProduction,0);
  // The active 105-locale manifest uses canonical codes; do not assert legacy
  // catalogue entries that are not shipped or exposed by the UI.
  assert.equal(cc.getLanguage('zh').name,'Mandarin Chinese');
  assert.equal(cc.getLanguage('zh').duplicateOf,null);
  assert.equal(cc.getLanguage('ar').dir,'rtl');
  assert.equal(cc.getLanguage('cy'),null);
  assert.equal(cc.getLanguage('fo'),null);
});
test('feature fails closed and encryption requires a valid 32-byte key', () => {
  assert.throws(()=>cc.createConversation({},{organizationId:'org_a',userId:'user_a'},{consentAccepted:true,languageCode:'en'},{}),e=>e.message==='CONTACT_CENTER_DISABLED');
  assert.throws(()=>cc.keyFromEnv({OPSC_CONTACT_CENTER_ENCRYPTION_KEY:'1234'}),e=>e.message==='CONTACT_CENTER_ENCRYPTION_NOT_CONFIGURED');
});
test('message ciphertext is encrypted, authenticated and scoped to row context', () => {
  const input='My account email is private@example.test and my support issue is urgent';
  const aad={organizationId:'org_a',conversationId:'cc_test',messageId:'ccm_test',actorType:'customer',languageCode:'en',encryptionKeyId:'test-v1'};
  const enc=cc.encryptContent(input,env,[aad.organizationId,aad.conversationId,aad.messageId,aad.actorType,aad.languageCode,aad.encryptionKeyId].join('|'));
  assert.equal(enc.content_ciphertext.includes('private@example.test'),false);
  assert.equal(cc.decryptContent({id:aad.messageId,organization_id:aad.organizationId,conversation_id:aad.conversationId,actor_type:aad.actorType,language_code:aad.languageCode,...enc},env),input);
  assert.throws(()=>cc.decryptContent({id:aad.messageId,organization_id:'org_b',conversation_id:aad.conversationId,actor_type:aad.actorType,language_code:aad.languageCode,...enc},env),e=>e.message==='CONTACT_CENTER_CIPHERTEXT_INTEGRITY_FAILURE');
});
test('encrypted transcripts remain decryptable during controlled key rotation', () => {
  const oldKey = crypto.randomBytes(32).toString('hex');
  const newKey = crypto.randomBytes(32).toString('hex');
  const oldEnv = { ...env, OPSC_CONTACT_CENTER_ENCRYPTION_KEY: oldKey, OPSC_CONTACT_CENTER_ENCRYPTION_KEY_ID: 'v1' };
  const oldAad = ['org_a','cc_rotation','ccm_rotation','customer','en','v1'].join('|');
  const encrypted = cc.encryptContent('legacy transcript', oldEnv, oldAad);
  const row = { id:'ccm_rotation', organization_id:'org_a', conversation_id:'cc_rotation', actor_type:'customer', language_code:'en', ...encrypted };
  const newEnv = { ...env, OPSC_CONTACT_CENTER_ENCRYPTION_KEY:newKey, OPSC_CONTACT_CENTER_ENCRYPTION_KEY_ID:'v2', OPSC_CONTACT_CENTER_ENCRYPTION_KEYS_JSON:JSON.stringify({v1:oldKey}) };
  assert.equal(cc.decryptContent(row, newEnv), 'legacy transcript');
  assert.throws(() => cc.decryptContent(row, { ...newEnv, OPSC_CONTACT_CENTER_ENCRYPTION_KEYS_JSON:'not-json' }), e => e.message === 'CONTACT_CENTER_ENCRYPTION_KEYRING_INVALID');
  assert.throws(() => cc.decryptContent(row, { ...newEnv, OPSC_CONTACT_CENTER_ENCRYPTION_KEYS_JSON:'{}' }), e => e.message === 'CONTACT_CENTER_ENCRYPTION_KEY_UNAVAILABLE');
});

test('conversation consent, encryption persistence, tenant isolation and erase workflow', () => {
  const {db,ctx,other,peer}=setup();
  try {
    assert.throws(()=>cc.createConversation(db,ctx,{channel:'web_chat',languageCode:'en',consentAccepted:false},env),e=>e.message==='CONTACT_CENTER_CONSENT_REQUIRED');
    const conv=cc.createConversation(db,ctx,{channel:'web_chat',languageCode:'en',consentAccepted:true},env);
    assert.equal(conv.status,'active');
    assert.throws(()=>cc.getConversation(db,other,conv.id,env),e=>e.message==='CONTACT_CENTER_CONVERSATION_NOT_FOUND');
    assert.throws(()=>cc.getConversation(db,peer,conv.id,env),e=>e.message==='CONTACT_CENTER_CONVERSATION_ACCESS_DENIED');
    assert.rejects(()=>cc.processTextMessage(db,peer,conv.id,{content:'Read this private conversation',clientMessageId:'peer:message-00001'},env),e=>e.message==='CONTACT_CENTER_CONVERSATION_ACCESS_DENIED');
    const raw='My email is private@example.test';
    cc.storeMessage(db,ctx,cc.findConversation(db,ctx.organizationId,conv.id),{actorType:'customer',content:raw,clientMessageId:'test:message-0001'},env);
    const stored=db.prepare('SELECT * FROM ai_contact_messages WHERE conversation_id=?').get(conv.id);
    assert.equal(stored.content_ciphertext.includes('private@example.test'),false);
    assert.equal(cc.getMessages(db,ctx,conv.id,env)[0].content,raw);
    const erased=cc.eraseConversation(db,ctx,conv.id,'privacy_test');
    assert.equal(erased.status,'erased');
    assert.equal(db.prepare('SELECT count(*) AS n FROM ai_contact_messages WHERE conversation_id=?').get(conv.id).n,0);
    assert.equal(cc.getConversation(db,ctx,conv.id,env).messages.length,0);
  } finally { db.close(); }
});
test('explicit human request bypasses AI call, queues exactly one handoff and duplicate request is idempotent', async () => {
  const {db,ctx}=setup();
  try {
    const conv=cc.createConversation(db,ctx,{channel:'web_chat',languageCode:'en',consentAccepted:true},env);
    const first=await cc.processTextMessage(db,ctx,conv.id,{content:'I want to speak to a human representative',clientMessageId:'web:human-request-0001'},env);
    assert.equal(first.status,'waiting_human');
    assert.equal(first.handoff.status,'queued');
    assert.equal(first.handoff.reasonCode,'customer_requested_human');
    const second=await cc.processTextMessage(db,ctx,conv.id,{content:'I want to speak to a human representative',clientMessageId:'web:human-request-0001'},env);
    assert.equal(second.duplicate,true);
    assert.equal(db.prepare('SELECT count(*) AS n FROM ai_contact_handoffs WHERE conversation_id=?').get(conv.id).n,1);
  } finally { db.close(); }
});
test('human handoff claim is tenant-bound, one-assignee and human reply requires assignment', () => {
  const {db,ctx,agent,other}=setup();
  try {
    const conv=cc.createConversation(db,ctx,{channel:'web_chat',languageCode:'ar',consentAccepted:true},env);
    const handoff=cc.createHandoff(db,ctx,conv.id,'low_confidence','Confidence below threshold.','ai','high');
    assert.equal(handoff.status,'queued');
    assert.throws(()=>cc.claimHandoff(db,other,handoff.id),e=>e.message==='CONTACT_CENTER_HANDOFF_NOT_FOUND');
    const claimed=cc.claimHandoff(db,agent,handoff.id);
    assert.equal(claimed.status,'claimed');
    assert.throws(()=>cc.postHumanReply(db,ctx,conv.id,{content:'Unauthorized reply',clientMessageId:'human:unauth-0001'},env),e=>e.message==='CONTACT_CENTER_HUMAN_ASSIGNMENT_REQUIRED');
    const reply=cc.postHumanReply(db,agent,conv.id,{content:'I will help with this case.',clientMessageId:'human:reply-000001'},env);
    assert.equal(reply.actorType,'human');
    assert.equal(cc.getConversation(db,agent,conv.id,env).messages.at(-1).actorType,'human');
    assert.equal(cc.resolveHandoff(db,agent,handoff.id,'Resolved').status,'completed');
    assert.equal(cc.getConversation(db,agent,conv.id,env).status,'resolved');
  } finally { db.close(); }
});
test('handoff notes redact common contact data and secret-shaped strings before plaintext storage', () => {
  const {db,ctx}=setup();
  try {
    const conv=cc.createConversation(db,ctx,{channel:'web_chat',languageCode:'en',consentAccepted:true},env);
    const handoff=cc.createHandoff(db,ctx,conv.id,'other','Contact private@example.test at +1 (555) 123-4567; key sk-abcdefghijklmnop','customer','high');
    const row=db.prepare('SELECT reason_detail FROM ai_contact_handoffs WHERE id=?').get(handoff.id);
    assert.equal(row.reason_detail.includes('private@example.test'),false);
    assert.equal(row.reason_detail.includes('555'),false);
    assert.equal(row.reason_detail.includes('sk-abcdefghijklmnop'),false);
    assert.match(row.reason_detail,/redacted-email/);
  } finally { db.close(); }
});

test('policy escalates explicit requests, high-risk answers and low-confidence responses', () => {
  assert.equal(cc.policyDecision('Please speak to a human', {confidence:.99,riskLevel:'low',requiresHuman:false,handoffReason:'none'},env).reasonCode,'customer_requested_human');
  assert.equal(cc.policyDecision('How can I reset my plan?', {confidence:.99,riskLevel:'critical',requiresHuman:false,handoffReason:'none'},env).reasonCode,'high_risk');
  assert.equal(cc.policyDecision('I need help', {confidence:.30,riskLevel:'low',requiresHuman:false,handoffReason:'none'},env).reasonCode,'low_confidence');
});
test('CRM customer linking is explicit, supervisor-only and tenant-bound', () => {
  const {db,ctx,agent,other}=setup();
  const stamp=new Date().toISOString();
  try {
    const conv=cc.createConversation(db,ctx,{channel:'web_chat',languageCode:'en',consentAccepted:true},env);
    db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?,?)').run('cus_test123','org_a','Verified Customer','customer@example.test','+15550001111','crm-ref-1','active',stamp,stamp);
    db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?,?)').run('cus_other123','org_b','Other Tenant Customer','other@example.test',null,'crm-ref-2','active',stamp,stamp);
    assert.deepEqual(cc.listCrmCustomers(db,agent,'verified').map(x=>x.id),['cus_test123']);
    assert.throws(()=>cc.listCrmCustomers(db,agent,'x'),e=>e.message==='SEARCH_QUERY_TOO_SHORT');
    assert.throws(()=>cc.listCrmCustomers(db,ctx,'verified'),e=>e.message==='FORBIDDEN');
    const otherSupervisor={...other,role:'manager'};
    assert.throws(()=>cc.linkConversationCustomer(db,otherSupervisor,conv.id,'cus_other123'),e=>e.message==='CONTACT_CENTER_CONVERSATION_NOT_FOUND');
    assert.throws(()=>cc.linkConversationCustomer(db,agent,conv.id,'cus_other123'),e=>e.message==='INVALID_CUSTOMER');
    assert.throws(()=>db.prepare('UPDATE ai_contact_conversations SET customer_id=? WHERE id=?').run('cus_other123',conv.id),/CONTACT_CENTER_CUSTOMER_TENANT_MISMATCH/);
    const linked=cc.linkConversationCustomer(db,agent,conv.id,'cus_test123');
    assert.equal(linked.linked,true);
    assert.equal(cc.getConversationCustomer(db,agent,conv.id).customer.email,'customer@example.test');
    assert.equal(cc.getConversation(db,agent,conv.id,env).customerId,'cus_test123');
    const audit=db.prepare("SELECT action FROM audit_log WHERE organization_id=? AND resource_id=? ORDER BY created_at DESC").all('org_a',conv.id);
    assert.ok(audit.some(x=>x.action==='contact_center_crm_customer_linked'));
    cc.eraseConversation(db,ctx,conv.id);
    assert.equal(cc.getConversationCustomer(db,agent,conv.id).linked,false);
    assert.throws(()=>cc.linkConversationCustomer(db,agent,conv.id,'cus_test123'),e=>e.message==='CONTACT_CENTER_CONVERSATION_CLOSED');
  } finally { db.close(); }
});
test('supervisor reassignment is atomic, eligible-agent-only and audited', () => {
  const {db,ctx,agent,peer}=setup();
  try {
    const conv=cc.createConversation(db,ctx,{channel:'web_chat',languageCode:'en',consentAccepted:true},env);
    const handoff=cc.createHandoff(db,ctx,conv.id,'high_risk','High-risk request requires specialist review.','policy','urgent');
    const reassigned=cc.reassignHandoff(db,agent,handoff.id,{assignedTo:'user_peer',reason:'Transfer to available trained operator'});
    assert.equal(reassigned.status,'claimed');
    assert.equal(reassigned.assignedTo,'user_peer');
    assert.equal(db.prepare('SELECT assigned_to FROM ai_contact_handoffs WHERE id=?').get(handoff.id).assigned_to,'user_peer');
    assert.equal(db.prepare('SELECT assigned_to FROM ai_contact_conversations WHERE id=?').get(conv.id).assigned_to,'user_peer');
    assert.equal(cc.reassignHandoff(db,agent,handoff.id,{assignedTo:'user_peer',reason:'Repeat the same assignment safely'}).duplicate,true);
    db.prepare("UPDATE ai_contact_conversations SET assigned_to='user_a',status='active' WHERE id=?").run(conv.id);
    const reconciled=cc.reassignHandoff(db,agent,handoff.id,{assignedTo:'user_peer',reason:'Reconcile the existing assignment state'});
    assert.equal(reconciled.duplicate,false);
    assert.equal(db.prepare('SELECT assigned_to,status FROM ai_contact_conversations WHERE id=?').get(conv.id).assigned_to,'user_peer');
    assert.equal(db.prepare('SELECT status FROM ai_contact_conversations WHERE id=?').get(conv.id).status,'waiting_human');
    assert.throws(()=>cc.reassignHandoff(db,peer,handoff.id,{assignedTo:'user_agent',reason:'Attempt unauthorized reassignment'}),e=>e.message==='FORBIDDEN');
    assert.throws(()=>cc.reassignHandoff(db,agent,handoff.id,{assignedTo:'user_b',reason:'Cross-tenant assignment test'}),e=>e.message==='INVALID_ASSIGNEE');
    const events=db.prepare("SELECT action,metadata_json FROM audit_log WHERE organization_id=? AND resource_id=? AND action='contact_center_handoff_reassigned' ORDER BY created_at").all('org_a',handoff.id);
    assert.equal(events.length,2);
    assert.ok(events.every(event=>event.action==='contact_center_handoff_reassigned'));
    assert.match(events[1].metadata_json,/user_a/);
    assert.equal(cc.listEligibleAgents(db,agent).some(x=>x.id==='user_peer'),true);
    assert.equal(cc.listEligibleAgents(db,agent).find(x=>x.id==='user_peer').email,'peer@example.test');
    assert.equal(cc.listEligibleAgents(db,agent).some(x=>x.id==='user_b'),false);
    const closedConversation=cc.createConversation(db,ctx,{channel:'web_chat',languageCode:'en',consentAccepted:true},env);
    const closedHandoff=cc.createHandoff(db,ctx,closedConversation.id,'high_risk','Closed case reassignment guard test.','policy','urgent');
    db.prepare("UPDATE ai_contact_conversations SET status='resolved' WHERE id=?").run(closedConversation.id);
    assert.throws(()=>cc.reassignHandoff(db,agent,closedHandoff.id,{assignedTo:'user_peer',reason:'Do not reassign a resolved case'}),e=>e.message==='CONTACT_CENTER_HANDOFF_NOT_REASSIGNABLE');
  } finally { db.close(); }
});
test('database schema was upgraded with contact-center persistence tables', () => {
  const {db}=setup();
  try {
    assert.equal(CURRENT_SCHEMA_VERSION,29);
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ai_contact_%'").all().map(x=>x.name).sort();
    assert.deepEqual(tables,['ai_contact_conversations','ai_contact_handoffs','ai_contact_messages']);
    const conversationColumns=db.prepare('PRAGMA table_info(ai_contact_conversations)').all().map(x=>x.name);
    assert.ok(conversationColumns.includes('customer_id'));
  } finally { db.close(); }
});
