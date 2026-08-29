# Fase 6D — consumidor, responsáveis e medicamentos controlados

## Entregue

- consumidor opcional em venda comum, com CPF/CNPJ validado quando informado;
- identificação obrigatória conforme a política configurada no produto;
- nome e nascimento do comprador para políticas com idade mínima;
- vendedor ativo e autorizado vinculado a toda nova venda;
- credencial farmacêutica com conselho, registro, UF, vigência e estado;
- verificação da credencial restrita a proprietário, administrador ou gestor;
- uso operacional somente de farmacêutico ativo, verificado e dentro da vigência;
- política independente da tributação com nível, versão, fundamento e metadata;
- requisitos configuráveis de comprador, prescrição, retenção, farmacêutico e idade;
- bloqueio integral da venda quando qualquer requisito estiver ausente;
- prescrição por item com número, prescritor, registro, UF e data;
- confirmação explícita da retenção quando configurada;
- registro imutável por item controlado e snapshot na venda;
- contexto reutilizado na preparação da NFC-e local;
- bloqueio de CPF/CNPJ divergente entre venda e NFC-e;
- central `/portal/controle-medicamentos` e campos operacionais em `/portal/caixa`;
- testes de idade, ausência de responsável, receita futura, retenção e política sem fonte.

## Decisão arquitetural importante

O sistema não conclui que um produto é controlado apenas por NCM, descrição, laboratório ou princípio ativo. Esses sinais podem futuramente gerar uma sugestão, mas a política aplicada precisa estar versionada, fundamentada e revisada por pessoa autorizada. Assim, uma atualização legal não fica escondida em código ou em resposta livre da IA.

## Regras de bloqueio

1. Toda nova venda precisa de vendedor com vínculo ativo.
2. Uma credencial suspensa, expirada, em rascunho ou fora da vigência não pode autorizar a venda.
3. CPF/CNPJ inválido não é persistido.
4. Idade mínima exige nascimento e é calculada na data da venda.
5. Prescrição futura ou incompleta bloqueia a operação.
6. Retenção configurada exige confirmação explícita do operador.
7. Política controlada sem versão e fundamento permanece bloqueada.
8. A falha ocorre antes de qualquer baixa de estoque, lote, saldo fiscal ou pagamento.
9. O registro da venda controlada não pode ser editado ou excluído.
10. A NFC-e local não pode trocar o documento do consumidor registrado na venda.

## Limites deliberados

- nenhuma lista sanitária foi embutida sem fonte e homologação;
- não existe integração simulada com sistemas oficiais de controle;
- não há armazenamento de imagem ou arquivo da prescrição nesta fase;
- validade clínica da receita continua parametrizada, pois depende da classe e da regra vigente;
- dispensação fracionada, saldo de receita, livro eletrônico e comunicação oficial aguardam definição do escopo regulatório;
- a migration foi criada, mas não aplicada automaticamente ao banco.

## Próxima fatia interna

1. [x] reservas e separação de mercadoria com expiração;
2. [x] transferências entre lojas preservando lote e proveniência;
3. [x] inventário, perdas, avarias e ajustes com aprovação;
4. troca vinculada a nova venda e ao estorno original;
5. relatórios gerenciais por vendedor, desconto, medicamento controlado, perda e margem.

## Antes da produção

- homologar políticas e fontes com responsável farmacêutico e jurídico;
- definir retenção e descarte de dados pessoais e prescrições;
- validar acesso, exportação e solicitações do titular;
- escolher integrações oficiais aplicáveis ao escopo real;
- executar piloto com comprador, prescrições válidas/inválidas, credenciais vencidas e falha transacional.
