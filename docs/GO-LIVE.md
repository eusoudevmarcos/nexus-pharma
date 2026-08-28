# Go-live do Nexus Pharma

O primeiro cliente real só deve ser liberado quando `npm run preflight:production`, executado em `api/`, terminar com `ready: true`. A central interna **Go-live** apresenta o mesmo diagnóstico sem exibir segredos.

## 1. Render: API e PostgreSQL

1. Criar o Blueprint a partir de `render.yaml`.
2. Trocar a API e o PostgreSQL para planos adequados à produção. O banco gratuito não oferece recuperação gerenciada.
3. Configurar `WEB_ORIGIN` com a origem HTTPS exata do portal Vercel.
4. Configurar `WEB_APP_URL` com a mesma URL pública do portal.
5. Configurar e-mail, gateway financeiro e observabilidade.
6. No primeiro deploy, manter temporariamente `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`.
7. Confirmar o administrador ativo e remover imediatamente as duas variáveis do ambiente.
8. Ajustar `DEPLOYMENT_STAGE=production`, `DATABASE_RECOVERY_MODE=PITR` e a janela realmente contratada.
9. Manter `ipAllowList: []` e usar somente a conexão interna entre API e banco.

O deploy aplica migrations pendentes com `prisma migrate deploy`; não use `migrate dev` em produção.

## 2. Vercel: institucional e portal

1. Criar o projeto com Root Directory `web`.
2. Definir `NEXUS_API_URL` para o domínio HTTPS da API.
3. Definir `NEXT_PUBLIC_SITE_URL` para o domínio HTTPS do portal.
4. Publicar primeiro em Preview e validar login, seleção de empresa, troca de empresa e logout.
5. Só então promover a mesma revisão para Production.

## 3. Integrações

- `EMAIL_RELAY_URL`, `EMAIL_RELAY_KEY` e `EMAIL_FROM` para convites e alertas.
- `BILLING_RELAY_URL`, `BILLING_RELAY_KEY` e `BILLING_WEBHOOK_SECRET` para cobrança unificada.
- `OBSERVABILITY_TOKEN` para o endpoint protegido de métricas.
- Os webhooks devem usar HTTPS e o segredo nunca deve entrar na Vercel.

## 4. Recuperação

1. Ativar PITR no PostgreSQL pago.
2. Criar backup lógico portátil para retenção independente.
3. Restaurar em uma base isolada.
4. Conferir migrations, autenticação, empresas, regras fiscais, estoque, vendas, faturamento e auditoria.
5. Registrar RPO, RTO e evidências em **Privacidade & DR**.
6. Repetir a cada 90 dias e depois de mudanças relevantes.

## 5. Liberação controlada

1. Executar o pipeline de qualidade.
2. Executar `npm run preflight:production` na API conectada ao ambiente final.
3. Resolver todos os itens `BLOCKED`; itens `WARN` exigem decisão registrada.
4. Cadastrar uma empresa piloto sem dados sensíveis reais.
5. Simular convite, venda, baixa de estoque, fechamento fiscal, cobrança e atendimento.
6. Somente depois liberar o primeiro cliente real.

## Rollback

- Portal: reverter para o último deployment estável da Vercel.
- API: reverter o serviço para a última revisão estável, sem apagar migrations já aplicadas.
- Banco: usar PITR para criar uma nova instância no ponto anterior ao incidente, validar isoladamente e só então redirecionar a API.
- Registrar o incidente e a decisão de retorno na central interna.
