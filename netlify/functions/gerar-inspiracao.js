// Polimento com IA da composição de decoração (Gemini).
// Requer variável de ambiente GEMINI_API_KEY no Netlify. Só aceita pedidos de utilizadores autenticados no Supabase.
const SB_URL = "https://fsbpakhrfkrmfgpaxyly.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzYnBha2hyZmtybWZncGF4eWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzMyMjAsImV4cCI6MjA4OTE0OTIyMH0.fkF9Ch9QvX2lecY1B2FxuDWxD4DmH4T6WAg6ggYBVlY"; // anon key — pública por design

const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

const PROMPT = `Esta imagem é uma maquete de decoração de festa montada no nosso espaço, com painéis e arcos reais.
Transforma-a numa fotografia realista MANTENDO EXACTAMENTE: o espaço, o palco, a posição, o tamanho, a forma e a cor de cada painel e arco.
Podes apenas: acrescentar luz e sombras naturais, ajustar o realismo dos materiais, tornar os balões e o texto de vinil mais naturais.
NÃO adiciones, removas nem alteres peças. NÃO mudes cores nem proporções. NÃO inventes elementos novos.`;

const json = (status, body) => ({ statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "método não permitido" });
  if (!process.env.GEMINI_API_KEY) return json(500, { error: "GEMINI_API_KEY não configurada no Netlify" });

  // só utilizadores autenticados (evita gastos por terceiros)
  const token = (event.headers.authorization || "").replace(/^Bearer /i, "");
  if (!token) return json(401, { error: "sem sessão" });
  const u = await fetch(SB_URL + "/auth/v1/user", { headers: { apikey: SB_KEY, Authorization: "Bearer " + token } });
  if (!u.ok) return json(401, { error: "sessão inválida" });

  let b;
  try { b = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "json inválido" }); }
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(b.image || "");
  if (!m) return json(400, { error: "imagem em falta" });

  const parts = [{ text: PROMPT + (b.extra ? "\nNotas do cliente: " + String(b.extra).slice(0, 500) : "") }, { inline_data: { mime_type: m[1], data: m[2] } }];
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts }] }),
  });
  const d = await r.json();
  if (!r.ok) return json(502, { error: (d.error && d.error.message) || "erro do Gemini" });
  const out = ((d.candidates || [])[0]?.content?.parts || []).find((p) => (p.inlineData || p.inline_data));
  const img = out && (out.inlineData || out.inline_data);
  if (!img) return json(502, { error: "o Gemini não devolveu imagem" });
  return json(200, { image: "data:" + (img.mimeType || img.mime_type || "image/png") + ";base64," + img.data });
};
