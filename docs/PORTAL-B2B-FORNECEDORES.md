# Painel da indústria e distribuição (Painel Prime)

> Laboratórios, distribuidoras e atacadistas acompanham **em tempo real e só
> para consulta** o estoque e as vendas dos próprios produtos nas farmácias
> parceiras. Em produção o painel fica desligado até
> `PRIME_ENABLED=true` (API, Render) e `NEXT_PUBLIC_PRIME_ENABLED=true`
> (site, Vercel — exige um novo deploy, porque variável `NEXT_PUBLIC_` entra no
> build). A gestão na Central Nexus funciona mesmo com o painel desligado.

## Os três lados

```
 Nexus (Central)                      Indústria/distribuição             Farmácia
 ───────────────                      ──────────────────────             ────────
 cadastra a organização  ──convite──▶ Responsável aceita, ativa MFA
 vincula farmácias ─────────────────▶ vê estoque/vendas AO VIVO  ◀────── compartilha
 define escopo (GS1)                  convida o próprio time             vê quem acessa
 audita tudo                          (só consulta)                      suspende quando quiser
```

## O que a indústria vê — e o que nunca vê

| Vê (quantidades, em tempo real) | Nunca vê |
|---|---|
| Vendas hoje / 7 / 30 dias por produto e por farmácia | Preço de venda, custo, margem |
| Estoque disponível na rede e por farmácia | Financeiro, caixa, contas a pagar |
| Ruptura (produto × farmácia zerados), cobertura em dias | Dados de consumidores |
| Lotes perto do vencimento; tendência de 14 dias | Motor fiscal, usuários da farmácia |
| Sinais de abastecimento com reposição sugerida | Produtos de concorrentes (laboratório) |

**Tempo real:** a visão ao vivo (vendas e estoque) é calculada a cada leitura e o
painel se relê sozinho a cada 30 s com a aba aberta (dá para pausar). Os sinais
(ruptura, cobertura, vencimento, alta demanda) são recalculados no máximo a cada
60 s por organização; execuções simultâneas de vários usuários são
compartilhadas. "Hoje" é o dia de São Paulo, não o do servidor em UTC.

**Só consulta:** a antiga fila comercial (assumir, contato, proposta, venda
convertida) e o botão de sincronizar foram removidos da API e da tela. A
indústria configura apenas a própria visão (preferências do radar) e o próprio
time.

## Escopo de produtos (decisão padrão, configurável por organização)

- **Laboratório: só os próprios produtos**, identificados pelo **prefixo GS1**
  do código de barras (7 a 12 dígitos — "789" sozinho é recusado, porque casaria
  com todo produto brasileiro). Sem prefixo cadastrado, não vê nenhum produto
  (falha fechado). GTIN-14 e UPC-A são normalizados antes de comparar.
- **Distribuidora e atacadista: todas as marcas**, porque abastecem todas.
- Liberar **todos os produtos para um laboratório** (o que expõe concorrentes) é
  ação exclusiva da **Diretoria, com MFA recente**. Restringir de volta, qualquer
  gestor pode — e o dado sai do painel na hora.
- O filtro é aplicado duas vezes: na sincronização (produto fora do escopo nem é
  carregado) e de novo na leitura (defesa em profundidade).

## Consentimento da farmácia (decisão padrão)

O vínculo é criado pela Nexus, com a autorização prevista no contrato. A
farmácia vê em **Usuários → "Quem acompanha seu estoque e suas vendas"** cada
organização que recebe seus dados e pode:

- **Suspender** a qualquer momento (sem MFA — proteger é imediato);
- **Religar** o que ela mesma suspendeu (com MFA — reabrir dado a terceiro).

Quem suspendeu é quem religa: a Nexus não religa o que a farmácia desligou
(`COMPARTILHAMENTO_SUSPENSO_PELA_FARMACIA`) e vice-versa. Encerrar de vez é
só pela Nexus. Suspensão/encerramento tiram os dados do painel **no mesmo
instante** (ressincronização forçada + filtro de leitura por vínculo ativo).

## Gestão (decisão padrão: Nexus cria, indústria cuida do time)

**Central Nexus → Indústria e distribuição** (Diretoria e Gestor do Comercial;
Colaborador do Comercial não acessa):

- Cadastrar organização (tipo, código, CNPJ, prefixos GS1) e mudar situação.
- Vincular/suspender/encerrar farmácias — **exige MFA recente**.
- Convidar o **Responsável** e demais usuários — **exige MFA recente**. Sem
  e-mail automático configurado, a tela mostra o link para enviar manualmente.
- Suspender/reativar usuários da organização.

**No próprio painel** (Responsável e Administrador): convidar Administrador ou
Visualizador e suspender/reativar — nunca o Responsável (definido pela Nexus)
nem a si mesmo.

Perfis: **Responsável** (OWNER), **Administrador** (ADMIN), **Visualizador**
(ANALYST). Todos veem os mesmos dados; os dois primeiros gerenciam time e
preferências. MANAGER/SALES/LOGISTICS ficam como legado no banco, sem ação
própria.

O usuário da indústria **nunca vira membro de farmácia nem da equipe Nexus**:
é conta de cliente comum com vínculo Prime. Painel exige MFA ativo; perfil
suspenso perde o acesso no request seguinte.

## Auditoria

`PRIME_ORGANIZATION_CREATED`, `PRIME_ORGANIZATION_UPDATED` (escopo antes/depois),
`PRIME_CONNECTION_UPDATED` (quem: NEXUS ou PHARMACY), `PRIME_INVITATION_CREATED`,
`PRIME_INVITATION_ACCEPTED`, `PRIME_MEMBER_UPDATED`, `PRIME_PREFERENCES_UPDATED`.

## Testes

- `api/tests/prime-scope.test.mjs` (CI): regra de escopo GS1, normalização,
  falha fechada.
- `api/tests/e2e/prime.e2e.mjs` (`npm run test:e2e:prime`, Postgres local): 53
  verificações com **duas organizações e três farmácias** — laboratório não vê
  concorrente nem farmácia sem vínculo, distribuidora não abre painel do
  laboratório, farmácia suspende e o dado some na hora, Nexus não religa o que a
  farmácia suspendeu, escopo total só pela Diretoria, time gerenciado, auditoria.
  Com o filtro de escopo sabotado de propósito, 7 verificações falham apontando o
  vazamento.

## Roadmap

1. [x] Organizações B2B, usuários, perfis e autenticação com MFA.
2. [x] Vínculos contratuais farmácia ⇄ organização.
3. [x] Sinais de ruptura, baixa cobertura, vencimento e alta demanda.
4. [x] Painel com regiões, filtros e preferências.
5. [x] ~~Fila comercial~~ — substituída por painel só de consulta (24/09).
6. [x] Sincronização automática (rotina diária + a cada 60 s com painel aberto).
7. [x] **Gestão visual na Central** (organizações, escopo, vínculos, convites, time).
8. [x] **Visão ao vivo** de sell-out e estoque, tendência de 14 dias, tabelas por produto e farmácia.
9. [x] **Transparência e controle da farmácia** (ver e suspender quem acessa).
10. [x] **Teste de isolamento** com duas organizações (e2e).
11. [ ] Ligar em produção (flags) e fazer o piloto com um laboratório real.
12. [ ] Métricas históricas (ruptura evitada, sell-in × sell-out) e exportação.
13. [ ] Escala: com muitas farmácias, trocar a agregação em memória por consulta
    agregada no banco (hoje é adequada ao piloto).
