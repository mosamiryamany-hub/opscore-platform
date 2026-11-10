const crypto = require('node:crypto');
function configuredModel() { return String(process.env.OPENAI_MODEL || '').trim(); }
const MAX_CONTEXT_CHARS = 20000;
const MAX_OUTPUT_TOKENS = 1200;

function redactText(value) {
  return String(value ?? '').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]').replace(/https?:\/\/[^\s]+/gi, '[redacted-url]').replace(/(?<!\w)\+?\d[\d ()\-]{7,}\d(?!\w)/g, (m) => (m.replace(/\D/g, '').length >= 10 ? '[redacted-phone]' : m));
}
function prepareContext(context) {
  const financialIncluded = String(process.env.AI_INCLUDE_FINANCIAL_CONTEXT || '').toLowerCase() === 'true';
  const identifiersIncluded = String(process.env.AI_INCLUDE_IDENTIFIERS || '').toLowerCase() === 'true';
  const work = context.workOrder || {};
  const prepared = {
    schemaVersion: context.schemaVersion,
    workOrder: {
      ...(identifiersIncluded ? { id: work.id } : {}),
      number: work.number, title: redactText(work.title), description: redactText(work.description), status: work.status, priority: work.priority,
      due_at: work.due_at, created_at: work.created_at, updated_at: work.updated_at, team_name: redactText(work.team_name)
    },
    timeline: Array.isArray(context.timeline) ? context.timeline.map(e => ({ at:e.at, type:e.type, source:e.source, message:redactText(e.message) })) : [],
    completion: { ready:Boolean(context.completion?.ready), blockers:(context.completion?.blockers || []).map(redactText) },
    labor: { totalMinutes:Number(context.labor?.totalMinutes || 0) }
  };
  if (financialIncluded) prepared.financial = context.financial ? { ...context.financial } : null;
  return prepared;
}

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    currentState: { type: 'string' },
    blockers: { type: 'array', items: { type: 'string' } },
    nextActions: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    evidenceGaps: { type: 'array', items: { type: 'string' } },
    disclaimer: { type: 'string' }
  },
  required: ['summary','currentState','blockers','nextActions','risks','evidenceGaps','disclaimer']
};
function aiStatus() {
  const provider = String(process.env.AI_PROVIDER || '').trim().toLowerCase();
  return {
    schemaVersion: 'opscore.ai-provider-status.v1',
    enabled: provider === 'openai' && Boolean(process.env.OPENAI_API_KEY) && Boolean(configuredModel()),
    provider: provider || null,
    model: provider === 'openai' && configuredModel() ? configuredModel() : null,
    note: provider === 'openai' ? (configuredModel() ? 'OpenAI Responses API provider is enabled only when OPENAI_API_KEY is present.' : 'OPENAI_MODEL must be supplied by the buyer; no model identifier is assumed.') : 'AI is fail-closed until an explicitly configured provider is available.'
  };
}
function validateOutput(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Object.assign(new Error('AI_PROVIDER_INVALID_JSON'), { code:'AI_PROVIDER_INVALID_JSON' });
  for (const key of ['summary','currentState','disclaimer']) if (typeof data[key] !== 'string') throw Object.assign(new Error('AI_PROVIDER_INVALID_JSON'), { code:'AI_PROVIDER_INVALID_JSON' });
  for (const key of ['blockers','nextActions','risks','evidenceGaps']) if (!Array.isArray(data[key]) || data[key].some(x => typeof x !== 'string')) throw Object.assign(new Error('AI_PROVIDER_INVALID_JSON'), { code:'AI_PROVIDER_INVALID_JSON' });
  return data;
}

async function openaiSummary(context) {
  const prepared = prepareContext(context);
  const serialized = JSON.stringify(prepared);
  const modelContext = serialized.slice(0, MAX_CONTEXT_CHARS);
  const contextHashSha256 = crypto.createHash('sha256').update(modelContext, 'utf8').digest('hex');
  if (String(process.env.AI_PROVIDER || '').toLowerCase() !== 'openai' || !process.env.OPENAI_API_KEY)
    throw Object.assign(new Error('AI_PROVIDER_NOT_CONFIGURED'), { code: 'AI_PROVIDER_NOT_CONFIGURED' });
  const model = configuredModel();
  if (!model)
    throw Object.assign(new Error('AI_MODEL_NOT_CONFIGURED'), { code: 'AI_MODEL_NOT_CONFIGURED' });
  const body = {
    model,
    store: false,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: 'You are OpsCore Field Copilot. Use ONLY the provided persisted operational context. Never invent facts, measurements, causes, financial values, or completed actions. Return concise operational guidance. All proposed actions remain subject to human approval.' }] },
      { role: 'user', content: [{ type: 'input_text', text: `Analyze this verified OpsCore work-order context:\n${modelContext}` }] }
    ],
    text: { format: { type: 'json_schema', name: 'opscore_work_order_summary', strict: true, schema } }
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const raw = await res.text();
    let out; try { out = JSON.parse(raw); } catch { throw Object.assign(new Error('AI_PROVIDER_INVALID_RESPONSE'), { code:'AI_PROVIDER_INVALID_RESPONSE' }); }
    if (!res.ok) throw Object.assign(new Error(`AI_PROVIDER_HTTP_${res.status}`), { code:`AI_PROVIDER_HTTP_${res.status}` });
    const text = out.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text;
    if (!text) throw Object.assign(new Error('AI_PROVIDER_EMPTY_OUTPUT'), { code:'AI_PROVIDER_EMPTY_OUTPUT' });
    let data; try { data = JSON.parse(text); } catch { throw Object.assign(new Error('AI_PROVIDER_INVALID_JSON'), { code:'AI_PROVIDER_INVALID_JSON' }); }
    data=validateOutput(data);
    return { provider:'openai', model, schemaVersion:'opscore.ai-work-order-summary.v1', grounding:{contextHashSha256,financialIncluded:String(process.env.AI_INCLUDE_FINANCIAL_CONTEXT || '').toLowerCase()==='true',identifiersIncluded:String(process.env.AI_INCLUDE_IDENTIFIERS || '').toLowerCase()==='true',piiRedaction:true,contextChars:modelContext.length
}, output:data };
  } finally { clearTimeout(timeout); }
}
module.exports = { aiStatus, openaiSummary };
