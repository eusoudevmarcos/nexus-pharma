# Nexus Pharma — apresentação da plataforma

## O que é o Nexus Pharma

O Nexus Pharma é uma plataforma de operação e inteligência para farmácias, drogarias e redes. Ela conecta o atendimento no balcão, a venda no caixa, o cadastro de produtos, o estoque, os lotes, as compras, o financeiro, a gestão e a tributação.

Ele não é apenas um frente de caixa e também não é somente um ERP tradicional. A proposta é acompanhar a jornada completa do produto e transformar cada movimentação em informação útil para a operação, a conformidade e a proteção da margem.

Enquanto um sistema comum registra o que já aconteceu, o Nexus também procura antecipar:

- o que está acabando ou já acabou;
- quanto e quando comprar;
- o que está próximo do vencimento;
- o que tem boa margem e alta procura;
- onde há excesso, baixa rotação ou risco de perda;
- onde a classificação tributária pode estar incompatível;
- onde existe risco de recolhimento indevido ou duplicado;
- qual regra foi aplicada, sua vigência, fonte, responsável e aprovação;
- qual decisão oferece melhor equilíbrio entre estoque, caixa, margem, validade e conformidade.

## A operação real da loja

### 1. Balcão e atendimento

O atendente, balconista ou farmacêutico inicia o atendimento antes do caixa. No Nexus, ele pode:

- ler o código de barras ou pesquisar por nome, princípio ativo ou laboratório;
- consultar preço, promoção e disponibilidade por loja;
- montar os itens e quantidades solicitados pelo consumidor;
- informar o desconto permitido para seu perfil;
- identificar o consumidor por CPF e nome;
- registrar dados de prescrição e o farmacêutico responsável quando a política do produto exigir;
- confirmar o pedido e enviar a pré-venda para a fila do caixa.

O balcão não recebe dinheiro e não baixa estoque. Isso separa responsabilidades e evita que um pedido ainda não pago seja tratado como venda concluída.

### 2. Caixa e frente de loja

O operador do caixa recebe a pré-venda pronta, sem redigitar os produtos ou os dados do cliente. Ele confere o pedido, informa um ou mais meios de pagamento e conclui a venda.

O caixa também contempla venda direta, abertura por PDV, suprimento, sangria, pagamentos divididos, sessão, conciliação e fechamento. No momento da conclusão, a API revalida preço, desconto, saldo, responsáveis e controles e registra venda, pagamento, estoque e memória fiscal de forma atômica.

### 3. Farmacêutico

O farmacêutico participa do atendimento quando o produto ou a política cadastrada exigir. Sua credencial tem situação e vigência controladas. Prescrição, identificação do comprador, retenção e fundamento da política permanecem vinculados à operação para conferência e auditoria.

## Setores conectados

### Produtos, categorias e estoque

Cadastro estruturado de produto, GTIN/EAN, fabricante, laboratório, fornecedor, ANVISA, composição, princípio ativo, categoria, custo e preço. Lotes registram fabricação, vencimento, saldo e origem. Estoque contempla entradas, transferências, inventários, ajustes, perdas e histórico por loja.

### Compras

Sugestões combinam saldo, giro, cobertura, sazonalidade, promoções, margem e validade dos lotes. O fluxo inclui fornecedores, cotações, propostas, pedidos, limites financeiros de aprovação, recebimento e ligação com a NF-e de entrada quando a integração for homologada.

### Fiscal e tributário

As categorias funcionam como matrizes fiscais versionadas que podem alimentar os produtos vinculados com:

- NCM e CEST;
- ICMS, CST, CSOSN, MVA, FCP, reduções e benefícios;
- PIS/COFINS unificado por CST e natureza da receita;
- IBS, CBS e cClassTrib;
- origem, destino, regime, vigência, dispositivo legal e fonte;
- histórico, comparação, simulação de impacto e aprovação em quatro olhos.

A IA trata classificações como sugestões explicadas e revisáveis. Ela não transforma repetição em regra legal nem substitui a homologação profissional.

### Financeiro

Contas a pagar e receber, parcelas, baixas, estornos, saldos e conciliação operacional se conectam a compras e vendas. As permissões mantêm valores sensíveis fora das áreas que não precisam deles.

### Gestão

Painéis mostram ruptura, giro, validade, margem, perdas, acurácia da recomendação e resultado por loja. O detalhamento pode chegar ao produto, lote e regra fiscal, permitindo entender a origem do indicador em vez de olhar apenas um número consolidado.

### Administração, segurança e suporte

Perfis diferentes separam proprietário, administrador, gerente, compras, financeiro, farmacêutico, atendente, caixa e consulta. O Nexus registra revisões de acesso, MFA, sessões, ações críticas, chamados do helpdesk e acessos temporários de suporte consentidos e auditados.

## O maior diferencial

O maior diferencial é transformar cada produto em uma decisão operacional, fiscal e econômica integrada.

No Nexus, a mesma informação percorre uma linha contínua:

```text
Atendimento no balcão
        ↓
Pré-venda confirmada
        ↓
Pagamento e conclusão no caixa
        ↓
Estoque, lote e margem atualizados
        ↓
Memória da regra fiscal preservada
        ↓
Alerta de compra, validade ou risco
        ↓
Decisão gerencial explicada e mensurável
```

Essa integração reduz redigitação, separa funções, melhora a experiência do consumidor e evita que operação, estoque, financeiro e fiscal mantenham versões diferentes da verdade.

## Preparado para a nova legislação

O Nexus já estrutura IBS, CBS e cClassTrib ao lado das regras atuais. Regras possuem vigência, fonte, versão e aprovação, permitindo convivência controlada durante a transição tributária.

O posicionamento correto não é prometer “não pagar imposto”. É permitir classificação legalmente adequada, evidenciada e auditável, reduzindo o risco de erro, recolhimento indevido ou duplicado e aproveitando tratamentos permitidos pela legislação aplicável.

## Como vender o Nexus

O Nexus deve ser vendido por três resultados:

1. uma loja mais rápida e organizada, do balcão ao caixa;
2. menos perdas, rupturas, excessos e erros tributários;
3. decisões de compra, margem e conformidade mais rápidas, explicadas e auditáveis.

### Mensagem principal

> O Nexus Pharma conecta o atendimento da farmácia à inteligência fiscal e de estoque para identificar falta de produtos, perdas por vencimento e riscos tributários antes que eles consumam a margem.

### Frase de contraste

> Enquanto outros sistemas mostram o que aconteceu, o Nexus ajuda cada setor a decidir o que fazer agora e o que evitar amanhã.

### Roteiro curto de demonstração

1. Ler um medicamento no balcão e consultar saldo e preço.
2. Identificar o consumidor, confirmar o pedido e enviá-lo ao caixa.
3. Receber a pré-venda e concluir o pagamento sem redigitação.
4. Mostrar a atualização de estoque, lote e margem.
5. Abrir a categoria fiscal e explicar a regra, fonte, vigência e aprovação.
6. Mostrar um alerta de ruptura ou vencimento e a sugestão de compra.
7. Abrir o relatório até o produto, lote e regra que originaram o indicador.

O Nexus Pharma deve ser apresentado como a plataforma que protege a margem sem perder a fluidez da operação: atende melhor, compra melhor, perde menos e controla a tributação com evidência e responsabilidade.
