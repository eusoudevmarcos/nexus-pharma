# Nexus Pharma Web

Site institucional e porta de entrada do SaaS, preparado para Vercel.

## Desenvolvimento

1. Copie `.env.example` para `.env.local`.
2. Configure `NEXUS_API_URL` com a API do Render.
3. Execute `npm install` e `npm run dev`.

Na Vercel, configure obrigatoriamente o diretório raiz do projeto como `web`, mantenha o Output Directory no padrão do Next.js e cadastre `NEXUS_API_URL` e `NEXT_PUBLIC_SITE_URL`. Não preencha o Output Directory manualmente com `.next`. A raiz do repositório contém a demonstração Vinext e não deve ser usada pelo projeto Vercel. A conexão do banco e os segredos de autenticação permanecem somente no Render.

O portal inclui seleção de empresa, painéis por perfil, gestão de usuários, geração e reenvio de convite de uso único, aceite de conta e alteração auditada de permissões. Quando o relay transacional está configurado, o convite é entregue automaticamente; sem ele, o portal apresenta o link seguro para envio manual.

Perfis corporativos não dependem de vínculo com uma farmácia: Helpdesk, Financeiro, Comercial, Desenvolvimento e Administração Interna recebem navegação e painéis próprios após o login. O Financeiro também acompanha filas e falhas de e-mail e os eventos recentes do webhook de cobrança.

O Comercial configura o plano e o início do contrato, gerando automaticamente a matriz, o primeiro PDV e as parcelas de onboarding. Financeiro e Administração possuem uma janela separada de Faturamento SaaS para homologar economias com evidências, acompanhar contratos e setup, fechar a competência e conferir cada item antes da cobrança.

Administração e Desenvolvimento possuem uma janela de Monitoramento com saúde da API, banco, integrações, sessões ativas, desempenho e tratamento auditado de incidentes.

A janela de Segurança permite revisar dispositivos, revogar sessões e acompanhar falhas de login, reutilização de token e acessos multiempresa bloqueados. Em produção, as credenciais ficam em cookies `HttpOnly`, `Secure`, `SameSite=Strict`, com prefixo `__Host-`. Operações da API web rejeitam origem cruzada e todas as páginas recebem CSP, HSTS, bloqueio de frame e política restritiva de recursos.

Clientes possuem uma Central de Alertas separada, com filtros para compras, vencimentos e cobranças. Operadores podem assumir alertas; perfis de gestão podem resolver ou dispensar, sempre com auditoria.
