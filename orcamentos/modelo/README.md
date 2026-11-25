# Modelo de orçamento (PDF)

Layout A4 de 1 página usado nos orçamentos da Cosmopolitan Party: cabeçalho com logo, dados do evento, espaço, catering (2 opções), decoração, totais, pagamento (50% reserva de data / 50% até 7 dias antes), nota de IVA e condições.

Regras do layout:
- Valores **sem IVA**, com a nota "Aos valores apresentados acresce IVA à taxa legal em vigor (23%)".
- Total = espaço + catering + decoração + caução (100 €). A reserva de data é 50% desse total.

Uso:
```
pip install reportlab
python3 gerar_orcamento.py exemplo-11235.json
```
Para um novo orçamento, copia `exemplo-11235.json`, altera os textos e valores e define `saida`.
