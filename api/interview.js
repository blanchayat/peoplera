const Anthropic = require('@anthropic-ai/sdk');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required.' });

  const { candidate, jobDescription } = req.body;
  if (!candidate || !jobDescription) return res.status(400).json({ error: 'Missing candidate or jobDescription' });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are an expert HR interviewer. Based on this candidate profile and job description, generate 8 targeted interview questions.

Candidate: ${JSON.stringify(candidate)}
Job Description: ${jobDescription}

Focus on:
- Probing their weaknesses directly but professionally
- Verifying their claimed strengths with evidence questions
- Culture fit and values alignment
- Role-specific technical or behavioral scenarios

Respond ONLY with valid JSON:
{
  "questions": [
    { "category": "Behavioral|Technical|Culture|Situational", "question": "...", "probes": "what to listen for" }
  ]
}`
      }]
    });

    const text = message.content.map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
