/**
 * ============================================================
 * VISITAS AO ESPAÇO — BACKEND
 * ============================================================
 *
 * Como instalar no Apps Script existente da Marcação do Ivo
 * (o mesmo script que serve "?page=dados" para o dashboard):
 *
 * 1) Abre o Apps Script Editor desse projeto.
 *
 * 2) Cria um novo ficheiro "Visitas.gs" e cola TUDO o que está
 *    abaixo do separador "INÍCIO DO CÓDIGO".
 *
 * 3) No ficheiro principal (onde está o doGet existente):
 *    a) Dentro do doGet(e), antes do return final, adiciona:
 *
 *         if (e.parameter.page === 'visitas-disponibilidade')
 *           return vst_jsonp_(e, vst_disponibilidade(e.parameter.mes));
 *         if (e.parameter.page === 'visitas-admin')
 *           return vst_jsonp_(e, vst_admin(e.parameter.token));
 *
 *    b) Se ainda não existir um doPost no projeto, copia o doPost
 *       que está no fim deste ficheiro. Se já existir, adiciona
 *       os cases do switch (visitas.marcar, visitas.bloco.criar,
 *       visitas.bloco.remover, visitas.marcacao.cancelar).
 *
 * 4) No menu do Apps Script: Project Settings → Script Properties.
 *    Adiciona uma propriedade:
 *
 *         Key:   VISITAS_ADMIN_TOKEN
 *         Value: <escolhe uma palavra-passe qualquer, ex: "cosmo-2026-visitas">
 *
 *    Este token só é pedido para acções de admin (criar bloco,
 *    cancelar marcação). A página pública não o precisa.
 *
 * 5) Corre a função vst_setup() uma vez — vai criar as 2 sheets
 *    novas no spreadsheet ativo ("Visitas Blocos" e
 *    "Visitas Marcacoes"). Vai pedir autorização para Calendar
 *    e Gmail — aceita.
 *
 * 6) Re-deploy: Deploy → Manage Deployments → Edit → Nova versão
 *    → Deploy. O URL fica igual ao que já está em SCRIPT_URL.
 *
 * 7) No dashboard, vai a Ferramentas → "Visitas — Admin" e cola
 *    o mesmo token no campo que aparece.
 *
 * ============================================================
 * INÍCIO DO CÓDIGO
 * ============================================================ */

const VST_CAL_ID = 'cosmopolitanparty.loures@gmail.com';
const VST_EMAILS_INTERNOS = ['cosmopolitanparty.loures@gmail.com', 'ocasiaodemordomias@gmail.com'];
const VST_SHEET_BLOCOS = 'Visitas Blocos';
const VST_SHEET_MARC = 'Visitas Marcacoes';
const VST_SHEET_FESTAS = 'Festas';
const VST_PAGINA_PUBLICA = 'https://cosmopolitanparty.pt/visitas/';

/* ---------- SETUP ---------- */
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

/* ---------- HELPERS DE RESPOSTA ---------- */
function vst_jsonp_(e, obj) {
  const cb = (e && e.parameter && e.parameter.callback) || 'cb';
  return ContentService
    .createTextOutput(cb + '(' + JSON.stringify(obj) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function vst_json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- PARSERS ---------- */
function vst_normData_(v) {
  if (!v) return '';
  if (v instanceof Date) {
    const y = v.getFullYear(),
          m = String(v.getMonth() + 1).padStart(2, '0'),
          d = String(v.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/); if (m) return m[3] + '-' + m[2] + '-' + m[1];
  return '';
}

function vst_normHora_(v) {
  if (!v) return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
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

/* ---------- LEITURAS ---------- */
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

function vst_lerFestasDias_(ss) {
  const sh = ss.getSheetByName(VST_SHEET_FESTAS);
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return [];
  const hdr = data[0].map(h => String(h).trim().toLowerCase());
  const iData = hdr.indexOf('data');
  if (iData < 0) return [];
  const out = new Set();
  for (let i = 1; i < data.length; i++) {
    const d = vst_normData_(data[i][iData]);
    if (d) out.add(d);
  }
  return Array.from(out);
}

/* ---------- ROTAS PÚBLICAS ---------- */
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
  const festas = vst_lerFestasDias_(ss).filter(d => d.indexOf(mes) === 0);
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

    const blocos = vst_lerBlocos_(ss).filter(b => b.data === data);
    const slotMin = vst_horaToMin_(slot);
    const dentro = blocos.some(b => slotMin >= vst_horaToMin_(b.inicio) && (slotMin + 30) <= vst_horaToMin_(b.fim));
    if (!dentro) return { ok: false, mensagem: 'Esse horário não está disponível.' };

    const marc = vst_lerMarcacoes_(ss).filter(m => m.data === data && m.status === 'ativa');
    if (marc.some(m => m.slot === slot)) {
      return { ok: false, mensagem: 'Outra pessoa marcou esse horário. Escolhe outro.' };
    }

    if (vst_lerFestasDias_(ss).indexOf(data) >= 0) {
      return { ok: false, mensagem: 'Esse dia já tem evento marcado.' };
    }

    const [Y, M, D] = data.split('-').map(Number);
    const [H, Mi] = slot.split(':').map(Number);
    const slotDt = new Date(Y, M - 1, D, H, Mi);
    if (slotDt.getTime() <= Date.now()) {
      return { ok: false, mensagem: 'Esse horário já passou.' };
    }

    const fimDt = new Date(slotDt.getTime() + 30 * 60 * 1000);
    const cal = CalendarApp.getCalendarById(VST_CAL_ID);
    const desc = 'Visita ao espaço Cosmopolitan Party.\n\n'
               + 'Nome: ' + payload.nome + '\n'
               + 'Email: ' + payload.email + '\n'
               + 'Telefone: ' + payload.telefone
               + (payload.obs ? '\n\nObs: ' + payload.obs : '');
    const ev = cal.createEvent('Visita — ' + payload.nome, slotDt, fimDt, {
      description: desc,
      guests: payload.email,
      sendInvites: true
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
        '<p><strong>Local:</strong> Loures<br/><strong>Contacto:</strong> 964 505 429</p>' +
        '<p style="margin-top:18px">Se precisares de alterar ou cancelar, é só responder a este email.</p>' +
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

/* ---------- ADMIN ---------- */
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
  const inicio = vst_normHora_(payload.inicio);
  const fim = vst_normHora_(payload.fim);
  if (!data || !inicio || !fim) return { ok: false, mensagem: 'Dados inválidos.' };
  if (vst_horaToMin_(inicio) >= vst_horaToMin_(fim)) {
    return { ok: false, mensagem: 'O fim tem de ser depois do início.' };
  }
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
        const cal = CalendarApp.getCalendarById(VST_CAL_ID);
        const ev = cal.getEventById(data[i][iCalId]);
        if (ev) ev.deleteEvent();
      } catch (e) {}
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
            '<p>Para remarcares, abre <a href="' + VST_PAGINA_PUBLICA + '">a página de marcações</a> ou liga 964 505 429.</p>' +
            '<p style="color:#8a5a70;font-size:12px">— Cosmopolitan Party</p>',
          name: 'Cosmopolitan Party'
        });
      } catch (e) {}
      return { ok: true };
    }
  }
  return { ok: false, mensagem: 'Marcação não encontrada.' };
}

/* ---------- doPost (cola se ainda não existir; senão merge) ---------- */
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
  let res;
  switch (body.action) {
    case 'visitas.marcar':              res = vst_marcar(body); break;
    case 'visitas.bloco.criar':         res = vst_criarBloco(body); break;
    case 'visitas.bloco.remover':       res = vst_removerBloco(body); break;
    case 'visitas.marcacao.cancelar':   res = vst_cancelarMarcacao(body); break;
    default: res = { ok: false, mensagem: 'Acção desconhecida: ' + body.action };
  }
  return vst_json_(res);
}
