const Anthropic = require('@anthropic-ai/sdk');

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY || '';
  if (!key) {
    const e = new Error('Missing ANTHROPIC_API_KEY');
    e.statusCode = 500;
    throw e;
  }
  return new Anthropic({ apiKey: key });
}

function jsonSchemaHint(schemaName) {
  if (schemaName === 'hire') {
    return {
      candidates: [{
        name: 'string',
        matchScore: '0-100',
        recommendation: 'string',
        strengths: ['string'],
        weaknesses: ['string']
      }]
    };
  }
  if (schemaName === 'board') {
    return {
      onboardingPlan: {
        day30: ['task1'],
        day60: ['task1'],
        day90: ['task1'],
        resources: ['string'],
        firstWeekChecklist: ['string']
      }
    };
  }
  if (schemaName === 'pulse') {
    return {
      employees: [{
        name: 'string',
        burnoutScore: '0-100',
        riskLevel: 'low/medium/high/critical',
        riskFactors: ['string'],
        recommendations: ['string']
      }]
    };
  }
  return {};
}

function tryExtractJson(text) {
  if (!text) return null;
  const t = String(text).trim();

  // Prefer fenced json blocks.
  const fence = t.match(/```json\s*([\s\S]*?)```/i);
  if (fence && fence[1]) {
    try { return JSON.parse(fence[1]); } catch { /* ignore */ }
  }

  // Try first JSON object/array span.
  const firstObj = t.indexOf('{');
  const firstArr = t.indexOf('[');
  let start = -1;
  if (firstObj >= 0 && firstArr >= 0) start = Math.min(firstObj, firstArr);
  else start = Math.max(firstObj, firstArr);
  if (start < 0) return null;

  const slice = t.slice(start);
  for (let end = slice.length; end > 1; end--) {
    const candidate = slice.slice(0, end).trim();
    try {
      return JSON.parse(candidate);
    } catch {
      // continue shrinking
    }
  }
  return null;
}

async function callClaudeJson({ system, user, schemaName }) {
  const client = getClient();
  const model = 'claude-sonnet-4-20250514';

  const schemaExample = jsonSchemaHint(schemaName);

  const msg = await client.messages.create({
    model,
    max_tokens: 1800,
    temperature: 0.2,
    system: system + `\n\nReturn ONLY valid JSON. No extra keys. No markdown. Match this schema shape: ${JSON.stringify(schemaExample)}`,
    messages: [{ role: 'user', content: user }]
  });

  const text = (msg && msg.content && msg.content[0] && msg.content[0].text) ? msg.content[0].text : '';
  const parsed = tryExtractJson(text);
  if (!parsed) {
    const e = new Error('AI returned non-JSON output');
    e.statusCode = 502;
    e.details = { raw: text.slice(0, 8000) };
    throw e;
  }
  return parsed;
}

module.exports = {
  callClaudeJson
};
