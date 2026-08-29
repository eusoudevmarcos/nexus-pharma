# Fase 6I — Cotações e custo líquido

## Entregue

- Cotação por loja com vários produtos, quantidades e prazo de resposta.
- Convite de pelo menos dois fornecedores antes da abertura concorrencial.
- Proposta por fornecedor com quantidade ofertada, preço, desconto por item, bonificação, tributo não recuperável, frete, desconto comercial, desconto financeiro, condição e prazo.
- Rateio proporcional e auditável de frete e descontos gerais entre os itens.
- Cálculo de custo líquido total e unitário considerando unidades bonificadas.
- Comparação do custo atual com a melhor proposta e estimativa de economia.
- Estimativa de lucro bruto potencial usando o preço de venda registrado na abertura da cotação.
- Validação de validade da proposta, pedido mínimo e atendimento das quantidades.
- Adjudicação gerencial da proposta vencedora.
- Conversão automática em pedido aprovado, mantendo custo líquido e bonificação por item.
- Atualização do último custo líquido do fornecedor-produto.
- Memória de propostas não escolhidas e auditoria de criação, abertura, proposta, cancelamento e adjudicação.
- Janela `/portal/cotacoes` separada da execução dos pedidos em `/portal/compras`.

## Fórmula aplicada

Para cada item:

`custo líquido = preço bruto - desconto do item - descontos gerais rateados + frete rateado + tributos não recuperáveis`

`custo líquido unitário = custo líquido / (quantidade comprada + quantidade bonificada)`

O sistema preserva os componentes do cálculo. Uma bonificação reduz o custo médio, mas não é tratada como desconto financeiro ou economia tributária.

## Limites desta fase

- As propostas são registradas internamente; ainda não há portal ou envio eletrônico para o fornecedor.
- A estimativa de lucro não garante venda futura e não desconta despesas operacionais.
- Tributos recuperáveis dependem do motor fiscal e da contabilidade; somente valores marcados como não recuperáveis entram no custo comercial desta fase.
- Devoluções ao fornecedor e acompanhamento externo de entrega continuam pendentes.
- A migration está pronta, mas não foi aplicada nem publicada.

## Endpoints

- `GET /api/v1/cotacoes/painel`
- `POST /api/v1/cotacoes/cotacoes`
- `POST /api/v1/cotacoes/cotacoes/:id/fornecedores`
- `PUT /api/v1/cotacoes/cotacoes/:id/abrir`
- `PUT /api/v1/cotacoes/propostas/:id`
- `POST /api/v1/cotacoes/cotacoes/:id/adjudicar`
- `PUT /api/v1/cotacoes/cotacoes/:id/cancelar`
