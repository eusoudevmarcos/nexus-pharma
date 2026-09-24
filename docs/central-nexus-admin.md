# Central Nexus — funcionalidades por página e por perfil

Documenta o que cada página do admin interno (`/portal/interno/*`) permite
fazer hoje, quem pode fazer (perfil/`systemRole`) e qual rota de API está por
trás. Escrito depois da auditoria que encontrou 5 páginas somente-leitura —
registra o que foi corrigido e o que continua assim **por design**.

> Para "quem pode fazer o quê" nos perfis de **cada usuário da farmácia**
> (tenant), a fonte viva é `/portal/interno/perfis` (lê
> `GET /api/v1/acessos/matriz`, gerado a partir de
> `api/src/security/access-control.ts`). Não duplicamos essa matriz aqui
> porque ela já é auto-atualizada pelo código — qualquer mudança de perfil
> aparece ali automaticamente.

---

## Comercial (`/portal/interno/comercial`)

**Quem acessa:** `INTERNAL_ADMIN`, `COMMERCIAL`.

| Ação | Perfil mínimo | Rota |
|---|---|---|
| Ver carteira (leads, contratos, lojas) | leitura | `GET /interno/comercial` |
| **Cadastrar cliente novo** | INTERNAL_ADMIN/COMMERCIAL | `POST /interno/comercial/empresas` |
| **Convidar o responsável** (1º usuário, senha própria por e-mail) | INTERNAL_ADMIN/COMMERCIAL | `POST /interno/comercial/empresas/:id/convite-responsavel` |
| Atualizar status/etapa do pipeline | INTERNAL_ADMIN/COMMERCIAL | `PATCH /interno/comercial/empresas/:id` |
| Ativar/atualizar contrato (plano, início, **tipo de cobrança**) | INTERNAL_ADMIN/COMMERCIAL | `PUT /interno/comercial/empresas/:id/assinatura` |
| **Adicionar loja (filial)** | INTERNAL_ADMIN/COMMERCIAL | `POST /interno/comercial/empresas/:id/lojas` |
| **Adicionar PDV numa loja** | INTERNAL_ADMIN/COMMERCIAL | `POST /interno/comercial/lojas/:id/pdvs` |
| **Ver histórico de aditivos** (criação, mudança de plano/cobrança, lojas/PDVs, convite) | leitura | `GET /interno/comercial/empresas/:id/historico` |

**Modelo de contrato (decisão registrada):** 1 empresa = 1 contrato vigente,
cobrindo matriz + filiais (preço de filial/PDV adicional já embutido no
plano). Redes de farmácia usam **múltiplas lojas sob o mesmo contrato**, não
contratos separados por loja. Mudanças ficam registradas como histórico de
aditivos (trilha de auditoria), não como contratos paralelos. Se no futuro for
necessário faturar cada loja separadamente, isso exige uma migration nova
(vínculo Loja→Assinatura) — decisão em aberto, não implementada.

**Tipo de cobrança:** `PAGANTE` (mensalidade normal) · `BRINDE` (cortesia com
prazo em `brinde_ate`) · `FREE` (piloto/testes, indefinido). Brinde/free não
geram fatura.

---

## Indústria e distribuição (`/portal/interno/industria`)

**Quem:** Diretoria e Gestor do Comercial (Colaborador não acessa).

Clientes B2B do Painel da indústria (Prime): laboratórios, distribuidoras e
atacadistas que acompanham, só para consulta e em tempo real, estoque e vendas
dos próprios produtos nas farmácias vinculadas. Detalhes completos em
[PORTAL-B2B-FORNECEDORES.md](PORTAL-B2B-FORNECEDORES.md).

| Ação | Regra | Rota |
|---|---|---|
| Cadastrar organização (tipo, código, CNPJ, prefixos GS1) | Laboratório nasce vendo só os próprios produtos | `POST /interno/industria/organizacoes` |
| Mudar situação / escopo / prefixos | "Todos os produtos" para laboratório: só Diretoria + MFA | `PATCH /interno/industria/organizacoes/:id` |
| Vincular, suspender ou encerrar farmácia | MFA recente; não religa o que a farmácia suspendeu | `PUT .../:id/conexoes` |
| Convidar Responsável / Administrador / Visualizador | MFA recente; link manual se não houver e-mail automático | `POST .../:id/convites` |
| Suspender / reativar usuário da organização | MFA recente | `PATCH .../:id/membros/:userId` |

---

## Perfis e permissões (`/portal/interno/perfis`)

**Quem acessa:** qualquer perfil interno (leitura da matriz).
**Quem gerencia a equipe:** só `INTERNAL_ADMIN`.

| Ação | Perfil mínimo | Rota |
|---|---|---|
| Ver matriz de RBAC (documentação viva) | leitura | `GET /acessos/matriz` |
| **Ver equipe Nexus + convites pendentes** | INTERNAL_ADMIN | `GET /interno/equipe` |
| **Convidar novo membro da equipe** (Admin/Developer/Helpdesk/Financeiro/Comercial) | INTERNAL_ADMIN + MFA recente | `POST /interno/equipe/convite` |

Antes só existia o seed manual (`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`) para
criar o primeiro administrador. Agora, com pelo menos um `INTERNAL_ADMIN`
ativo, novos membros da equipe são convidados pela tela — a senha é sempre
definida pelo próprio convidado ao aceitar o e-mail, nunca pelo admin.

---

## Catálogos fiscais (`/portal/interno/catalogos-fiscais`)

**Quem acessa:** `INTERNAL_ADMIN`, `DEVELOPER`.

| Ação | Perfil mínimo | Rota |
|---|---|---|
| Ver cobertura, alertas e revisões pendentes | INTERNAL_ADMIN/DEVELOPER | `GET /interno/fiscal/saude` |
| **Importar catálogo oficial** (NCM, CEST, CST, CSOSN, IBS/CBS...) | INTERNAL_ADMIN/DEVELOPER | `POST /interno/fiscal/catalogos/importar` |
| **Ativar catálogo** (2º responsável, "quatro olhos") | INTERNAL_ADMIN + MFA recente | `POST /interno/fiscal/catalogos/:id/ativar` |
| **Importar matriz tributária do DF** | INTERNAL_ADMIN/DEVELOPER | `POST /interno/fiscal/matriz-df/importar` |
| **Homologar pacote da matriz DF** (parecer obrigatório) | INTERNAL_ADMIN + MFA recente | `POST /interno/fiscal/matriz-df/pacotes/:hash/aprovar` |

A importação é feita colando o JSON já extraído das fontes oficiais (Portal
Nacional da NF-e, Receita Federal, SINJ/DF) — é dado técnico em massa
(potencialmente milhares de itens), não um cadastro item a item. Quem importa
nunca pode ser quem ativa/homologa (a API rejeita o mesmo usuário nas duas
pontas — regra de quatro olhos já existente no backend).

---

## Go-live (`/portal/interno/go-live`) — sem alteração, por design

Relatório de prontidão em tempo real (certificados, migrations, MFA
obrigatório, backup/PITR etc.). **Não tem o que clicar**: cada item é
resolvido fora da tela (variável de ambiente no Render, migration, backup),
nunca por um botão aqui. Continua somente-leitura corretamente.

---

## Financeiro interno (`/portal/interno/financeiro`) — dashboard por design

Mostra receita recorrente, faturas e automações (e-mail/webhooks). As ações de
fato (fechar fatura do mês, registrar economia homologada) já existem — ficam
em **Faturamento SaaS** (`/portal/interno/faturamento`), que já era
interativo. Financeiro é o painel de leitura; Faturamento é onde se age.

---

## Desenvolvimento (`/portal/interno/desenvolvimento`) — gap conhecido, não resolvido

Mostra releases e aprovações, mas **o backend não tem rota para criar release,
aprovar ou liberar cliente** — só `GET /interno/desenvolvimento`. Diferente
das outras páginas, aqui falta desenho de produto antes de codar (o que é uma
"release" no fluxo de vocês, quem aprova o quê, como se libera um cliente para
uma versão). Registrado como pendência para uma próxima rodada.
