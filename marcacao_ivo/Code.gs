/***** CONFIG *****/
const TZ = 'Europe/Lisbon';
const CAL_ID = 'cosmopolitanparty.loures@gmail.com';
const SHEET_NAME = 'Festas';

const HDR_TS        = 'Carimbo de data/hora';
const HDR_DATA      = 'Data da festa';
const HDR_INICIO    = 'Hora de início';
const HDR_FIM       = 'Hora de término';
const HDR_NOME      = 'Nome do cliente';
const HDR_TEL       = 'Contacto do cliente (telefone)';
const HDR_VALOR     = 'Valor da festa (€)';
const HDR_CAUCAO    = 'Caução';
const HDR_LIMPEZA   = 'Limpeza';
const HDR_PAGO      = 'Valor já pago';
const HDR_OBS       = 'Observações';
const HDR_QUEM_LIMPA = 'Quem faz limpeza?';
const HDR_LINK_A    = 'Link Calendário (Andreia)';
const HDR_LINK_F    = 'Link Calendário (Festas)';
const HDR_SYNC      = 'Sync';

const EMAIL_TO = [
  'cosmopolitanparty.loures@gmail.com',
  'ramalheiroa@gmail.com'
];

const FORM_BASE_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdwM0jlmYR8gWiFBlusZlzjIaV8lWaj85L3--sZaKURL3012Q/viewform';
const FORM_FIELDS = {
  data: 'entry.2141012538',
  inicio: 'entry.1648949831',
  fim: 'entry.694426724'
};
const BUFFER_MINUTES = 0;


/***** CONFIG — VISITAS *****/
const VST_EMAILS_INTERNOS = ['cosmopolitanparty.loures@gmail.com', 'ocasiaodemordomias@gmail.com'];
const VST_SHEET_BLOCOS = 'Visitas Blocos';
const VST_SHEET_MARC = 'Visitas Marcacoes';
const VST_PAGINA_PUBLICA = 'https://cosmopolitanparty.pt/visitas/';


/***** doGet — router principal *****/
function doGet(e) {
  const param = (e && e.parameter && e.parameter.page) ? e.parameter.page : '';

  // === ROTAS VISITAS ===
  if (param === 'visitas-disponibilidade') return vst_jsonp_(e, vst_disponibilidade(e.parameter.mes));
  if (param === 'visitas-admin')           return vst_jsonp_(e, vst_admin(e.parameter.token));

  if (param === 'dados') return doGetDashboard(e);
  if (param === 'updateCal') return updateCalEvento_(e);

  // Por defeito → página de disponibilidade
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Disponibilidade de Festas')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/***** UPDATE CAL — atualiza nome/telefone/observações no evento do Google Calendar
 *     Chamado pelo dashboard quando o utilizador edita os dados de uma festa.
 *     Parâmetros (GET):
 *       link   — URL do evento (campo Link Calendário (Festas) ou (Andreia))
 *       nome   — novo nome (opcional)
 *       tel    — novo telefone (opcional)
 *       obs    — novas observações (opcional)
 *     Devolve JSON ou JSONP {ok: bool, err?: string}
 *****/
function updateCalEvento_(e) {
  const callback = e && e.parameter && e.parameter.callback;
  const send = obj => {
    const json = JSON.stringify(obj);
    return ContentService
      .createTextOutput(callback ? `${callback}(${json})` : json)
      .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
  };
  try {
    const link = (e && e.parameter && e.parameter.link || '').toString().trim();
    if (!link) return send({ ok: false, err: 'Falta link do evento.' });
    // Extrair eid (base64 do realId + " " + calendar id) do link ?eid=…
    const m = link.match(/[?&]eid=([^&]+)/);
    if (!m) return send({ ok: false, err: 'Link inválido (sem eid).' });
    let eid = decodeURIComponent(m[1]);
    while (eid.length % 4 !== 0) eid += '=';
    let realId;
    try {
      const decoded = Utilities.newBlob(Utilities.base64Decode(eid)).getDataAsString();
      realId = decoded.split(' ')[0]; // "REAL_ID calendar_id"
    } catch (err) {
      return send({ ok: false, err: 'Falha ao descodificar eid.' });
    }
    const cal = CalendarApp.getCalendarById(CAL_ID);
    if (!cal) return send({ ok: false, err: 'Calendário não acessível.' });
    const ev = cal.getEventById(realId);
    if (!ev) return send({ ok: false, err: 'Evento não encontrado.' });

    const nome = (e.parameter.nome || '').toString();
    const tel  = (e.parameter.tel  || '').toString();
    const obs  = (e.parameter.obs  || '').toString();

    if (nome) ev.setTitle(`Festa — ${nome} (Flamenga)`);

    // Atualizar a descrição. Regex tolerantes — apanham com ou sem emoji prefixado
    // (compatibilidade com eventos antigos que ainda têm emojis).
    let desc = ev.getDescription() || '';
    if (nome) desc = desc.replace(/^.*Cliente:\s*.*$/m, `Cliente: ${nome}`);
    if (tel)  desc = desc.replace(/^.*Telefone:\s*.*$/m, `Telefone: ${tel}`);
    if (obs)  {
      if (/Observações:/.test(desc)) {
        desc = desc.replace(/(^.*Observações:\s*\n?)[\s\S]*$/m, `Observações:\n${obs}`);
      } else {
        desc = desc + `\n\nObservações:\n${obs}`;
      }
    }
    ev.setDescription(desc);

    return send({ ok: true });
  } catch (err) {
    return send({ ok: false, err: String(err && err.message || err) });
  }
}


/***** doPost — endpoint único de escrita (Visitas) *****/
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
  let res;
  switch (body.action) {
    case 'visitas.marcar':            res = vst_marcar(body); break;
    case 'visitas.bloco.criar':       res = vst_criarBloco(body); break;
    case 'visitas.bloco.remover':     res = vst_removerBloco(body); break;
    case 'visitas.marcacao.cancelar': res = vst_cancelarMarcacao(body); break;
    default: res = { ok: false, mensagem: 'Acção desconhecida: ' + body.action };
  }
  return ContentService
    .createTextOutput(JSON.stringify(res))
    .setMimeType(ContentService.MimeType.JSON);
}


/***** API DASHBOARD — devolve JSON ou JSONP *****/
function doGetDashboard(e) {
  const callback = e && e.parameter && e.parameter.callback;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAME);

  if (!sh) {
    const json = JSON.stringify({ error: 'Folha não encontrada.' });
    return ContentService
      .createTextOutput(callback ? `${callback}(${json})` : json)
      .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
  }

  const data    = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const rows    = data.slice(1);

  const events = rows
    .filter(row => row[0] !== '')
    .map((row, idx) => {
      const col = name => {
        const i = headers.indexOf(name);
        return i >= 0 ? row[i] : '';
      };
      return {
        rowIndex:    idx,
        carimbo:     formatVal_(col(HDR_TS)),
        dataFesta:   formatVal_(col(HDR_DATA)),
        horaInicio:  formatVal_(col(HDR_INICIO)),
        horaFim:     formatVal_(col(HDR_FIM)),
        cliente:     col(HDR_NOME),
        telefone:    String(col(HDR_TEL)),
        valorTotal:  parseFloat(col(HDR_VALOR))   || 0,
        caucao:      parseFloat(col(HDR_CAUCAO))  || 0,
        limpeza:     parseFloat(col(HDR_LIMPEZA)) || 0,
        valorPago:   parseFloat(col(HDR_PAGO))    || 0,
        pagoExtra:   parseFloat(col('Pago Extra')) || 0,
        observacoes: col(HDR_OBS),
        quemLimpa:   col(HDR_QUEM_LIMPA),
        sync:        col(HDR_SYNC),
        linkCalendar: col(HDR_LINK_F),
      };
    });

  const json = JSON.stringify(events);
  return ContentService
    .createTextOutput(callback ? `${callback}(${json})` : json)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}


/***** TRIGGER: Ao submeter o formulário *****/
function onFormSubmit(e) {
  if (!e || !e.range) {
    throw new Error('Este script só funciona via acionador "Ao enviar um formulário".');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error(`Folha "${SHEET_NAME}" não encontrada.`);

  const row = e.range.getRow();
  if (row <= 1) return;

  const cols = getCols_(sh, [
    HDR_DATA, HDR_INICIO, HDR_FIM,
    HDR_NOME, HDR_TEL, HDR_VALOR, HDR_CAUCAO, HDR_LIMPEZA, HDR_PAGO, HDR_OBS,
    HDR_LINK_A, HDR_LINK_F, HDR_SYNC
  ]);
  // Quem limpa é opcional — se a coluna não existir, ignora sem rebentar
  const colsOpt = getColsOpt_(sh, [HDR_QUEM_LIMPA]);

  const syncVal = sh.getRange(row, cols[HDR_SYNC]).getValue();
  if (String(syncVal).trim().toUpperCase() === 'OK') return;

  const dataFesta = sh.getRange(row, cols[HDR_DATA]).getValue();
  const horaIni   = sh.getRange(row, cols[HDR_INICIO]).getValue();
  const horaFim   = sh.getRange(row, cols[HDR_FIM]).getValue();

  const start = toDateTime_(dataFesta, horaIni);
  let end     = toDateTime_(dataFesta, horaFim);

  if (!(start instanceof Date) || isNaN(start.getTime())) {
    throw new Error(`Start inválido na linha ${row}.`);
  }
  if (!(end instanceof Date) || isNaN(end.getTime())) {
    throw new Error(`End inválido na linha ${row}.`);
  }

  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  const nome  = sh.getRange(row, cols[HDR_NOME]).getValue();
  const tel   = sh.getRange(row, cols[HDR_TEL]).getValue();
  const valor = sh.getRange(row, cols[HDR_VALOR]).getValue();
  const cau   = sh.getRange(row, cols[HDR_CAUCAO]).getValue();
  const limp  = sh.getRange(row, cols[HDR_LIMPEZA]).getValue();
  const pago  = sh.getRange(row, cols[HDR_PAGO]).getValue();
  const obs   = sh.getRange(row, cols[HDR_OBS]).getValue();
  const quemLimpa = colsOpt[HDR_QUEM_LIMPA] ? sh.getRange(row, colsOpt[HDR_QUEM_LIMPA]).getValue() : '';

  const titulo = `Festa — ${nome || 'Cliente'} (Flamenga)`;

  // Formatos legíveis (start/end são Date com fuso correcto)
  const dataLbl = Utilities.formatDate(start, TZ, 'EEEE, dd/MM/yyyy');
  const horaIniLbl = Utilities.formatDate(start, TZ, 'HH:mm');
  const horaFimLbl = Utilities.formatDate(end, TZ, 'HH:mm');
  const duracaoMin = Math.round((end.getTime() - start.getTime()) / 60000);
  const duracaoLbl = duracaoMin >= 60
    ? `${Math.floor(duracaoMin / 60)}h${duracaoMin % 60 ? String(duracaoMin % 60).padStart(2,'0') : ''}`
    : `${duracaoMin}min`;

  const descricao =
`COSMOPOLITAN PARTY — Detalhes da Festa

Data: ${dataLbl}
Horário: ${horaIniLbl} – ${horaFimLbl} (${duracaoLbl})

Cliente: ${nome || '-'}
Telefone: ${tel || '-'}

Valores
- Festa: ${fmtMoney_(valor)}
- Caução: ${fmtMoney_(cau)}
- Limpeza: ${fmtMoney_(limp)}
- Pago: ${fmtMoney_(pago)}
- Em falta: ${fmtMoney_((+valor || 0) - (+pago || 0))}

Limpeza: ${quemLimpa || '-'}

Observações:
${obs || '-'}`.trim();

  const cal = CalendarApp.getCalendarById(CAL_ID);
  if (!cal) throw new Error(`Não consegui aceder ao calendário: ${CAL_ID}`);

  const ev = cal.createEvent(titulo, start, end, {
    description: descricao,
    timeZone: TZ
  });

  const linkEvento = 'https://calendar.google.com/calendar/event?eid='
    + Utilities.base64Encode(ev.getId()).replace(/=+$/, '');

  sh.getRange(row, cols[HDR_LINK_F]).setValue(linkEvento);
  sh.getRange(row, cols[HDR_LINK_A]).setValue(linkEvento);
  sh.getRange(row, cols[HDR_SYNC]).setValue('OK');

  // ─── Pedido de dados ao cliente — link WhatsApp 1-clique ───
  const dataPt = formatarDataPt_(dataFesta);
  const primeiroNome = String(nome || '').trim().split(/\s+/)[0] || 'cliente';
  const msgPedido =
`Olá ${primeiroNome}, aqui Andreia da Cosmopolitan Party. A sua festa de ${dataPt} ficou reservada.

Para confirmar a reserva falta apenas o contrato — assim para prosseguirmos precisamos de:
• Nome completo
• Foto/cópia do documento (CC ou passaporte)
• NIF
• Morada

Assim que tenha toda a informação necessária, enviamos o contrato.
A assinatura é online pelo que não será necessário se deslocar.

Qualquer dúvida estamos ao dispor.`;
  const telNorm = normalizePtPhone_(tel);
  const waLink = telNorm ? `https://wa.me/${telNorm}?text=${encodeURIComponent(msgPedido)}` : '';

  const subj = `Festa criada no calendário: ${titulo}`;
  const bodyText = `${descricao}\n\nLink do evento: ${linkEvento}` +
    (waLink ? `\n\nPedido de dados ao cliente (1 clique):\n${waLink}` : '\n\nSem telefone válido — pedido de dados tem de ser enviado manualmente.');

  const htmlBody =
    '<div style="font-family:Arial,sans-serif;max-width:560px;color:#1a0010">' +
      '<div style="background:linear-gradient(135deg,#e0187a,#ff4da6);padding:20px;border-radius:12px 12px 0 0;color:#fff">' +
        '<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:.85">Cosmopolitan Party</div>' +
        `<div style="font-size:20px;font-weight:700;margin-top:6px">Festa criada</div>` +
        `<div style="font-size:13px;opacity:.9;margin-top:4px">${escapeHtml_(nome || 'Cliente')} · ${escapeHtml_(dataPt)}</div>` +
      '</div>' +
      '<div style="border:1px solid #f0c8dc;border-top:none;border-radius:0 0 12px 12px;padding:20px">' +
        `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;font-size:13px;margin:0 0 16px;color:#333">${escapeHtml_(descricao)}</pre>` +
        `<p style="margin:0 0 10px;font-size:13px"><a href="${linkEvento}" style="color:#e0187a;text-decoration:none;font-weight:600">Abrir no Google Calendar</a></p>` +
        (waLink
          ? `<div style="margin-top:18px;padding-top:14px;border-top:1px solid #f0c8dc"><p style="margin:0 0 8px;font-size:12px;color:#8a5a70">Próximo passo — pedido de dados ao cliente:</p><a href="${waLink}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:11px 18px;border-radius:9px;font-weight:600;font-size:13px">Enviar WhatsApp (mensagem pronta)</a></div>`
          : '<p style="margin-top:14px;color:#c0143c;font-size:12px">Sem telefone válido — pedido de dados tem de ser enviado manualmente.</p>') +
      '</div>' +
    '</div>';

  EMAIL_TO.forEach(to => {
    if (!to) return;
    // GmailApp.sendEmail só aceita assinatura posicional (recipient, subject, body, options)
    GmailApp.sendEmail(to, subj, bodyText, { htmlBody: htmlBody, name: 'Cosmopolitan Party' });
  });
}

// ─── Helpers para o pedido de dados ───
function normalizePtPhone_(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('351') && digits.length >= 12) return digits.slice(0, 12);
  if (digits.length === 9) return '351' + digits;
  return digits;
}
function formatarDataPt_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, TZ, 'dd/MM/yyyy');
  }
  const s = String(v).trim();
  const m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m1) return `${m1[3].padStart(2,'0')}/${m1[2].padStart(2,'0')}/${m1[1]}`;
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) return `${m2[1].padStart(2,'0')}/${m2[2].padStart(2,'0')}/${m2[3]}`;
  return s;
}
function escapeHtml_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


/***** DISPONIBILIDADE (página HTML do Ivo) *****/
function verificarDisponibilidade(data, inicio, fim) {
  if (!data || !inicio || !fim) {
    return { ok: false, mensagem: 'Preenche data, hora de início e hora de término.' };
  }

  const cal = CalendarApp.getCalendarById(CAL_ID);
  if (!cal) return { ok: false, mensagem: 'Não foi possível aceder ao calendário.' };

  let start = new Date(`${data}T${inicio}:00`);
  let end   = new Date(`${data}T${fim}:00`);

  if (end <= start) end.setDate(end.getDate() + 1);

  if (BUFFER_MINUTES > 0) {
    start = new Date(start.getTime() - BUFFER_MINUTES * 60000);
    end   = new Date(end.getTime()   + BUFFER_MINUTES * 60000);
  }

  const eventos = cal.getEvents(start, end);
  if (eventos.length > 0) {
    return { ok: false, mensagem: 'Já existe uma festa ou bloqueio nesse horário.' };
  }

  return { ok: true, mensagem: 'Espaço disponível.', formUrl: construirLinkForm(data, inicio, fim) };
}

function construirLinkForm(data, inicio, fim) {
  const ini = inicio.length === 5 ? inicio + ':00' : inicio;
  const f   = fim.length   === 5 ? fim   + ':00' : fim;
  return FORM_BASE_URL + '?usp=pp_url'
    + '&' + FORM_FIELDS.data   + '=' + encodeURIComponent(data)
    + '&' + FORM_FIELDS.inicio + '=' + encodeURIComponent(ini)
    + '&' + FORM_FIELDS.fim    + '=' + encodeURIComponent(f);
}

function formatarDataParaForm(dataIso) { return dataIso; }


/***** HELPERS GERAIS *****/
function getCols_(sheet, headersNeeded) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  const out = {};
  headersNeeded.forEach(h => {
    const idx = headers.indexOf(String(h).trim());
    if (idx === -1) throw new Error(`Coluna "${h}" não encontrada.`);
    out[h] = idx + 1;
  });
  return out;
}
// Versão opcional — se a coluna não existir, devolve undefined em vez de rebentar
function getColsOpt_(sheet, headersNeeded) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  const out = {};
  headersNeeded.forEach(h => {
    const idx = headers.indexOf(String(h).trim());
    if (idx >= 0) out[h] = idx + 1;
  });
  return out;
}

function toDateTime_(dateVal, timeVal) {
  const d = normalizeDate_(dateVal);
  if (!d) return null;
  const t = normalizeTime_(timeVal);
  if (!t) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.hours, t.minutes, t.seconds, 0);
}

function normalizeDate_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  const s = String(v).trim();
  if (!s) return null;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}

function normalizeTime_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return { hours: v.getHours(), minutes: v.getMinutes(), seconds: v.getSeconds() };
  }
  if (typeof v === 'number') {
    const total = Math.round(v * 86400);
    return { hours: Math.floor(total / 3600) % 24, minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]), se = m[3] ? Number(m[3]) : 0;
  if (h > 23 || mi > 59 || se > 59) return null;
  return { hours: h, minutes: mi, seconds: se };
}

function formatVal_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  }
  return String(v);
}

function fmtMoney_(v) {
  if (v === '' || v === null || v === undefined) return '';
  return String(v).trim() + (String(v).includes('€') ? '' : ' €');
}


/* =====================================================================
   VISITAS AO ESPAÇO (30 min)
   =====================================================================
   Setup (uma vez):
   1. Project Settings → Script Properties → adiciona
        VISITAS_ADMIN_TOKEN = <palavra-passe à tua escolha>
   2. Corre uma vez a função vst_setup() (cria as 2 sheets novas e
      pede autorização Calendar + Gmail — aceita).
   3. Deploy → Manage Deployments → ✏️ → New version → Deploy.
   ===================================================================== */

function vst_setup() {
  const ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(VST_SHEET_BLOCOS)) {
    const s = ss.insertSheet(VST_SHEET_BLOCOS);
    s.appendRow(['id', 'data', 'inicio', 'fim', 'criado_em']);
    s.setFrozenRows(1);
  }
  if (!ss.getSheetByName(VST_SHEET_MARC)) {
    const s = ss.insertSheet(VST_SHEET_MARC);
    s.appendRow(['id', 'data', 'slot', 'nome', 'email', 'telefone', 'obs',
                 'calendar_event_id', 'link_calendario', 'criado_em', 'status']);
    s.setFrozenRows(1);
  }
}

function vst_jsonp_(e, obj) {
  const cb = (e && e.parameter && e.parameter.callback) || 'cb';
  return ContentService
    .createTextOutput(cb + '(' + JSON.stringify(obj) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function vst_normData_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (v instanceof Date) {
    const y = v.getFullYear(),
          m = String(v.getMonth() + 1).padStart(2, '0'),
          d = String(v.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  if (typeof v === 'number') {
    // Serial number do Sheets (dias desde 1899-12-30)
    const epoch = new Date(1899, 11, 30);
    const dt = new Date(epoch.getTime() + v * 86400000);
    const y = dt.getFullYear(),
          m = String(dt.getMonth() + 1).padStart(2, '0'),
          d = String(dt.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/); if (m) return m[3] + '-' + m[2] + '-' + m[1];
  return '';
}

function vst_normHora_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  }
  if (typeof v === 'number') {
    // Fração de dia (0.604166… = 14:30) — pode vir > 1 se Sheets guardou como datetime serial
    const frac = v - Math.floor(v);
    const totalMin = Math.round(frac * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return m[1].padStart(2, '0') + ':' + m[2];
  return '';
}

function vst_horaToMin_(h) {
  const [H, M] = h.split(':').map(Number);
  return H * 60 + M;
}

function vst_humanData_(d) {
  const [Y, M, D] = d.split('-').map(Number);
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return D + ' ' + meses[M - 1] + ' ' + Y;
}

function vst_lerBlocos_(ss) {
  const sh = ss.getSheetByName(VST_SHEET_BLOCOS);
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(r => ({
    id: String(r[0]),
    data: vst_normData_(r[1]),
    inicio: vst_normHora_(r[2]),
    fim: vst_normHora_(r[3])
  })).filter(b => b.id && b.data);
}

function vst_lerMarcacoes_(ss) {
  const sh = ss.getSheetByName(VST_SHEET_MARC);
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(r => ({
    id: String(r[0]),
    data: vst_normData_(r[1]),
    slot: vst_normHora_(r[2]),
    nome: String(r[3] || ''),
    email: String(r[4] || ''),
    telefone: String(r[5] || ''),
    obs: String(r[6] || ''),
    calendar_event_id: String(r[7] || ''),
    link_calendario: String(r[8] || ''),
    criado_em: String(r[9] || ''),
    status: String(r[10] || 'ativa')
  })).filter(m => m.id);
}

function vst_lerFestasDias_(ss, mesFiltro) {
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow <= 1 || lastCol <= 0) return [];
  // Lê só o header para encontrar a coluna Data
  const hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim().toLowerCase());
  let iData = hdr.indexOf('data');
  if (iData < 0) iData = hdr.indexOf(HDR_DATA.toLowerCase());
  if (iData < 0) return [];
  // Lê apenas a coluna Data (1 coluna em vez da sheet inteira)
  const vals = sh.getRange(2, iData + 1, lastRow - 1, 1).getValues();
  const out = new Set();
  for (let i = 0; i < vals.length; i++) {
    const d = vst_normData_(vals[i][0]);
    if (d && (!mesFiltro || d.indexOf(mesFiltro) === 0)) out.add(d);
  }
  return Array.from(out);
}

function vst_disponibilidade(mes) {
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    const hoje = new Date();
    mes = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
  }
  const ss = SpreadsheetApp.getActive();
  const blocos = vst_lerBlocos_(ss).filter(b => b.data.indexOf(mes) === 0);
  const marcacoes = vst_lerMarcacoes_(ss)
    .filter(m => m.data.indexOf(mes) === 0 && m.status === 'ativa')
    .map(m => ({ data: m.data, slot: m.slot }));
  const festas = vst_lerFestasDias_(ss, mes);
  return { ok: true, mes: mes, blocos: blocos, marcacoes: marcacoes, festas: festas };
}

function vst_marcar(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.getActive();
    const data = vst_normData_(payload.data);
    const slot = vst_normHora_(payload.slot);
    if (!data || !slot) return { ok: false, mensagem: 'Data ou horário inválido.' };
    if (!payload.nome || !payload.email || !payload.telefone) {
      return { ok: false, mensagem: 'Preenche nome, email e telefone.' };
    }

    const slotMin = vst_horaToMin_(slot);
    // Defesa 1: slots têm de ser múltiplos de 30 min (ancorados em :00 e :30)
    if (slotMin % 30 !== 0) {
      return { ok: false, mensagem: 'Horário inválido. Os slots começam em :00 ou :30.' };
    }

    // Snap retroactivo dos blocos antigos para garantir que slots redondos cabem em blocos esquisitos
    const blocos = vst_lerBlocos_(ss).filter(b => b.data === data);
    const dentro = blocos.some(b => {
      const bi = Math.ceil(vst_horaToMin_(b.inicio) / 30) * 30;
      const bf = Math.floor(vst_horaToMin_(b.fim) / 30) * 30;
      return slotMin >= bi && (slotMin + 30) <= bf;
    });
    if (!dentro) return { ok: false, mensagem: 'Esse horário não está disponível.' };

    // Verifica overlap (não só slot exato) — apanha marcações antigas com slots não-redondos
    const slotEnd = slotMin + 30;
    const marc = vst_lerMarcacoes_(ss).filter(m => m.data === data && m.status === 'ativa');
    const overlap = marc.some(m => {
      const ms = vst_horaToMin_(m.slot);
      if (isNaN(ms)) return false;
      const me = ms + 30;
      return ms < slotEnd && me > slotMin;
    });
    if (overlap) {
      return { ok: false, mensagem: 'Outra pessoa marcou esse horário. Escolhe outro.' };
    }

    if (vst_lerFestasDias_(ss, data.substring(0,7)).indexOf(data) >= 0) {
      return { ok: false, mensagem: 'Esse dia já tem evento marcado.' };
    }

    const [Y, M, D] = data.split('-').map(Number);
    const [H, Mi] = slot.split(':').map(Number);
    const slotDt = new Date(Y, M - 1, D, H, Mi);
    if (slotDt.getTime() <= Date.now()) {
      return { ok: false, mensagem: 'Esse horário já passou.' };
    }

    const fimDt = new Date(slotDt.getTime() + 30 * 60 * 1000);
    const cal = CalendarApp.getCalendarById(CAL_ID);

    // Defesa 2: verificar no Calendar se já existe qualquer evento neste slot
    // (cobre rows com slot mal-parsed na sheet + bloqueios manuais da Andreia)
    const conflitos = cal.getEvents(slotDt, fimDt);
    if (conflitos.length > 0) {
      return { ok: false, mensagem: 'Outra pessoa marcou esse horário. Escolhe outro.' };
    }
    const desc = 'Visita ao espaço Cosmopolitan Party.\n\n'
               + 'Nome: ' + payload.nome + '\n'
               + 'Email: ' + payload.email + '\n'
               + 'Telefone: ' + payload.telefone
               + (payload.obs ? '\n\nObs: ' + payload.obs : '');
    // Sem guests/sendInvites — evita Google Meet automático.
    // O cliente recebe o nosso email HTML personalizado em vez de invite Calendar.
    const ev = cal.createEvent('Visita — ' + payload.nome, slotDt, fimDt, {
      description: desc
    });
    const calEventId = ev.getId();

    const id = Utilities.getUuid();
    ss.getSheetByName(VST_SHEET_MARC).appendRow([
      id, data, slot, payload.nome, payload.email, payload.telefone,
      payload.obs || '', calEventId, ev.getHtmlLink ? ev.getHtmlLink() : '',
      new Date().toISOString(), 'ativa'
    ]);

    vst_emailCliente_(payload, data, slot);
    vst_emailInternos_(payload, data, slot);

    return {
      ok: true,
      id: id,
      mensagem: 'Visita marcada para ' + vst_humanData_(data) + ' às ' + slot + '. Recebes confirmação por email.'
    };
  } finally {
    lock.releaseLock();
  }
}

function vst_emailCliente_(p, data, slot) {
  const assunto = 'Visita ao espaço Cosmopolitan Party — ' + vst_humanData_(data) + ' às ' + slot;
  const html =
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a0010">' +
      '<div style="background:linear-gradient(135deg,#e0187a,#ff4da6);padding:24px;border-radius:12px 12px 0 0;color:#fff">' +
        '<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:.8">Cosmopolitan Party · Loures</div>' +
        '<div style="font-size:22px;font-weight:700;margin-top:6px">Visita confirmada</div>' +
      '</div>' +
      '<div style="border:1px solid #f0c8dc;border-top:none;border-radius:0 0 12px 12px;padding:24px">' +
        '<p>Olá ' + p.nome + ',</p>' +
        '<p>A tua visita ao espaço está marcada para:</p>' +
        '<p style="font-size:18px;font-weight:700;color:#e0187a;margin:18px 0">' +
          vst_humanData_(data) + ' · ' + slot + ' (30 min)' +
        '</p>' +
        '<p><strong>Local:</strong> Loures<br/><strong>Para alterar ou cancelar:</strong> 930 666 370 (Erica) ou 964 505 429 (Ivo)</p>' +
        '<p style="margin-top:18px">Também podes responder a este email.</p>' +
        '<p style="color:#8a5a70;font-size:12px;margin-top:24px;border-top:1px solid #f0c8dc;padding-top:14px">Cosmopolitan Party · Loures</p>' +
      '</div>' +
    '</div>';
  MailApp.sendEmail({ to: p.email, subject: assunto, htmlBody: html, name: 'Cosmopolitan Party' });
}

function vst_emailInternos_(p, data, slot) {
  const assunto = 'Nova visita — ' + vst_humanData_(data) + ' ' + slot + ' — ' + p.nome;
  const html =
    '<div style="font-family:Arial,sans-serif;max-width:560px;color:#1a0010">' +
      '<h3 style="color:#e0187a;margin-bottom:6px">Nova visita marcada</h3>' +
      '<p style="font-size:16px;font-weight:700;margin:14px 0">' + vst_humanData_(data) + ' às ' + slot + ' (30 min)</p>' +
      '<table style="border-collapse:collapse;font-size:14px">' +
        '<tr><td style="padding:4px 12px 4px 0;color:#8a5a70">Nome</td><td>' + p.nome + '</td></tr>' +
        '<tr><td style="padding:4px 12px 4px 0;color:#8a5a70">Email</td><td>' + p.email + '</td></tr>' +
        '<tr><td style="padding:4px 12px 4px 0;color:#8a5a70">Telefone</td><td>' + p.telefone + '</td></tr>' +
        (p.obs ? '<tr><td style="padding:4px 12px 4px 0;color:#8a5a70">Obs</td><td>' + p.obs + '</td></tr>' : '') +
      '</table>' +
    '</div>';
  MailApp.sendEmail({ to: VST_EMAILS_INTERNOS.join(','), subject: assunto, htmlBody: html, name: 'Cosmopolitan Party' });
}

function vst_adminCheckToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('VISITAS_ADMIN_TOKEN');
  return expected && token === expected;
}

function vst_admin(token) {
  if (!vst_adminCheckToken_(token)) return { ok: false, mensagem: 'Token inválido.' };
  const ss = SpreadsheetApp.getActive();
  return {
    ok: true,
    blocos: vst_lerBlocos_(ss),
    marcacoes: vst_lerMarcacoes_(ss),
    festas: vst_lerFestasDias_(ss)
  };
}

function vst_criarBloco(payload) {
  if (!vst_adminCheckToken_(payload.token)) return { ok: false, mensagem: 'Token inválido.' };
  const data = vst_normData_(payload.data);
  let inicio = vst_normHora_(payload.inicio);
  let fim = vst_normHora_(payload.fim);
  if (!data || !inicio || !fim) return { ok: false, mensagem: 'Dados inválidos.' };
  // Snap server-side para múltiplos de 30 (defesa contra clients antigos)
  const iniMin = Math.ceil(vst_horaToMin_(inicio) / 30) * 30;
  const fimMin = Math.floor(vst_horaToMin_(fim) / 30) * 30;
  if (iniMin >= fimMin) {
    return { ok: false, mensagem: 'Bloco demasiado curto (mínimo 30 min entre :00 e :30).' };
  }
  inicio = String(Math.floor(iniMin / 60)).padStart(2, '0') + ':' + String(iniMin % 60).padStart(2, '0');
  fim = String(Math.floor(fimMin / 60)).padStart(2, '0') + ':' + String(fimMin % 60).padStart(2, '0');
  const id = Utilities.getUuid();
  SpreadsheetApp.getActive().getSheetByName(VST_SHEET_BLOCOS)
    .appendRow([id, data, inicio, fim, new Date().toISOString()]);
  return { ok: true, id: id };
}

function vst_removerBloco(payload) {
  if (!vst_adminCheckToken_(payload.token)) return { ok: false, mensagem: 'Token inválido.' };
  const sh = SpreadsheetApp.getActive().getSheetByName(VST_SHEET_BLOCOS);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === payload.id) {
      sh.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, mensagem: 'Bloco não encontrado.' };
}

function vst_cancelarMarcacao(payload) {
  if (!vst_adminCheckToken_(payload.token)) return { ok: false, mensagem: 'Token inválido.' };
  const sh = SpreadsheetApp.getActive().getSheetByName(VST_SHEET_MARC);
  const data = sh.getDataRange().getValues();
  const hdr = data[0];
  const iStatus = hdr.indexOf('status');
  const iCalId = hdr.indexOf('calendar_event_id');
  const iNome = hdr.indexOf('nome');
  const iEmail = hdr.indexOf('email');
  const iData = hdr.indexOf('data');
  const iSlot = hdr.indexOf('slot');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === payload.id) {
      try {
        const cal = CalendarApp.getCalendarById(CAL_ID);
        const ev = cal.getEventById(data[i][iCalId]);
        if (ev) ev.deleteEvent();
      } catch (err) {}
      sh.getRange(i + 1, iStatus + 1).setValue('cancelada');
      try {
        const dt = vst_normData_(data[i][iData]);
        const slot = vst_normHora_(data[i][iSlot]);
        MailApp.sendEmail({
          to: String(data[i][iEmail]),
          subject: 'Visita cancelada — ' + vst_humanData_(dt) + ' ' + slot,
          htmlBody:
            '<p>Olá ' + data[i][iNome] + ',</p>' +
            '<p>A tua visita marcada para <strong>' + vst_humanData_(dt) + ' às ' + slot + '</strong> foi cancelada.</p>' +
            '<p>Para remarcares, abre <a href="' + VST_PAGINA_PUBLICA + '">a página de marcações</a> ou liga 930 666 370 (Erica) / 964 505 429 (Ivo).</p>' +
            '<p style="color:#8a5a70;font-size:12px">— Cosmopolitan Party</p>',
          name: 'Cosmopolitan Party'
        });
      } catch (err) {}
      return { ok: true };
    }
  }
  return { ok: false, mensagem: 'Marcação não encontrada.' };
}
