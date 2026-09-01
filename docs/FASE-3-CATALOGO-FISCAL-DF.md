# Fase 3 — Catálogo fiscal oficial e matriz do Distrito Federal

## Objetivo

Separar três responsabilidades que não podem ser confundidas:

1. publicação oficial bruta, como NCM, CEST, CST e cClassTrib;
2. interpretação aplicável ao Distrito Federal;
3. regra efetivamente liberada para cálculo e sugestão ao cliente.

Uma importação nunca altera a tributação de clientes. Ela entra em `UNDER_REVIEW`, recebe hash SHA-256 e somente outro usuário com papel interno autorizado pode homologá-la.

## Catálogos controlados

- NCM e CEST;
- CST ICMS e CSOSN;
- CST PIS/COFINS e Natureza da Receita;
- CST/cClassTrib e alíquotas IBS/CBS;
- ICMS-ST, MVA, FCP, reduções e benefícios do Distrito Federal;
- meios de pagamento e esquema NFC-e, mantidos para a futura fase de homologação.

O conteúdo inicial codificado no produto continua sendo apenas uma referência de demonstração. Produção exige versão oficial ativa.

## Fontes aceitas

O importador aceita somente HTTPS sem credenciais embutidas e domínio governamental `.gov.br`. As fontes primárias acompanhadas inicialmente são:

- Portal Nacional da NF-e;
- Receita Federal;
- CONFAZ;
- SINJ/DF;
- Classificação Fiscal de Mercadorias/Siscomex.

## Fluxo dos catálogos

1. Desenvolvimento importa uma publicação identificando versão, URL, data e itens.
2. O serviço normaliza códigos e NCMs, rejeita duplicidades e vigências invertidas e calcula o hash.
3. A comparação mostra códigos adicionados, alterados e removidos diante da versão ativa.
4. Um administrador interno diferente do importador revisa e ativa.
5. A versão anterior vira `SUPERSEDED`; os itens anteriores deixam de ser ativos, sem apagar o histórico.

Rotas internas:

- `GET /api/v1/interno/fiscal/saude`
- `POST /api/v1/interno/fiscal/catalogos/importar`
- `GET /api/v1/interno/fiscal/catalogos/:id/diferencas`
- `POST /api/v1/interno/fiscal/catalogos/:id/ativar`

## Pacote da matriz DF

Cada regra exige:

- NCM e CEST quando aplicável;
- UF de origem, destino DF, regime e operação;
- início e fim de vigência;
- resultado ICMS estruturado com indicação de ST, CST ou CSOSN, alíquota, FCP, redução, MVA e benefício quando aplicáveis;
- URL oficial, dispositivo legal, versão da fonte e hash do pacote;
- importador, revisor, data e parecer de homologação.

Rotas internas:

- `POST /api/v1/interno/fiscal/matriz-df/importar`
- `POST /api/v1/interno/fiscal/matriz-df/pacotes/:hash/aprovar`

O mesmo usuário não consegue importar e aprovar. Uma regra já aprovada é imutável na mesma versão. Resultado divergente no mesmo recorte e vigência sobreposta bloqueia a aprovação.

## Alertas automáticos

O diagnóstico calcula, sem editar dados:

- catálogo obrigatório sem versão ativa;
- quantidade do manifesto diferente da quantidade armazenada;
- versão ativa sem publicação, hash ou revisor;
- item vencido ou a vencer em até 45 dias;
- mesmo padrão NCM associado a códigos concorrentes;
- regra DF aprovada após o fim da vigência;
- regra sem fonte governamental, referência, hash ou revisão;
- regras aprovadas com mesmo recorte, vigência sobreposta e resultados diferentes.

Qualquer alerta crítico deixa `readyForProduction` como falso. O painel fica em `/portal/interno/catalogos-fiscais`.

## O que ainda depende de trabalho externo

- baixar e transformar o conteúdo integral de cada publicação oficial;
- homologar a interpretação com profissional tributário responsável;
- iniciar o piloto por medicamentos, higiene e maquiagem do DF;
- acompanhar revogações e novas publicações por rotina agendada;
- ampliar para outras UFs somente após os casos do DF estarem aprovados.
