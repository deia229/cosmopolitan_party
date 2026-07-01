/**
 * COSMOPOLITAN PARTY — Contratos com Google Docs + PDF + Confirmação
 * VERSÃO COMPLETA com rota nova ?page=contratos para o dashboard.
 *
 * COMO INSTALAR (cópia segura):
 * 1. Abre o teu Apps Script de contratos
 * 2. SELECIONA TUDO no editor (Cmd+A) e APAGA
 * 3. COLA o conteúdo deste ficheiro inteiro
 * 4. Guarda (Cmd+S)
 * 5. Deploy → Manage deployments → editar deployment ATIVO
 *    → Version: "New version" → Description: "rota contratos"
 *    → Deploy
 *    (NÃO cries deployment novo — atualiza o existente para manteres o URL)
 *
 * O QUE MUDOU em relação à versão anterior:
 * - doGet(e) agora faz routing: se ?page=contratos → lista pendentes; senão → confirmação (igual a antes)
 * - Função NOVA: servirContratosPendentes_(e) — devolve JSONP com lista
 * - Tudo o resto (onFormSubmit, geração de PDF, emails, confirmação) está IGUAL ao original
 */

const CONFIG = {
  SPREADSHEET_ID:      '1d4g95miZ9LFgvakB4nsJs8QHCY5O-0xWJOa5FcpekPQ',
  SHEET_NAME:          'Respostas1',
  CONTRACTS_FOLDER_ID: '1nXDov7hD4hEG5xnNHT_awukav1SOMjV3',
  TEMPLATE_DOC_ID:     '1RqegszrYTaHXeXPtZTVCvzZ3k2GTG3UgxY7t3kGBr3M',
  TZ:                  'Europe/Lisbon',
  IVO_EMAIL:           'cosmopolitanparty.loures@gmail.com',
  ERICA_EMAIL:         'ocasiaodemordomias@gmail.com',

  COLS: {
    carimbo:         1,
    nome:            2,
    nif:             3,
    morada:          4,
    telefone:        5,
    whatsapp:        6,
    dataEvento:      7,
    horaInicio:      8,
    horaFim:         9,
    maxPessoas:      10,
    valorBase:       11,
    caucao:          12,
    limpeza:         13,
    comIVA:          14,
    observacoes:     15,
    valorJaPago:     16,
    ano:             17,
    sequencial:      18,
    idContrato:      19,
    estadoContrato:  20,
    dataConfirmacao: 21,
    horaConfirmacao: 22,
    token:           23,
    linkConfirmacao: 24,
    whatsappCliente: 25,
    whatsappEnviado: 26,
    linkPDF:         27
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getSheet_() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) throw new Error('Sheet não encontrada: ' + CONFIG.SHEET_NAME);
  return sh;
}

function val_(sh, row, col) {
  if (!col) return '';
  return (sh.getRange(row, col).getValue() || '').toString().trim();
}

function disp_(sh, row, col) {
  if (!col) return '';
  return (sh.getRange(row, col).getDisplayValue() || '').toString().trim();
}

function normalizePtPhone_(raw) {
  var digits = (raw || '').toString().replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('351') && digits.length >= 12) return digits.slice(0, 12);
  if (digits.length === 9) return '351' + digits;
  return digits;
}

function buildWaMe_(phone, msg) {
  return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(msg);
}

function esc_(s) {
  return (s || '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function calcHoras_(ini, fim) {
  try {
    var parse = function(s) {
      if (!s) return null;
      var txt = s.toString().trim().replace('h', ':').replace('.', ':');
      var m = txt.match(/(\d{1,2})[:](\d{2})/);
      return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
    };

    var i = parse(ini);
    var f = parse(fim);

    if (i === null || f === null) return '';
    if (f <= i) f += 24 * 60;

    var diff = f - i;
    var h = Math.floor(diff / 60);
    var m = diff % 60;

    if (m === 0) return h + 'h';
    return h + 'h' + String(m).padStart(2, '0');
  } catch (e) {
    return '';
  }
}

function getAnoFromRow_(sh, row) {
  var d = sh.getRange(row, CONFIG.COLS.dataEvento).getValue();
  if (d instanceof Date && !isNaN(d)) return d.getFullYear();
  return new Date().getFullYear();
}

function nextSequencial_(sh, ano) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 1;

  var anos = sh.getRange(2, CONFIG.COLS.ano, lastRow - 1, 1).getValues();
  var seqs = sh.getRange(2, CONFIG.COLS.sequencial, lastRow - 1, 1).getValues();

  var max = 0;
  for (var i = 0; i < anos.length; i++) {
    var a = parseInt(anos[i][0], 10);
    var s = parseInt(seqs[i][0], 10);
    if (a === ano && !isNaN(s) && s > max) max = s;
  }
  return max + 1;
}

function escapeForReplaceText_(text) {
  return text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function replaceAllPlaceholders_(container, replacements) {
  if (!container) return;
  Object.keys(replacements).forEach(function(key) {
    container.replaceText(escapeForReplaceText_(key), replacements[key] || '');
  });
}

function aplicarLinkConfirmacao_(container, textoBotao, url) {
  if (!container) return;

  var found = null;
  while ((found = container.findText(textoBotao, found))) {
    var text = found.getElement().asText();
    var start = found.getStartOffset();
    var end = found.getEndOffsetInclusive();

    text.setLinkUrl(start, end, url);
    text.setUnderline(start, end, true);
    text.setBold(start, end, true);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GERAR GOOGLE DOC + PDF
// ─────────────────────────────────────────────────────────────────────────────

function gerarContratoDocEPdf_(dados) {
  var folder = DriveApp.getFolderById(CONFIG.CONTRACTS_FOLDER_ID);
  var nomeBase = dados.idContrato + ' - ' + dados.nome;

  // 1. Criar cópia do template
  var templateFile = DriveApp.getFileById(CONFIG.TEMPLATE_DOC_ID);
  var docCopy = templateFile.makeCopy(nomeBase, folder);
  var docId = docCopy.getId();

  // 2. Abrir o Google Doc e substituir placeholders
  var doc = DocumentApp.openById(docId);
  var body = doc.getBody();

  var linhaIVA = dados.comIVA === 'Sim'
    ? '(acresce IVA à taxa legal em vigor)'
    : '(isento de IVA)';

  var replacements = {
    '[ID CONTRATO]': dados.idContrato || '',
    '[DATA DE EMISSÃO]': dados.dataEmissao || '',
    '[NOME COMPLETO]': dados.nome || '',
    '[NIF]': dados.nif || '—',
    '[MORADA]': dados.morada || '—',
    '[TELEFONE]': dados.telefone || '—',
    '[DATA]': dados.dataEvento || '',
    '[HORA INÍCIO]': dados.horaInicio || '',
    '[HORA FIM]': dados.horaFim || '',
    '[HORAS TOTAL]': dados.horasTotal || '—',
    '[Nº MÁXIMO DE PESSOAS]': dados.maxPessoas || '',
    '[VALOR BASE]': dados.valorBase || '',
    '[LINHA IVA]': linhaIVA,
    '[CAUÇÃO]': dados.caucao || '',
    '[LIMPEZA]': dados.limpeza || '',
    '[SINAL PAGO]': dados.sinalPago || '',
    '[BTN_CONFIRMACAO]': 'Confirmar contrato'
  };

  replaceAllPlaceholders_(body, replacements);
  aplicarLinkConfirmacao_(body, 'Confirmar contrato', dados.linkConfirmacao);

  var header = doc.getHeader();
  if (header) {
    replaceAllPlaceholders_(header, replacements);
    aplicarLinkConfirmacao_(header, 'Confirmar contrato', dados.linkConfirmacao);
  }

  var footer = doc.getFooter();
  if (footer) {
    replaceAllPlaceholders_(footer, replacements);
    aplicarLinkConfirmacao_(footer, 'Confirmar contrato', dados.linkConfirmacao);
  }

  doc.saveAndClose();

  // 3. Criar PDF
  var pdfBlob = DriveApp.getFileById(docId).getAs(MimeType.PDF);
  pdfBlob.setName(nomeBase + '.pdf');
  var pdfFile = folder.createFile(pdfBlob);

  // 4. Partilhar PDF em modo leitura
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    docId: docId,
    docUrl: docCopy.getUrl(),
    pdfId: pdfFile.getId(),
    pdfUrl: pdfFile.getUrl()
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER PRINCIPAL — onFormSubmit (igual ao original)
// ─────────────────────────────────────────────────────────────────────────────

function onFormSubmit(e) {
  if (!e || !e.range) return;

  var sh = e.range.getSheet();
  var row = e.range.getRow();
  if (row < 2) return;

  // 1. Gerar ID do contrato
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);

  try {
    var ano = getAnoFromRow_(sh, row);
    var seq = nextSequencial_(sh, ano);
    var id = 'CP-' + ano + '-' + String(seq).padStart(3, '0');

    sh.getRange(row, CONFIG.COLS.ano).setValue(ano);
    sh.getRange(row, CONFIG.COLS.sequencial).setValue(seq);
    sh.getRange(row, CONFIG.COLS.idContrato).setValue(id);
    sh.getRange(row, CONFIG.COLS.estadoContrato).setValue('Pendente');
  } finally {
    lock.releaseLock();
  }

  SpreadsheetApp.flush();

  // 2. Token e link de confirmação
  var token = val_(sh, row, CONFIG.COLS.token);
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '');
    sh.getRange(row, CONFIG.COLS.token).setValue(token);
  }

  var WEB_APP_URL = PropertiesService.getScriptProperties().getProperty('WEB_APP_URL');
  if (!WEB_APP_URL) throw new Error('Falta WEB_APP_URL em Script Properties.');

  var idContrato = val_(sh, row, CONFIG.COLS.idContrato);
  var linkConfirmacao = WEB_APP_URL +
    '?row=' + row +
    '&id=' + encodeURIComponent(idContrato) +
    '&t=' + encodeURIComponent(token);

  sh.getRange(row, CONFIG.COLS.linkConfirmacao).setValue(linkConfirmacao);
  SpreadsheetApp.flush();

  // 3. Ler dados da sheet
  var nome       = disp_(sh, row, CONFIG.COLS.nome);
  var nif        = disp_(sh, row, CONFIG.COLS.nif);
  var morada     = disp_(sh, row, CONFIG.COLS.morada);
  var telefone   = disp_(sh, row, CONFIG.COLS.telefone) || disp_(sh, row, CONFIG.COLS.whatsapp);
  var dataEvento = disp_(sh, row, CONFIG.COLS.dataEvento);
  var horaInicio = disp_(sh, row, CONFIG.COLS.horaInicio);
  var horaFim    = disp_(sh, row, CONFIG.COLS.horaFim);
  var maxPessoas = disp_(sh, row, CONFIG.COLS.maxPessoas);
  var valorBase  = disp_(sh, row, CONFIG.COLS.valorBase);
  var caucao     = disp_(sh, row, CONFIG.COLS.caucao);
  var limpeza    = disp_(sh, row, CONFIG.COLS.limpeza);
  var comIVA     = disp_(sh, row, CONFIG.COLS.comIVA);
  var sinalPago  = disp_(sh, row, CONFIG.COLS.valorJaPago);
  var horasTotal = calcHoras_(horaInicio, horaFim);
  var dataEmissao = Utilities.formatDate(new Date(), CONFIG.TZ, 'dd/MM/yyyy');

  // 4. Gerar contrato + PDF
  var docInfo;
  try {
    docInfo = gerarContratoDocEPdf_({
      idContrato: idContrato,
      nome: nome,
      nif: nif,
      morada: morada,
      telefone: telefone,
      dataEvento: dataEvento,
      horaInicio: horaInicio,
      horaFim: horaFim,
      horasTotal: horasTotal,
      maxPessoas: maxPessoas,
      valorBase: valorBase,
      caucao: caucao,
      limpeza: limpeza,
      comIVA: comIVA,
      sinalPago: sinalPago,
      linkConfirmacao: linkConfirmacao,
      dataEmissao: dataEmissao
    });

    sh.getRange(row, CONFIG.COLS.linkPDF).setValue(docInfo.pdfUrl);
    sh.getRange(row, CONFIG.COLS.estadoContrato).setValue('Gerado');
    SpreadsheetApp.flush();

  } catch (err) {
    Logger.log('Erro a gerar contrato/PDF: ' + err.message);
    sh.getRange(row, CONFIG.COLS.estadoContrato).setValue('Erro contrato');
    SpreadsheetApp.flush();
    throw err;
  }

  // 5. Criar link WhatsApp
  var telNorm = normalizePtPhone_(telefone);

  var msgWA =
    'Boa tarde novamente\n' +
    'Em anexo o contrato da festa de ' + dataEvento + '.\n\n' +
    'É tudo digital — basta abrir o PDF e clicar no link de confirmação no final (Cláusula 7). Esse clique fica registado com data e hora e vale como aceitação.\n\n' +
    docInfo.pdfUrl + '\n\n' +
    'A reserva fica então garantida quando recebermos a confirmação e o sinal. Alguma questão que surja estamos ao dispor\n\n' +
    'Cosmopolitan Party';

  var waLink = telNorm ? buildWaMe_(telNorm, msgWA) : '';

  if (waLink) {
    sh.getRange(row, CONFIG.COLS.whatsappCliente).setValue(waLink);
    SpreadsheetApp.flush();
  }

  // 6. Email ao Ivo e à Érica
  var subject = '📄 Contrato pronto — ' + idContrato + ' | ' + nome + ' | ' + dataEvento;

  var htmlEmail =
    '<div style="font-family:Arial,sans-serif;max-width:580px;color:#111">' +
      '<div style="background:#1a0a0a;padding:14px 20px;border-radius:10px 10px 0 0">' +
        '<h2 style="color:#fff;margin:0;font-size:16px">🎉 Contrato Gerado — ' + esc_(idContrato) + '</h2>' +
      '</div>' +
      '<div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:18px">' +
        '<table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:16px">' +
          '<tr style="background:#fafafa"><td style="padding:6px 10px;color:#777;width:35%">Contrato</td><td style="padding:6px 10px;font-weight:bold">' + esc_(idContrato) + '</td></tr>' +
          '<tr><td style="padding:6px 10px;color:#777">Cliente</td><td style="padding:6px 10px">' + esc_(nome) + '</td></tr>' +
          '<tr style="background:#fafafa"><td style="padding:6px 10px;color:#777">Telemóvel</td><td style="padding:6px 10px">' + esc_(telefone) + '</td></tr>' +
          '<tr><td style="padding:6px 10px;color:#777">Data evento</td><td style="padding:6px 10px">' + esc_(dataEvento) + ' · ' + esc_(horaInicio) + '–' + esc_(horaFim) + (horasTotal ? ' (' + esc_(horasTotal) + ')' : '') + '</td></tr>' +
          '<tr style="background:#fafafa"><td style="padding:6px 10px;color:#777">Nº pessoas</td><td style="padding:6px 10px">' + esc_(maxPessoas) + '</td></tr>' +
          '<tr><td style="padding:6px 10px;color:#777">Valor base</td><td style="padding:6px 10px">' + esc_(valorBase) + '€ ' + (comIVA === 'Sim' ? '(c/IVA)' : '(s/IVA)') + '</td></tr>' +
          '<tr style="background:#fafafa"><td style="padding:6px 10px;color:#777">Caução</td><td style="padding:6px 10px">' + esc_(caucao) + '€</td></tr>' +
          '<tr><td style="padding:6px 10px;color:#777">Limpeza</td><td style="padding:6px 10px">' + esc_(limpeza) + '€</td></tr>' +
          '<tr style="background:#fff8e1"><td style="padding:6px 10px;color:#777">Sinal pago</td><td style="padding:6px 10px;font-weight:bold;color:#c2185b">' + esc_(sinalPago) + '€</td></tr>' +
        '</table>' +
        '<a href="' + docInfo.pdfUrl + '" style="display:inline-block;background:#1a0a0a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;font-size:13px;margin-right:8px;margin-bottom:8px">📄 Abrir Contrato PDF</a>' +
        (waLink
          ? '<a href="' + waLink + '" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;font-size:13px;margin-bottom:8px">💬 Enviar WhatsApp ao Cliente</a>'
          : '<p style="color:#ef4444;font-size:12px">⚠ Número inválido.</p>') +
        '<p style="font-size:11px;color:#9ca3af;margin-top:14px;border-top:1px solid #f3f4f6;padding-top:10px">Gerado em ' + esc_(dataEmissao) + '. O link de confirmação está dentro do PDF.</p>' +
      '</div>' +
    '</div>';

  MailApp.sendEmail({
    to: CONFIG.IVO_EMAIL,
    cc: CONFIG.ERICA_EMAIL,
    subject: subject,
    body: 'Contrato: ' + idContrato + ' | ' + nome + '\nPDF: ' + docInfo.pdfUrl + (waLink ? '\nWhatsApp: ' + waLink : ''),
    htmlBody: htmlEmail
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Localiza a linha onde o ID do contrato vive — robusto a reordenação da Sheet.
// Tenta primeiro o `rowHint` (rápido); se não bater, varre a coluna idContrato.
// ─────────────────────────────────────────────────────────────────────────────
function findRowByContractId_(sh, contractId, rowHint) {
  // 1) Hint — tentativa rápida (caso a linha ainda esteja onde estava)
  if (rowHint && rowHint >= 2) {
    var hintVal = (sh.getRange(rowHint, CONFIG.COLS.idContrato).getDisplayValue() || '').toString().trim();
    if (hintVal === contractId) return rowHint;
  }
  // 2) Procura linear pela coluna idContrato
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  var n = lastRow - 1;
  var ids = sh.getRange(2, CONFIG.COLS.idContrato, n, 1).getDisplayValues();
  for (var i = 0; i < n; i++) {
    if ((ids[i][0] || '').toString().trim() === contractId) return i + 2;
  }
  return -1;
}


// ─────────────────────────────────────────────────────────────────────────────
// doGet — ROUTING entre confirmação (original) e listagem de pendentes (NOVA)
// ─────────────────────────────────────────────────────────────────────────────

function doGet(e) {
  e = e || { parameter: {} };
  var page = (e.parameter.page || '').toString().trim();

  // ── ROTA NOVA: lista de contratos pendentes (JSONP, para o dashboard) ──
  if (page === 'contratos') {
    return servirContratosPendentes_(e);
  }

  // ── ROTA ORIGINAL: confirmação de contrato pelo cliente ──
  // Aceita o `row` no URL apenas como pista — a fonte de verdade é o `id`.
  // Procura o ID na Sheet, ignora desalinhamentos de linhas (sort, inserção, etc.).
  var rowHint = parseInt((e.parameter.row || '').toString().trim(), 10);
  var id  = (e.parameter.id || '').toString().trim();
  var t   = (e.parameter.t  || '').toString().trim();

  if (!id || !t) {
    return paginaErro_('Link inválido ou expirado.');
  }

  var sh = getSheet_();
  var row = findRowByContractId_(sh, id, rowHint);
  if (row < 2) {
    return paginaErro_('Link inválido — contrato não encontrado.');
  }

  var tokenSheet = val_(sh, row, CONFIG.COLS.token);
  if (!tokenSheet)      return paginaErro_('Token em falta. Contacta a Cosmopolitan Party.');
  if (tokenSheet !== t) return paginaErro_('Link inválido — token não coincide.');

  var already = sh.getRange(row, CONFIG.COLS.dataConfirmacao).getValue();
  if (already) {
    return paginaSucesso_('Este contrato já foi confirmado anteriormente. Obrigado!', true);
  }

  var now = new Date();
  sh.getRange(row, CONFIG.COLS.dataConfirmacao).setValue(Utilities.formatDate(now, CONFIG.TZ, 'yyyy-MM-dd'));
  sh.getRange(row, CONFIG.COLS.horaConfirmacao).setValue(Utilities.formatDate(now, CONFIG.TZ, 'HH:mm'));
  sh.getRange(row, CONFIG.COLS.estadoContrato).setValue('Confirmado');
  SpreadsheetApp.flush();

  var idSheet = id;
  var nome = val_(sh, row, CONFIG.COLS.nome);
  var dataEvento = disp_(sh, row, CONFIG.COLS.dataEvento);

  MailApp.sendEmail({
    to: CONFIG.IVO_EMAIL,
    cc: CONFIG.ERICA_EMAIL,
    subject: '✅ Contrato confirmado — ' + idSheet + ' | ' + nome,
    body: nome + ' confirmou o contrato ' + idSheet + ' para ' + dataEvento + '.\nConfirmado em: ' + Utilities.formatDate(now, CONFIG.TZ, 'dd/MM/yyyy HH:mm'),
    htmlBody:
      '<div style="font-family:Arial;max-width:480px;padding:20px;color:#111">' +
        '<div style="background:#059669;border-radius:10px;padding:12px 18px;margin-bottom:14px">' +
          '<h2 style="color:#fff;margin:0;font-size:15px">✅ Contrato Confirmado!</h2>' +
        '</div>' +
        '<p><b>Contrato:</b> ' + esc_(idSheet) + '</p>' +
        '<p><b>Cliente:</b> ' + esc_(nome) + '</p>' +
        '<p><b>Evento:</b> ' + esc_(dataEvento) + '</p>' +
        '<p><b>Confirmado em:</b> ' + Utilities.formatDate(now, CONFIG.TZ, 'dd/MM/yyyy HH:mm') + '</p>' +
      '</div>'
  });

  return paginaSucesso_('Contrato confirmado com sucesso! A Cosmopolitan Party já foi notificada.', false);
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNÇÃO NOVA — Lista de contratos pendentes via JSONP (para o dashboard)
// ─────────────────────────────────────────────────────────────────────────────

// Aceita data nos formatos yyyy/MM/dd, yyyy-MM-dd, dd/MM/yyyy. Devolve timestamp (ou 0).
function parseDataContrato_(s) {
  if (!s) return 0;
  s = String(s).trim();
  var m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
  return 0;
}

function servirContratosPendentes_(e) {
  var all = (e.parameter.all || '').toString().trim() === '1';
  // Filtro opcional: só contratos cuja dataEvento >= since (YYYY-MM-DD)
  var since = (e.parameter.since || '').toString().trim();
  var sinceTs = since ? parseDataContrato_(since) : 0;
  var sh = getSheet_();
  var lastRow = sh.getLastRow();
  var contratos = [];

  if (lastRow >= 2) {
    var n = lastRow - 1;
    var startRow = 2;

    var nomeArr     = sh.getRange(startRow, CONFIG.COLS.nome,           n, 1).getDisplayValues();
    var telArr      = sh.getRange(startRow, CONFIG.COLS.telefone,       n, 1).getDisplayValues();
    var dataArr     = sh.getRange(startRow, CONFIG.COLS.dataEvento,     n, 1).getDisplayValues();
    var horaIniArr  = sh.getRange(startRow, CONFIG.COLS.horaInicio,     n, 1).getDisplayValues();
    var horaFimArr  = sh.getRange(startRow, CONFIG.COLS.horaFim,        n, 1).getDisplayValues();
    var idArr       = sh.getRange(startRow, CONFIG.COLS.idContrato,     n, 1).getDisplayValues();
    var estadoArr   = sh.getRange(startRow, CONFIG.COLS.estadoContrato, n, 1).getDisplayValues();
    var dataConfArr = sh.getRange(startRow, CONFIG.COLS.dataConfirmacao,n, 1).getDisplayValues();
    var pdfArr      = sh.getRange(startRow, CONFIG.COLS.linkPDF,        n, 1).getDisplayValues();
    var waArr       = sh.getRange(startRow, CONFIG.COLS.whatsappCliente,n, 1).getDisplayValues();

    var confirmadosPorChave = {};
    for (var i = 0; i < n; i++) {
      var est = (estadoArr[i][0] || '').toString().trim();
      var dc  = (dataConfArr[i][0] || '').toString().trim();
      if (est === 'Confirmado' || dc) {
        var chave = (nomeArr[i][0] || '').toString().trim().toLowerCase() + '|' + (dataArr[i][0] || '').toString().trim();
        confirmadosPorChave[chave] = (idArr[i][0] || '').toString().trim();
      }
    }

    for (var j = 0; j < n; j++) {
      var estado = (estadoArr[j][0] || '').toString().trim();
      var dataConf = (dataConfArr[j][0] || '').toString().trim();
      var idC = (idArr[j][0] || '').toString().trim();
      if (!idC) continue;
      var confirmado = (estado === 'Confirmado' || !!dataConf);
      // Por defeito (sem all=1) só devolve pendentes — mantém compatibilidade
      if (!all && confirmado) continue;

      var nome = (nomeArr[j][0] || '').toString().trim();
      var dataEv = (dataArr[j][0] || '').toString().trim();
      // Filtro temporal: ignora contratos cuja data do evento já passou (mês anterior)
      if (sinceTs) {
        var evTs = parseDataContrato_(dataEv);
        if (evTs && evTs < sinceTs) continue;
      }
      var chaveDup = nome.toLowerCase() + '|' + dataEv;
      var substituidoPor = confirmadosPorChave[chaveDup] || null;

      contratos.push({
        id:             idC,
        cliente:        nome,
        telefone:       (telArr[j][0]      || '').toString().trim(),
        dataEvento:     dataEv,
        horaInicio:     (horaIniArr[j][0]  || '').toString().trim(),
        horaFim:        (horaFimArr[j][0]  || '').toString().trim(),
        estado:         estado,
        dataConfirmacao: dataConf,
        confirmado:     confirmado,
        linkPDF:        (pdfArr[j][0]      || '').toString().trim(),
        waLink:         (waArr[j][0]       || '').toString().trim(),
        substituidoPor: substituidoPor,
        row:            j + 2
      });
    }
  }

  var cb = (e.parameter.callback || '').toString().trim();
  var json = JSON.stringify(contratos);
  if (cb) {
    return ContentService.createTextOutput(cb + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────────────────────
// PÁGINAS HTML — Sucesso e Erro (iguais ao original)
// ─────────────────────────────────────────────────────────────────────────────

function paginaSucesso_(msg, jaFeito) {
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cosmopolitan Party</title>' +
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;background:#f0fdf4;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#fff;border-radius:16px;padding:40px 28px;max-width:440px;width:100%;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.08)}.icon{font-size:52px;margin-bottom:14px}h1{font-size:20px;color:#111;margin-bottom:10px}p{color:#666;font-size:14px;line-height:1.6;margin-bottom:6px}.brand{margin-top:24px;font-size:11px;color:#aaa}</style></head>' +
    '<body><div class="card"><div class="icon">' + (jaFeito ? '✅' : '🎉') + '</div>' +
    '<h1>' + (jaFeito ? 'Já confirmado' : 'Confirmação registada!') + '</h1>' +
    '<p>' + esc_(msg) + '</p><p>Pode fechar esta página.</p>' +
    '<div class="brand">Cosmopolitan Party · cosmopolitanparty.loures@gmail.com</div></div></body></html>'
  ).setTitle('Cosmopolitan Party');
}

function paginaErro_(msg) {
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cosmopolitan Party</title>' +
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;background:#fff1f2;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#fff;border-radius:16px;padding:40px 28px;max-width:440px;width:100%;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.08)}.icon{font-size:52px;margin-bottom:14px}h1{font-size:20px;color:#111;margin-bottom:10px}p{color:#666;font-size:14px;line-height:1.6;margin-bottom:6px}.brand{margin-top:24px;font-size:11px;color:#aaa}</style></head>' +
    '<body><div class="card"><div class="icon">⚠️</div><h1>Ocorreu um erro</h1>' +
    '<p>' + esc_(msg) + '</p><p style="margin-top:8px">Contacta a Cosmopolitan Party.</p>' +
    '<div class="brand">Cosmopolitan Party · cosmopolitanparty.loures@gmail.com</div></div></body></html>'
  ).setTitle('Cosmopolitan Party');
}
