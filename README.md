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

## Próximas etapas

1. Conectar a API e o PostgreSQL ao Render e executar a migration inicial.
2. Conectar `web/` à Vercel e informar as variáveis de ambiente.
3. Informar as credenciais do relay de e-mail e conectar o adaptador do provedor escolhido.
4. Informar o segredo interno e conectar o adaptador do provedor de cobrança escolhido.
5. Adicionar observabilidade, alertas e monitoramento de produção.

Consulte [api/README.md](api/README.md) para a API, [web/README.md](web/README.md) para o frontend e [docs/architecture.md](docs/architecture.md) para a arquitetura alvo.
