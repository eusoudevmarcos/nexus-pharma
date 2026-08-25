# Nexus Pharma

Plataforma SaaS de inteligência fiscal, estoque, vendas e gestão para farmácias.

## Estrutura atual

- `app/`: demonstração visual existente, publicada de forma privada.
- `web/`: site institucional e porta de entrada Next.js preparados para Vercel.
- `api/`: API Fastify preparada para Render.
- `api/prisma/`: modelo PostgreSQL, migration inicial e seed.
- `docs/architecture.md`: desenho de Vercel, Render, perfis e segurança.
- `render.yaml`: infraestrutura declarativa para API e banco.

A persistência de produção foi consolidada em PostgreSQL + Prisma. O modelo cobre empresas, usuários, permissões, planos, assinaturas, financeiro, helpdesk, releases, catálogo fiscal, lotes, vendas, alertas, análises da IA e auditoria.

O portal autenticado já possui seleção segura de empresa, navegação por perfil e painéis separados de Gestão, Operação, Motor Fiscal e Usuários. A administração de equipe permite convite com validade e uso único, aceite de conta, alteração de perfil e suspensão auditada. Os indicadores são calculados pela API diretamente sobre vendas, estoque, lotes, análises tributárias e logs de auditoria, sempre isolados por empresa.

A central corporativa possui acesso independente para Helpdesk, Financeiro, Comercial e Desenvolvimento. Usuários internos são direcionados automaticamente à sua área, com filas operacionais, indicadores consolidados e ações auditadas sobre chamados e implantação de clientes.

A automação comercial já possui fila auditável de e-mail, reenvio com rotação do token e fallback manual. A cobrança dispõe de webhook normalizado com HMAC, proteção contra repetição e processamento idempotente de faturas e assinaturas. O painel Financeiro acompanha as duas integrações sem misturar o acesso dos clientes.

A central de observabilidade acompanha prontidão da API e PostgreSQL, desempenho, sessões e integrações. Falhas são agrupadas em incidentes, reabertas em caso de recorrência e tratadas pela equipe técnica com trilha de auditoria.

A automação diária cria uma fila inteligente para estoque baixo, oportunidades de compra com boa margem, lotes em vencimento e cobranças atrasadas. Cada execução possui histórico, proteção contra duplicidade e tratamento automático das condições já normalizadas.

O motor comercial SaaS possui os planos Basic, Smart, Fiscal Inteligente e Ultimate, onboarding financeiro, matriz e primeiro PDV inclusos, cobrança de filiais e PDVs extras e memória mensal discriminada. O Success Fee só é calculado sobre economia tributária e perdas de estoque evitadas depois da homologação humana com evidências. A área Comercial ativa o contrato e gera o cronograma de setup; a janela interna de Faturamento homologa a economia, fecha a competência e entrega uma cobrança idempotente ao adaptador do gateway.

## Próximas etapas

1. Conectar a API e o PostgreSQL ao Render e executar a migration inicial.
2. Conectar `web/` à Vercel e informar as variáveis de ambiente.
3. Informar as credenciais do relay de e-mail e conectar o adaptador do provedor escolhido.
4. Informar `BILLING_RELAY_URL`, `BILLING_RELAY_KEY` e o segredo do webhook para conectar o provedor de cobrança escolhido.
5. Conectar o coletor externo de logs e alertas ao endpoint protegido de métricas.
6. Revisar o custo do Cron Job do Render e ativar a rotina diária na implantação comercial.

Consulte [api/README.md](api/README.md) para a API, [web/README.md](web/README.md) para o frontend e [docs/architecture.md](docs/architecture.md) para a arquitetura alvo.
