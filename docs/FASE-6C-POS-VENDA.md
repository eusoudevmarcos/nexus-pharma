# Fase 6C — descontos e pós-venda seguro

## Entregue

- desconto percentual com preço original e valor concedido preservados por venda e item;
- limite de desconto por papel, configurável por empresa e validado na API;
- cancelamento total restrito a proprietário, administrador e gestor;
- devolução parcial permitida aos perfis operacionais autorizados;
- idempotência e repetição controlada em conflitos de transação serializável;
- venda original, itens, memória fiscal e NFC-e preservados para auditoria;
- alocação da devolução sobre o lote e a proveniência fiscal realmente consumidos;
- retorno ao estoque apenas para condição `RESALABLE` e lote ainda válido;
- registro sem reintegração para avaria, vencimento e demais condições não vendáveis;
- ajuste reverso da provisão mensal de receita, custo, imposto e lucro;
- reembolso distribuído sobre o saldo não utilizado dos pagamentos originais;
- devolução em dinheiro refletida na conciliação da sessão aberta;
- reembolso externo marcado como bloqueado, sem simular confirmação do PSP, banco ou adquirente;
- pendência fiscal quando a venda possui NFC-e autorizada;
- central `/portal/pos-venda` com venda, quantidades restantes, histórico e filas separadas;
- migration com restrições, chaves, índices e triggers de imutabilidade;
- testes unitários para alocação de origem, pagamentos, descontos e conciliação.

## Regras que evitam brechas

1. Nenhum estorno exclui ou reescreve a venda original.
2. Uma quantidade já devolvida não pode ser devolvida outra vez.
3. Um lote vencido nunca volta ao estoque vendável.
4. O saldo da proveniência fiscal é recomposto junto com o saldo físico.
5. O reembolso nunca ultrapassa o saldo dos pagamentos originais.
6. A gaveta precisa ter dinheiro esperado suficiente para a devolução em espécie.
7. NFC-e autorizada exige evento fiscal oficial; o registro interno cria pendência, não autorização fictícia.
8. Pix e cartão exigem integração real para mudar de `BLOCKED` para confirmação.

## Limites deliberados

- a migration foi criada e validada, mas não foi aplicada automaticamente a nenhum banco;
- não existe endpoint para “confirmar” manualmente evento fiscal ou reembolso externo;
- cancelamento oficial da NFC-e, TEF, PSP Pix e adquirentes aguardam escolha e homologação dos provedores;
- a movimentação exige seleção explícita de uma sessão de caixa aberta;
- trocas com nova venda vinculada ainda não fazem parte desta fase.

## Próxima fatia interna

1. [x] vincular consumidor/CPF, vendedor e farmacêutico responsável à venda;
2. [x] cadastrar políticas e autorizações configuráveis para medicamentos controlados;
3. implementar reserva, transferência entre lojas, inventário, perdas e ajustes aprovados;
4. criar troca como devolução vinculada a uma nova venda, sem compensação opaca;
5. criar relatórios de desconto, devolução, motivo, operador, perda e impacto de margem.

## Dependências externas posteriores

- cancelar NFC-e com evento, protocolo, prazo e regras homologadas da UF;
- confirmar e desfazer Pix/TEF/cartão no provedor escolhido;
- conciliar chargeback, falha parcial, timeout e resposta assíncrona;
- validar o fluxo em piloto físico com perfis, gaveta, impressora e queda de rede.
