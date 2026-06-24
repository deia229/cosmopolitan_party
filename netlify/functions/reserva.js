// Constantes Supabase — anon key é pública por design (mesma exposta no dashboard).
const SB_URL = "https://fsbpakhrfkrmfgpaxyly.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzYnBha2hyZmtybWZncGF4eWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzMyMjAsImV4cCI6MjA4OTE0OTIyMH0.fkF9Ch9QvX2lecY1B2FxuDWxD4DmH4T6WAg6ggYBVlY";

function parseTotalNum(s) {
  if (!s) return null;
  const m = String(s).replace(/\s/g, "").match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  return Number(m[1].replace(",", "."));
}

async function insertSupabase(d) {
  const body = {
    nome: d.nome || "Sem nome",
    contacto: d.contacto || null,
    data_festa: d.data || null,
    turno: d.turno || null,
    entrada: d.entrada || null,
    saida: d.saida || null,
    barris: d.barris || null,
    total: d.total || null,
    total_num: parseTotalNum(d.total),
  };
  const r = await fetch(SB_URL + "/rest/v1/cp_reservas_site", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SB_KEY,
      Authorization: "Bearer " + SB_KEY,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error("supabase " + r.status + ": " + t);
  }
}

async function notifyTelegram(d) {
  const token = Netlify.env.get("TELEGRAM_TOKEN");
  const chat = Netlify.env.get("TELEGRAM_CHAT");
  const text = [
    "📅 Nova reserva — Cosmopolitan Party",
    "Data: " + (d.data || "-"),
    "Turno: " + (d.turno || "-"),
    "Horário: " + (d.entrada || "-") + " → " + (d.saida || "-"),
    "Barris: " + (d.barris || "-"),
    "Total: " + (d.total || "-"),
    "Nome: " + (d.nome || "-"),
    "Contacto: " + (d.contacto || "-"),
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
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const d = await req.json();
    // Persistência primeiro — fonte de verdade para o cockpit.
    // Telegram é notificação. Falha de um não trava o outro.
    const errors = {};
    await Promise.all([
      insertSupabase(d).catch((e) => { errors.supabase = String(e); }),
      notifyTelegram(d).catch((e) => { errors.telegram = String(e); }),
    ]);
    if (errors.supabase && errors.telegram) {
      return new Response(JSON.stringify({ ok: false, error: errors }), {
        status: 502, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, warn: errors }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/.netlify/functions/reserva" };
