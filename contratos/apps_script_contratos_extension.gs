/**
 * EXTENSÃO ao Apps Script de contratos — adiciona rota `?page=contratos`
 * para o dashboard ler a lista de contratos pendentes via JSONP.
 *
 * COMO INSTALAR:
 * 1. Abre o Apps Script de contratos (https://script.google.com)
 * 2. SUBSTITUI a função `doGet(e)` existente pela nova versão abaixo
 *    (faz routing entre confirmação e listagem de pendentes)
 * 3. ADICIONA a função `servirContratosPendentes_(e)` abaixo
 * 4. Faz "Deploy" → "Manage deployments" → editar o deployment ativo
 *    → version: "New version" → Deploy
 *    (NÃO cries um novo URL — atualiza o existente para manteres o token)
 */

// ─────────────────────────────────────────────────────────────────────────────
// SUBSTITUI a função doGet(e) existente por esta:
// ─────────────────────────────────────────────────────────────────────────────

// Helper — localiza linha por ID, robusto a reordenação da Sheet.
function findRowByContractId_(sh, contractId, rowHint) {
  if (rowHint && rowHint >= 2) {
    var hintVal = (sh.getRange(rowHint, CONFIG.COLS.idContrato).getDisplayValue() || '').toString().trim();
    if (hintVal === contractId) return rowHint;
  }
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  var n = lastRow - 1;
  var ids = sh.getRange(2, CONFIG.COLS.idContrato, n, 1).getDisplayValues();
  for (var i = 0; i < n; i++) {
    if ((ids[i][0] || '').toString().trim() === contractId) return i + 2;
  }
  return -1;
}

function doGet(e) {
  e = e || { parameter: {} };
  var page = (e.parameter.page || '').toString().trim();

  // Rota nova: lista de contratos pendentes (JSONP, para o dashboard)
  if (page === 'contratos') {
    return servirContratosPendentes_(e);
  }

  // ── Confirmação de contrato — procura por ID (não confia no `row` do URL)
  var rowHint = parseInt((e.parameter.row || '').toString().trim(), 10);
  var id  = (e.parameter.id || '').toString().trim();
  var t   = (e.parameter.t  || '').toString().trim();

  if (!id || !t) {
    return paginaErro_('Link inválido ou expirado.');
  }

  var sh = getSheet_();
  var row = findRowByContractId_(sh, id, rowHint);
  if (row < 2) return paginaErro_('Link inválido — contrato não encontrado.');

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
// ADICIONA esta função nova:
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
        id:            idC,
        cliente:       nome,
        telefone:      (telArr[j][0]      || '').toString().trim(),
        dataEvento:    dataEv,
        horaInicio:    (horaIniArr[j][0]  || '').toString().trim(),
        horaFim:       (horaFimArr[j][0]  || '').toString().trim(),
        estado:        estado,
        dataConfirmacao: dataConf,
        confirmado:    confirmado,
        linkPDF:       (pdfArr[j][0]      || '').toString().trim(),
        waLink:        (waArr[j][0]       || '').toString().trim(),
        substituidoPor: substituidoPor,
        row:           j + 2
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
