# Arquitetura alvo do Nexus Pharma

## Serviços

- **Web institucional e portal SaaS:** Next.js na Vercel, dentro de `web/`.
- **API:** Fastify + TypeScript no Render, dentro de `api/`.
- **Banco:** PostgreSQL gerenciado pelo Render.
- **ORM e migrations:** Prisma. `api/prisma/schema.prisma` é a fonte única do modelo relacional.
- **Demonstração Sites:** permanece isolada na raiz; o portal de produção está em `web/`.

## Fluxo de implantação

1. O Render cria o PostgreSQL e injeta `DATABASE_URL` na API.
2. Antes de publicar a API, `prisma migrate deploy` aplica apenas migrations pendentes.
3. O seed idempotente garante os planos comerciais e, quando configurado, o primeiro administrador interno.
4. A Vercel recebe a URL pública da API em `NEXUS_API_URL`, usada no servidor Next.js; nunca recebe a conexão do banco.
5. O navegador autentica na API e envia `Authorization: Bearer <token>` e `x-company-id` nas operações de uma empresa.

## Perfis

Há dois níveis independentes:

- `SystemRole`: equipe Nexus (`INTERNAL_ADMIN`, `DEVELOPER`, `HELPDESK`, `FINANCE`, `COMMERCIAL`) ou cliente.
- `TenantRole`: papel do usuário dentro de cada empresa (`OWNER`, `ADMIN`, `MANAGER`, `FINANCE`, `PHARMACIST`, `OPERATOR`, `VIEWER`).

Assim, um colaborador interno pode operar suporte, cobrança ou liberações sem receber automaticamente acesso operacional permanente aos dados de uma farmácia.

## Domínios persistidos

- identidade, empresas, convites e permissões;
- planos, assinaturas e faturas;
- categorias, regras fiscais por regime, produtos, lotes e movimentações;
- vendas com retrato fiscal imutável, provisão mensal e alertas de reposição;
- proveniência tributária por lote, saldo fiscal e avaliações de saída vinculadas à venda;
- análises da IA fiscal com origem, destino, composição, justificativa, evidências e revisão humana;
- tickets e mensagens para helpdesk;
- releases, aprovações por área e liberação por cliente;
- credenciais de API e trilha de auditoria.

## Segurança mínima antes de produção

- trocar e guardar `JWT_SECRET` somente no Render;
- usar um domínio HTTPS da API e restringir `WEB_ORIGIN` ao domínio da Vercel;
- criar o administrador pelo seed uma única vez e depois remover as variáveis de senha;
- manter os cookies `HttpOnly`, `Secure`, `SameSite=Strict` e prefixados com `__Host-` no portal;
- monitorar reutilização de refresh token, sessões excedentes e eventos de acesso na central de Segurança;
- manter o banco sem acesso público (`ipAllowList: []`) e usar somente a conexão interna do Render;
- homologar regras e fontes fiscais com profissional responsável antes de ativá-las para venda.
