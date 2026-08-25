# Nexus Pharma Web

Site institucional e porta de entrada do SaaS, preparado para Vercel.

## Desenvolvimento

1. Copie `.env.example` para `.env.local`.
2. Configure `NEXUS_API_URL` com a API do Render.
3. Execute `npm install` e `npm run dev`.

Na Vercel, configure o diretório raiz do projeto como `web` e cadastre `NEXUS_API_URL` e `NEXT_PUBLIC_SITE_URL`. A conexão do banco e os segredos de autenticação permanecem somente no Render.

O portal inclui seleção de empresa, painéis por perfil, gestão de usuários, geração e reenvio de convite de uso único, aceite de conta e alteração auditada de permissões. Quando o relay transacional está configurado, o convite é entregue automaticamente; sem ele, o portal apresenta o link seguro para envio manual.

Perfis corporativos não dependem de vínculo com uma farmácia: Helpdesk, Financeiro, Comercial, Desenvolvimento e Administração Interna recebem navegação e painéis próprios após o login. O Financeiro também acompanha filas e falhas de e-mail e os eventos recentes do webhook de cobrança.

Administração e Desenvolvimento possuem uma janela de Monitoramento com saúde da API, banco, integrações, sessões ativas, desempenho e tratamento auditado de incidentes.
