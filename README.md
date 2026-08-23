# Nexus Pharma

Plataforma SaaS de inteligência fiscal, estoque, vendas e gestão para farmácias.

## Estrutura atual

- `app/`: demonstração visual existente, publicada de forma privada.
- `api/`: API Fastify preparada para Render.
- `api/prisma/`: modelo PostgreSQL, migration inicial e seed.
- `docs/architecture.md`: desenho de Vercel, Render, perfis e segurança.
- `render.yaml`: infraestrutura declarativa para API e banco.

A persistência de produção foi consolidada em PostgreSQL + Prisma. O modelo cobre empresas, usuários, permissões, planos, assinaturas, financeiro, helpdesk, releases, catálogo fiscal, lotes, vendas, alertas, análises da IA e auditoria.

## Próximas etapas

1. Criar `web/`, o site institucional e o portal Next.js para Vercel.
2. Integrar login e seleção de empresa com a API.
3. Construir as áreas do cliente, helpdesk, financeiro, gestores e desenvolvedores.
4. Conectar o repositório ao Render e à Vercel e configurar os domínios.

Consulte [api/README.md](api/README.md) para desenvolvimento da API e [docs/architecture.md](docs/architecture.md) para a arquitetura alvo.
