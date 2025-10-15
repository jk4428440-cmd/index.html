export async function handler(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders() };
  }
  if (event.httpMethod !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}
  const { image_base64, prompt } = body || {};
  if (!image_base64) return json({ error: 'image_base64 required' }, 400);

  const GEMINI = process.env.GEMINI_API_KEY;
  const PPLX = process.env.PPLX_API_KEY;
  if (!GEMINI || !PPLX) return json({ error: 'Missing API keys' }, 500);

  const userPrompt = prompt || 'Analyze this UI screenshot and give 5 actionable fixes.';

  const gemini = fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI}`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({contents:[{parts:[{text:userPrompt},{inline_data:{mime_type:'image/png',data:image_base64}}]}]})
  }).then(async r=>{ if(!r.ok) throw new Error('Gemini '+r.status); const j=await r.json();
    const t=(j?.candidates?.[0]?.content?.parts||[]).map(p=>p.text).filter(Boolean).join('
')||'No text'; return 'Gemini:
'+t; });

  const pplx = fetch('https://api.perplexity.ai/chat/completions',{
    method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+PPLX},
    body:JSON.stringify({model:'sonar-small-online',messages:[
      {role:'system',content:'You are a concise UI/UX analyst.'},
      {role:'user',content:userPrompt+' Respond in bullet points.'}
    ],max_tokens:600,temperature:0.2})
  }).then(async r=>{ if(!r.ok) throw new Error('Perplexity '+r.status); const j=await r.json();
    const t=j?.choices?.[0]?.message?.content||'No text'; return 'Perplexity:
'+t; });

  const [g,p]=await Promise.allSettled([gemini,pplx]);
  const parts=[]; if(g.status==='fulfilled') parts.push(g.value); if(p.status==='fulfilled') parts.push(p.value);
  const result = parts.length? parts.join('

---

') : 'Both providers failed.';
  return json({ result }, 200);
}
function corsHeaders(){ return {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type'
};}
function json(obj, code=200){ return { statusCode:code, headers:{ 'Content-Type':'application/json', ...corsHeaders() }, body:JSON.stringify(obj) }; }
