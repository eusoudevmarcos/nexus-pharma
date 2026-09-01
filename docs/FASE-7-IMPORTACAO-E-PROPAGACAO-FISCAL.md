# Fase 7 — importação e propagação fiscal controlada

## Importação de produtos

- CSV e XLSX são transformados no navegador em linhas canônicas; o arquivo não altera o cadastro ao ser selecionado.
- A API valida GTIN, duplicidade, categoria aprovada, fornecedor ativo, números, margem, composição e indício de registro ANVISA ausente.
- Cada lote guarda hash, origem, linhas brutas, dados normalizados, erros, avisos e ação prevista (`CREATE` ou `UPDATE`).
- Estoque não é importado por este fluxo. Saldo continua mudando apenas por entrada/lote e movimentos auditáveis.
- O criador envia o lote e outro proprietário, administrador ou gerente aprova. O criador nunca aprova o próprio lote.
- A aplicação cria ou atualiza produtos e vínculos com fornecedores em uma transação única.

## Propagação fiscal

- A simulação compara uma categoria atual com outra categoria ativa e aprovada.
- O painel apresenta versões, NCM, campos alterados, produtos afetados, estoque e valores agregados.
- O hash-base inclui as duas regras e a lista de produtos. Qualquer mudança posterior bloqueia a aplicação e exige nova simulação.
- A aprovação em quatro olhos altera a categoria dos produtos somente depois da revisão de outro gestor.
- A trilha de auditoria registra simulação, envio, rejeição ou aplicação.

## Limites intencionais

- A simulação não declara economia tributária definitiva; isso dependerá do motor fiscal homologado e de evidência legal vigente.
- A importação não cria fornecedor automaticamente. O CNPJ precisa existir e estar ativo.
- O arquivo é limitado a 1.000 linhas por lote para manter validação, revisão e transação previsíveis.
