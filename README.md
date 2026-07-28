# Nexus Pharma

MVP de inteligência fiscal, sell-out e reposição de estoque para farmácias.

- `app/`: interface web responsiva com dashboard, PDV, estoque e conferência.
- `api/`: núcleo Fastify + TypeScript, PostgreSQL e MongoDB.
- `database/`: schema relacional e documento fiscal de exemplo.

O front-end demonstra os fluxos com dados locais e fila offline no navegador.
O serviço em `api/` contém a implementação tipada do processamento de vendas e
recebe as credenciais do Render e MongoDB Atlas por variáveis de ambiente.

## Interface

```bash
npm install
npm run dev
```

## API

Consulte [`api/README.md`](api/README.md).

