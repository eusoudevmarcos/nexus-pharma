# Fase 6H — Contas a pagar

## Entregue

- Título financeiro criado automaticamente para cada NF-e conferida e vinculada a um pedido, desde que possua valor positivo.
- Estado inicial em rascunho, sem vencimento presumido ou parcela inventada pelo sistema.
- Configuração de até 60 parcelas, exigindo que a soma seja exatamente igual ao valor da NF-e.
- Acompanhamento de títulos em aberto, parciais, pagos, cancelados e contestados.
- Indicadores de saldo aberto, parcelas vencidas, próximos sete dias e pagamentos do mês.
- Baixa total ou parcial por dinheiro, Pix, transferência, boleto, cartão ou outro meio.
- Referência de comprovante, data e usuário responsável preservados.
- Estorno por segundo usuário, com justificativa obrigatória e recálculo transacional de parcela e título.
- Cancelamento somente quando não existe pagamento ativo.
- Histórico de pagamentos protegido contra exclusão e alteração dos campos originais.
- Central responsiva em `/portal/financeiro`, separada do financeiro interno da empresa SaaS.

## Fluxo

1. A NF-e é conferida no recebimento e vinculada ao pedido de compra.
2. O sistema cria um título em rascunho com fornecedor, pedido, documento, chave e valor.
3. O perfil autorizado informa a quantidade de parcelas e os vencimentos.
4. O título passa a aceitar baixas manuais identificadas.
5. Pagamentos parciais atualizam parcela e título na mesma transação.
6. Um estorno exige outra pessoa autorizada e restaura os saldos sem apagar o registro original.

## Limites desta fase

- A baixa é um registro interno. Ela não confirma movimentação bancária, Pix, boleto ou conciliação externa.
- Contas bancárias, fluxo de caixa projetado, centro de custo, plano de contas e conciliação bancária continuam pendentes.
- Retenções, descontos financeiros, juros, multas e renegociações ainda não foram modelados.
- A migration está preparada, mas não foi aplicada nem publicada.

## Endpoints

- `GET /api/v1/contas-pagar/painel`
- `PUT /api/v1/contas-pagar/titulos/:id/configurar`
- `POST /api/v1/contas-pagar/parcelas/:id/pagamentos`
- `POST /api/v1/contas-pagar/pagamentos/:id/estornar`
- `PUT /api/v1/contas-pagar/titulos/:id/cancelar`
