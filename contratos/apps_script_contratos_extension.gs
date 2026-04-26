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

function doGet(e) {
  e = e || { parameter: {} };
  var page = (e.parameter.page || '').toString().trim();

  // Rota nova: lista de contratos pendentes (JSONP, para o dashboard)
  if (page === 'contratos') {
    return servirContratosPendentes_(e);
  }

  // ── Resto do código original (confirmação de contrato) ─────────────────
  var row = parseInt((e.parameter.row || '').toString().trim(), 10);
  var id  = (e.parameter.id || '').toString().trim();
  var t   = (e.parameter.t  || '').toString().trim();

  if (!row || row < 2 || !id || !t) {
    return paginaErro_('Link inválido ou expirado.');
  }

  var sh = getSheet_();
  var idSheet = val_(sh, row, CONFIG.COLS.idContrato);
  var tokenSheet = val_(sh, row, CONFIG.COLS.token);

  if (idSheet !== id)   return paginaErro_('Link inválido — contrato não encontrado.');
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

function servirContratosPendentes_(e) {
  var sh = getSheet_();
  var lastRow = sh.getLastRow();
  var contratos = [];

  if (lastRow >= 2) {
    var n = lastRow - 1;
    var startRow = 2;

    // Carregar todas as colunas necessárias de uma só vez
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

    // 1ª passagem — coletar todas as confirmações por chave (cliente|data) para detetar duplicados
    var confirmadosPorChave = {};
    for (var i = 0; i < n; i++) {
      var est = (estadoArr[i][0] || '').toString().trim();
      var dc  = (dataConfArr[i][0] || '').toString().trim();
      if (est === 'Confirmado' || dc) {
        var chave = (nomeArr[i][0] || '').toString().trim().toLowerCase() + '|' + (dataArr[i][0] || '').toString().trim();
        confirmadosPorChave[chave] = (idArr[i][0] || '').toString().trim();
      }
    }

    // 2ª passagem — coletar pendentes
    for (var j = 0; j < n; j++) {
      var estado = (estadoArr[j][0] || '').toString().trim();
      var dataConf = (dataConfArr[j][0] || '').toString().trim();
      var idC = (idArr[j][0] || '').toString().trim();
      if (!idC) continue;
      // Pendente = tem ID, NÃO está Confirmado, NÃO tem data de confirmação
      if (estado === 'Confirmado' || dataConf) continue;

      var nome = (nomeArr[j][0] || '').toString().trim();
      var dataEv = (dataArr[j][0] || '').toString().trim();
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
        linkPDF:       (pdfArr[j][0]      || '').toString().trim(),
        waLink:        (waArr[j][0]       || '').toString().trim(),
        substituidoPor: substituidoPor,  // ID do contrato confirmado para mesmo cliente+data, se houver
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
