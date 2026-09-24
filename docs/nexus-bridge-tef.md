# Nexus Bridge — contrato de integração com maquininhas (TEF)

Especificação do **agente local** que liga o PDV (web) às maquininhas/pinpads. É o
"molde" para plugar Stone e outras adquirentes sem que a página web toque no
hardware. Serve tanto para quem for implementar o agente quanto para o time de
frontend que vai chamá-lo.

---

## 1. Por que existe um agente local

O navegador **não acessa** pinpad por USB/serial/Bluetooth (PCI + sandbox). Então:

```
┌────────────┐   WSS/HTTPS localhost   ┌───────────────┐   TEF/SDK   ┌──────────┐
│  PDV (web) │ ──────────────────────▶ │ Nexus Bridge  │ ──────────▶ │ pinpad   │
│  Nexus     │ ◀────────────────────── │ (agente no PC)│ ◀────────── │ maquininha│
└────────────┘   eventos de status     └───────────────┘             └──────────┘
       │
       │ só DEPOIS de aprovado: envia o pagamento (NSU) para a API Nexus ao concluir a venda
       ▼
   POST /api/v1/vendas  (pagamentos[].referencia_externa = NSU)
```

- O **Bridge é local**: a API Nexus **não** conversa com ele. Quem orquestra é o PDV.
- Ao aprovar, o PDV finaliza a venda na API normalmente — `processarVenda` já aceita
  `pagamentos[].referenciaExterna` (grave ali o **NSU**), e a venda é idempotente e
  transacional.

### Mixed content (importante)
Uma página **https** não pode chamar `http://localhost`. O agente deve expor
**WSS/HTTPS** com um certificado **confiável localmente** (cert para `127.0.0.1` ou
um host tipo `bridge.nexus.local` instalado no trust store da máquina na instalação).
É assim que os agentes de TEF de mercado resolvem. Porta sugerida: `:9187`.

---

## 2. Transporte e sessão

- **WebSocket seguro** (`wss://127.0.0.1:9187`) — preferido, porque pagamento tem
  eventos intermediários ("insira o cartão", "digite a senha", "processando").
- Alternativa: HTTPS com *long-polling* de status.
- Handshake: o PDV envia `hello` com o `tenant`, a `loja`, o `pdv` e um token de
  sessão do agente (configurado na instalação). O agente responde `ready` com a
  versão, a adquirente e o modelo do pinpad.

Toda mensagem carrega `id` (correlação) e `type`. O agente **ecoa** o `id` nas
respostas e eventos daquela operação.

---

## 3. Operações (contrato de mensagens)

### 3.1 Iniciar pagamento — `payment.start`
PDV → Bridge:
```json
{
  "id": "op_01H...",
  "type": "payment.start",
  "data": {
    "valor": 30.50,                     // R$, 2 casas
    "forma": "CREDIT",                  // CREDIT | DEBIT | PIX | VOUCHER
    "parcelas": 1,                       // crédito
    "financiamento": "LOJISTA",         // LOJISTA | EMISSOR (quando parcelado)
    "referencia_pdv": "venda-rascunho-123", // idempotência no lado do agente
    "imprimir_comprovante": true
  }
}
```

Bridge → PDV (eventos, mesmo `id`):
```json
{ "id":"op_01H...", "type":"payment.progress", "data":{ "estado":"AGUARDANDO_CARTAO", "mensagem":"Insira ou aproxime o cartão" } }
{ "id":"op_01H...", "type":"payment.progress", "data":{ "estado":"PROCESSANDO" } }
```

Resultado final:
```json
{
  "id": "op_01H...",
  "type": "payment.result",
  "data": {
    "status": "APROVADO",              // APROVADO | NEGADO | CANCELADO | ERRO
    "nsu": "000123456",                // ← vai em pagamentos[].referencia_externa
    "nsu_adquirente": "987654",
    "autorizacao": "A1B2C3",
    "bandeira": "VISA",
    "forma": "CREDIT",
    "parcelas": 1,
    "valor": 30.50,
    "comprovante_cliente": "...texto/ESC-POS...",
    "comprovante_loja": "...",
    "codigo_retorno": "00",
    "mensagem": "Transacao aprovada"
  }
}
```

### 3.2 Confirmar / desfazer — `payment.confirm`
O TEF exige confirmação (protocolo "pendente → confirmado"). Após o PDV **persistir**
a venda com sucesso, envia `payment.confirm { id, nsu }`. Se a venda falhar ao gravar,
envia `payment.reverse { id, nsu }` para **desfazer** no adquirente. O agente cuida do
CNF/DES do TEF.

> Regra de ouro: **confirme no TEF somente depois** de a venda estar gravada na API
> Nexus. Assim nunca há "cobrou mas não vendeu".

### 3.3 Cancelar em andamento — `payment.cancel`
Cancela uma operação ainda não finalizada (cliente desistiu). `{ id }`.

### 3.4 Cancelar/estornar transação anterior — `payment.void`
`{ id, nsu, valor, data_original }` → estorno administrativo.

### 3.5 Status / saúde — `agent.status`
`{ id }` → `{ pinpad:"CONECTADO", adquirente:"STONE", versao:"1.0.0", tef:"PAYGO" }`.

### 3.6 Reimpressão — `receipt.reprint`
`{ id, nsu }` → devolve o comprovante para reimpressão.

---

## 4. Estados e erros

`estado` (progresso): `AGUARDANDO_CARTAO`, `AGUARDANDO_SENHA`, `PROCESSANDO`,
`REMOVA_CARTAO`, `IMPRIMINDO`.

`status` (final): `APROVADO`, `NEGADO`, `CANCELADO`, `ERRO`.

Erros do agente usam envelope `{ type:"error", id, data:{ codigo, mensagem } }` com
códigos estáveis: `PINPAD_DESCONECTADO`, `TEF_INDISPONIVEL`, `TIMEOUT`,
`OPERACAO_DUPLICADA`, `VALOR_INVALIDO`, `CANCELADO_PELO_OPERADOR`.

Timeouts sugeridos: cartão 60s, senha 60s, processamento 40s. Sempre reversível.

---

## 5. Como escolher o TEF

| Opção | Prós | Contras |
|---|---|---|
| **PayGo (Elgin/Control iD)** | Multi-adquirente, larga adoção, homologação simples | Licença/registro |
| **SiTef (Software Express)** | Multi-adquirente robusto, padrão de grandes redes | Mais pesado |
| **Stone TEF / Connect** | Integração direta Stone | Preso à Stone |

**Recomendação:** **PayGo ou SiTef** — o "e outras" do pedido fica resolvido sem
trocar de código quando a farmácia mudar de adquirente. O Bridge encapsula o TEF
escolhido; o PDV nunca muda.

---

## 6. Encaixe no que já existe

- `SalePayment.referenciaExterna` → **NSU** (já modelado).
- `processarVenda({ pagamentos: [{ metodo, valor, referenciaExterna }] })` → concluir
  a venda com o resultado aprovado.
- Adicionar ao snapshot do pagamento (metadata): `bandeira`, `parcelas`, `autorizacao`.
- Fluxo do caixa: **abrir sessão → itens → `payment.start` → aprovado → grava venda →
  `payment.confirm`**. Em falha de gravação: `payment.reverse`.

---

## 7. Roteiro de implementação

1. Escolher o TEF (PayGo/SiTef).
2. Empacotar o **Nexus Bridge** (serviço Windows) com WSS + cert local confiável.
3. Implementar `payment.start/confirm/reverse/cancel/void/status/reprint`.
4. No PDV: cliente WSS + máquina de estados do pagamento + tela de progresso.
5. Ligar `payment.confirm` **após** o `POST /vendas` retornar sucesso.
6. Homologar com a adquirente (ambiente de teste do TEF) antes de produção.

> Segurança: o Bridge nunca expõe dados de cartão ao PDV/Nexus — só NSU/autorização.
> Tudo auditável, como o resto do sistema.
