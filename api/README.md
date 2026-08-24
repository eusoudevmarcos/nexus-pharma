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
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/planos`
- `GET/POST/PUT /api/v1/cadastros/categorias`
- `GET/POST/PUT /api/v1/cadastros/produtos`
- `GET/POST/PUT /api/v1/fiscal/analises`
- `POST /api/v1/vendas/processar`
- `GET/POST /api/v1/suporte/tickets`
- `GET /api/v1/relatorios/{gestao,operacao,fiscal,usuarios}`
- `GET/POST /api/v1/usuarios/convites`
- `POST /api/v1/usuarios/convites/aceitar`
- `PATCH /api/v1/usuarios/membros/:id`
- `GET/PATCH /api/v1/interno/suporte`
- `GET /api/v1/interno/financeiro`
- `GET/PATCH /api/v1/interno/comercial`
- `GET /api/v1/interno/desenvolvimento`
- `GET /api/v1/financeiro/assinaturas`
- `GET/POST /api/v1/desenvolvimento/releases`

O processamento da venda é idempotente, consome lotes por vencimento, registra o retrato fiscal aplicado, atualiza a provisão mensal e cria alertas de reposição. Convites de acesso usam token único armazenado como hash, expiram em 72 horas e toda mudança de perfil é auditada. As sugestões tributárias continuam sujeitas a revisão humana e homologação profissional.

## Render

O `render.yaml` da raiz provisiona API e PostgreSQL. O plano gratuito está configurado apenas para preparação inicial; antes de uso comercial, escolha um plano com retenção, backups e capacidade adequados.
