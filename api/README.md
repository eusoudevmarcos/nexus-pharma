# Nexus Pharma API

API multiempresa em Fastify + TypeScript, com PostgreSQL e Prisma.

## Preparação local

1. Copie `.env.example` para `.env` e preencha `DATABASE_URL` e `JWT_SECRET`.
2. Execute `npm install`.
3. Crie o banco local e rode `npm run prisma:migrate:deploy`.
4. Opcionalmente configure `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` e rode `npm run prisma:seed`.
5. Inicie com `npm run dev`.

## Comandos

- `npm run prisma:validate`: valida o modelo.
- `npm run prisma:generate`: gera o cliente tipado.
- `npm run prisma:migrate:dev -- --name nome_da_mudanca`: cria migration em desenvolvimento.
- `npm run prisma:migrate:deploy`: aplica migrations pendentes sem resetar dados.
- `npm run prisma:seed`: cria ou atualiza os planos e o administrador opcional.
- `npm run build`: gera o Prisma Client e compila a API.

## Contrato de acesso

Após `POST /api/v1/auth/login`, envie:

```text
Authorization: Bearer <access_token>
x-company-id: <uuid-da-empresa>
```

Rotas principais:

- `GET /health`
- `GET /health/live`
- `GET /health/ready`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/planos`
- `GET/POST/PUT /api/v1/cadastros/categorias`
- `GET/POST/PUT /api/v1/cadastros/produtos`
- `GET/POST/PUT /api/v1/fiscal/analises`
- `POST /api/v1/vendas/processar`
- `GET/POST /api/v1/suporte/tickets`
- `GET /api/v1/relatorios/{gestao,operacao,fiscal,usuarios}`
- `GET /api/v1/relatorios/alertas`
- `PATCH /api/v1/alertas/:id`
- `GET/POST /api/v1/usuarios/convites`
- `POST /api/v1/usuarios/convites/:id/reenviar`
- `POST /api/v1/usuarios/convites/aceitar`
- `PATCH /api/v1/usuarios/membros/:id`
- `GET/PATCH /api/v1/interno/suporte`
- `GET /api/v1/interno/financeiro`
- `GET/PATCH /api/v1/interno/comercial`
- `GET /api/v1/interno/desenvolvimento`
- `GET/PATCH /api/v1/interno/monitoramento`
- `GET /api/v1/financeiro/assinaturas`
- `GET/POST /api/v1/desenvolvimento/releases`
- `POST /api/v1/webhooks/billing/:provider`
- `GET /api/v1/operations/metrics`

O processamento da venda é idempotente, consome lotes por vencimento, registra o retrato fiscal aplicado, atualiza a provisão mensal e cria alertas de reposição. Convites de acesso usam token único armazenado como hash, expiram em 72 horas e toda mudança de perfil é auditada. O reenvio rotaciona o token e invalida o link anterior. As sugestões tributárias continuam sujeitas a revisão humana e homologação profissional.

## E-mail transacional

Configure `WEB_APP_URL`, `EMAIL_RELAY_URL`, `EMAIL_RELAY_KEY` e `EMAIL_FROM` no Render. A API envia ao relay um `POST` JSON com `from`, `to`, `subject`, `html`, `text` e `metadata`. Sem relay configurado, o convite permanece como `QUEUED` e o portal oferece o link para envio manual. O token nunca é persistido no registro de entrega.

## Webhooks financeiros

O adaptador do provedor deve normalizar o evento e chamar `POST /api/v1/webhooks/billing/:provider` com os cabeçalhos:

```text
x-nexus-event-id: identificador-unico-do-evento
x-nexus-timestamp: timestamp Unix em segundos
x-nexus-signature: HMAC-SHA256 em hexadecimal
```

A assinatura usa `BILLING_WEBHOOK_SECRET` sobre `<timestamp>.<event-id>.<sha256-do-JSON>`. A janela aceita é de cinco minutos. Eventos são idempotentes por provedor e identificador; o corpo normalizado aceita eventos de fatura (`opened`, `paid`, `past_due`, `voided`) e assinatura (`activated`, `paused`, `cancelled`). Antes de produção, o adaptador específico do provedor escolhido deve validar a assinatura original dele e então gerar esta assinatura interna.

## Observabilidade

`/health/live` confirma que o processo está ativo; `/health/ready` também valida o PostgreSQL e informa sua latência. O endpoint `/api/v1/operations/metrics` exige `Authorization: Bearer <OBSERVABILITY_TOKEN>` e entrega contadores do processo sem expor dados de clientes.

Falhas não tratadas, entregas de e-mail e webhooks financeiros geram incidentes agrupados por impressão digital. A central interna em `/portal/interno/monitoramento` permite que Administração e Desenvolvimento assumam e resolvam a ocorrência, com auditoria. Se a mesma falha reaparecer, o incidente é reaberto automaticamente.

## Automação diária do negócio

`npm run jobs:daily` executa uma rotina idempotente que:

- identifica estoque baixo e produtos com margem a partir de 25%, boa saída e cobertura de até 15 dias;
- calcula quantidade sugerida para 30 dias de venda;
- gera alertas progressivos de vencimento em 90, 60 e 30 dias;
- sinaliza cobranças vencidas;
- encerra automaticamente alertas cuja condição deixou de existir;
- registra contadores, tentativas, resultado e falhas da execução.

O Blueprint inclui um Cron Job diário às `10:00 UTC`. O comando sempre termina após a execução e o histórico impede processamento duplicado no mesmo dia. Cron Jobs não possuem plano gratuito e geram cobrança própria quando provisionados; consulte a [documentação oficial do Render](https://render.com/docs/cronjobs) antes de sincronizar o serviço.

## Render

O `render.yaml` da raiz provisiona API e PostgreSQL. O plano gratuito está configurado apenas para preparação inicial; antes de uso comercial, escolha um plano com retenção, backups e capacidade adequados.
