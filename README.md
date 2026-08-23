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

## Próximas etapas

1. Conectar a API e o PostgreSQL ao Render e executar a migration inicial.
2. Conectar `web/` à Vercel e informar as variáveis de ambiente.
3. Evoluir o portal autenticado com seleção de empresa e áreas por perfil.
4. Construir as áreas do cliente, helpdesk, financeiro, gestores e desenvolvedores.

Consulte [api/README.md](api/README.md) para a API, [web/README.md](web/README.md) para o frontend e [docs/architecture.md](docs/architecture.md) para a arquitetura alvo.
