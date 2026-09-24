# Checklist de execução — o que falta, por frente

Consolida o que foi construído e o que falta em cada frente. Marque conforme avançar.

---

## Frente 0 — Publicar o trabalho mais recente (curto prazo, é sua ação)

Tudo até `41318a0` **está em produção** (Vercel + Render): emissor NFC-e,
brinde/free, automações de estoque, funcionalidades da Central Nexus e o CRM
interno (departamentos/senioridade).

- [x] Push + CI + deploy da Central Nexus (`5ba0899`) e do CRM interno
  (`4b6a775` com migration `crm_interno_departamentos`, fix `41318a0`)
- [x] **CI agora roda os testes** — antes o "quality gate" só compilava; os
  testes (NFC-e, DANFE, cadeia tributária, fronteiras de perfil) nunca tinham
  bloqueado um deploy. Agora um teste quebrado impede o Render de publicar.
- [ ] Testar o CRM interno em produção: ativar MFA em Minha segurança →
  convidar Marketing/Comercial → rebaixar para Colaborador → atribuir um
  cliente → entrar como a pessoa e ver só a carteira dela

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

## Frente 2 — Onboarding brinde / free / pagante ✅ completo (back + front)

- [x] `SubscriptionBillingType` (PAYING/COMPLIMENTARY/FREE) + faturamento que pula
      cobrança para brinde/free
- [x] Rota `PUT /interno/comercial/empresas/:id/assinatura` aceita `tipo_cobranca`
- [x] **Frontend:** campo "Tipo de cobrança" + "Brinde até" na Central Nexus →
      Comercial (ativação de contrato)
- [x] **Cadastro de cliente novo:** `POST /interno/comercial/empresas` +
      formulário "Novo cliente" na Central Nexus → Comercial
- [x] **Convite do primeiro usuário do cliente:** `POST /interno/comercial/
      empresas/:id/convite-responsavel` + mini-formulário no card de cada
      empresa. A senha é sempre definida pelo próprio destinatário ao clicar
      no link do e-mail (nunca pelo admin Nexus).
- [ ] Definir os primeiros clientes brinde (quem, prazo em `brinde_ate`)
- [ ] Processo de conversão: quando o brinde virar pagante, reenviar a mesma rota
      com `tipo_cobranca: "PAGANTE"` e o plano definitivo

---

## Frente 3 — Automação de estoque (validade/lote) ✅ #1 e #2 completas (back + front)

- [x] **#1** NF-e grupo `rastro` → pré-preenche lote/fabricação/validade no recebimento
- [x] **#2** Parser GS1 (DataMatrix) + `POST /estoque/codigo/resolver`
- [x] **Frontend:** campo "Bipar código" na tela de recebimento/conferência
      (`/portal/recebimento`) — preenche produto, lote, fabricação e validade
- [ ] **Frontend:** consumir no balcão/caixa (bipagem 1D) — menor prioridade,
      a busca por EAN no balcão já funciona (scanner já digita no campo)
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

## Frente 4.5 — Central Nexus: controles do admin ✅ maior parte pronta

Auditoria encontrou 5 páginas do admin interno 100% somente-leitura. Detalhe
completo, página a página e por perfil, em
[central-nexus-admin.md](central-nexus-admin.md).

- [x] Cadastro de cliente + convite do responsável (feito em rodada anterior)
- [x] Equipe interna Nexus: listar + convidar (Admin/Dev/Helpdesk/Financeiro/Comercial)
- [x] Catálogos fiscais: importar (JSON) + ativar/homologar com quatro olhos
- [x] Comercial: adicionar loja/PDV + ver histórico de aditivos do contrato
- [ ] Desenvolvimento (releases/aprovações): gap conhecido, precisa de desenho
      de produto antes de codar — backend não tem nem rota de criar release
- [ ] Financeiro interno: ações de retry (e-mail/webhook com falha) — baixa
      prioridade, hoje resolve-se manualmente

---

## Frente 4.6 — Indústria e distribuição (Painel Prime) ✅ pronto, desligado em produção

Doc: [PORTAL-B2B-FORNECEDORES.md](PORTAL-B2B-FORNECEDORES.md)

- [x] Painel só de consulta, ao vivo (vendas hoje/7/30 dias, estoque, ruptura, tendência)
- [x] Laboratório vê só os próprios produtos (prefixo GS1); distribuidora vê todos
- [x] Gestão na Central: organização, escopo, vínculos, convites, time
- [x] Farmácia vê quem acessa os dados dela e suspende quando quiser
- [x] Teste de isolamento com duas organizações (e2e, 53 verificações)
- [ ] **Ligar em produção:** `PRIME_ENABLED=true` no Render e
      `NEXT_PUBLIC_PRIME_ENABLED=true` na Vercel (+ novo deploy do site)
- [ ] Cadastrar o primeiro laboratório com os prefixos GS1 reais e fazer o piloto

---

## Frente 5 — Do diagnóstico original (produção plena, mais longo prazo)

- [ ] Testes de **isolamento multiempresa** e concorrência. Já cobertos: equipe
      interna (e2e CRM) e indústria ⇄ farmácia (e2e Prime). Falta: farmácia ⇄
      farmácia nas rotas de tenant e concorrência
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
| [central-nexus-admin.md](central-nexus-admin.md) | Cada página do admin interno: o que faz, quem pode, qual rota |
| [roadmap-integracoes-e-automacao.md](roadmap-integracoes-e-automacao.md) | Visão geral: brinde/free, TEF, leitores, automação de validade |
| [nexus-bridge-tef.md](nexus-bridge-tef.md) | Contrato de mensagens do agente de maquininha |
| [frontend-leitura-codigo.md](frontend-leitura-codigo.md) | Código de referência: proxy, leitor USB, câmera |
| Este arquivo | Checklist de execução consolidado, por frente |
