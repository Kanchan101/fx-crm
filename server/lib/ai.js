const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Use Haiku for fast extraction, Sonnet for analysis
const FAST_MODEL = 'claude-haiku-4-5-20251001';   // 3x faster, 10x cheaper
const SMART_MODEL = 'claude-sonnet-4-20250514';    // For matching/outreach

async function callClaude(prompt, { model = FAST_MODEL, maxTokens = 2000 } = {}) {
  if (!ANTHROPIC_API_KEY) return null;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const result = await response.json();
  const text = result.content?.[0]?.text || '';

  // Extract JSON if present
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); }
    catch { return text; }
  }
  return text;
}

// Fast CV parsing — uses Haiku
async function parseCV(cvText) {
  return callClaude(`Parse this CV/resume. Return ONLY JSON:
{
  "name": "full name",
  "email": "email",
  "phone": "10 digit only, no +91",
  "location": "city",
  "experience_years": number,
  "skills": "comma separated",
  "current_role": "current title",
  "current_company": "company",
  "education": "highest education"
}
If not found use "" or 0.

CV TEXT:
${cvText.substring(0, 8000)}`, { model: FAST_MODEL, maxTokens: 1000 });
}

// Smart matching — uses Sonnet (more accurate)
async function matchCVtoJD(cvText, job) {
  return callClaude(`Compare CV vs JD. Return ONLY JSON:
{"match_percent": number, "matching_skills": ["skill"], "missing_skills": ["skill"], "summary": "2-3 sentences"}

JOB: ${job.title} at ${job.client_name}, ${job.location}, ${job.exp_min}-${job.exp_max}y
Skills: ${job.skills || ''}, Desc: ${(job.description || '').substring(0, 2000)}

CV: ${cvText.substring(0, 6000)}`, { model: SMART_MODEL, maxTokens: 1500 });
}

// Outreach messages — uses Sonnet
async function generateOutreach(job, candidateName, senderName, customNote) {
  return callClaude(`You are a recruiter at FX Consulting. Generate 3 messages. Return ONLY JSON:
{
  "email_subject": "subject",
  "email_body": "full email with greeting and sign-off",
  "whatsapp": "max 800 chars, casual professional",
  "linkedin": "max 300 chars, professional"
}

Job: ${job.title} at ${job.client_name} (${job.client_industry || ''}), ${job.location}
Exp: ${job.exp_min}-${job.exp_max}y
Skills: ${job.skills || ''}, Desc: ${(job.description || '').substring(0, 2000)}
Sender: ${senderName}, FX Consulting
Candidate: ${candidateName}
${customNote ? 'Note: ' + customNote : ''}

Be direct about the opportunity. Include JD details. NEVER include CTC/salary/compensation details in any message — this is confidential.`, { model: SMART_MODEL, maxTokens: 2000 });
}

module.exports = { callClaude, parseCV, matchCVtoJD, generateOutreach, FAST_MODEL, SMART_MODEL };
