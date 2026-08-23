# Contrato do frontend Vercel

O próximo frontend será criado em `web/` como um projeto Next.js independente. Na Vercel, o **Root Directory** deverá ser `web`.

## Variáveis

```text
NEXT_PUBLIC_API_URL=https://api.seudominio.com.br
```

Somente a URL pública da API pode usar o prefixo `NEXT_PUBLIC_`. Segredos, `DATABASE_URL` e `JWT_SECRET` pertencem exclusivamente ao Render.

## Rotas planejadas

- `/`: institucional, proposta de valor e demonstração visual;
- `/recursos`: motor fiscal, estoque, validade, vendas e inteligência de compras;
- `/planos`: pacotes carregados de `GET /api/v1/planos`;
- `/seguranca`: isolamento por empresa, auditoria e revisão humana;
- `/entrar`: login;
- `/app`: área do cliente;
- `/operacoes`: gestores e financeiro da empresa;
- `/suporte`: clientes e helpdesk;
- `/interno/desenvolvimento`: releases e liberações;
- `/interno/financeiro`: assinaturas, cobranças e inadimplência.

## Sessão

Nesta primeira fundação, a API devolve `access_token` curto e `refresh_token` rotativo. Antes da liberação comercial, o frontend deve armazenar o refresh token em cookie `HttpOnly`, usando uma rota server-side do Next.js; ele não deve ficar em `localStorage`.

Após escolher uma empresa, cada chamada operacional envia `x-company-id`. O backend confere a associação e o papel do usuário, não confiando apenas no valor enviado pela interface.

## Ordem da próxima etapa

1. landing page institucional responsiva;
2. páginas de recursos, segurança e planos;
3. login e recuperação de acesso;
4. shell dos portais por perfil;
5. integração gradual dos módulos existentes.
