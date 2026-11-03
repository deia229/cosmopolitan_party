// Constantes Supabase — anon key é pública por design (mesma exposta no dashboard).
const SB_URL = "https://fsbpakhrfkrmfgpaxyly.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzYnBha2hyZmtybWZncGF4eWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzMyMjAsImV4cCI6MjA4OTE0OTIyMH0.fkF9Ch9QvX2lecY1B2FxuDWxD4DmH4T6WAg6ggYBVlY";

function parseTotalNum(s) {
  if (!s) return null;
  const m = String(s).replace(/\s/g, "").match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  return Number(m[1].replace(",", "."));
}

// Discriminação do valor — espelha o simulador do site (index.html).
const TURNOS = {
  "11h–16h": { nome: "Tarde", v: 300, ini: 11, fim: 16 },
  "18h–23h": { nome: "Noite", v: 300, ini: 18, fim: 23 },
  "08h–meia-noite": { nome: "Dia inteiro", v: 650, ini: 8, fim: 24 },
};
const LIMPEZA = 125, CAUCAO = 100, HORA_EXTRA = 50;

function eur(n) {
  return n.toLocaleString("pt-PT", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + "€";
}
function hh(v) {
  if (!v) return null;
  const p = String(v).split(":");
  return Number(p[0]) + Number(p[1] || 0) / 60;
}
function breakdown(d) {
  const t = TURNOS[d.turno];
  if (!t) return null;
  const ent = hh(d.entrada), sai0 = hh(d.saida);
  let horasExtra = 0;
  if (ent !== null && sai0 !== null) {
    const sai = sai0 <= ent ? sai0 + 24 : sai0;
    horasExtra = Math.max(0, Math.ceil(Math.max(0, t.ini - ent) + Math.max(0, sai - t.fim) - 1e-9));
  }
  const barris = (d.barris && d.barris !== "nenhum" ? String(d.barris).split(", ") : [])
    .map((b) => ({ nome: b.replace(/\s*\d+€$/, "").trim(), v: Number((b.match(/(\d+)€$/) || [])[1]) || 0 }));
  const barrisTotal = barris.reduce((a, b) => a + b.v, 0);
  return {
    turno: t, horasExtra, heTotal: horasExtra * HORA_EXTRA, barris, barrisTotal,
    total: t.v + horasExtra * HORA_EXTRA + barrisTotal + LIMPEZA + CAUCAO,
  };
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
  const b = breakdown(d);
  const linhas = [
    "📅 Nova reserva — Cosmopolitan Party",
    "",
    "👤 " + (d.nome || "-") + " · " + (d.contacto || "-"),
    "🗓 Data: " + (d.data || "-"),
    "⏰ Horário: " + (d.entrada || "-") + " → " + (d.saida || "-"),
  ];
  if (b) {
    linhas.push("", "💶 Discriminação");
    linhas.push("• Espaço (" + b.turno.nome + ", " + d.turno + "): " + eur(b.turno.v));
    linhas.push("• Horas extra" + (b.horasExtra ? " (" + b.horasExtra + "h × " + HORA_EXTRA + "€)" : "") + ": " + eur(b.heTotal));
    if (b.barris.length) {
      b.barris.forEach((x) => linhas.push("• Barril " + x.nome + ": " + eur(x.v)));
    } else {
      linhas.push("• Barris: 0€");
    }
    linhas.push("• Limpeza: " + eur(LIMPEZA));
    linhas.push("• Caução (reembolsável): " + eur(CAUCAO));
    linhas.push("", "Total: " + (d.total || eur(b.total)));
  } else {
    linhas.push("Turno: " + (d.turno || "-"), "Barris: " + (d.barris || "-"), "", "Total: " + (d.total || "-"));
  }
  const text = linhas.join("\n");
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
