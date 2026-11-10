'use strict';
function model(){ const value=String(process.env.OPENAI_EMBEDDING_MODEL||'').trim(); if(!value) throw new Error('AI_EMBEDDING_MODEL_REQUIRED'); return value; }
async function embed(text){
  const key=String(process.env.OPENAI_API_KEY||'').trim(); if(!key) throw Object.assign(new Error('AI_PROVIDER_NOT_CONFIGURED'),{code:'AI_PROVIDER_NOT_CONFIGURED'});
  const input=String(text||'').slice(0,20000); if(!input) throw new Error('EMBEDDING_INPUT_EMPTY');
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
  try{const r=await fetch('https://api.openai.com/v1/embeddings',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model:model(),input}),signal:controller.signal});const raw=await r.text();let d;try{d=JSON.parse(raw)}catch{throw new Error('EMBEDDING_PROVIDER_INVALID_JSON')}if(!r.ok)throw new Error(`EMBEDDING_PROVIDER_HTTP_${r.status}`);const v=d?.data?.[0]?.embedding;if(!Array.isArray(v)||!v.length||v.some(x=>typeof x!=='number'||!Number.isFinite(x)))throw new Error('EMBEDDING_PROVIDER_INVALID_VECTOR');return {model:model(),vector:v};}finally{clearTimeout(timer)}
}
module.exports={embed,model};
