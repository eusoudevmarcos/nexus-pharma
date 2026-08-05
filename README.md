# Nexus Pharma

MVP de inteligência fiscal, sell-out e reposição de estoque para farmácias.

- `app/`: interface web responsiva com dashboard, PDV, estoque e conferência.
- `api/`: núcleo Fastify + TypeScript, PostgreSQL e MongoDB.
- `database/`: schema relacional e documento fiscal de exemplo.

O front-end demonstra os fluxos com dados locais e fila offline no navegador.
O serviço em `api/` contém a implementação tipada do processamento de vendas e
recebe as credenciais do Render e MongoDB Atlas por variáveis de ambiente.

As regras tributárias ficam em categorias fiscais versionadas. Produtos guardam
apenas nomenclatura, lote, entrada, estoque, fabricação, vencimento, custo e preço,
herdando NCM, ICMS, PIS/COFINS e IBS/CBS da categoria vigente. Em 2026, os exemplos
consideram as alíquotas-teste e a compensação parametrizável de CBS com PIS/COFINS;
o Simples Nacional permanece com IBS/CBS zerados no perfil demonstrativo.

## Interface

```bash
npm install
npm run dev
```

## API

Consulte [`api/README.md`](api/README.md).
