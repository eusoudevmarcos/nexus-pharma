# Go-live do Nexus Pharma

O primeiro cliente real só deve ser liberado quando `npm run preflight:production`, executado em `api/`, terminar com `ready: true`. A central interna **Go-live** apresenta o mesmo diagnóstico sem exibir segredos.

## 1. Render: API e PostgreSQL

### Homologação sem custo

O arquivo `render.staging.yaml` conecta a API ao PostgreSQL gratuito existente chamado
`nexus-pharma`, na região Oregon. Ele cria somente o Web Service gratuito, aplica as
migrations do Prisma durante o build e executa o seed inicial uma única vez.

Ao criar o Blueprint, informe `render.staging.yaml` como caminho e preencha apenas
`SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`. Esse ambiente é de homologação: o banco
gratuito expira, não possui PITR e o serviço pode suspender por inatividade.

O `render.yaml` permanece como arquitetura de produção e não deve ser sincronizado
sem aprovar previamente os custos do banco e dos serviços pagos.

1. Conectar o repositório Git e criar o Blueprint a partir de `render.yaml`.
2. Confirmar os custos antes da primeira sincronização: o Blueprint usa serviço `starter`, PostgreSQL `basic-256mb` e Cron Job `starter` para permitir pre-deploy, PITR e automação diária.
3. Configurar `WEB_ORIGIN` com a origem HTTPS exata do portal Vercel.
4. Configurar `WEB_APP_URL` com a mesma URL pública do portal.
5. Configurar e-mail, gateway financeiro e observabilidade.
6. No primeiro deploy, manter temporariamente `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`. O `initialDeployHook` executa o seed uma vez; as migrations são executadas em todo deploy pelo `preDeployCommand`.
7. Confirmar o administrador ativo e remover imediatamente as duas variáveis do ambiente.
8. Confirmar `DEPLOYMENT_STAGE=production`, `DATABASE_RECOVERY_MODE=PITR` e a janela realmente contratada. O valor inicial documentado é de três dias e precisa corresponder ao plano do workspace.
9. Manter `ipAllowList: []` e usar somente a conexão interna entre API e banco.
10. Configurar os endpoints oficiais DF-e e manter as chaves `DFE_ENABLE_SEFAZ_TRANSMISSION`, `NFCE_ENABLE_SEFAZ_TRANSMISSION` e `NFCE_ALLOW_PRODUCTION_PREPARATION` desligadas até a homologação fiscal.
11. Manter `PRIME_ENABLED=false` enquanto o Painel Prime estiver reservado somente para demonstrações futuras.

O deploy aplica migrations pendentes com `prisma migrate deploy`; não use `migrate dev` em produção.

## 2. Vercel: institucional e portal

1. Criar o projeto com Root Directory `web`.
2. Definir `NEXUS_API_URL` para o domínio HTTPS da API.
3. Manter Framework Preset como `Next.js` e Output Directory no padrão do framework; não configurar `.next` manualmente.
4. Não usar `/` como Root Directory: a raiz contém a demonstração Vinext e não gera o artefato `.next` esperado pela Vercel.
5. Definir `NEXT_PUBLIC_SITE_URL` para o domínio HTTPS do portal.
6. Manter `NEXT_PUBLIC_PRIME_ENABLED=false` no produto principal; habilitar somente em uma demonstração controlada.
7. Publicar primeiro em Preview e validar login, seleção de empresa, troca de empresa e logout.
8. Só então promover a mesma revisão para Production.
9. Validar `GET /api/health`: a resposta só fica `200` quando o portal consegue alcançar `/health/ready` na API.

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

## 6. Verificação depois da publicação

Na raiz, execute `npm run verify:production -- https://api.seudominio.com.br https://app.seudominio.com.br`. O diagnóstico verifica API, PostgreSQL, ponte do portal, cabeçalhos de segurança, robots e sitemap sem receber senhas.

O deploy de infraestrutura não significa que a operação fiscal está liberada. Enquanto o preflight indicar `nfce-sefaz` como `BLOCKED`, o ambiente serve somente para homologação interna e piloto sem emissão fiscal real.

## Rollback

- Portal: reverter para o último deployment estável da Vercel.
- API: reverter o serviço para a última revisão estável, sem apagar migrations já aplicadas.
- Banco: usar PITR para criar uma nova instância no ponto anterior ao incidente, validar isoladamente e só então redirecionar a API.
- Registrar o incidente e a decisão de retorno na central interna.
