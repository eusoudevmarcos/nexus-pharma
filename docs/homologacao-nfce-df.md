# Homologação NFC-e (SEFAZ-DF) — guia de insumos e ativação

Guia prático para colocar a emissão de NFC-e (modelo 65) em homologação e depois
em produção no Distrito Federal. O **código do emissor já está pronto** (XML
oficial 4.00, assinatura, QR Code, DANFE, autorização, cancelamento e validação
estrutural), com a transmissão **desligada por flag**. O que falta são insumos
externos (certificado, CSC, credenciamento, XSDs, matriz DF) e a homologação
propriamente dita.

> Regra de ouro: **só ligue `NFCE_ENABLE_SEFAZ_TRANSMISSION=true` depois de obter
> `cStat 100` (autorizada) em ambiente de homologação.** Enquanto a flag estiver
> desligada, nada é enviado ao SEFAZ.

---

## 0. Ordem recomendada

1. Certificado digital A1 (e-CNPJ) → 2. Credenciamento NFC-e na SEFAZ-DF (IE +
CSC) → 3. Endereço fiscal e cadastro da empresa → 4. Endpoints SEFAZ-DF e CSC no
sistema → 5. XSDs oficiais → 6. Matriz tributária DF (contador) → 7. Rodada de
homologação até `cStat 100` → 8. Ativar produção.

---

## 1. Certificado digital A1 (e-CNPJ)

- **O que é:** certificado ICP-Brasil tipo **A1** (arquivo `.pfx`/`.p12` + senha),
  no CNPJ da farmácia. Não serve A3 (cartão/token) para servidor.
- **Onde obter:** qualquer Autoridade Certificadora credenciada (Serpro, Certisign,
  Serasa, Valid, Soluti etc.). Validade típica de 1 ano.
- **Como carregar no sistema:** `POST /api/v1/fiscal/dfe/certificados`
  com `{ ambiente: "HOMOLOGATION"|"PRODUCTION", pfx_base64, senha }`.
  O sistema **criptografa** o certificado em repouso (AES-256-GCM) usando a
  variável de ambiente `DFE_CERTIFICATE_ENCRYPTION_KEY` (32 bytes, hex ou base64)
  — configure-a **apenas no servidor (Render)**, nunca no front.
- ⚠️ **Nunca** cole o `.pfx` nem a senha em chat, e-mail ou commit.

## 2. Credenciamento NFC-e na SEFAZ-DF + CSC

- **Credenciar** a farmácia como emitente de NFC-e no portal da SEFAZ-DF, primeiro
  em **homologação**. A Inscrição Estadual (IE) precisa estar habilitada.
- **CSC (Código de Segurança do Contribuinte)** e **idCSC**: gerados no portal da
  SEFAZ-DF. São **obrigatórios para o QR Code**. Guarde os dois: o `idCSC` (curto,
  ex.: `000001`) e o `CSC` (segredo).
- O DF usa a infraestrutura **SVRS** (Sefaz Virtual do RS) para autorizar NFC-e.

## 3. Endereço fiscal e cadastro da empresa

Para gerar o XML, o cadastro da empresa (`Company.settings`, JSON) precisa conter:

```json
{
  "stateRegistration": "0730000100109",     // IE (só dígitos)
  "municipalityCode": "5300108",            // IBGE de Brasília
  "fiscalAddress": {
    "street": "SCS Quadra 2 Bloco C",
    "number": "10",
    "district": "Asa Sul",
    "zipCode": "70300-000",
    "phone": "6133334444"
  }
}
```

- O **CRT** é derivado automaticamente do regime tributário da empresa
  (`SIMPLES_NACIONAL` → CRT 1; demais → CRT 3).
- O preparo (`POST /api/v1/fiscal/nfce/vendas/:saleId/preparar`) **bloqueia** com
  código de validação claro se faltar IE, código do município ou endereço.

## 4. Endpoints SEFAZ-DF e CSC no sistema

Cadastre por empresa/ambiente via `PUT /api/v1/fiscal/nfce/configuracao`:

```json
{
  "ambiente": "HOMOLOGATION",
  "uf": "DF",
  "serie": 1,
  "versao_qrcode": 2,
  "identificador_csc": "000001",
  "segredo_csc": "SEU_CSC_AQUI",
  "url_autorizacao":  "https://.../NFeAutorizacao4",
  "url_status":       "https://.../NFeStatusServico4",
  "url_evento":       "https://.../NFeRecepcaoEvento4",
  "url_inutilizacao": "https://.../NFeInutilizacao4",
  "url_qrcode":       "https://.../nfce/qrcode",
  "url_consulta":     "https://.../nfce/consulta",
  "versao_schema_oficial": "PL_009p_NT2025.002"
}
```

- Use as URLs **de homologação** do SVRS/SEFAZ-DF primeiro; troque para produção
  depois de homologar.
- O CSC é **persistido em qualquer versão de QR** e é **exigido ao ativar** a
  configuração (`ativa: true`) — uma config ativa sem CSC é recusada com
  `NFCE_CSC_OBRIGATORIO`, evitando salvar algo que nunca conseguiria transmitir.
- `url_inutilizacao` alimenta o endpoint dedicado de inutilização de numeração
  (`POST /api/v1/fiscal/nfce/inutilizacoes`).

## 5. XSDs oficiais

- **Baixar** o pacote de schemas vigente no Portal Nacional da NF-e
  (`https://www.nfe.fazenda.gov.br` → "Documentos" → "Esquemas XSD"), incluindo a
  **NT 2025.002** (Reforma Tributária — IBS/CBS).
- O sistema já valida a **estrutura** do XML antes de transmitir
  (`nfce-xsd.service`). A validação **contra o XSD oficial** é um ponto de extensão
  já preparado: ao dispor dos `.xsd`, conecte uma engine (ex.: `libxmljs2`)
  apontando para eles e o `engine` passa de `structural` para `xsd`.
- Enquanto o XSD IBS/CBS não estabilizar, o grupo IBS/CBS fica **desligado**
  (`includeReformGroups=false`) para não gerar XML inválido.

## 6. Matriz tributária DF (com o contador)

- O contador valida, por categoria/produto: **NCM/CEST, CFOP, CST/CSOSN, PIS/COFINS
  (monofásico de medicamentos), ICMS-ST/MVA/FCP, benefícios e vigências**.
- Importe as tabelas oficiais via
  `POST /api/v1/fiscal/nfce/catalogos-oficiais/importar` e homologue a versão antes
  de ativar (fluxo de quatro olhos já existente).
- Pendência conhecida: os valores de **ICMS-ST retido por item** (CSOSN 500) hoje
  saem como `0` — precisam vir da proveniência fiscal/matriz para o cupom refletir
  a retenção corretamente.

## 7. Rodada de homologação

1. Empresa em `DEPLOYMENT_STAGE` de teste, com certificado e CSC de **homologação**.
2. `NFCE_ENABLE_SEFAZ_TRANSMISSION=true` **apenas** no ambiente de homologação.
3. Registrar uma venda de teste → `preparar` → `transmitir`
   (`POST /api/v1/fiscal/nfce/documentos/:id/transmitir`).
4. Conferir retorno **`cStat 100` (Autorizado o uso da NF-e)** e o protocolo.
5. Testar **cancelamento** (`/documentos/:id/cancelar`, justificativa ≥ 15 ca-
   racteres) → `cStat 135`.
6. Validar o XML autorizado contra o **XSD oficial** e conferir o DANFE + QR num
   leitor real.

## 8. Ativar produção

- Só depois do item 7 concluído: repita 1–4 com certificado, CSC e URLs de
  **produção**, `NFCE_ALLOW_PRODUCTION_PREPARATION=true` e
  `NFCE_SCHEMA_VERSION` sem o prefixo `local-`.
- O gate `getProductionReadiness()` (`nfce-sefaz`) só deve passar após XSD validado
  e homologação comprovada.

---

## Checklist rápido

- [ ] Certificado A1 (.pfx) obtido e carregado (`POST /fiscal/dfe/certificados`)
- [ ] `DFE_CERTIFICATE_ENCRYPTION_KEY` configurada no servidor
- [ ] IE habilitada + credenciamento NFC-e homologação (SEFAZ-DF)
- [ ] CSC + idCSC gerados e salvos (`PUT /fiscal/nfce/configuracao`, obrigatório ao ativar)
- [ ] Endereço fiscal em `Company.settings.fiscalAddress`
- [ ] URLs SVRS/SEFAZ-DF de homologação cadastradas
- [ ] XSDs oficiais baixados
- [ ] Matriz tributária DF validada pelo contador e importada
- [ ] Venda de teste autorizada com `cStat 100`
- [ ] Cancelamento testado (`cStat 135`)
- [ ] Repetição em produção + gate de prontidão verde
