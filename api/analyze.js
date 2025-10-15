export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  }

  let payload = {};
  try { payload = await req.json(); } catch {}
  const { image_base64, prompt } = payload || {};
  if (!image_base64) {
    return new Response(JSON.stringify({ error: "image_base64 required" }), {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const PPLX_API_KEY  = process.env.PPLX_API_KEY;
  if (!GEMINI_API_KEY || !PPLX_API_KEY) {
    return new Response(JSON.stringify({ error: "Missing API keys" }), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  }

  const userPrompt = prompt || "Analyze this UI screenshot and give 5 actionable fixes.";

  const geminiReq = fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key="+GEMINI_API_KEY,
    {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        contents:[{ parts:[
          { text:userPrompt },
          { inline_data:{ mime_type:"image/png", data:image_base64 } }
        ]}]
      })
    }
  ).then(async r=>{
    if(!r.ok) throw new Error("Gemini "+r.status);
    const j=await r.json();
    const t=(j?.candidates?.[0]?.content?.parts||[]).map(p=>p.text).filter(Boolean).join("
")||"No text";
    return "Gemini:
"+t;
  });

  const pplxReq = fetch("https://api.perplexity.ai/chat/completions", {
    method:"POST",
    headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+PPLX_API_KEY },
    body: JSON.stringify({
      model:"sonar-small-online",
      messages:[
        { role:"system", content:"You are a concise UI/UX analyst." },
        { role:"user", content:userPrompt+" Respond in bullet points." }
      ],
      max_tokens:600,
      temperature:0.2
    })
  }).then(async r=>{
    if(!r.ok) throw new Error("Perplexity "+r.status);
    const j=await r.json();
    const t=j?.choices?.[0]?.message?.content||"No text";
    return "Perplexity:
"+t;
  });

  const [g,p]=await Promise.allSettled([geminiReq,pplxReq]);
  const parts=[]; if(g.status==="fulfilled") parts.push(g.value); if(p.status==="fulfilled") parts.push(p.value);
  const result = parts.length ? parts.join("

---

") : "Both providers failed.";

  return new Response(JSON.stringify({ result }), {
    headers:{ "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }
  });
}
