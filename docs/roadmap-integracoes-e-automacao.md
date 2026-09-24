# Roadmap — Onboarding, integrações de hardware e automação de estoque

Documento de continuidade para: (1) o modelo de clientes brinde/free já implementado,
(2) integração com maquininhas de pagamento, (3) leitores de código de barras e
(4) automação da captura de lote/validade dos produtos. Prioriza o que dá mais
resultado com menos esforço e marca o que já existe no código.

---

## 1. Onboarding de clientes: pagante, brinde e free ✅ (implementado)

Já existe no código o tipo de cobrança da assinatura, separado do plano e do status:

| Tipo (`billingType`) | Uso | Cobrança |
|---|---|---|
| `PAYING` (PAGANTE) | Cliente normal | Mensalidade + setup + success fee |
| `COMPLIMENTARY` (BRINDE) | Cortesia/teste com prazo para virar pagante | **Nada** (acesso completo) |
| `FREE` | Conta gratuita para piloto/implantação e testes | **Nada** (acesso completo, indefinido) |

**Como cadastrar** (após liberar o contrato), rota de backoffice comercial:

```
PUT /api/v1/fiscal/.. → PUT /api/v1/interno/comercial/empresas/:id/assinatura
{
  "plano": "ULTIMATE",            // features liberadas (use um plano completo no piloto)
  "inicio_contrato": "2026-09-24",
  "status": "ACTIVE",
  "tipo_cobranca": "BRINDE",      // PAGANTE | BRINDE | FREE
  "brinde_ate": "2026-12-31"      // opcional, só para BRINDE
}
```

- Brinde/free **operam normalmente** (o faturamento provisiona loja + PDV), mas o
  fechamento mensal **não gera fatura, setup nem success fee**.
- **Converter para pagante:** repita a chamada com `"tipo_cobranca": "PAGANTE"` e o
  plano correto — o onboarding financeiro (setup/parcelas) é criado nesse momento.
- Migration: `20260924020000_subscription_billing_type` (aplicar com `prisma migrate deploy`).

**Pendência de UX:** expor o campo `tipo_cobranca` na tela de cadastro do backoffice
(o back já aceita; falta o front).

---

## 2. Maquininhas de pagamento (Stone e outras)

### Por que não dá para o navegador falar direto com a maquininha
Por PCI e pela sandbox do navegador, uma página web **não acessa** pinpad por
USB/serial/Bluetooth. O padrão de mercado é **TEF** (Transferência Eletrônica de
Fundos): um middleware local no PC conversa com a maquininha, e o PDV conversa com
esse middleware.

### Arquitetura recomendada
```
PDV (web)  →  Nexus Bridge (agente local no PC)  →  TEF/SDK  →  pinpad/maquininha
   |                       (localhost, WS/HTTPS)                    |
   └────────────  { valor, parcelas }  ⇄  { nsu, autorização, bandeira, comprovante }
```

- **Nexus Bridge**: um pequeno serviço no balcão (Windows) que o PDV chama em
  `localhost`. Ele encapsula a biblioteca de TEF e devolve o resultado.
- Opções de TEF:
  - **Stone TEF / Stone Connect** — se for Stone-only.
  - **PayGo (Elgin/Control iD)** ou **SiTef (Software Express)** — **multi-adquirente**
    (Stone, Cielo, Rede, GetNet…). **Recomendado** para não ficar preso a uma
    adquirente e atender "e outras".
- O modelo de dados já suporta: `SalePayment` guarda `referenciaExterna` → grave ali
  o **NSU/autorização**; adicione bandeira/parcelas no snapshot do pagamento.

### Passos
1. Definir 1 TEF (sugiro PayGo/SiTef pela multi-adquirente).
2. Especificar o contrato do Nexus Bridge (`iniciarPagamento`, `confirmar`,
   `cancelar`, `status`, `imprimirComprovante`).
3. Ligar no fluxo do caixa: ao finalizar, PDV → Bridge → captura NSU → grava no
   `SalePayment` → conclui a venda (a venda já é idempotente e transacional).

---

## 3. Leitores de código de barras

Bom saber: **a maioria não precisa de API.** Leitores USB/sem fio funcionam como
**teclado (HID keyboard-wedge)** — "digitam" o código no campo em foco + Enter.

| Cenário | Como | Precisa de código? |
|---|---|---|
| **1D (EAN-13)** no balcão | Leitor comum digita no campo de busca | Não — já funciona |
| **2D DataMatrix (GS1)** | Leitor **imager 2D** digita a string GS1 | Sim — **parsear GS1** (ver §4) |
| **Câmera (celular/webcam)** | Lib JS no navegador (ex.: ZXing) lê 1D e 2D | Sim — integrar a lib |

**Ação:** (a) manter o campo de busca com foco e tratar prefixo/sufixo do leitor;
(b) **detectar e parsear payload GS1** no PDV; (c) opcional: leitura por câmera
(ZXing) para mobile/conferência.

---

## 4. Automação de lote/validade (o "não digitar pack manual") ⭐

Digitar validade na mão é lento e erra. A boa notícia: **quase nada precisa ser
digitado** se atacarmos na ordem certa. Do melhor para o último recurso:

### Nível 1 — Entrada por NF-e do fornecedor (MELHOR ROI, zero hardware)
A NF-e de compra que o sistema **já importa** (DF-e) costuma trazer, por item, o
grupo **`rastro`** com **`nLote`, `dFab`, `dVal`, `qLote`**. Ou seja: ao **receber a
mercadoria**, lote + fabricação + validade podem ser **preenchidos automaticamente**
a partir do XML — sem escanear nada.

- **✅ Implementado.** O parser lê o grupo `rastro`, a importação persiste em
  `dfe_document_items.rastro` e o recebimento pré-preenche lote/fabricação/validade
  (só a quantidade física fica para conferência). Cobre a maior parte das entradas.

### Nível 2 — DataMatrix GS1 da caixa (para conferência e o que não veio no XML)
Medicamentos sob rastreabilidade ANVISA (SNCM) trazem um **DataMatrix 2D** que
codifica, em GS1 Application Identifiers:

| AI | Conteúdo |
|----|----------|
| `(01)` | GTIN (identifica o produto) |
| `(17)` | **Validade** (AAMMDD) |
| `(10)` | **Lote** |
| `(21)` | Serial (IUM — item único) |

Um leitor **imager 2D** (ou a câmera do celular) lê tudo de uma vez → **lote +
validade + serial estruturados**, sem OCR e sem digitar.

- **✅ Implementado (backend).** `gs1-barcode.service` faz o parse e
  `POST /estoque/codigo/resolver` devolve `{ produto, lote, validade, serial }`.
  Falta o **frontend** consumir (campo com foco no leitor 2D e/ou câmera ZXing).

### Nível 3 — OCR da data (fallback para packs sem 2D)
Perfumaria/OTC antigos podem ter só o EAN-13 (1D), que **não** carrega validade.
Aí sim entra a **foto**: OCR on-device (ML Kit / Tesseract / Vision) lê "VAL 12/2026
LOTE ABC123", o sistema **sugere** e a pessoa confirma. É sugestão assistida, nunca
gravação cega — mesma filosofia da IA fiscal.

### Nível 4 — Manual com defaults inteligentes (último recurso)
Autocompletar validade/lote pelo histórico do produto+fornecedor; validar formato;
alertar validade improvável.

### App do celular (futuro, "com calma")
Um **PWA/companion** autenticado ao tenant que: escaneia o DataMatrix (Nível 2),
cai para OCR (Nível 3) quando não há 2D, e envia para um **endpoint de ingestão**
(`gtin, lote, validade, fab, serial`) que cria/atualiza `InventoryLot`. Como o modelo
de lote e a auditoria já existem, o app é uma **casca de captura** sobre a API.

### Recomendação de sequência
1. **Nível 1 (NF-e `rastro`)** — maior alcance, só software, aproveita o DF-e que já
   temos. **Começar por aqui.**
2. **Parser GS1 + leitor 2D** (Nível 2) — conferência e balcão.
3. **OCR mobile** (Nível 3) e o **app** — quando os dois primeiros estiverem rodando.

---

## Resumo de próximos passos de código

| Prioridade | Tarefa | Depende de | Status |
|---|---|---|---|
| Alta | Ler grupo `rastro` da NF-e e pré-preencher lote/validade no recebimento | nada (só código) | ✅ feito |
| Alta | Parser GS1 (AI 01/17/10/21) + endpoint `POST /estoque/codigo/resolver` | nada (só código) | ✅ feito |
| Alta | Expor `tipo_cobranca` na tela de cadastro do backoffice | frontend | pendente |
| Média | Consumir `/codigo/resolver` no PDV/conferência (campo com foco no scanner) | frontend | pendente |
| Média | Leitura por câmera (ZXing) no PDV/mobile (usa o mesmo endpoint) | frontend | pendente |
| Média | Especificar/implementar o **Nexus Bridge** de TEF (PayGo/SiTef) | escolha do TEF | pendente |
| Futuro | App de captura (PWA) que escaneia e chama `/codigo/resolver` | os itens acima | pendente |

> Filosofia mantida em tudo: **automatizar sugerindo, confirmar com humano, registrar
> a decisão.** Vale para fiscal, para validade e para pagamento.
