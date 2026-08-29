# Nexus Pharma API

API multiempresa em Fastify + TypeScript, com PostgreSQL e Prisma.

## Preparação local

1. Copie `.env.example` para `.env` e preencha `DATABASE_URL` e `JWT_SECRET`.
2. Execute `npm install`.
3. Crie o banco local e rode `npm run prisma:migrate:deploy`.
4. Opcionalmente configure `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` e rode `npm run prisma:seed`.
5. Inicie com `npm run dev`.

## Comandos

- `npm run prisma:validate`: valida o modelo.
- `npm run prisma:generate`: gera o cliente tipado.
- `npm run prisma:migrate:dev -- --name nome_da_mudanca`: cria migration em desenvolvimento.
- `npm run prisma:migrate:deploy`: aplica migrations pendentes sem resetar dados.
- `npm run prisma:seed`: cria ou atualiza os planos e o administrador opcional.
- `npm run build`: gera o Prisma Client e compila a API.
- `npm test`: compila a API e valida as decisões de ST, monofásico, crédito e CFOP.

## Contrato de acesso

Após `POST /api/v1/auth/login`, envie:

```text
Authorization: Bearer <access_token>
x-company-id: <uuid-da-empresa>
```

Rotas principais:

- `GET /health`
- `GET /health/live`
- `GET /health/ready`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/planos`
- `GET/POST/PUT /api/v1/cadastros/categorias`
- `GET/POST/PUT /api/v1/cadastros/produtos`
- `GET /api/v1/cadastros/catalogos`
- `GET/POST/PUT /api/v1/fiscal/analises`
- `POST /api/v1/fiscal/analises/:id/sugerir`
- `PUT /api/v1/fiscal/analises/:id/decisao`
- `GET /api/v1/fiscal/assistente/metricas`
- `GET/POST/PUT /api/v1/fiscal/matriz`
- `GET/POST /api/v1/fiscal/dfe/certificados`
- `POST /api/v1/fiscal/dfe/sincronizar`
- `POST /api/v1/fiscal/dfe/importar-xml`
- `GET /api/v1/fiscal/dfe/documentos`
- `GET /api/v1/fiscal/dfe/documentos/:id`
- `POST /api/v1/fiscal/dfe/documentos/:id/conferencia`
- `PUT /api/v1/fiscal/dfe/conferencias/:receivingId/itens/:itemId`
- `POST /api/v1/fiscal/dfe/conferencias/:id/concluir`
- `PUT /api/v1/fiscal/dfe/divergencias/:id`
- `POST /api/v1/fiscal/dfe/documentos/:id/manifestacoes`
- `POST /api/v1/fiscal/rastreabilidade/entradas`
- `PUT /api/v1/fiscal/rastreabilidade/entradas/:id/revisao`
- `POST /api/v1/fiscal/rastreabilidade/avaliacoes-saida`
- `GET /api/v1/fiscal/rastreabilidade/produtos/:productId`
- `GET /api/v1/fiscal/rastreabilidade/resumo`
- `POST /api/v1/vendas/processar`
- `GET /api/v1/pos-venda/vendas`
- `GET /api/v1/pos-venda/vendas/:id`
- `POST /api/v1/pos-venda/vendas/:id/estornos`
- `GET /api/v1/pos-venda/pendencias-fiscais`
- `GET /api/v1/pos-venda/reembolsos-pendentes`
- `GET /api/v1/controle-venda/contexto`
- `GET/PUT /api/v1/controle-venda/farmaceuticos`
- `GET /api/v1/controle-venda/produtos`
- `PUT /api/v1/controle-venda/produtos/:id/politica`
- `GET /api/v1/controle-venda/registros`
- `POST /api/v1/caixa/offline/dispositivos`
- `POST /api/v1/caixa/offline/snapshots`
- `POST /api/v1/caixa/offline/sincronizar`
- `GET /api/v1/caixa/offline/status`
- `GET/POST /api/v1/suporte/tickets`
- `GET /api/v1/relatorios/{gestao,operacao,fiscal,usuarios}`
- `GET /api/v1/relatorios/alertas`
- `PATCH /api/v1/alertas/:id`
- `GET/POST /api/v1/usuarios/convites`
- `POST /api/v1/usuarios/convites/:id/reenviar`
- `POST /api/v1/usuarios/convites/aceitar`
- `PATCH /api/v1/usuarios/membros/:id`
- `GET/PATCH /api/v1/interno/suporte`
- `GET /api/v1/interno/financeiro`
- `GET /api/v1/interno/faturamento`
- `POST /api/v1/interno/faturamento/economias`
- `POST /api/v1/interno/faturamento/fechar`
- `PUT /api/v1/interno/comercial/empresas/:id/assinatura`
- `POST /api/v1/interno/comercial/empresas/:id/lojas`
- `POST /api/v1/interno/comercial/lojas/:id/pdvs`
- `GET/PATCH /api/v1/interno/comercial`
- `GET /api/v1/interno/desenvolvimento`
- `GET/PATCH /api/v1/interno/monitoramento`
- `GET /api/v1/interno/seguranca`
- `PATCH /api/v1/interno/seguranca/sessoes/:id`
- `GET /api/v1/financeiro/assinaturas`
- `GET/POST /api/v1/desenvolvimento/releases`
- `POST /api/v1/webhooks/billing/:provider`
- `GET /api/v1/operations/metrics`

O processamento da venda é idempotente, consome lotes por vencimento, registra o retrato fiscal aplicado, atualiza a provisão mensal e cria alertas de reposição. Convites de acesso usam token único armazenado como hash, expiram em 72 horas e toda mudança de perfil é auditada. O reenvio rotaciona o token e invalida o link anterior. As sugestões tributárias continuam sujeitas a revisão humana e homologação profissional.

## Rastreabilidade tributária

Cada entrada pode manter um extrato fiscal imutável por produto e lote, com o hash do documento de origem, CFOP/CST recebidos, ICMS-ST, PIS/COFINS monofásico, tratamento de créditos, IBS/CBS e evidências. O saldo fiscal aprovado é consumido juntamente com o saldo físico do lote.

Antes de concluir uma venda, o motor valida as UFs, o CFOP de saída e a coerência entre a regra da categoria e a tributação comprovada na entrada. Saídas com CST 60/CSOSN 500 sem retenção anterior, produtos monofásicos com novo débito de PIS/COFINS, crédito monofásico permitido ou operação interestadual usando CFOP interno são bloqueados. O valor mostrado como potencial protegido não é contabilizado automaticamente como economia confirmada; ele depende de revisão fiscal.

O cadastro da origem começa em `DRAFT` e somente `OWNER`, `ADMIN`, `MANAGER` ou `PHARMACIST` pode aprová-lo. Aprovações exigem evidência e, no caso monofásico, natureza da receita e créditos de PIS/COFINS marcados como proibidos. O XML ou snapshot recebido nunca é substituído pela decisão de saída.

## DF-e e recebimento de NF-e

A migration `20260828233000_dfe_receiving_and_fiscal_matrix` adiciona a matriz tributária por UF/operação, o cofre de certificado A1, cursores NSU, documentos, itens, divergências, manifestações e conferências. O XML é armazenado integralmente com SHA-256 e um trigger impede modificar a fonte depois da inserção. A classificação sugerida fica em coluna separada e só é aplicada à proveniência quando um usuário autorizado registra a decisão.

Para homologar sem SEFAZ, use `POST /api/v1/fiscal/dfe/importar-xml`. Para conexão direta, configure `DFE_CERTIFICATE_ENCRYPTION_KEY`, os endpoints oficiais do ambiente desejado e instale o A1 pela rota autenticada. `DFE_ENABLE_SEFAZ_TRANSMISSION` permanece `false` por padrão; somente altere para `true` depois de validar certificado, URLs, schemas e eventos no ambiente de homologação.

O início da conferência cria a Ciência da Operação; a conclusão exige produto, quantidade conferida, lote, fabricação, validade futura, classificação mínima e ausência de divergência crítica aberta. Em seguida, uma transação única atualiza lote, estoque, movimento e proveniência e cria a Confirmação da Operação. CT-e e MDF-e permanecem fora deste módulo porque usam serviços e regras próprios.

## Assistente fiscal local e auditável

O primeiro estágio da Fase 5 não chama um modelo externo. `POST /api/v1/fiscal/analises/:id/sugerir` cruza a categoria, a regra do regime, a matriz por UF/operação e somente as fontes já cadastradas. O resultado sempre nasce como `NEEDS_REVIEW`, informa riscos e confiança, registra as fontes em `TaxEvidence` e nunca altera o cadastro fiscal automaticamente.

Uma sugestão sem fonte tem confiança limitada a 49% e não pode ser aprovada. A decisão humana usa `PUT /api/v1/fiscal/analises/:id/decisao`; rejeições exigem justificativa e aprovações anteriores do mesmo alvo tornam-se `SUPERSEDED`. As métricas de cobertura de fontes, concordância humana e confiança ficam disponíveis sem custo em `/api/v1/fiscal/assistente/metricas`.

## NFC-e local e protegida

A migration `20260829093000_nfce_local_lifecycle` adiciona sequência por empresa/ambiente/série, documento modelo 65 e histórico de tentativas. `POST /api/v1/fiscal/nfce/vendas/:saleId/preparar` aceita somente venda concluída como NFC-e e reutiliza o snapshot tributário gravado na venda; não existe um segundo cálculo fiscal durante a preparação. A operação é idempotente por venda e ambiente, e a alocação de número usa transação serializável com repetição em conflitos concorrentes.

O payload, a chave de 44 dígitos, o XML local e seu SHA-256 tornam-se imutáveis por trigger. O arquivo disponível em `/documentos/:id/xml` é identificado como `NfceLocalDraft`, não é assinado e não deve ser transmitido. Ele existe para conferência interna até que o renderizador oficial seja validado contra o pacote XSD e as Notas Técnicas vigentes.

Mantenha `NFCE_ENABLE_SEFAZ_TRANSMISSION=false` e `NFCE_ALLOW_PRODUCTION_PREPARATION=false`. Mesmo se a primeira variável for alterada por engano, o adaptador atual registra a tentativa como bloqueada e não acessa a rede. Para preparar em homologação, cadastre CNPJ, UF e, em `Company.settings`, `stateRegistration` e `municipalityCode`. A ativação real ainda exige credenciamento na UF, A1, mecanismo vigente de QR Code/CSC, endpoints oficiais e roteiro de homologação aprovado.

## Frente de caixa e conciliação

A migration `20260829130000_cash_register_and_reconciliation` adiciona sessões de caixa, movimentos, recebimentos e fechamento. Um índice parcial no PostgreSQL permite apenas uma sessão `OPEN` por PDV. A abertura exige loja e PDV ativos da empresa; sangria e suprimento recebem chave de idempotência, motivo e usuário, e uma sangria não pode deixar o dinheiro esperado negativo.

Quando `POST /api/v1/vendas/processar` recebe `sessao_caixa_id` e `pagamentos`, a venda, os itens, o consumo de estoque/lotes, a memória tributária e os recebimentos são gravados na mesma transação serializável. A soma dos pagamentos deve coincidir com o valor bruto. Pix e cartões nascem como `RECORDED`: isso significa somente que o operador os informou, não que banco, adquirente ou TEF os confirmou.

O fechamento em `/api/v1/caixa/sessoes/:id/fechar` compara cada meio separadamente. Assim, falta de R$ 10 em dinheiro e sobra de R$ 10 em Pix continuam sendo uma divergência, mesmo com diferença total zero. O snapshot é protegido por SHA-256 e trigger de imutabilidade; uma divergência exige justificativa e pode ser marcada como revisada apenas por proprietário, administrador ou gestor.

## Descontos e pós-venda

A migration `20260829170000_post_sale_and_discounts` preserva preço bruto e desconto na venda e em cada item. O limite padrão é definido por perfil (operador 5%, farmacêutico 10%, gestor 15%, administrador/proprietário 20%) e pode ser reduzido ou ajustado em `Company.settings.posDiscountLimits`, com teto absoluto de 50%. A API é sempre a autoridade; esconder ou limitar o campo no navegador não substitui essa validação.

Cancelamento total e devolução parcial são apêndices imutáveis da venda, nunca edição ou exclusão do registro original. A operação serializável recompõe somente item vendável, usando exatamente o lote e a proveniência fiscal consumidos na saída, grava movimento `RETURN`, ajusta a provisão mensal e distribui o valor pelo saldo ainda disponível dos pagamentos. Produto vencido, avariado ou marcado como não vendável não retorna ao estoque disponível.

Dinheiro devolvido é abatido da sessão aberta. Pix, cartão, vale e outros geram `PaymentRefund` com estado `BLOCKED` até existir integração homologada; o sistema não afirma que o provedor realizou o reembolso. Se houver NFC-e autorizada, o documento original é preservado e uma pendência fiscal é aberta para o evento oficial. Rascunhos locais não autorizados podem ser cancelados internamente. A operação e as filas ficam separadas em `/portal/pos-venda`.

## Consumidor, vendedor e medicamentos controlados

A migration `20260829203000_sale_context_and_controlled_medicines` adiciona consumidor, vendedor, credencial farmacêutica, política de controle do produto e registro imutável por item. A política não é inferida pelo NCM e não contém listas legais fixas: o responsável autorizado informa o nível, a versão, o fundamento, a vigência e os requisitos aplicáveis ao produto.

Cada nova venda exige vendedor ativo. O consumidor continua opcional na venda comum, mas CPF/CNPJ, nome e nascimento passam a ser validados quando identificação ou idade mínima forem exigidas. Produtos podem exigir prescrição completa, confirmação de retenção e credencial farmacêutica `VERIFIED` dentro da vigência. Qualquer ausência bloqueia toda a transação antes de baixar estoque, lote, proveniência ou pagamentos.

O snapshot da venda preserva consumidor, vendedor e farmacêutico. O item preserva a política aplicada e `ControlledSaleRecord` guarda os dados apresentados, a versão e as evidências sem permitir alteração ou exclusão. A NFC-e local reutiliza esse contexto e rejeita documento de consumidor divergente. Configuração e acompanhamento ficam em `/portal/controle-medicamentos`; a operação ocorre em `/portal/caixa`.

Esses registros podem conter dados pessoais e profissionais. Antes da produção, prazo de retenção, base legal, acesso, exportação e tratamento de solicitações do titular precisam ser homologados com os responsáveis jurídico, sanitário e de privacidade. Integrações com sistemas oficiais permanecem fora desta fase e não são simuladas.

## Estoque multiloja e ajustes aprovados

A migration `20260830090000_multi_store_inventory_control` separa saldo físico e reservado por loja e lote. Reservas diminuem somente o disponível e possuem expiração; transferências passam por rascunho, expedição e recebimento, mantendo a mercadoria em trânsito sem alterar o estoque consolidado. O snapshot de proveniência acompanha cada item transferido.

Inventários fotografam o saldo esperado e armazenam a contagem e a diferença por lote. Perdas, avarias, vencimentos e correções são solicitações pendentes: somente uma aprovação por segundo usuário altera saldo da loja, lote, produto e movimento. A mesma segregação vale para o recebimento da transferência — quem expediu não pode confirmar o próprio recebimento.

Entradas por NF-e e lote inicial alimentam a loja de destino, vendas no caixa consomem apenas o saldo disponível daquela loja e devoluções vendáveis retornam à loja do caixa. A API fica em `/api/v1/estoque` e a operação em `/portal/estoque`. A automação diária libera reservas expiradas; operações que precisarem de janelas menores podem executar a mesma rotina com maior frequência.

## Relatórios e fechamento gerencial

A migration `20260830133000_managerial_reports_and_closing` adiciona um fechamento interno imutável por empresa e competência. A consulta `/api/v1/relatorios/gerencial` aceita período, loja, PDV, categoria, produto e vendedor, recalculando DRE, curva ABC, vendedores, recebimentos e perdas sobre os registros originais. Filtros de item não reutilizam o total integral da venda.

`POST /api/v1/relatorios/gerencial/exportar` produz CSV e registra filtros e quantidade de linhas na auditoria. `POST /api/v1/relatorios/gerencial/fechar` exige papel gerencial e bloqueia enquanto houver caixa aberto, ajuste, inventário ou transferência pendente. O snapshot recebe SHA-256 e não pode ser alterado ou excluído.

Esse fechamento é exclusivamente gerencial. Não substitui contabilidade, SPED, EFD, apuração fiscal ou obrigação acessória oficial.

## Compras e fornecedores

A migration `20260830170000_suppliers_and_purchasing` adiciona fornecedor, vínculo por produto, pedido, itens e ligação auditável com o recebimento DF-e. A central `/portal/compras` calcula reposição por loja usando saldo disponível, reservas, pedidos aprovados pendentes, venda dos últimos 30 dias, estoque mínimo, prazo e embalagem do fornecedor.

Pedidos nascem em rascunho, exigem aprovação gerencial para entrar como mercadoria a receber e podem ser recebidos parcialmente. A ligação só aceita uma NF-e já conferida, valida o CNPJ emitente e reaproveita a entrada fiscal existente; não cria movimento ou estoque em duplicidade.

O módulo de compras não baixa pagamentos diretamente. A fase seguinte cria o título financeiro; cotação entre fornecedores, bonificações e integração bancária continuam pendentes.

## Contas a pagar do cliente

A migration `20260830210000_accounts_payable` adiciona títulos, parcelas e pagamentos vinculados ao fornecedor, pedido, recebimento e XML de origem. Ao ligar uma NF-e conferida a um pedido, documentos com valor positivo geram um título `DRAFT`; o sistema não presume vencimento nem cria cobrança para documentos de valor zero.

`PUT /api/v1/contas-pagar/titulos/:id/configurar` exige que a soma das parcelas seja igual ao total do documento. Baixas totais e parciais recalculam parcela e título em transação serializável. O pagamento original não pode ser apagado nem editado; o estorno exige outro usuário autorizado, guarda justificativa e restaura os saldos.

A operação fica em `/portal/financeiro`. Ela registra a informação interna fornecida pelo usuário, mas não confirma liquidação bancária. Integrações de Pix, boleto, conta bancária e conciliação permanecem bloqueadas até a contratação e homologação dos respectivos provedores.

## Cotação e custo líquido

A migration `20260831010000_supplier_quotations` adiciona cotação, itens, fornecedores convidados, propostas e memória comercial por item. A API exige dois fornecedores para abrir a concorrência e calcula custo líquido com preço, desconto do item, descontos gerais rateados, frete rateado, tributo não recuperável e quantidade bonificada.

A adjudicação valida prazo, pedido mínimo e atendimento das quantidades. A proposta vencedora gera um pedido já aprovado com custo líquido unitário e quantidade total, incluindo bonificação; as demais propostas ficam como não selecionadas e não são apagadas. A central fica em `/portal/cotacoes`.

A entrada de tributo não recuperável é uma informação comercial sujeita à conferência fiscal e contábil. O cálculo não transforma crédito tributário em economia nem garante a margem futura exibida.

## Devolução ao fornecedor

A migration `20260831130000_supplier_returns` adiciona devoluções e itens imutáveis vinculados ao recebimento, XML, fornecedor, loja, lote e proveniência fiscal. `GET /api/v1/compras/recebimentos/:id/devolucao` calcula o saldo devolvível; `POST /api/v1/compras/recebimentos/:id/devolucoes` confirma um item, alguns ou todos, com quantidade integral ou fracionada.

A confirmação é idempotente e serializável. Estoque da loja, lote, produto, saldo fiscal, quantidade recebida do pedido e financeiro são atualizados juntos. O valor reduz somente o saldo ainda aberto do título; o excedente vira crédito pendente com o fornecedor, preservando pagamentos e documento originais.

O serviço cria apenas o rascunho da NF-e de devolução com referência à chave e ao item original. CFOP, tributação, assinatura, transmissão, protocolo e XML autorizado continuam bloqueados até a integração do emissor NF-e modelo 55 e a homologação fiscal/SEFAZ.

## Identidade e sessões

Configure `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS` e `MAX_ACTIVE_SESSIONS`. Cada token de acesso contém o identificador da sessão e a API confirma no PostgreSQL se a sessão e a conta continuam ativas; logout e revogação administrativa passam a ter efeito imediato.

O refresh token é armazenado somente como hash e rotacionado por operação atômica. A reutilização do token anterior ou duas rotações concorrentes revogam toda a sessão e geram um evento crítico. Falhas de login usam comparação de senha de tempo equivalente mesmo para identidades inexistentes, reduzindo enumeração por tempo. A central `/portal/interno/seguranca` mostra sessões, falhas e eventos para Administração e Desenvolvimento.

## E-mail transacional

Configure `WEB_APP_URL`, `EMAIL_RELAY_URL`, `EMAIL_RELAY_KEY` e `EMAIL_FROM` no Render. A API envia ao relay um `POST` JSON com `from`, `to`, `subject`, `html`, `text` e `metadata`. Sem relay configurado, o convite permanece como `QUEUED` e o portal oferece o link para envio manual. O token nunca é persistido no registro de entrega.

## Webhooks financeiros

O adaptador do provedor deve normalizar o evento e chamar `POST /api/v1/webhooks/billing/:provider` com os cabeçalhos:

```text
x-nexus-event-id: identificador-unico-do-evento
x-nexus-timestamp: timestamp Unix em segundos
x-nexus-signature: HMAC-SHA256 em hexadecimal
```

A assinatura usa `BILLING_WEBHOOK_SECRET` sobre `<timestamp>.<event-id>.<sha256-do-JSON>`. A janela aceita é de cinco minutos. Eventos são idempotentes por provedor e identificador; o corpo normalizado aceita eventos de fatura (`opened`, `paid`, `past_due`, `voided`) e assinatura (`activated`, `paused`, `cancelled`). Antes de produção, o adaptador específico do provedor escolhido deve validar a assinatura original dele e então gerar esta assinatura interna.

## Faturamento mensal SaaS

O seed mantém quatro planos vigentes: Basic (R$ 698), Smart (R$ 1.199), Fiscal Inteligente (R$ 1.990) e Ultimate (R$ 2.498). Todos incluem uma loja e um PDV por loja; cada filial ativa adicional soma R$ 1.000 e cada PDV ativo acima do primeiro de sua loja soma R$ 280.

O fechamento mensal salva uma memória imutável com competência, plano, contagens e itens discriminados. Planos Fiscal Inteligente e Ultimate exigem que a economia do mês esteja `VERIFIED`; sem homologação e evidências, a fatura permanece `DRAFT`, com envio ao gateway bloqueado. Depois do fechamento, a economia fica `LOCKED`. O Ultimate cria entrada de R$ 5.000 no primeiro mês e quatro parcelas de R$ 1.250 nos meses 2 a 5; os demais planos criam o setup único de R$ 890.

Configure `BILLING_RELAY_URL` e, se necessário, `BILLING_RELAY_KEY`. A API envia uma cobrança unificada com chave de idempotência e itens. Sem relay, a solicitação fica `QUEUED` para integração manual; o sistema nunca simula que o pagamento foi emitido. O webhook `invoice.paid` baixa as parcelas do onboarding vinculadas e conclui o onboarding quando todas forem pagas.

Não há rateio proporcional nesta versão: lojas e PDVs são contados pela situação no encerramento da competência. Essa regra deve constar no contrato comercial antes da entrada em produção.

## Cadastros produtivos e estratégia comercial

Categorias centralizam NCM, CEST, classificação, vigência e regras por regime. Produtos herdam essa base fiscal e mantêm custo, preço, controle sanitário, lotes e uma estratégia comercial opcional. CST PIS/COFINS, CST ICMS, CSOSN, natureza da receita e cClassTrib são fornecidos por catálogo controlado; a tela não depende de códigos fiscais livres.

O saldo do produto não é alterado pelo `PUT` cadastral: entradas, lotes, inventários, transferências, vendas, perdas e devoluções são as fontes auditáveis de estoque. As estratégias `FEATURED`, `PROMOTION`, `HIGH_MARGIN`, `FAST_MOVING`, `CLEARANCE`, `EXPIRY_PRIORITY` e `LAUNCH` orientam a operação. Uma promoção só é aplicada quando possui preço e vigência válidos; o motor da API recalcula o preço no fechamento da venda e grava no snapshot o preço de tabela, o preço comercial e a estratégia utilizada.

## Caixa offline

Cada instalação do caixa é registrada e vinculada a um PDV. Enquanto conectado, o operador gera um snapshot de curta duração contendo catálogo, preço comercial, saldo vendável, categoria, versão fiscal e bloqueios sanitários. A validade é reduzida automaticamente quando existe uma mudança programada de preço ou término de vigência fiscal.

No navegador, vendas elegíveis são armazenadas em IndexedDB com payload criptografado por AES-GCM e UUID idempotente. A chave é derivada de um PIN local de seis dígitos com PBKDF2 e não fica gravada em texto aberto. O app shell `/caixa-offline` guarda somente a interface genérica e ativos estáticos no cache; catálogo e vendas permanecem criptografados no armazenamento do dispositivo.

O modo offline aceita somente produto não controlado e recebimento em dinheiro. Na reconexão, a API valida dispositivo, integridade e vigência do snapshot, sessão aberta, impressão digital fiscal/comercial, estoque, lotes, desconto e usuário antes de processar cada venda. Divergências ficam como conflito explícito e nunca são aplicadas silenciosamente. O caixa não pode ser fechado com comandos offline pendentes. Proprietários, administradores e gestores podem suspender, revogar ou reativar cada instalação diretamente no painel do caixa.

## Observabilidade

`/health/live` confirma que o processo está ativo; `/health/ready` também valida o PostgreSQL e informa sua latência. O endpoint `/api/v1/operations/metrics` exige `Authorization: Bearer <OBSERVABILITY_TOKEN>` e entrega contadores do processo sem expor dados de clientes.

Falhas não tratadas, entregas de e-mail e webhooks financeiros geram incidentes agrupados por impressão digital. A central interna em `/portal/interno/monitoramento` permite que Administração e Desenvolvimento assumam e resolvam a ocorrência, com auditoria. Se a mesma falha reaparecer, o incidente é reaberto automaticamente.

## Automação diária do negócio

`npm run jobs:daily` executa uma rotina idempotente que:

- identifica estoque baixo e produtos com margem a partir de 25%, boa saída e cobertura de até 15 dias;
- calcula quantidade sugerida para 30 dias de venda;
- gera alertas progressivos de vencimento em 90, 60 e 30 dias;
- sinaliza cobranças vencidas;
- encerra automaticamente alertas cuja condição deixou de existir;
- registra contadores, tentativas, resultado e falhas da execução.

O Blueprint inclui um Cron Job diário às `10:00 UTC`. O comando sempre termina após a execução e o histórico impede processamento duplicado no mesmo dia. Cron Jobs não possuem plano gratuito e geram cobrança própria quando provisionados; consulte a [documentação oficial do Render](https://render.com/docs/cronjobs) antes de sincronizar o serviço.

## Render

O `render.yaml` da raiz provisiona API e PostgreSQL. O plano gratuito está configurado apenas para preparação inicial; antes de uso comercial, escolha um plano com retenção, backups e capacidade adequados.
