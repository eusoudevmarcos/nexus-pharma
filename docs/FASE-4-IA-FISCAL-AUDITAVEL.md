# Fase 4 — IA fiscal auditável

## Objetivo

Adicionar inteligência ao saneamento sem permitir que texto livre, repetição de usuário ou estimativa econômica se transforme em regra tributária.

O motor continua local e determinístico. Ele ajuda a localizar incompatibilidades, organizar evidências e priorizar revisão humana. A fonte legal aprovada permanece superior a qualquer sinal semântico.

## Compatibilidade produto × NCM

A análise cruza:

- nome e descrição do produto;
- princípio ativo e composição;
- laboratório/fabricante;
- presença do registro ANVISA;
- categoria fiscal atual;
- NCM atual;
- descrições e padrões do catálogo NCM oficial ativo.

O resultado pode ser:

- `COMPATIBLE`: os sinais disponíveis apoiam o NCM atual;
- `INCONCLUSIVE`: faltam dados ou catálogo oficial suficiente;
- `CONFLICT`: descrição, composição, registro ou candidato oficial contradizem o NCM atual.

Uma análise com `CONFLICT` não pode ser aprovada. O operador pode informar um NCM corrigido na rejeição, mas isso apenas registra uma evidência de aprendizado.

## Memória das correções

Cada decisão humana grava:

- análise original;
- produto e categoria;
- usuário revisor;
- decisão e justificativa;
- impressão digital do contexto;
- impressão digital da sugestão;
- classificação corrigida informada pelo revisor.

Quando o mesmo NCM corrigido aparece pelo menos três vezes no histórico do produto ou categoria, o motor mostra um aviso de recorrência. Esse aviso:

- não altera o NCM;
- não cria regra legal;
- não aumenta a confiança da sugestão;
- não autoriza venda ou emissão fiscal;
- somente ajuda o responsável a investigar uma exceção recorrente.

## Impacto econômico

Quando existe categoria candidata aprovada, regra do mesmo regime e volume de venda, a interface mostra uma comparação nominal estimada.

Ela é explicitamente separada da economia homologada porque não considera automaticamente bases reduzidas, créditos, substituição tributária, benefícios ou particularidades da operação. Portanto:

- não alimenta o Success Fee;
- não entra na fatura SaaS;
- não é apresentada como economia confirmada;
- exige simulação tributária completa e homologação antes de uso gerencial.

## Evidências e confiança

A confiança considera categoria aprovada, regra do regime, matriz por UF/operação, fontes legais, estados da operação e composição. Conflitos semânticos reduzem e limitam a confiança.

As evidências podem vir da categoria, matriz e catálogo NCM oficial ativo. Sem fonte, a análise não pode ser aprovada.

## Casos de avaliação

O conjunto inicial cobre:

1. produto coerente com o NCM;
2. maquiagem cadastrada como sabonete;
3. descrição insuficiente e catálogo ausente;
4. texto adversarial misturando domínios incompatíveis;
5. medicamento sem registro ANVISA informado.

## O que ainda falta

- carregar e homologar o catálogo NCM oficial integral;
- validar o registro ANVISA em fonte sanitária oficial quando houver integração autorizada;
- ampliar os casos com dados reais anonimizados e homologados;
- implementar RAG apenas sobre fontes aprovadas, caso o ganho justifique o custo;
- criar o ranking comercial combinando margem, giro, ruptura, validade e aderência;
- medir precisão, falso positivo e concordância por versão do motor.
