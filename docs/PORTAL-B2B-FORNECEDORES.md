# Portal B2B de fornecedores — arquitetura de evolução

> Complemento futuro mantido apenas para demonstrações. Em operação normal, API, menu e automação permanecem desligados por `PRIME_ENABLED=false` e `NEXT_PUBLIC_PRIME_ENABLED=false`.

## Objetivo

Permitir que laboratórios, distribuidores e demais fornecedores atendam farmácias com mais agilidade, transformando ruptura, baixa cobertura e vencimento próximo em oportunidades objetivas de reposição. A funcionalidade poderá integrar os pacotes Nexus e, no futuro, ser licenciada aos fornecedores parceiros.

O fornecedor poderá conhecer produto, saldo operacional, quantidade em baixa ou zerada, quantidade próxima do vencimento, janela de vencimento e sugestão de reposição. Permanecem protegidos preços de venda, margem, consumidores, caixa, financeiro, motor fiscal, concorrentes e demais informações que não sejam necessárias ao abastecimento.

## Estado atual

A fundação do **Painel Prime** está implementada. A operação interna já cadastra fornecedores, relaciona produtos, calcula necessidade, abre cotações, compara propostas e gera pedidos. O módulo Prime acrescenta organizações B2B independentes, usuários próprios, vínculos com farmácias, configurações por operação, oportunidades persistidas e painel dedicado.

A liberação para fornecedores reais permanece condicionada à aplicação da migration, cadastro da organização, vínculo dos clientes, ativação do MFA e homologação do isolamento com dados de piloto.

## Modelo de identidade implementado

- `PrimeOrganization`: plataforma Nexus, laboratório, distribuidor ou atacadista.
- `PrimeMembership`: usuário com papel `OWNER`, `ADMIN`, `MANAGER`, `SALES`, `LOGISTICS` ou `ANALYST`.
- `PrimeConnection`: vínculo contratual entre farmácia e organização Prime, com vigência e suspensão.
- `PrimeOpportunity`: oportunidade persistida por cliente, loja, produto e tipo de sinal.
- `PrimeOpportunityEvent`: histórico de atribuição, contato, proposta, conversão, recusa ou encerramento.
- `SupplierCatalogOffer`: produto, embalagem, disponibilidade, preço, prazo e validade comercial.
- `CommercialConversation`: canal auditado ligado a cotação, proposta ou pedido.
- `SupplierAccessAudit`: toda leitura, proposta, mensagem e alteração feita pelo fornecedor.

Um fornecedor não será criado como membro da farmácia. Isso evita que ele herde menus administrativos ou tenha acesso lateral a estoque, financeiro, motor fiscal, clientes e vendas.

## Escopos mínimos de acesso

- Visualizar apenas cotações para as quais foi convidado.
- Visualizar oportunidades de abastecimento dos clientes vinculados ao seu catálogo, incluindo saldo, ruptura, cobertura, quantidade a vencer e reposição sugerida.
- Filtrar oportunidades por cliente, região, produto, criticidade, janela de vencimento e prazo de atendimento.
- Assumir a oportunidade, registrar contato de rotina, resposta do cliente e próxima ação.
- Enviar e revisar a própria proposta enquanto o prazo estiver aberto.
- Consultar pedidos adjudicados para sua organização.
- Atualizar disponibilidade e prazo do próprio catálogo.
- Conversar com a farmácia dentro do contexto comercial autorizado.
- Nunca visualizar preço de venda da farmácia, margem interna, fiscal, caixa, financeiro, concorrentes, preço das outras propostas ou dados de consumidores.

## Painel operacional do fornecedor

O painel deverá apresentar:

- **Ruptura agora:** produtos zerados e quantidade recomendada para recompor o nível mínimo;
- **Baixa cobertura:** saldo atual, dias estimados de cobertura, consumo médio e reposição sugerida;
- **Vencimento próximo:** produto, quantidade afetada e faixas de 30, 60 e 90 dias, sem expor custo ou margem;
- **Oportunidade combinada:** baixa cobertura descontando os lotes que provavelmente vencerão antes da venda;
- **Fila comercial:** novas, assumidas, contato realizado, proposta enviada, convertidas, recusadas e encerradas;
- **Logística:** disponibilidade informada, prazo prometido, pedido relacionado, expedição e entrega;
- **Resultado:** tempo de primeiro contato, conversão, ruptura evitada, cobertura recomposta e pontualidade.

O dono/sócio operador do Nexus terá uma visão de governança da rede e poderá habilitar fornecedores, acompanhar SLAs e investigar abuso. Usuários do fornecedor verão somente clientes e produtos abrangidos por seus vínculos e atribuições.

## Regras comerciais

- Nenhum laboratório recebe prioridade fixa no código.
- O ranking deve explicar custo líquido, prazo, bonificação, histórico de entrega e validade ofertada.
- A farmácia decide e a adjudicação fica auditada.
- O recurso de assistência ao abastecimento deve estar previsto no pacote, no onboarding e nos instrumentos contratuais aplicáveis; a farmácia poderá suspender o canal comercial.
- O contato pode ocorrer como rotina comercial normal, sem expor ao atendente dados além dos necessários para a reposição.
- Recomendações de compra continuam sendo calculadas pelo Nexus e a decisão final de comprar permanece com a farmácia.
- O fornecedor nunca altera estoque, validade, recomendação ou pedido diretamente; ele responde, propõe e acompanha.
- A organização Prime pode visualizar todos os produtos em falta, baixa, alta demanda ou vencimento nos clientes vinculados, inclusive itens ainda fora de seu catálogo; isso permite ampliar a gama atendida.
- Nenhuma organização Prime recebe acesso a farmácias fora de seu vínculo.
- Toda visualização de oportunidade e todo contato ficam registrados para governança, sem compartilhar essa trilha com fornecedores concorrentes.

## Roadmap

1. [x] Criar organizações B2B, usuários, seis perfis e autenticação protegida por MFA.
2. [x] Implementar vínculos contratuais entre farmácia e organização Prime.
3. [x] Materializar oportunidades por ruptura, baixa cobertura, vencimento e alta demanda.
4. [x] Criar dashboard Prime, mapa regional, filtros, janela logística de 2 a 5 dias e preferências de alertas.
5. [x] Criar fila comercial com atribuição, contato, proposta, conversão, recusa e encerramento auditados.
6. [x] Sincronizar o radar automaticamente na rotina diária e sob demanda.
7. [ ] Criar onboarding visual para organizações, vínculos e usuários Prime.
8. [ ] Integrar catálogo/ofertas, mensagens, notificações e acompanhamento logístico.
9. [ ] Adicionar métricas históricas de entrega, ruptura evitada, conversão e competitividade.
10. [ ] Executar piloto e testes de isolamento multiempresa com ao menos dois fornecedores.
