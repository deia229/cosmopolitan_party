// Polimento com IA da composição de decoração (OpenAI).
// Requer variável de ambiente OPENAI_API_KEY no Netlify. Só aceita pedidos de utilizadores autenticados no Supabase.
const SB_URL = "https://fsbpakhrfkrmfgpaxyly.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzYnBha2hyZmtybWZncGF4eWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzMyMjAsImV4cCI6MjA4OTE0OTIyMH0.fkF9Ch9QvX2lecY1B2FxuDWxD4DmH4T6WAg6ggYBVlY"; // anon key — pública por design

const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

const PROMPT = `Esta imagem é uma maquete de decoração de festa montada no nosso espaço, com painéis e arcos reais.
Transforma-a numa fotografia realista MANTENDO EXACTAMENTE: o espaço, o palco, a posição, o tamanho, a forma e a cor de cada painel e arco.
Podes apenas: acrescentar luz e sombras naturais, ajustar o realismo dos materiais, tornar os balões e o texto de vinil mais naturais.
NÃO adiciones, removas nem alteres peças. NÃO mudes cores nem proporções. NÃO inventes elementos novos.`;

const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini";

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
  const KEY = process.env.OPENAI_API_KEY;
  if (!KEY) return json(500, { error: "OPENAI_API_KEY não configurada no Netlify" });

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
  const errMsg = (d) => (d && d.error && d.error.message) || "erro da OpenAI";

  // 1) sugerir peças a partir de uma inspiração
  if (b.mode === "sugerir") {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
      body: JSON.stringify({
        model: TEXT_MODEL,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: [{ type: "text", text: SUGGEST }, { type: "image_url", image_url: { url: b.image } }] }],
      }),
    });
    const d = await r.json();
    if (!r.ok) return json(502, { error: errMsg(d) });
    try { return json(200, JSON.parse(d.choices[0].message.content)); }
    catch { return json(502, { error: "resposta da OpenAI ilegível" }); }
  }

  // 2) polir a maquete com IA (edição de imagem)
  const toBlob = (mm) => new Blob([Buffer.from(mm[2], "base64")], { type: mm[1] });
  const ext = (mm) => mm[1].split("/")[1].replace("jpeg", "jpg");
  const fd = new FormData();
  fd.append("model", IMAGE_MODEL);
  fd.append("prompt", PROMPT + (b.extra ? "\nNotas do cliente: " + String(b.extra).slice(0, 500) : ""));
  fd.append("image[]", toBlob(m), "maquete." + ext(m));
  const ref = parse(b.ref);
  if (ref) {
    fd.set("prompt", fd.get("prompt") + "\nA segunda imagem é uma referência do cliente: serve só para o ambiente, luz e acabamento. NÃO copies as peças dela; mantém as peças da maquete (primeira imagem).");
    fd.append("image[]", toBlob(ref), "referencia." + ext(ref));
  }
  fd.append("size", "1024x1536");
  fd.append("quality", process.env.OPENAI_IMAGE_QUALITY || "medium");
  if (/^gpt-image-1/.test(IMAGE_MODEL)) fd.append("input_fidelity", "high");
  const r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: "Bearer " + KEY }, body: fd });
  const d = await r.json();
  if (!r.ok) return json(502, { error: errMsg(d) });
  const img = d.data && d.data[0] && d.data[0].b64_json;
  if (!img) return json(502, { error: "a OpenAI não devolveu imagem" });
  return json(200, { image: "data:image/png;base64," + img });
};
