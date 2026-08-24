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

## Próximas etapas

1. Conectar a API e o PostgreSQL ao Render e executar a migration inicial.
2. Conectar `web/` à Vercel e informar as variáveis de ambiente.
3. Construir os painéis internos de helpdesk, financeiro e desenvolvedores.
4. Integrar provedor de e-mail transacional para entrega automática dos convites.
5. Integrar cobrança, observabilidade e monitoramento de produção.

Consulte [api/README.md](api/README.md) para a API, [web/README.md](web/README.md) para o frontend e [docs/architecture.md](docs/architecture.md) para a arquitetura alvo.
