# Fase 6B — frente de caixa e conciliação local

## Entregue

- abertura de sessão vinculada a loja, PDV e operador;
- proteção de uma única sessão aberta por PDV;
- carrinho operacional sobre produtos e estoque persistidos;
- venda, impostos, baixa de lote/estoque e recebimentos em uma transação;
- pagamentos divididos entre dinheiro, Pix, crédito, débito, vale e outros;
- suprimento e sangria com idempotência, motivo e auditoria;
- bloqueio de sangria superior ao dinheiro esperado na gaveta;
- fechamento com declaração separada por meio;
- conciliação que detecta diferenças por meio mesmo quando o total geral coincide;
- snapshot de fechamento com hash e proteção contra alteração;
- justificativa para diferença e revisão posterior por papel gerencial;
- histórico de vendas da sessão, situação da NFC-e e fechamentos recentes em `/portal/caixa`.

## Limites deliberados

- Pix, cartões e vales ficam como `RECORDED`, nunca como confirmação financeira externa.
- Não existe comunicação TEF, adquirente ou banco nesta fase.
- Cancelamento e devolução foram entregues na Fase 6C; integrações oficiais de NFC-e, TEF e Pix continuam deliberadamente bloqueadas.
- O fechamento não autoriza NFC-e nem substitui a conciliação fiscal por competência.
- A operação offline ainda precisa de protocolo próprio de fila, conflito e sincronização.

## Fase 6C concluída sem provedor externo

1. [x] Implementar cancelamento e devolução transacionais com autorização por papel.
2. [x] Recompor lote, saldo fiscal, estoque, provisão e recebimento sem apagar a venda original.
3. [x] Criar desconto com limite por papel e memória do preço original.
4. [ ] Vincular cliente, vendedor e farmacêutico responsável quando exigido.
5. [ ] Implementar reserva, transferência, inventário e perdas com aprovação.

## Dependências externas posteriores

- escolher TEF/adquirente e integrar confirmação, desfazimento e conciliação;
- integrar Pix dinâmico e webhooks do PSP;
- homologar impressão, dispositivos, operação offline e NFC-e por UF;
- executar piloto físico com abertura, venda, falha de rede e fechamento real.
