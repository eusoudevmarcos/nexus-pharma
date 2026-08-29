# Fase 4 — DF-e, saneamento e recebimento de NF-e

## O que funciona sem configuração externa

- Importação de XML de NF-e ou resumo pelo portal e pela API.
- Validação estrutural, normalização e cálculo do SHA-256.
- Preservação imutável do XML original no PostgreSQL.
- Cruzamento com a matriz `NCM + CEST + UF + regime + operação + vigência`.
- Registro de diferenças entre XML e sugestão, sem reescrever a fonte.
- Aceite explícito da sugestão ou manutenção do valor recebido.
- Conferência física de produto, quantidade, lote, fabricação, validade e custo.
- Entrada transacional no estoque e criação da proveniência fiscal por lote.
- Criação pendente de Ciência e Confirmação para homologação sem envio acidental.

## O que exige configuração manual antes da conexão real

1. Aplicar as migrations em PostgreSQL com `npm run prisma:migrate:deploy`.
2. Definir `DFE_CERTIFICATE_ENCRYPTION_KEY` com 32 bytes aleatórios e guardá-la no cofre do Render.
3. Instalar o certificado A1 de cada CNPJ e confirmar cadeia, validade e senha.
4. Informar URLs oficiais de distribuição e recepção de evento para homologação e produção.
5. Homologar o CNPJ no serviço da SEFAZ e respeitar as regras de consumo do NSU.
6. Baixar, versionar e homologar os XSDs oficiais vigentes; o código atual valida estrutura e tipos suportados, mas ainda não executa validação XSD completa.
7. Popular e aprovar a matriz fiscal do DF com fontes legais reais. O repositório não inventa regras de ST, MVA ou benefício fiscal.
8. Somente depois dos testes, mudar `DFE_ENABLE_SEFAZ_TRANSMISSION=true`.

## Barreiras de segurança aplicadas

- Produção não transmite por padrão.
- Certificado e senha são cifrados com AES-256-GCM; a API nunca devolve o conteúdo.
- XML e hash não podem ser alterados após a captura.
- XML destinado a outro CNPJ é recusado quando o CNPJ da empresa está configurado.
- Divergências críticas, item sem produto, lote incompleto, validade inválida ou classificação mínima ausente bloqueiam a entrada.
- Aceitar uma sugestão altera somente o dado interno rastreável; nunca o XML do fornecedor.
- Ciência é criada ao iniciar a conferência e Confirmação apenas depois da conclusão física.

## Referências técnicas oficiais

- Portal Nacional da NF-e — Web Services do Ambiente Nacional: <https://www.nfe.fazenda.gov.br/portal/WebServices.aspx?tipoConteudo=o9MkXc%2BhmKs%3D>
- Portal Nacional da NF-e — Notas Técnicas: <https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=04BIflQt1aY%3D>
- Portal Nacional da NF-e — Esquemas XML: <https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w%3D>
