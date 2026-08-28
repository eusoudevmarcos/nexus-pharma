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
- `npm test`: compila a API e valida as decisões de ST, monofásico, crédito e CFOP.

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
- `POST /api/v1/fiscal/rastreabilidade/entradas`
- `PUT /api/v1/fiscal/rastreabilidade/entradas/:id/revisao`
- `POST /api/v1/fiscal/rastreabilidade/avaliacoes-saida`
- `GET /api/v1/fiscal/rastreabilidade/produtos/:productId`
- `GET /api/v1/fiscal/rastreabilidade/resumo`
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
- `GET /api/v1/interno/faturamento`
- `POST /api/v1/interno/faturamento/economias`
- `POST /api/v1/interno/faturamento/fechar`
- `PUT /api/v1/interno/comercial/empresas/:id/assinatura`
- `POST /api/v1/interno/comercial/empresas/:id/lojas`
- `POST /api/v1/interno/comercial/lojas/:id/pdvs`
- `GET/PATCH /api/v1/interno/comercial`
- `GET /api/v1/interno/desenvolvimento`
- `GET/PATCH /api/v1/interno/monitoramento`
- `GET /api/v1/interno/seguranca`
- `PATCH /api/v1/interno/seguranca/sessoes/:id`
- `GET /api/v1/financeiro/assinaturas`
- `GET/POST /api/v1/desenvolvimento/releases`
- `POST /api/v1/webhooks/billing/:provider`
- `GET /api/v1/operations/metrics`

O processamento da venda é idempotente, consome lotes por vencimento, registra o retrato fiscal aplicado, atualiza a provisão mensal e cria alertas de reposição. Convites de acesso usam token único armazenado como hash, expiram em 72 horas e toda mudança de perfil é auditada. O reenvio rotaciona o token e invalida o link anterior. As sugestões tributárias continuam sujeitas a revisão humana e homologação profissional.

## Rastreabilidade tributária

Cada entrada pode manter um extrato fiscal imutável por produto e lote, com o hash do documento de origem, CFOP/CST recebidos, ICMS-ST, PIS/COFINS monofásico, tratamento de créditos, IBS/CBS e evidências. O saldo fiscal aprovado é consumido juntamente com o saldo físico do lote.

Antes de concluir uma venda, o motor valida as UFs, o CFOP de saída e a coerência entre a regra da categoria e a tributação comprovada na entrada. Saídas com CST 60/CSOSN 500 sem retenção anterior, produtos monofásicos com novo débito de PIS/COFINS, crédito monofásico permitido ou operação interestadual usando CFOP interno são bloqueados. O valor mostrado como potencial protegido não é contabilizado automaticamente como economia confirmada; ele depende de revisão fiscal.

O cadastro da origem começa em `DRAFT` e somente `OWNER`, `ADMIN`, `MANAGER` ou `PHARMACIST` pode aprová-lo. Aprovações exigem evidência e, no caso monofásico, natureza da receita e créditos de PIS/COFINS marcados como proibidos. O XML ou snapshot recebido nunca é substituído pela decisão de saída.

## Identidade e sessões

Configure `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS` e `MAX_ACTIVE_SESSIONS`. Cada token de acesso contém o identificador da sessão e a API confirma no PostgreSQL se a sessão e a conta continuam ativas; logout e revogação administrativa passam a ter efeito imediato.

O refresh token é armazenado somente como hash e rotacionado por operação atômica. A reutilização do token anterior ou duas rotações concorrentes revogam toda a sessão e geram um evento crítico. Falhas de login usam comparação de senha de tempo equivalente mesmo para identidades inexistentes, reduzindo enumeração por tempo. A central `/portal/interno/seguranca` mostra sessões, falhas e eventos para Administração e Desenvolvimento.

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

## Faturamento mensal SaaS

O seed mantém quatro planos vigentes: Basic (R$ 698), Smart (R$ 1.199), Fiscal Inteligente (R$ 1.990) e Ultimate (R$ 2.498). Todos incluem uma loja e um PDV por loja; cada filial ativa adicional soma R$ 1.000 e cada PDV ativo acima do primeiro de sua loja soma R$ 280.

O fechamento mensal salva uma memória imutável com competência, plano, contagens e itens discriminados. Planos Fiscal Inteligente e Ultimate exigem que a economia do mês esteja `VERIFIED`; sem homologação e evidências, a fatura permanece `DRAFT`, com envio ao gateway bloqueado. Depois do fechamento, a economia fica `LOCKED`. O Ultimate cria entrada de R$ 5.000 no primeiro mês e quatro parcelas de R$ 1.250 nos meses 2 a 5; os demais planos criam o setup único de R$ 890.

Configure `BILLING_RELAY_URL` e, se necessário, `BILLING_RELAY_KEY`. A API envia uma cobrança unificada com chave de idempotência e itens. Sem relay, a solicitação fica `QUEUED` para integração manual; o sistema nunca simula que o pagamento foi emitido. O webhook `invoice.paid` baixa as parcelas do onboarding vinculadas e conclui o onboarding quando todas forem pagas.

Não há rateio proporcional nesta versão: lojas e PDVs são contados pela situação no encerramento da competência. Essa regra deve constar no contrato comercial antes da entrada em produção.

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
