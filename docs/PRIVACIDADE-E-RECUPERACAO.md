# Operação de privacidade e recuperação

Este documento define o mínimo operacional antes do Nexus Pharma receber dados reais de clientes. Ele não substitui a avaliação do encarregado de dados nem a assessoria jurídica.

## Pedidos de titulares

- Todo pedido nasce com protocolo, empresa, titular autenticado, tipo, data e prazo operacional.
- A confirmação simplificada deve ser tratada imediatamente sempre que possível. A declaração completa de acesso tem prazo legal de até 15 dias.
- Correção, anonimização, bloqueio, eliminação, portabilidade, revogação, compartilhamento e revisão de decisão automatizada entram na mesma fila auditável.
- A exclusão nunca é automática. Antes do encerramento, a administração registra a providência ou a razão jurídica de retenção.
- O painel é restrito à administração interna; o cliente enxerga apenas os próprios pedidos.
- Toda mudança de estado gera `AuditLog`.

## Retenção técnica automatizada

A rotina diária remove somente artefatos técnicos já encerrados:

- sessões revogadas ou expiradas além de `AUTH_SESSION_RETENTION_DAYS`;
- tokens de uso único utilizados ou expirados além de `ONE_TIME_TOKEN_RETENTION_DAYS`.

Dados fiscais, financeiros, de usuários, empresas e trilhas de auditoria não são apagados pela rotina. Eles exigem análise de finalidade, base legal e obrigação regulatória.

## Bloqueador de produção

Enquanto `DATABASE_RECOVERY_MODE=NONE`, o painel deve exibir a recuperação como não pronta. Antes do go-live:

1. migrar o PostgreSQL da Render para uma instância paga com recuperação point-in-time;
2. definir `DATABASE_RECOVERY_MODE=PITR` e a janela realmente contratada em `DATABASE_RECOVERY_WINDOW_DAYS`;
3. criar uma exportação lógica fora da janela do provedor para retenção independente;
4. executar a restauração em uma base isolada, nunca sobre a base principal;
5. verificar migrations, quantidade de empresas/usuários, autenticação, regras fiscais, estoques, faturamento e trilha de auditoria;
6. registrar no painel a referência do backup, RPO, RTO, verificações e responsável;
7. repetir o teste ao menos a cada 90 dias e depois de mudanças relevantes de infraestrutura.

## Critério de prontidão

O painel só indica prontidão quando coexistem:

- recuperação PITR declarada e com janela maior que zero;
- um teste de restauração aprovado nos últimos 90 dias.

Essa marcação é uma evidência operacional declarada pelo responsável. Ela não consulta nem altera automaticamente o painel da Render.

## Referências oficiais

- Lei 13.709/2018 (LGPD): https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- Direitos dos titulares (ANPD): https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares
- Recuperação e backups do Render Postgres: https://render.com/docs/postgresql-backups
