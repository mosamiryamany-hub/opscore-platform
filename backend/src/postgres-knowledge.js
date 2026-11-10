'use strict';
const crypto=require('node:crypto');
const {embed,model}=require('./ai-embeddings');
function sha(v){return crypto.createHash('sha256').update(String(v),'utf8').digest('hex');}
async function ensure(pool){
  const r=await pool.query(`SELECT to_regclass('public.opscore_knowledge_chunks') AS table_name, EXISTS (SELECT 1 FROM pg_extension WHERE extname='vector') AS vector_installed`);
  if(!r.rows[0]?.table_name || !r.rows[0]?.vector_installed) throw new Error('KNOWLEDGE_SCHEMA_NOT_READY');
}
async function upsert(pool,{organizationId,sourceType,sourceId,content,metadata={}}){await ensure(pool);const e=await embed(content);const vector=`[${e.vector.join(',')}]`;const q=`INSERT INTO opscore_knowledge_chunks(organization_id,source_type,source_id,content,content_sha256,embedding,metadata_json) VALUES($1,$2,$3,$4,$5,$6::vector,$7::jsonb) ON CONFLICT(organization_id,source_type,source_id,content_sha256) DO UPDATE SET embedding=EXCLUDED.embedding,metadata_json=EXCLUDED.metadata_json,updated_at=now() RETURNING id,created_at,updated_at`;const r=await pool.query(q,[organizationId,sourceType,sourceId,String(content),sha(content),vector,JSON.stringify(metadata)]);return{...r.rows[0],model:model(),contentSha256:sha(content)};}
async function search(pool,{organizationId,query,limit=10}){await ensure(pool);const e=await embed(query),vector=`[${e.vector.join(',')}]`,n=Math.max(1,Math.min(Number(limit)||10,50));const r=await pool.query(`SELECT id,source_type,source_id,content,content_sha256,metadata_json,1-(embedding <=> $2::vector) AS similarity FROM opscore_knowledge_chunks WHERE organization_id=$1 AND embedding IS NOT NULL ORDER BY embedding <=> $2::vector LIMIT $3`,[organizationId,vector,n]);return{schemaVersion:'opscore.knowledge-search.v1',model:e.model,items:r.rows};}
module.exports={ensure,upsert,search};
