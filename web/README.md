# Nexus Pharma Web

Site institucional e porta de entrada do SaaS, preparado para Vercel.

## Desenvolvimento

1. Copie `.env.example` para `.env.local`.
2. Configure `NEXUS_API_URL` com a API do Render.
3. Execute `npm install` e `npm run dev`.

Na Vercel, configure o diretório raiz do projeto como `web` e cadastre `NEXUS_API_URL` e `NEXT_PUBLIC_SITE_URL`. A conexão do banco e os segredos de autenticação permanecem somente no Render.
