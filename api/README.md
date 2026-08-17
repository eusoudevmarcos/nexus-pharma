# Nexus Pharma API

Núcleo modular em Fastify + TypeScript, com PostgreSQL para vendas/DRE/auditoria
e MongoDB para catálogo, regras fiscais e estoque.

## Execução local

1. Copie `.env.example` para `.env` e preencha as conexões.
2. Execute, em ordem, `database/postgres/001_core_fiscal.sql` e
   `database/postgres/002_auditoria_categoria_fiscal.sql` no PostgreSQL.
3. Importe `database/mongo/categoria-medicamentos.exemplo.json` em
   `categorias_fiscais`; depois substitua o ID da categoria e importe
   `database/mongo/produto-exemplo.json` em `produtos_regras_fiscais`.
4. Rode `npm install` e `npm run dev` dentro desta pasta.

Os cadastros estão em `GET/POST/PUT /api/v1/cadastros/categorias` e
`GET/POST/PUT /api/v1/cadastros/produtos`. O processamento da saída está em
`POST /api/v1/vendas/processar`. Envie sempre uma
`idempotency_key` UUID gerada no PDV; ela impede venda duplicada quando uma fila
offline for sincronizada novamente.

> O cálculo é um provisionamento gerencial parametrizado. Enquadramento fiscal,
> CST/CSOSN, natureza da receita e vigências devem ser homologados pela
> contabilidade responsável antes de uso em produção.
