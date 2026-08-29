# Fase 6G — Compras e fornecedores

## Entregue

- Cadastro de fornecedor por empresa, com CNPJ, contato, prazo de entrega, pedido mínimo, condição de pagamento e situação.
- Vínculo produto-fornecedor com código externo, último custo, quantidade mínima, embalagem e fornecedor preferencial.
- Sugestão de reposição por loja considerando saldo físico, reservado, disponível, pedidos aprovados ainda não recebidos, vendas dos últimos 30 dias, estoque mínimo, prazo e embalagem.
- Priorização visual de ruptura e baixa cobertura, mostrando investimento e lucro bruto potencial.
- Pedido de compra em rascunho, aprovação gerencial, cancelamento justificado, recebimento parcial e conclusão.
- Vínculo do pedido somente com uma NF-e já conferida, sem segunda entrada de estoque.
- Validação do CNPJ emitente e atualização do último custo do fornecedor.
- Auditoria de cadastro, vínculo, criação, aprovação, cancelamento e recebimento.

## Fluxo seguro

1. A gestão seleciona loja, cobertura e produtos sugeridos.
2. O pedido nasce como rascunho e não é contado como mercadoria em trânsito.
3. Após aprovação gerencial, o saldo pendente entra no cálculo como compra a receber.
4. A mercadoria é conferida no fluxo DF-e, que grava lote, validade, custo, estoque e proveniência fiscal.
5. O recebimento concluído é vinculado ao pedido. O sistema compara CNPJ e produtos e atualiza as quantidades recebidas.

## Limites desta fase

- A recomendação usa venda real dos últimos 30 dias e a média histórica já cadastrada como fallback; ainda não calcula sazonalidade, promoção ou previsão estatística.
- Lucro potencial é gerencial, antes de despesas e sem prometer venda futura.
- Cotação concorrencial, bonificações, devolução ao fornecedor, contas a pagar e integração bancária permanecem pendentes.
- A migration foi preparada, mas não aplicada em banco nesta etapa.

## Endpoints

- `GET /api/v1/compras/painel`
- `POST /api/v1/compras/fornecedores`
- `PUT /api/v1/compras/fornecedores/:id`
- `PUT /api/v1/compras/fornecedores/:id/produtos`
- `POST /api/v1/compras/pedidos`
- `PUT /api/v1/compras/pedidos/:id/aprovar`
- `PUT /api/v1/compras/pedidos/:id/cancelar`
- `POST /api/v1/compras/pedidos/:id/recebimentos`

Operação visual: `/portal/compras`.
