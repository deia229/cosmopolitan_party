// Constantes Supabase — anon key é pública por design (mesma exposta no dashboard).
const SB_URL = "https://fsbpakhrfkrmfgpaxyly.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzYnBha2hyZmtybWZncGF4eWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzMyMjAsImV4cCI6MjA4OTE0OTIyMH0.fkF9Ch9QvX2lecY1B2FxuDWxD4DmH4T6WAg6ggYBVlY";

function parseTotalNum(s) {
  if (!s) return null;
  const m = String(s).replace(/\s/g, "").match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  return Number(m[1].replace(",", "."));
}

// Normaliza telefone PT para wa.me (indicativo 351, sem espaços/símbolos)
function normalizePtPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("351") && digits.length >= 12) return digits.slice(0, 12);
  if (digits.length === 9) return "351" + digits;
  return digits;
}

// Data ISO (yyyy-mm-dd) → dd/mm/yyyy legível. Devolve o original se não reconhecer.
function formatarDataPt(v) {
  const s = String(v || "").trim();
  const m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m1) return `${m1[3].padStart(2, "0")}/${m1[2].padStart(2, "0")}/${m1[1]}`;
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) return `${m2[1].padStart(2, "0")}/${m2[2].padStart(2, "0")}/${m2[3]}`;
  return s;
}

// Dados de pagamento (fixos) usados na mensagem de resposta ao cliente.
const CAUCAO_EUR = 100; // caução incluída no total do site (+100 no cálculo)
const PAG_MBWAY = "964505429";
const PAG_IBAN = "PT50 0018 0003 4996 1683 0201 5 (Benedita Almeida)";

// Formata valor em euros à portuguesa: inteiro sem casas ("675"), senão 2 casas
// com vírgula ("337,50").
function fmtEur(n) {
  const r = Math.round(Number(n) * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(".", ",");
}

// Link WhatsApp de 1-clique com a mensagem de resposta pronta ao cliente.
// Não envia nada — abre o WhatsApp com o texto escrito para a Andreia/Ivo/Érica
// confirmarem e carregarem em Enviar.
//
// Valores derivados do pedido do site:
//   total do site = valor do espaço (já com limpeza) + caução (100€)
//   → valor do espaço = total − 100 ;  sinal 50% = espaço ÷ 2
function waConfirmacaoLink(d) {
  const telNorm = normalizePtPhone(d.contacto);
  if (!telNorm) return "";
  const primeiroNome = String(d.nome || "").trim().split(/\s+/)[0] || "";
  const saudacao = primeiroNome ? `Olá ${primeiroNome}!` : "Olá!";
  const dataPt = formatarDataPt(d.data);
  const horario = d.entrada && d.saida ? `${d.entrada} às ${d.saida}` : "";

  const total = parseTotalNum(d.total);
  const espaco = total != null ? total - CAUCAO_EUR : null;
  const temValores = espaco != null && espaco > 0;

  const linhas = [
    `${saudacao} ✨ Obrigada pelo interesse na Cosmopolitan Party.`,
    "",
    dataPt
      ? `Ainda temos disponibilidade para o dia ${dataPt}!` +
        (temValores
          ? ` Para o turno ${horario}, o valor do espaço é de ${fmtEur(espaco)}€ (+IVA) e já inclui a limpeza.`
          : horario
          ? ` Para o turno ${horario}, o valor do espaço já inclui a limpeza.`
          : "")
      : "Ainda temos disponibilidade para a data pedida!",
  ];

  if (temValores) {
    linhas.push(
      "",
      `A caução é de ${fmtEur(CAUCAO_EUR)}€, devolvida após o evento se estiver tudo em conformidade.`,
      "",
      `Para garantir a data, é necessário o pagamento de 50% — ${fmtEur(espaco / 2)} € por:`,
      `• MBWay ${PAG_MBWAY}`,
      `• ${PAG_IBAN}`,
      "E envio de comprovativo."
    );
  }

  linhas.push(
    "",
    "Estamos ao dispor para qualquer esclarecimento.",
    "",
    "Obrigada",
    "Andreia"
  );

  const msg = linhas.join("\n");
  return `https://wa.me/${telNorm}?text=${encodeURIComponent(msg)}`;
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
  const waLink = waConfirmacaoLink(d);
  const text = [
    "📅 Nova reserva — Cosmopolitan Party",
    "Data: " + (d.data || "-"),
    "Turno: " + (d.turno || "-"),
    "Horário: " + (d.entrada || "-") + " → " + (d.saida || "-"),
    "Barris: " + (d.barris || "-"),
    "Total: " + (d.total || "-"),
    "Nome: " + (d.nome || "-"),
    "Contacto: " + (d.contacto || "-"),
    "",
    waLink
      ? "✅ Responder ao cliente (mensagem pronta, 1 clique):\n" + waLink
      : "⚠️ Sem telefone válido — resposta ao cliente tem de ser manual.",
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
