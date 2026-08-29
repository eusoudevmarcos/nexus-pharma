# Fase 6E — estoque multiloja, reservas e ajustes

## Entregue

- saldo físico separado por loja, produto e lote;
- saldo reservado separado do disponível, sem reduzir o estoque físico;
- reserva com expiração, referência, responsável e liberação explícita;
- transferência em rascunho, expedição e recebimento;
- estoque em trânsito visível e sem duplicar o saldo consolidado;
- recebimento confirmado por pessoa diferente de quem expediu;
- snapshot da proveniência fiscal do lote em cada item transferido;
- inventário iniciado a partir de uma fotografia do saldo da loja;
- contagem e diferença registradas por lote;
- aprovação ou rejeição do inventário por segundo usuário;
- perda, avaria, vencimento e correção submetidos antes de afetar o saldo;
- dupla aprovação nos ajustes de estoque;
- entrada por NF-e e lote inicial alimentando o saldo da loja;
- venda no caixa consumindo apenas o disponível daquela loja;
- devolução vendável retornando à loja do caixa;
- movimentos de estoque com identificação da loja;
- trilha de auditoria para reservas, transferências, inventários e ajustes;
- central operacional em `/portal/estoque`.

## Regras de integridade

1. Quantidade reservada nunca pode superar o saldo físico da loja.
2. Reserva não reduz estoque físico; apenas reduz o disponível.
3. Lote vencido não pode ser reservado.
4. Transferência exige lojas diferentes e saldo disponível na origem.
5. A expedição retira da origem e coloca a mercadoria em trânsito.
6. O recebimento adiciona o saldo ao destino sem alterar o total consolidado.
7. Quem expede não pode confirmar o próprio recebimento.
8. Inventário e ajuste exigem aprovação por pessoa diferente do solicitante.
9. Perda, avaria e vencimento aceitam somente variação negativa.
10. Apenas uma decisão aprovada altera lote, produto e saldo da loja.
11. Operações finais mantêm trilha imutável no banco.

## Migração de saldos existentes

A migration cria os novos saldos por loja e atribui lotes antigos à loja matriz ativa, ou à primeira loja ativa quando não existir uma matriz. Ela também associa movimentos antigos à mesma loja de referência. A migration foi preparada, mas não aplicada automaticamente.

## Limites deliberados

- uma transferência criada possui os itens informados na criação e não é editada depois;
- a expiração automática das reservas está conectada à rotina diária; uma execução mais frequente pode ser configurada conforme a operação;
- inventário parcial por corredor, fabricante ou categoria fica para a próxima evolução;
- leitura por coletor, código de barras e impressão de romaneio ainda não foram integradas;
- a operação foi validada localmente, sem publicação ou execução no banco de produção.

## Próxima fatia recomendada

1. troca vinculada a uma nova venda e ao estorno original;
2. relatórios gerenciais por vendedor, desconto, controlados, perdas e margem;
3. compras e pedidos considerando disponível, reservado e em trânsito;
4. alertas de transferências atrasadas e expiração de reservas em intervalos menores;
5. reconciliação física, fiscal e contábil por competência.
