# Fase 6J — Devolução ao fornecedor por NF-e e quantidade

## Entregue

- A devolução parte obrigatoriamente de uma NF-e já conferida e vinculada ao pedido de compra.
- O fluxo pergunta se será devolvido um item, alguns itens ou todos os itens ainda disponíveis.
- Para cada item, o usuário pode devolver a quantidade inteira ou uma fração com até três casas decimais.
- A prévia informa recebido, já devolvido, saldo da nota, saldo livre da loja, lote, custo e bloqueios.
- A confirmação é idempotente e executa uma transação serializável única.
- A transação reduz saldo da loja, lote, produto e proveniência fiscal; cria movimento negativo; recalcula o recebido do pedido; e registra auditoria imutável.
- O valor reduz primeiro o saldo ainda não pago do título. O excedente pago ou sem título vira crédito pendente com o fornecedor.
- O histórico original da NF-e, dos pagamentos e das devoluções não é apagado.
- Um rascunho fiscal é criado com `finNFe = 4`, chave de origem e número do item original.
- A tela separa claramente a reversão interna da posterior revisão tributária e autorização SEFAZ.

## Proteções

- Não permite selecionar item que não pertence à NF-e escolhida.
- Não permite devolver acima do recebido menos devoluções anteriores.
- Não permite consumir saldo reservado, vendido, transferido ou baixado.
- Não permite consumir mais proveniência fiscal do que ainda resta para a nota e o item.
- O modo `ONE` exige exatamente um item; `SOME`, ao menos dois; e `ALL`, todos os itens devolvíveis.
- Registros e itens de devolução são imutáveis no banco. Somente campos do ciclo fiscal podem receber atualizações posteriores.

## Regra fiscal preservada

A NF-e de devolução precisa referenciar o documento fiscal original; as regras atuais também preveem referência ao item original quando o referenciamento é feito por item. A implementação conserva esses dados no rascunho, mas não define CFOP, CST, base ou alíquota sem passar pelo motor fiscal e pela UF aplicável.

Referências oficiais consultadas:

- [Portal Nacional da NF-e — Manual de Orientação do Contribuinte](https://www.nfe.fazenda.gov.br/pOrtaL/listaConteudo.aspx?tipoConteudo=ndIjl+iEFdE=)
- [Portal Nacional da NF-e — regras de validação da devolução referenciada](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=bBbBVKSai3U=)

## Pendente

- Conectar o rascunho ao emissor NF-e modelo 55 e ao certificado A1.
- Resolver CFOP e tributação da devolução pelo motor fiscal conforme operação, origem, destino, regime e vigência.
- Registrar autorização, rejeição, protocolo, chave e XML final retornados pela SEFAZ.
- Transformar o crédito pendente em compensação financeira formal, nota de crédito ou recebimento do fornecedor.
- Implementar cancelamento fiscal e contramovimento controlado quando uma devolução autorizada precisar ser desfeita.
