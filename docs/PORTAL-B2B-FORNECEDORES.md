# Painel da indústria e distribuição (Painel Prime)

> Laboratórios, distribuidoras e atacadistas acompanham **em tempo real e só
> para consulta** o estoque e as vendas nas farmácias parceiras. Em produção o
> painel fica desligado até `PRIME_ENABLED=true` (API, Render) e
> `NEXT_PUBLIC_PRIME_ENABLED=true` (site, Vercel — exige um novo deploy, porque
> variável `NEXT_PUBLIC_` entra no build). A gestão na Central Nexus funciona
> mesmo com o painel desligado.

## Os três lados

```
 Nexus (Central)                      Indústria/distribuição             Farmácia
 ───────────────                      ──────────────────────             ────────
 cadastra a organização  ──convite──▶ Responsável aceita, ativa MFA
 vincula farmácias ─────────────────▶ vê estoque/vendas AO VIVO  ◀────── compartilha (contrato)
 suspende/encerra vínculo             convida o próprio time             consulta quem acompanha
 audita tudo                          (só consulta)
```

## Política de 25/09 (decisões do negócio)

1. **Toda organização vê todas as marcas** nas farmácias vinculadas — inclusive
   laboratório. O laboratório vê todo o estoque baixo do cliente e decide por
   si mesmo o que oferecer.
2. **O compartilhamento faz parte do contrato da farmácia.** A farmácia não
   suspende; ela consulta quem acompanha os dados dela. Suspender ou encerrar é
   exclusivo da Nexus.
3. **A Nexus cria a indústria e convida o Responsável; o Responsável cuida do
   time.**

## O que a indústria vê — e o que nunca vê

| Vê (quantidades, em tempo real) | Nunca vê |
|---|---|
| Vendas hoje / 7 / 30 dias por produto e por farmácia, de todas as marcas | Preço de venda, custo, margem |
| Estoque disponível na rede e por farmácia | Financeiro, caixa, contas a pagar |
| Ruptura (produto × farmácia zerados), cobertura em dias | Dados de consumidores |
| Lotes perto do vencimento; tendência de 14 dias | Motor fiscal, usuários da farmácia |
| Sinais de abastecimento com reposição sugerida | Farmácias fora do vínculo |

**Tempo real:** a visão ao vivo (vendas e estoque) é calculada a cada leitura e o
painel se relê sozinho a cada 30 s com a aba aberta (dá para pausar). Os sinais
(ruptura, cobertura, vencimento, alta demanda) são recalculados no máximo a cada
60 s por organização; execuções simultâneas de vários usuários são
compartilhadas. "Hoje" é o dia de São Paulo, não o do servidor em UTC.

**Só consulta:** a antiga fila comercial (assumir, contato, proposta, venda
convertida) e o botão de sincronizar foram removidos da API e da tela. A
indústria configura apenas a própria visão (preferências do radar) e o próprio
time.

## Restrição opcional por prefixo GS1

O padrão é **todas as marcas**. Se um contrato específico exigir, a Nexus pode
restringir uma organização aos **próprios produtos**, pelo prefixo GS1 do código
de barras (7 a 12 dígitos — "789" sozinho é recusado, porque casaria com todo
produto brasileiro). Restrição ligada sem prefixo não mostra nada (falha
fechado); GTIN-14 e UPC-A são normalizados antes de comparar. Qualquer gestor da
indústria na Central liga ou desliga, e o painel reflete **na hora**. O filtro
vale na sincronização e de novo na leitura.

A migration `prime_laboratorio_ve_todas_as_marcas` levou para "todas as marcas"
os laboratórios cadastrados com a restrição antiga gravada como padrão.

## Compartilhamento é contratual

A farmácia vê em **Usuários → "Quem acompanha seu estoque e suas vendas"** cada
organização que acompanha os dados dela, com a situação (acompanhando, suspenso
pela Nexus, encerrado) — **só consulta**, sem botões e sem rota de alteração.

A Nexus liga, suspende, religa ou encerra o vínculo na Central (com MFA
recente). Suspender ou encerrar tira os dados do painel **no mesmo instante**
(ressincronização forçada + leitura só de vínculos ativos).

## Gestão (Nexus cria, indústria cuida do time)

**Central Nexus → Indústria e distribuição** (Diretoria e Gestor do Comercial;
Colaborador do Comercial não acessa):

- Cadastrar organização (tipo, código, CNPJ, prefixos GS1 opcionais) e mudar situação.
- Vincular, suspender, religar ou encerrar farmácias — **exige MFA recente**.
- Convidar o **Responsável** e demais usuários — **exige MFA recente**. Sem
  e-mail automático configurado, a tela mostra o link para enviar manualmente.
- Suspender/reativar usuários da organização; ligar/desligar a restrição GS1.

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
`PRIME_CONNECTION_UPDATED`, `PRIME_INVITATION_CREATED`,
`PRIME_INVITATION_ACCEPTED`, `PRIME_MEMBER_UPDATED`, `PRIME_PREFERENCES_UPDATED`.

## Testes

- `api/tests/prime-scope.test.mjs` (CI): padrão "todas as marcas", restrição GS1
  opcional, normalização, falha fechada.
- `api/tests/e2e/prime.e2e.mjs` (`npm run test:e2e:prime`, Postgres local): 54
  verificações com **duas organizações e três farmácias** — laboratório vê todas
  as marcas só nas farmácias vinculadas, distribuidora não abre painel do
  laboratório, farmácia não tem rota para suspender (404), suspensão da Nexus
  tira o dado na hora, restrição GS1 liga/desliga na hora, time gerenciado,
  auditoria.

## Roadmap

1. [x] Organizações B2B, usuários, perfis e autenticação com MFA.
2. [x] Vínculos contratuais farmácia ⇄ organização.
3. [x] Sinais de ruptura, baixa cobertura, vencimento e alta demanda.
4. [x] Painel com regiões, filtros e preferências.
5. [x] ~~Fila comercial~~ — substituída por painel só de consulta (24/09).
6. [x] Sincronização automática (rotina diária + a cada 60 s com painel aberto).
7. [x] **Gestão visual na Central** (organizações, escopo, vínculos, convites, time).
8. [x] **Visão ao vivo** de sell-out e estoque, tendência de 14 dias, tabelas por produto e farmácia.
9. [x] **Transparência para a farmácia** (consulta de quem acompanha — contrato).
10. [x] **Teste de isolamento** com duas organizações (e2e).
11. [ ] Ligar em produção (flags) e fazer o piloto com um laboratório real.
12. [ ] Métricas históricas (ruptura evitada, sell-in × sell-out) e exportação.
13. [ ] Escala: com muitas farmácias, trocar a agregação em memória por consulta
    agregada no banco (hoje é adequada ao piloto).
