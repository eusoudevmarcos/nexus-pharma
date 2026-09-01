# Lapidação operacional — estoque, gestão e suporte

## Entregue nesta fase

- Previsão de compra com fator sazonal por loja/produto/mês e aumento configurável para promoções ativas.
- Política por empresa com cobertura padrão, limite de aprovação gerencial e aprovação obrigatória do proprietário acima do limite.
- Vínculo auditável entre recomendação, item do pedido e quantidade efetivamente recebida.
- Medição diária de acurácia, ruptura evitada, perda potencial evitada e giro de estoque.
- Relatório gerencial com filtros consistentes e exportação CSV, XLSX e PDF.
- Drill-down de venda até produto, lote, origem da NF-e, regra fiscal, CST, cClassTrib e hash da decisão.
- Helpdesk do cliente com abertura, SLA, conversa, situação e responsável.
- Recuperação de senha por token de uso único (30 minutos), troca autenticada e revogação de sessões.
- Sessão de diagnóstico do helpdesk somente leitura, vinculada ao chamado, consentida por proprietário/administrador com MFA, temporária e auditada.
- Matriz de permissões atualizada com o domínio de helpdesk e consentimento.

## Aplicação

1. Executar `npm run prisma:migrate:deploy` na API do Render.
2. Publicar API e frontend a partir da mesma revisão Git.
3. Configurar `EMAIL_RELAY_URL`, `EMAIL_RELAY_KEY` e `EMAIL_FROM` para entrega automática dos links de recuperação.
4. Confirmar que proprietário e administrador possuem MFA antes de testar o consentimento de suporte.
5. Executar uma rodada do job diário para iniciar as medições das recomendações e expirar sessões vencidas.

## Validação funcional mínima

- Definir limite de compras, criar pedido acima dele e confirmar que gerente é bloqueado e proprietário é autorizado.
- Aplicar fator sazonal e promoção e conferir os fatores exibidos na sugestão.
- Exportar o mesmo relatório nos três formatos e abrir uma venda para conferir lote e regra fiscal.
- Abrir chamado, responder pelos dois lados, solicitar acesso, consentir com MFA, abrir diagnóstico e revogar.
- Solicitar redefinição de senha e confirmar que o link não pode ser reutilizado.
