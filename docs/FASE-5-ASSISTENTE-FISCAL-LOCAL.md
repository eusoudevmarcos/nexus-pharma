# Fase 5 — assistente fiscal local e auditável

## Objetivo deste estágio

Entregar agilidade de classificação sem contratar um modelo de IA e sem transformar hipótese em regra fiscal. O assistente local consulta somente os dados já aprovados no PostgreSQL.

## Fluxo

1. Usuário escolhe produto ou categoria, UFs e operação.
2. O motor recupera categoria, regra do regime, matriz vigente e fontes cadastradas.
3. A sugestão recebe confiança, riscos, fundamentação e citações.
4. O resultado fica em `NEEDS_REVIEW` e não altera o produto ou a categoria.
5. Responsável autorizado aprova ou rejeita; rejeição exige justificativa.
6. A decisão entra na auditoria e nas métricas de concordância.

## Barreiras

- Sem fonte cadastrada, a confiança não ultrapassa 49% e a aprovação é bloqueada.
- A confiança máxima é 95%; o sistema nunca declara certeza absoluta.
- Repetição de uma correção humana não cria regra legal automaticamente.
- Economia estimada permanece zerada até existir cálculo comprovado e homologado.
- Não há chamada, token ou custo de modelo externo nesta fase.

## Evolução futura opcional

Um RAG semântico poderá ser conectado depois que o catálogo oficial estiver completo e homologado. Mesmo nessa etapa, a fonte, a vigência e a revisão humana continuarão obrigatórias.
