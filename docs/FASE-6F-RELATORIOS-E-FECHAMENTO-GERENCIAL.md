# Fase 6F — relatórios e fechamento gerencial

## Entregue

- filtros por período, loja, PDV, categoria, produto e vendedor;
- DRE gerencial com venda bruta, descontos, devoluções, receita líquida, tributos, custo, perdas e resultado;
- devoluções e perdas não vendáveis tratadas separadamente no resultado;
- curva ABC por receita com quantidade, participação acumulada e lucro;
- desempenho por vendedor com vendas, receita, descontos e lucro;
- recebimentos líquidos por dinheiro, Pix, cartões, vale e outros;
- perdas aprovadas com loja, produto, lote, quantidade e valor de custo;
- lista de vendas com loja, PDV, vendedor, tributos e lucro;
- exportação CSV com registro na auditoria;
- fechamento interno por competência com snapshot e SHA-256;
- bloqueio do fechamento enquanto houver caixa aberto, inventário, ajuste ou transferência pendente;
- snapshot e fechamento protegidos contra alteração e exclusão no banco;
- central responsiva na janela `/portal/gestao`.

## Limite contábil e fiscal

O fechamento desta fase é gerencial e operacional. Ele não substitui escrituração contábil, SPED, EFD, apuração fiscal, obrigação acessória nem fechamento executado por contador. Essa separação aparece na interface e na documentação para evitar que um relatório interno seja interpretado como declaração oficial.

## Regras de integridade

1. O relatório sempre é limitado à empresa ativa.
2. O período máximo consultável é de 366 dias.
3. Filtros por produto e categoria recalculam valores pelos itens, não pelo total integral da venda.
4. Devoluções reduzem receita, tributos e custo conforme os itens efetivamente estornados.
5. Item devolvido sem retorno ao estoque entra como perda.
6. Perdas aprovadas usam quantidade e custo do movimento de estoque.
7. A exportação é auditada com filtros e quantidade de linhas.
8. Apenas proprietário, administrador ou gestor pode fechar a competência.
9. O fechamento exige o primeiro e o último dia do mesmo mês na interface.
10. A mesma empresa não pode fechar duas vezes a mesma competência.

## Pendente para evolução

- drill-down completo até lote, proveniência, regra e evidência;
- exportação PDF e XLSX;
- relatórios agendados e envio por e-mail;
- despesas operacionais, contas a pagar e plano de contas para DRE contábil;
- fechamento fiscal oficial e reconciliação com SPED;
- comparação entre lojas, metas, orçamento e séries históricas avançadas.
