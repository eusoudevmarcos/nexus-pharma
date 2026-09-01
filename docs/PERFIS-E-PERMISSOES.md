# Perfis, permissões e segregação de funções

Versão da política: **2026.08.31**
Modelo: **RBAC com menor privilégio**

## Como interpretar a matriz

| Nível | Significado |
| --- | --- |
| Consulta | Visualiza informações sem criar, editar, transmitir ou aprovar |
| Opera | Executa o fluxo diário do domínio |
| Aprova | Opera e autoriza ações sensíveis ou exceções |
| Administra | Configura e governa o domínio |

O nível exibido inclui os níveis anteriores. O menu é apenas uma ajuda de navegação; a autorização efetiva é aplicada pela API.

## Perfis da farmácia

### Proprietário (`OWNER`)

- Responsável máximo pela empresa e pela continuidade do acesso.
- Governa a conta, administra usuários, opera e aprova todos os domínios.
- O último proprietário ativo não pode ser removido ou suspenso.

### Administrador da farmácia (`ADMIN`)

- Administra equipe, configuração e operação diária.
- Opera e configura todos os módulos da farmácia e gerencia usuários.
- Não substitui nem remove o proprietário protegido e não acessa a Central Nexus.

### Gerente (`MANAGER`)

- Coordena a operação e acompanha o resultado da unidade.
- Consulta usuários, fecha relatórios e aprova compras, ajustes, inventários e decisões fiscais autorizadas.
- Não convida pessoas, não altera perfis e não muda a titularidade.

### Compras e estoque (`BUYER`)

- Evita ruptura e excesso de estoque.
- Opera fornecedores, cotações, pedidos, recebimento NF-e, lotes e inventário operacional; consulta produtos e painéis de abastecimento.
- Não opera caixa, contas a pagar, usuários nem configuração fiscal.

### Financeiro da farmácia (`FINANCE`)

- Controla obrigações e resultados financeiros do cliente.
- Opera contas a pagar, acompanha indicadores, consulta compras, cotações e motor fiscal e atua nos reflexos financeiros do pós-venda.
- Não movimenta estoque, não opera caixa e não configura tributação.
- É diferente do `FINANCE` corporativo Nexus; os códigos vivem em fronteiras de identidade diferentes.

### Farmacêutico (`PHARMACIST`)

- Responde pela operação farmacêutica e classificação assistida.
- Opera medicamentos controlados, produtos e categorias, estoque, recebimento, motor fiscal, NFC-e e apoio ao caixa.
- Não administra usuários, contas a pagar ou negociação comercial de compras.

### Caixa / operador (`OPERATOR`)

- Executa venda com superfície mínima de acesso.
- Consulta produtos, opera sessão de caixa, venda, NFC-e, contingência e pós-venda permitido e exerce seus direitos de privacidade.
- Não acessa painéis gerenciais, compras, estoque administrativo, cadastro tributário ou usuários.

### Auditoria e consulta (`VIEWER`)

- Permite conferência ampla sem mutação.
- Consulta relatórios, estoque, compras, fiscal, rastreabilidade, documentos e configurações não secretas.
- Não cria, edita, transmite, baixa, aprova ou administra usuários.

## Matriz resumida da farmácia

| Domínio | Proprietário | Admin | Gerente | Compras | Financeiro loja | Farmacêutico | Caixa | Auditoria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Painéis e alertas | Administra | Administra | Aprova | Consulta | Consulta | Consulta | — | Consulta |
| Produtos e categorias | Administra | Administra | Administra | Consulta | — | Opera | Consulta | Consulta |
| Estoque e lotes | Administra | Administra | Aprova | Opera | — | Opera | — | Consulta |
| Compras e cotações | Administra | Administra | Aprova | Opera | Consulta | — | — | Consulta |
| Financeiro da farmácia | Administra | Administra | Opera | — | Opera | — | — | Consulta |
| Caixa e pós-venda | Administra | Administra | Administra | — | Consulta | Opera | Opera | Consulta |
| Medicamentos controlados | Administra | Administra | Aprova | — | — | Opera | — | Consulta |
| Motor fiscal e IA | Administra | Administra | Aprova | — | Consulta | Aprova | — | Consulta |
| NF-e e recebimento | Administra | Administra | Aprova | Opera | — | Opera | — | Consulta |
| NFC-e | Administra | Administra | Administra | — | — | Opera | Opera | Consulta |
| Usuários e acessos | Administra | Administra | Consulta | — | — | — | — | — |
| Privacidade pessoal | Opera | Opera | Opera | Opera | Opera | Opera | Opera | Opera |

## Perfis internos Nexus

### Administração Nexus (`INTERNAL_ADMIN`)

Governa segurança, continuidade, privacidade, go-live, departamentos e homologação de catálogos. Não entra diretamente no tenant do cliente. Uma futura assistência dentro da empresa deverá usar sessão de suporte temporária, motivada, consentida e auditada.

### Desenvolvimento (`DEVELOPER`)

Acessa monitoramento, segurança em consulta, go-live, releases e importação técnica de catálogos. Não ativa sozinho uma base legal oficial, não opera departamentos financeiro/comercial e não acessa diretamente dados da farmácia.

### Helpdesk (`HELPDESK`)

Opera chamados, SLA e comunicação. Não herda permissões de gerente ou administrador do cliente. O atendimento não abre acesso automático ao tenant.

### Financeiro Nexus (`FINANCE`)

Opera assinaturas, contratos, faturas SaaS, inadimplência e success fee auditado. Não acessa contas a pagar, caixa ou estoque do cliente.

### Comercial Nexus (`COMMERCIAL`)

Opera leads, propostas, planos e onboarding comercial. Não acessa a operação, o fiscal ou dados transacionais da farmácia.

## Matriz resumida da Central Nexus

| Domínio | Admin Nexus | Desenvolvimento | Helpdesk | Financeiro Nexus | Comercial |
| --- | --- | --- | --- | --- | --- |
| Monitoramento | Administra | Opera | — | — | — |
| Segurança | Administra | Consulta | — | — | — |
| Privacidade e DR | Administra | — | — | — | — |
| Go-live | Administra | Opera | — | — | — |
| Catálogos oficiais | Administra | Opera | — | — | — |
| Helpdesk | Administra | — | Opera | — | — |
| Financeiro e faturamento SaaS | Administra | — | — | Opera | — |
| Comercial | Administra | — | — | — | Opera |
| Desenvolvimento | Administra | Administra | — | — | — |

## Regras de segurança aplicadas

1. Um usuário corporativo Nexus não pode usar apenas um `x-company-id` para entrar em uma farmácia.
2. Toda rota de empresa exige vínculo ativo com a empresa e empresa em situação ativa.
3. Rotas fiscais, matriz tributária, rastreabilidade, produtos e NFC-e validam na API os mesmos perfis exibidos no portal.
4. O operador possui acesso ao autosserviço de privacidade, mas continua fora dos módulos gerenciais.
5. Mudança de perfil, suspensão e ações relevantes permanecem auditáveis.
6. A aprovação em quatro olhos continua separada da execução sempre que a regra do fluxo exigir.
7. Proprietários, administradores e perfis internos devem usar MFA; ações privilegiadas exigem confirmação recente e vinculada à sessão atual.

## Fronteira futura de fornecedores

Fornecedor, laboratório e representante não serão perfis da farmácia. O portal B2B deverá ter:

- identidade e autenticação próprias;
- vínculo explícito com cada farmácia;
- habilitação contratual revogável por canal comercial;
- escopo por catálogo, oportunidade, região, cliente ou pedido;
- acesso operacional a saldo, ruptura, cobertura, quantidade a vencer e reposição sugerida;
- ocultação de preço de venda, margem, fiscal, caixa, financeiro, concorrentes e dados de consumidores;
- trilha de contato e proposta;
- bloqueio de qualquer acesso transversal entre farmácias.

Essa frente permanece planejada para uma fase posterior e não amplia as permissões atuais.
