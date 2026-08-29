# Fase 6 — fundação local da NFC-e

## Escopo entregue

- sequência independente por empresa, ambiente e série, com alocação serializável;
- chave modelo 65 com código numérico e dígito verificador;
- preparação idempotente a partir de uma venda `COMPLETED` e `NFC65`;
- reutilização integral do snapshot fiscal da saída, incluindo ICMS, PIS/COFINS, IBS/CBS e classificação;
- validação de cadastro do emitente, documento do consumidor, itens e campos tributários;
- payload canônico, hash SHA-256 e XML local de conferência;
- trigger que impede modificar venda, ambiente, numeração, chave, conteúdo e hash depois da gravação;
- emissão normal e rascunho de contingência offline;
- fila e painel em `/portal/nfce`;
- tentativa de transmissão registrada e bloqueada, sem chamada externa.

## Limite de segurança

`NfceLocalDraft` não é um XML autorizado, não contém assinatura digital e não substitui o leiaute oficial. O portal oficial já possui pacotes de schema e Notas Técnicas de 2025/2026 para QR Code, Reforma Tributária e evolução cadastral. Por isso o projeto não congela um XSD antigo nem simula autorização.

Produção e rede ficam desligadas por duas flags independentes:

```text
NFCE_ALLOW_PRODUCTION_PREPARATION=false
NFCE_ENABLE_SEFAZ_TRANSMISSION=false
```

## Próxima fatia, após configuração externa

1. Confirmar credenciamento e regras NFC-e da UF piloto.
2. Incorporar e versionar o pacote XSD oficial vigente no dia da homologação.
3. Configurar A1, QR Code/CSC conforme a regra vigente e endpoints do autorizador.
4. Renderizar o XML oficial, validar por XSD, assinar e enviar somente em homologação.
5. Persistir recibo, protocolo, rejeição e XML autorizado sem apagar a fonte local.
6. Implementar consulta, cancelamento, inutilização, contingência reconciliada e DANFE.
7. Liberar produção somente após casos aprovados e reconciliação ponta a ponta.
