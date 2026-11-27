// Lógica do resumo diário de alertas (Telegram). Espelha as regras do dashboard (computeAlertas).
const SB_URL = "https://fsbpakhrfkrmfgpaxyly.supabase.co";
const EVENTOS_URL = "https://script.google.com/macros/s/AKfycbx5SeYyBiSlv8pkFEg_DMjg0BGiNoLAso_VB00cSFBuCz_038Ojfu6SwBGK95yt4QiJ4A/exec";
const CHAT_DEFAULT = "1347302734";
// Dias antes do evento em que avisamos (evita mensagem todos os dias desde o dia 30)
const DIAS_AVISO = [30, 21, 14, 10, 7, 5, 3, 2, 1, 0];

const normDate = (s) => {
  if (!s) return "";
  s = String(s).trim().split(/[T ]/)[0];
  let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return s;
};
const phone9 = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length >= 9 ? d.slice(-9) : d; };
const normName = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const eur = (n) => (Math.round(n * 100) / 100).toLocaleString("pt-PT", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + "€";
const fmtD = (iso) => iso.split("-").reverse().join("/");
const parseJ = (s, d) => { try { const v = JSON.parse(s || ""); return v ?? d; } catch { return d; } };

async function sb(path, key) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`supabase ${path.split("?")[0]}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function fetchEventos() {
  const r = await fetch(`${EVENTOS_URL}?page=dados&callback=cb`, { redirect: "follow" });
  const t = (await r.text()).trim();
  const m = t.match(/^[\w$.]+\(([\s\S]*)\);?$/);
  const data = JSON.parse(m ? m[1] : t);
  if (!Array.isArray(data)) throw new Error("eventos: resposta inesperada");
  return data.map((e) => {
    const dataFesta = normDate(e.dataFesta);
    return { ...e, dataFesta, _key: dataFesta + "__" + (e.cliente || "") };
  });
}

function hojeLisboa() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date()); // YYYY-MM-DD
  return new Date(p + "T00:00:00Z");
}

export async function construirMensagem(serviceKey) {
  const [eventos, custos, contratos] = await Promise.all([
    fetchEventos(),
    sb("cp_event_costs?select=event_key,pagamentos,extras,pack_items", serviceKey),
    sb("cp_contratos?select=cliente,telefone,data_evento,estado,data_confirmacao", serviceKey),
  ]);
  const custoBy = {};
  custos.forEach((r) => { custoBy[r.event_key] = r; });

  const cByPD = {}, cByND = {};
  [...contratos].sort((a, b) => (isConf(a) ? 1 : 0) - (isConf(b) ? 1 : 0)).forEach((c) => {
    const dt = normDate(c.data_evento), ph = phone9(c.telefone), nm = normName(c.cliente);
    if (ph && dt) cByPD[ph + "|" + dt] = c;
    if (nm && dt) cByND[nm + "|" + dt] = c;
  });
  function isConf(c) { return c.estado === "Confirmado" || !!c.data_confirmacao; }
  const statusContrato = (ev) => {
    const dt = ev.dataFesta, ph = phone9(ev.telefone);
    const c = (ph && cByPD[ph + "|" + dt]) || cByND[normName(ev.cliente) + "|" + dt];
    return !c ? "none" : isConf(c) ? "ok" : "pend";
  };

  const hoje = hojeLisboa();
  const itens = [];
  for (const ev of eventos) {
    if (!ev.dataFesta || !/^\d{4}-\d{2}-\d{2}$/.test(ev.dataFesta)) continue;
    const diff = Math.round((new Date(ev.dataFesta + "T00:00:00Z") - hoje) / 86400000);
    if (diff < 0 || diff > 30) continue;
    const row = custoBy[ev._key] || {};
    const extras = parseJ(row.extras, {});
    const pags = parseJ(row.pagamentos, []);
    const tarefas = parseJ(row.pack_items, []);
    const sheetPag = (+ev.valorPago || 0) + (+ev.pagoExtra || 0);
    const pago = sheetPag + pags.reduce((s, p) => s + (+p.valor || 0), 0);
    const limp = String(ev.quemLimpa || "").trim().toLowerCase() === "cosmopolitan" ? +ev.limpeza || 0 : 0;
    const extrasTot = Object.values(extras).flat().reduce((s, i) => s + (+i.valor || 0), 0);
    const acordado = (+ev.valorTotal || 0) + (+ev.caucao || 0) + limp + extrasTot;
    const falta = Math.max(0, acordado - pago);
    const linhas = [];

    if (DIAS_AVISO.includes(diff)) {
      const st = statusContrato(ev);
      if (st === "none") linhas.push("📄 Sem contrato — criar e enviar");
      if (st === "pend" && diff <= 14) linhas.push("✍️ Contrato por assinar — pedir assinatura");
      if (diff <= 7 && pago === 0) linhas.push(`💶 Sem sinal registado — pedir pagamento (acordado ${eur(acordado)})`);
      else if (diff <= 7 && falta > 0) linhas.push(`💶 Falta pagar ${eur(falta)} — pedir o restante`);
    }
    // Lembretes de decoração/catering marcados para hoje
    tarefas.forEach((t) => {
      if (t.tipo === "deccat" && !t.feito && t.data === new Date(hoje).toISOString().slice(0, 10)) {
        linhas.push(`${t.emoji || "🎨"} ${t.tarefa}`);
      }
    });
    if (linhas.length) {
      const quando = diff === 0 ? "HOJE" : diff === 1 ? "amanhã" : `em ${diff} dias`;
      const tel = ev.telefone ? ` · 📞 ${ev.telefone}` : "";
      itens.push({ diff, texto: `🎉 ${ev.cliente || "—"} — ${fmtD(ev.dataFesta)} (${quando})${tel}\n${linhas.map((l) => "   " + l).join("\n")}` });
    }
  }
  itens.sort((a, b) => a.diff - b.diff);
  if (!itens.length) return null;
  return "⏰ Cosmopolitan Party — pendentes\n\n" + itens.map((i) => i.texto).join("\n\n");
}

export async function enviarTelegram(text) {
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) throw new Error("TELEGRAM_TOKEN em falta");
  const chat = process.env.TELEGRAM_CHAT_ID || CHAT_DEFAULT;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000) }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error("telegram: " + j.description);
}
