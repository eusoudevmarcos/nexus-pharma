# CRM interno Nexus Pharma — departamentos, senioridade e separação B2B/B2C

Estudo solicitado para separar com clareza **duas coisas que hoje convivem no
mesmo produto, mas são organizacionalmente diferentes**:

1. **SaaS B2B interno** — como a *empresa Nexus Pharma* se organiza por dentro
   (departamentos, gestores, colaboradores, CEO/CTO). É o "CRM interno".
2. **SaaS B2C/PDV do cliente** — como cada *farmácia* opera (caixa, balcão,
   estoque, fiscal, IA tributária). Já existe e está bem desenhado; aqui só
   organizamos e documentamos.

Este documento não altera código. É a base para as próximas decisões e para
os dois mindmaps que o acompanham.

---

## Parte 1 — Diagnóstico do que existe hoje

### 1.1 O que já está certo (não mexer)

- **CEO/CTO (`INTERNAL_ADMIN`) já vê todos os 11 menus da Central Nexus.**
  Conferido em `web/app/portal/internal-shell.tsx`: toda entrada do menu
  inclui `INTERNAL_ADMIN` na lista de perfis liberados. A reclamação de
  "acesso mais prático" não é falta de visibilidade — é a **falta de estrutura
  departamental por baixo**, tratada abaixo.
- **O modelo de perfis do lado da farmácia (tenant) já é sólido e já cobre
  exatamente os papéis que você descreveu** (gestor/diretor, gerência, frente
  de caixa, balcão, estoque/compras). Ver Parte 3 — é documentação, não
  redesenho.

### 1.2 O gap real: perfil interno é "achatado", sem departamento nem senioridade

Hoje (`api/src/security/access-control.ts`), a equipe Nexus tem só 5
`systemRole`, cada um **plano** — sem distinção entre quem lidera e quem
executa:

| `systemRole` atual | Problema |
|---|---|
| `COMMERCIAL` | Todo mundo com esse perfil vê **a carteira inteira** de clientes. Não existe "vendedor vê só os leads dele" vs "gestor comercial vê tudo". |
| `FINANCE` (Nexus) | Mesma coisa — não distingue analista de gestor financeiro. |
| `HELPDESK` | Mesma coisa — não distingue atendente de líder de suporte. |
| `DEVELOPER` | Mesma coisa. |
| — | **Marketing não existe como função.** Não há domínio, não há rota, não há nada — é 100% a construir no futuro. |

Ou seja: o sistema já separa bem "Nexus interno" de "farmácia do cliente"
(isso está ótimo). O que falta é separar **dentro** do "Nexus interno" — por
departamento e por nível de responsabilidade.

---

## Parte 2 — Modelo proposto: Departamento × Senioridade

### 2.1 Os dois eixos

**Departamento** (o que a pessoa faz):

| Departamento | Função | Hoje mapeia para |
|---|---|---|
| **Diretoria** | CEO/CTO — acesso completo a tudo, inclusive desenvolvimento | `INTERNAL_ADMIN` (mantém) |
| **Desenvolvimento** | Produto, releases, monitoramento, catálogos fiscais técnicos | `DEVELOPER` (mantém) |
| **Comercial** | Vendas — leads, contratos, onboarding | `COMMERCIAL` (mantém) |
| **Marketing** | Campanhas, materiais, aquisição — **não existe ainda, é 100% novo** | — (novo) |
| **Financeiro** | Faturamento SaaS, inadimplência, economia homologada | `FINANCE` (mantém) |
| **Suporte** | Helpdesk, chamados, acesso consentido | `HELPDESK` (mantém) |

**Senioridade** (o quanto a pessoa vê dentro do departamento):

| Nível | Significado | Regra de acesso a dados |
|---|---|---|
| **Diretor** (CEO/CTO) | Acesso completo, cruza todos os departamentos, inclusive dev | Sem restrição — `INTERNAL_ADMIN` como já é hoje |
| **Gestor** | Lidera o departamento | Vê **tudo** dentro do próprio departamento (todos os clientes/tickets/faturas do setor), **menos** áreas de outro departamento (principalmente Desenvolvimento/infra, salvo se for o Gestor de Desenvolvimento) |
| **Colaborador** | Executa no dia a dia | Vê **só o que é dele** — o vendedor só vê os clientes que ele mesmo cadastrou/está conduzindo; o atendente de suporte só vê os tickets atribuídos a ele |

Isso bate exatamente com o que você descreveu: *"gestor vai ter bastante
acesso interno, menos as partes voltadas para desenvolvimento"*, *"gestores
terão acesso completo para determinadas funções"*, *"cada um ter sua sessão e
seus acessos a dados que somente eles conseguem"*, *"ceo/cto terá acesso
completo a tudo"*.

### 2.2 Por que dois campos novos, não um redesenho total

Para não quebrar as ~15 rotas que já checam `requireSystemRoles([...])`,
a proposta é **aditiva**:

- Mantém `User.systemRole` como está (é o que a maioria das rotas já verifica
  — trocar isso agora seria reescrever toda a autorização à toa).
- Adiciona dois campos novos ao `User`:
  - `department` (`DIRETORIA | DESENVOLVIMENTO | COMERCIAL | MARKETING | FINANCEIRO | SUPORTE`)
  - `seniority` (`DIRETOR | GESTOR | COLABORADOR`)
- As rotas que hoje são "tudo ou nada" para um `systemRole` (ex.: qualquer
  `COMMERCIAL` vê toda a carteira) passam a filtrar por `seniority`: se
  `COLABORADOR`, adiciona `WHERE responsavel_id = <usuário>` na consulta.

**O que isso exige de verdade (schema):** para o "colaborador só vê o que é
dele" funcionar de fato no Comercial, falta um campo de **responsável** por
cliente — hoje `Company` não tem dono comercial. Precisaria de algo como
`Company.commercialOwnerId` (quem está conduzindo aquele cliente). Isso é uma
migration nova, pequena, mas é a peça que faltava para o escopo por
colaborador funcionar — sinalizado aqui, não implementado ainda.

### 2.3 Marketing — o que fica pra depois

Marketing não tem hoje nenhum domínio, rota, tela ou dado no sistema. Antes de
codar qualquer coisa, precisa responder: o que o Marketing faz **dentro do
Nexus**? Campanhas de aquisição, materiais para o comercial, métricas de
conversão do funil (leads → contrato)? Fica registrado como **departamento
existente no organograma, sem funcionalidade ainda** — para o mindmap incluir
o lugar dele sem inventar telas que não sabemos se são as certas.

---

## Parte 3 — O lado do cliente (farmácia): já está certo, só documentar

Comparando o que você descreveu com o que já existe em
`api/src/security/access-control.ts` (`tenantRoles`):

| Você descreveu | Já existe como | Cobertura |
|---|---|---|
| Gestor/diretor da farmácia (acesso a tudo: CRM, estoque, vendas, caixa, vencimentos) | `OWNER` / `ADMIN` | ✅ Acesso ADMIN em praticamente todos os domínios |
| Gerência | `MANAGER` | ✅ Aprova compras/estoque, painel gerencial, fechamentos |
| Frente de caixa / PDV | `OPERATOR` | ✅ Caixa, NFC-e, pós-venda — sem painéis administrativos |
| Vendedor / balcão | `ATTENDANT` | ✅ Consulta, pré-venda, encaminha ao caixa — não abre caixa |
| Estoquista / compras | `BUYER` | ✅ Cotações, pedidos, fornecedores, recebimento, estoque |
| — | `PHARMACIST` | Farmacêutico — controlados, revisão fiscal (já existia, cabe no seu retrato) |
| — | `FINANCE` (loja) | Financeiro da farmácia, separado do financeiro Nexus |
| — | `VIEWER` | Auditoria/consulta, sem mutação |

**Conclusão: o modelo do lado do cliente não precisa ser redesenhado.** Ele já
tem os 9 perfis certos, com fronteiras já bem definidas
(`api/src/security/access-control.ts:43-124`). O que faltava era o **mindmap
visual** para enxergar isso de uma vez — está na Parte 4.

### 3.1 "Grupo" — atenção a um ponto que pode confundir

Quando você diz *"gestor/diretor da farmácia, grupo etc."*, hoje o sistema
resolve rede de farmácias como **1 empresa com várias lojas sob 1 contrato**
(decisão já registrada em `docs/central-nexus-admin.md`). Isso é diferente de
um **grupo econômico com várias empresas (CNPJs) separadas** — isso não existe
ainda e é um tópico maior (holding com contratos distintos por empresa),
fora do escopo deste documento. Sinalizado para não confundir com a divisão
departamental interna.

---

## Parte 4 — Os dois mindmaps

1. **CRM interno Nexus Pharma** — departamentos × senioridade × páginas da
   Central Nexus, mostrando quem vê o quê.
2. **Perfis do cliente (farmácia)** — os 9 perfis tenant, o que cada um opera,
   e as telas do portal correspondentes.

Publicados como artefatos separados (links entregues junto com este
documento).

---

## Parte 5 — Próximos passos (aguardando sua decisão, nada implementado)

- [ ] Confirmar a lista de departamentos (Diretoria, Desenvolvimento,
      Comercial, Marketing, Financeiro, Suporte — falta algum? Jurídico? RH?)
- [ ] Confirmar o significado de "Gestor" por departamento (aprovar o que
      fica de fato liberado pra cada um — ex.: Gestor Financeiro pode fechar
      fatura de qualquer cliente, Gestor Comercial pode reatribuir um lead de
      um colaborador pra outro?)
- [ ] Decidir o campo de "responsável" (`Company.commercialOwnerId` ou
      equivalente) para o escopo por colaborador funcionar de verdade
- [ ] Decidir o que o Marketing efetivamente vai fazer no produto antes de
      desenhar telas para ele
- [ ] Só depois disso: migration + telas de gestão de departamento/senioridade
      (hoje o convite de equipe só pergunta o `systemRole`)
