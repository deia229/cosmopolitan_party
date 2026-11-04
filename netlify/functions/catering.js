// Pedido de catering do site: guarda no Supabase (dashboard) e envia só uma notificação curta ao Telegram.
const SB_URL = "https://fsbpakhrfkrmfgpaxyly.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzYnBha2hyZmtybWZncGF4eWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzMyMjAsImV4cCI6MjA4OTE0OTIyMH0.fkF9Ch9QvX2lecY1B2FxuDWxD4DmH4T6WAg6ggYBVlY";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

async function insertSupabase(d) {
  const r = await fetch(SB_URL + "/rest/v1/cp_catering_pedidos", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, Prefer: "return=minimal" },
    body: JSON.stringify({
      nome: String(d.nome || "Sem nome").slice(0, 200),
      contacto: String(d.contacto || "").slice(0, 200) || null,
      data_festa: d.data || null,
      pessoas: num(d.pax),
      itens: Array.isArray(d.itens) ? d.itens.slice(0, 100) : null,
      notas: String(d.notas || "").slice(0, 2000) || null,
      valor_num: num(d.valor),
      iva_num: num(d.iva),
      total_num: num(d.grand),
      resumo: String(d.resumo || "").slice(0, 8000) || null,
    }),
  });
  if (!r.ok) throw new Error("supabase " + r.status + ": " + (await r.text()));
}

async function notifyTelegram(d) {
  const token = Netlify.env.get("TELEGRAM_TOKEN");
  const chat = Netlify.env.get("TELEGRAM_CHAT");
  const text = [
    "🍽️ Novo pedido de catering — ver no dashboard",
    "Nome: " + (d.nome || "-"),
    "Contacto: " + (d.contacto || "-"),
    "Data: " + (d.data || "-") + " · " + (d.pax || "-") + " pessoas",
    "Total c/ IVA: " + (d.totalTxt || "-"),
  ].join("\n");
  const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error("telegram: " + j.description);
}

export default async (req) => {
  const h = { "Content-Type": "application/json" };
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "method" }), { status: 405, headers: h });
  try {
    const d = await req.json();
    const errors = {};
    await Promise.all([
      insertSupabase(d).catch((e) => { errors.supabase = String(e); }),
      notifyTelegram(d).catch((e) => { errors.telegram = String(e); }),
    ]);
    // Só falha se o pedido não ficou guardado nem notificado.
    if (errors.supabase && errors.telegram) return new Response(JSON.stringify({ ok: false, error: errors }), { status: 502, headers: h });
    return new Response(JSON.stringify({ ok: true, warn: errors }), { status: 200, headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: h });
  }
};

export const config = { path: "/.netlify/functions/catering" };
