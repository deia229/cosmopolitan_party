# SMS automático de confirmação ao cliente

Contexto da conversa (21/10/2026) para retomar na extensão do Chrome.

## Objetivo
Quando o Ivo cria a festa no Google Forms, o cliente recebe automaticamente uma notificação
("a sua reserva ficou registada, entraremos em contacto em breve"), sem ninguém abrir conversa.
O pedido de dados do contrato continua a ser feito por WhatsApp (botão 1-clique no e-mail), noutro momento.

## Estado atual
- `marcacao_ivo/Code.gs` já cria o evento no calendário e envia o e-mail com o botão `wa.me`.
- Foi acrescentada a função `enviarSmsConfirmacao_(telNorm, dataPt)`, chamada no fim do fluxo, dentro de try/catch
  (uma falha no SMS não afeta o evento nem o e-mail).
- Fornecedor escolhido: **Twilio** (API HTTP via `UrlFetchApp`).

Texto enviado (sem acentos para caber num único SMS, GSM-7):

> Cosmopolitan Party: a sua reserva para o dia {dd/MM/yyyy} ficou registada. Entraremos em contacto em breve. Obrigado!

## Ativação (Apps Script > Definições do projeto > Propriedades do script)
| Propriedade | Valor |
|---|---|
| `TWILIO_SID` | Account SID |
| `TWILIO_TOKEN` | Auth Token |
| `TWILIO_FROM` | remetente, ex.: `CosmoParty` ou número Twilio |
| `SMS_ATIVO` | `true` liga; qualquer outro valor desliga |

Confirmar no Twilio se o remetente alfanumérico precisa de registo para Portugal; se sim, usar um número Twilio.
Testar sempre com uma festa de teste no número da Andreia.

## Preços por SMS para Portugal (pesquisa)
| Fornecedor | Preço |
|---|---|
| Twilio | $0,0501 (https://www.twilio.com/en-us/sms/pricing/pt) |
| Plivo | desde $0,046 (https://www.plivo.com/sms/pricing/pt/) |
| D7 Networks | $0,028 (https://d7networks.com/sms/portugal/) |
| Telnyx | $0,004 base + taxa do operador (taxa de PT não confirmada) |

D7 seria ~metade do preço, mas a diferença para o volume atual é de cêntimos por mês. Decisão: manter Twilio.

## Próximo passo: extensão do Chrome
Ver como a extensão cria/regista as festas e encaixar lá o mesmo envio (ou chamar o mesmo endpoint),
reutilizando `normalizePtPhone_`, `formatarDataPt_` e o texto acima.
