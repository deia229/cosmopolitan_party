// Polimento com IA da composição de decoração (Gemini).
// Requer variável de ambiente GEMINI_API_KEY no Netlify. Só aceita pedidos de utilizadores autenticados no Supabase.
const SB_URL = "https://fsbpakhrfkrmfgpaxyly.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzYnBha2hyZmtybWZncGF4eWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzMyMjAsImV4cCI6MjA4OTE0OTIyMH0.fkF9Ch9QvX2lecY1B2FxuDWxD4DmH4T6WAg6ggYBVlY"; // anon key — pública por design

const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

const PROMPT = `Esta imagem é uma maquete de decoração de festa montada no nosso espaço, com painéis e arcos reais.
Transforma-a numa fotografia realista MANTENDO EXACTAMENTE: o espaço, o palco, a posição, o tamanho, a forma e a cor de cada painel e arco.
Podes apenas: acrescentar luz e sombras naturais, ajustar o realismo dos materiais, tornar os balões e o texto de vinil mais naturais.
NÃO adiciones, removas nem alteres peças. NÃO mudes cores nem proporções. NÃO inventes elementos novos.`;

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";

const SUGGEST = `És designer de decoração de festas. O cliente enviou uma imagem de inspiração. Recria-a usando APENAS o nosso inventário, num palco com 352 cm de largura (centro = 0).
Inventário (id | medidas L x A cm | quantidade | notas):
- arco_liso_p | 61x175 | 2 | arco liso, cor alterável
- arco_liso_g | 80x190 | 2 | arco liso grande, cor alterável
- meio_e | 75x180 | 2 | meio-arco com curva à esquerda, cor alterável (2 metades formam 1 arco)
- meio_d | 75x180 | 2 | meio-arco com curva à direita, cor alterável
- arco_vaz | 80x180 | 1 | arco com abertura para fotos, cor alterável
- mold_rect | 80x180 | 1 | moldura rectangular com abertura, cor alterável
- mold_barbie | 100x180 | 1 | moldura grande com abertura e texto de vinil, cor alterável
- incl | 60x180 | 2 | painel com topo inclinado, cor alterável (usar flip para espelhar)
- ripas | 60x220 | 2 | painel de ripas creme/bege (cor fixa)
- marmore | 80x235 | 1 | painel mármore azul (cor fixa)
Também há grupos de balões (cores livres). Cores em hexadecimal. Vinil/texto só quando a inspiração tiver texto. Não excedas as quantidades. Posiciona com xcm (centro da peça, -160 a 160), sem sobrepor peças desnecessariamente. flip só para incl/meio-arcos quando fizer sentido.
Responde só em JSON: {"pieces":[{"cat":"id","color":"#hex","text":"","textColor":"#hex","xcm":0,"flip":false}],"balloons":[{"color":"#hex","color2":"#hex","color3":"#hex","xcm":0,"scale":100}],"notes":"o que não conseguimos replicar com o inventário"}`;

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
  const parse = (x) => /^data:(image\/\w+);base64,(.+)$/.exec(x || "");
  const m = parse(b.image);
  if (!m) return json(400, { error: "imagem em falta" });

  if (b.mode === "sugerir") {
    const rs = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + TEXT_MODEL + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: SUGGEST }, { inline_data: { mime_type: m[1], data: m[2] } }] }], generationConfig: { responseMimeType: "application/json" } }),
    });
    const ds = await rs.json();
    if (!rs.ok) return json(502, { error: (ds.error && ds.error.message) || "erro do Gemini" });
    try {
      const txt = ds.candidates[0].content.parts.map((p) => p.text || "").join("");
      return json(200, JSON.parse(txt));
    } catch { return json(502, { error: "resposta do Gemini ilegível" }); }
  }

  const parts = [{ text: PROMPT + (b.extra ? "\nNotas do cliente: " + String(b.extra).slice(0, 500) : "") }, { inline_data: { mime_type: m[1], data: m[2] } }];
  const ref = parse(b.ref);
  if (ref) parts.push({ text: "Imagem de referência do cliente: serve só para o ambiente, luz e acabamento. NÃO copies as peças dela; mantém as peças da maquete." }, { inline_data: { mime_type: ref[1], data: ref[2] } });
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
