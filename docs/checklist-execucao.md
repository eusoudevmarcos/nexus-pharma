# Checklist de execução — o que falta, por frente

Consolida tudo que foi construído na branch `feat/nfce-emissor-oficial` (11 commits)
e o que falta em cada frente, para acompanhamento. Marque conforme avançar.

---

## Frente 0 — Publicar o trabalho (curto prazo, é sua ação)

- [ ] `git push -u origin feat/nfce-emissor-oficial`
- [ ] Abrir PR: `https://github.com/eusoudevmarcos/nexus-pharma/pull/new/feat/nfce-emissor-oficial`
- [ ] Revisar e mergear
- [ ] No ambiente de destino: `npm install` (fastify subiu de versão) + `npx prisma migrate deploy`
  (aplica 3 migrations: `inutilization_url`, `billing_type`, `dfe_item_rastro`)

---

## Frente 1 — Fiscal / homologação NFC-e (off, com você/contador/SEFAZ)

Guia completo: [homologacao-nfce-df.md](homologacao-nfce-df.md)

- [ ] Certificado A1 (e-CNPJ) obtido e carregado (`POST /fiscal/dfe/certificados`)
- [ ] `DFE_CERTIFICATE_ENCRYPTION_KEY` configurada no servidor (Render)
- [ ] IE habilitada + credenciamento NFC-e em homologação (SEFAZ-DF)
- [ ] CSC + idCSC gerados e salvos (`PUT /fiscal/nfce/configuracao`)
- [ ] Endereço fiscal em `Company.settings.fiscalAddress`
- [ ] URLs SVRS/SEFAZ-DF de homologação cadastradas (autorização, status, evento,
      **inutilização** — campo novo `url_inutilizacao`)
- [ ] XSDs oficiais baixados (para a validação real substituir a estrutural)
- [ ] Matriz tributária DF validada pelo contador e importada
- [ ] Venda de teste autorizada com `cStat 100`
- [ ] Cancelamento testado (`cStat 135`)
- [ ] `NFCE_ENABLE_SEFAZ_TRANSMISSION=true` **somente** em homologação, depois produção

Código já pronto: XML 4.00, assinatura, QR, DANFE, autorização, cancelamento,
inutilização, validação estrutural. Nada disso precisa de nova implementação —
só os insumos acima.

---

## Frente 2 — Onboarding brinde / free / pagante ✅ backend pronto

- [x] `SubscriptionBillingType` (PAYING/COMPLIMENTARY/FREE) + faturamento que pula
      cobrança para brinde/free
- [x] Rota `PUT /interno/comercial/empresas/:id/assinatura` aceita `tipo_cobranca`
- [ ] **Frontend:** expor o campo no cadastro do backoffice comercial
- [ ] Definir os primeiros clientes brinde (quem, prazo em `brinde_ate`)
- [ ] Processo de conversão: quando o brinde virar pagante, reenviar a mesma rota
      com `tipo_cobranca: "PAGANTE"` e o plano definitivo

---

## Frente 3 — Automação de estoque (validade/lote) ✅ backend pronto

- [x] **#1** NF-e grupo `rastro` → pré-preenche lote/fabricação/validade no recebimento
- [x] **#2** Parser GS1 (DataMatrix) + `POST /estoque/codigo/resolver`
- [ ] **Frontend:** consumir `/codigo/resolver` na tela de recebimento/conferência
- [ ] **Frontend:** consumir no balcão/caixa (bipagem 1D)
- [ ] **Frontend:** leitor por câmera (ZXing) — código de referência pronto em
      [frontend-leitura-codigo.md](frontend-leitura-codigo.md)
- [ ] Comprar/testar 1 leitor **imager 2D** (não o laser 1D comum) para ler
      DataMatrix de medicamentos rastreados
- [ ] Piloto: medir quantos itens ainda exigem digitação manual (deve cair
      drasticamente com #1 + #2)
- [ ] (Futuro) App/PWA de captura mobile sobre o mesmo endpoint

---

## Frente 4 — Pagamento (maquininhas / TEF)

Contrato completo: [nexus-bridge-tef.md](nexus-bridge-tef.md)

- [ ] Escolher o TEF: **PayGo** ou **SiTef** (recomendado, multi-adquirente)
- [ ] Contratar/homologar o TEF escolhido com a(s) adquirente(s) (Stone e outras)
- [ ] Implementar o **Nexus Bridge** (serviço Windows local, WSS `:9187`,
      certificado confiável em `127.0.0.1`)
- [ ] Implementar as mensagens: `payment.start/confirm/reverse/cancel/void/status/reprint`
- [ ] **Frontend do caixa:** cliente WSS + máquina de estados de pagamento
- [ ] Ligar `payment.confirm` **só depois** que `POST /vendas` retornar sucesso
- [ ] Testar cenário de falha: venda não grava → `payment.reverse`
- [ ] Piloto com 1 loja antes de expandir

---

## Frente 5 — Do diagnóstico original (produção plena, mais longo prazo)

- [ ] Testes de **isolamento multiempresa** e concorrência (maior risco silencioso
      hoje — nenhum teste automatizado prova isso)
- [ ] **RLS** no Postgres ou middleware Prisma que injeta `companyId` (rede de
      proteção além da disciplina manual nas queries)
- [ ] **Backup/PITR** gerenciado + teste de restauração comprovado
- [ ] Gateway de pagamento SaaS real (cobrança das mensalidades — diferente do
      TEF do caixa, que é para o cliente final)
- [ ] Relay de e-mail real (convites, reset de senha)
- [ ] Observabilidade externa (APM/alerting)
- [ ] SAST/DAST/pentest
- [ ] Termos, contratos, SLA, revisão LGPD jurídica
- [ ] Piloto controlado com usuários reais

---

## Onde cada coisa está documentada

| Documento | Cobre |
|---|---|
| [homologacao-nfce-df.md](homologacao-nfce-df.md) | Insumos e passo-a-passo da homologação fiscal |
| [roadmap-integracoes-e-automacao.md](roadmap-integracoes-e-automacao.md) | Visão geral: brinde/free, TEF, leitores, automação de validade |
| [nexus-bridge-tef.md](nexus-bridge-tef.md) | Contrato de mensagens do agente de maquininha |
| [frontend-leitura-codigo.md](frontend-leitura-codigo.md) | Código de referência: proxy, leitor USB, câmera |
| Este arquivo | Checklist de execução consolidado, por frente |
