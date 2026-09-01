# Nexus Pharma — checklist funcional e roadmap de implementação

Este documento separa o que existe no código do que ainda depende de integração, homologação ou desenvolvimento. A demonstração visual da raiz (`app/`) não deve ser confundida com o portal SaaS de produção (`web/`) e a API persistente (`api/`).

## Legenda

- [x] Implementado e verificado no repositório.
- [~] Parcial: existe estrutura útil, mas falta integração, cobertura ou tela operacional para produção.
- [ ] Não implementado.
- **Bloqueador:** precisa estar concluído antes do primeiro cliente real.

## Prioridade executiva atual

O caminho crítico foi reorganizado para concluir primeiro o diferencial operacional e fiscal do Nexus Pharma:

1. cadastros produtivos de produtos e categorias, estratégia comercial e IA orientada por evidências;
2. sincronização offline segura dos caixas;
3. SEFAZ, NFC-e e catálogos oficiais versionados;
4. migrations e homologação no Render, seguidas da publicação do portal na Vercel;
5. piloto controlado e expansão por UF.

A contabilidade avançada (plano de contas, centro de custo e DRE contábil formal) fica fora do caminho crítico. Permanecem no escopo atual contas a pagar, contas a receber, caixa, compras, perdas, margem e relatórios gerenciais suficientes para conduzir a operação.

## 1. Arquitetura SaaS, banco e multiempresa

### Já está pronto

- [x] API modular em Fastify e TypeScript.
- [x] PostgreSQL com Prisma como fonte do modelo de produção.
- [x] Migrations versionadas para identidade, operação, fiscal, faturamento, segurança, privacidade, rastreabilidade e DF-e.
- [x] Estrutura declarativa do Render para API, banco e rotina diária.
- [x] Portal Next.js separado e preparado para Vercel.
- [x] Isolamento de dados por empresa e seleção explícita da empresa ativa.
- [x] Trilha de auditoria para operações sensíveis.
- [x] Verificação automatizada de build, modelo e contratos principais.

### Roadmap do que falta

- [x] PostgreSQL e API provisionados no Render.
- [x] `prisma migrate deploy` e seed estão automatizados; a migration operacional mais recente foi aplicada e conferida no Render.
- [x] Portal publicado na Vercel, conectado à API e validado contra a mesma revisão da `main`.
- [ ] Criar ambientes separados de desenvolvimento, homologação e produção.
- [ ] Executar testes de carga, concorrência e isolamento entre empresas.
- [ ] Definir política de versionamento e compatibilidade da API.

## 2. Site institucional e entrada comercial

### Já está pronto

- [x] Página institucional responsiva com identidade Nexus Pharma.
- [x] Páginas de recursos, planos, segurança e login.
- [x] Metadados, sitemap, robots e manifesto web.
- [x] Apresentação dos quatro planos e adicionais de escala.
- [x] Botão de entrada para o portal autenticado.

### Roadmap do que falta

- [ ] Publicar domínio definitivo e configurar DNS, HTTPS e e-mails corporativos.
- [ ] Criar formulário comercial persistente, consentimento e pipeline de leads.
- [ ] Adicionar política de cookies, termos de uso, contrato SaaS e política de privacidade revisados juridicamente.
- [ ] Configurar analytics com consentimento, métricas de conversão e monitoramento de SEO.
- [ ] Produzir casos de uso, demonstração comercial e central pública de status.

## 3. Identidade, autenticação e segurança

### Já está pronto

- [x] Login com hash de senha e proteção contra enumeração por tempo.
- [x] JWT vinculado a sessão persistida e revogável.
- [x] Refresh token rotativo com detecção de reutilização.
- [x] Cookies seguros no portal, proteção de origem e headers restritivos.
- [x] Limite de sessões simultâneas, logout e revogação administrativa.
- [x] Convites com validade, uso único, hash e reenvio com rotação.
- [x] Perfis internos e perfis da empresa separados.
- [x] Central interna de eventos, falhas e sessões.
- [x] MFA TOTP para proprietários, administradores e equipe interna, com confirmação da senha na ativação.
- [x] Códigos de recuperação de uso único, segredo criptografado e bloqueio contra reutilização de código.
- [x] Confirmação reforçada por sessão para ações críticas e cobertura visível na Central de Segurança e no Go-live.

### Roadmap do que falta

- [ ] **Bloqueador:** configurar segredos fortes e exclusivos no ambiente de produção.
- [x] Recuperação e alteração de senha por token de uso único, expiração, auditoria e revogação das sessões anteriores.
- [~] Ampliar política de senha e bloqueio adaptativo; a confirmação de ações críticas já utiliza MFA/step-up.
- [ ] Executar SAST, DAST, análise de dependências e teste de intrusão independente.
- [ ] Planejar SSO corporativo e passkeys para uma fase posterior.

## 4. Usuários, permissões e áreas internas

### Já está pronto

- [x] Papéis da empresa: proprietário, administrador, gerente, compras, financeiro da farmácia, farmacêutico, caixa e auditoria/consulta.
- [x] Papéis internos: administração, desenvolvimento, helpdesk, financeiro e comercial.
- [x] Janelas separadas de Gestão, Operação, Fiscal, Alertas, Usuários e Privacidade.
- [x] Janelas internas separadas de Comercial, Suporte, Financeiro, Faturamento, Desenvolvimento, Monitoramento, Segurança, Privacidade e Go-live.
- [x] Convite, alteração de perfil, suspensão e reativação auditados.
- [x] Relatório de usuários e atividade dos últimos 30 dias.
- [x] Matriz visual por domínio e nível: consulta, operação, aprovação e administração.
- [x] Catálogo central versionado de perfis, responsabilidades, limites e áreas padrão.
- [x] Bloqueio de acesso direto de perfis Nexus ao tenant por simples identificador de empresa.
- [x] Autorizações fiscais, cadastrais, NFC-e, caixa e pós-venda alinhadas entre menu e API.
- [x] Fronteira documentada para o futuro portal B2B de fornecedores, sem reaproveitar perfis da farmácia.
- [x] Campanhas periódicas de recertificação com snapshot, hash, prazo, decisões individuais e detecção de divergências.
- [x] Exportação CSV da revisão com evidência, justificativa e responsável.
- [x] Revogação com confirmação explícita e conclusão em quatro olhos por outro administrador/proprietário.

### Roadmap do que falta

- [ ] Permitir papéis personalizados sem quebrar os perfis padrão.
- [x] Aprovação em quatro olhos combinada com MFA/step-up nas ações privilegiadas críticas.
- [x] Sessão de suporte temporária, consentida, justificada, limitada a diagnóstico e integralmente auditada.
- [ ] Homologar a matriz com usuários reais de cada perfil antes do piloto.
- [ ] Adicionar indicadores de SLA e produtividade para cada departamento interno.

## 5. Categorias fiscais e cadastro de produtos

### Já está pronto

- [x] Categorias fiscais herdadas pelos produtos vinculados.
- [x] Cadastro de NCM, CEST, classificação, vigência e versão da regra.
- [x] Regras por regime tributário.
- [x] CST PIS/COFINS unificado com seleção controlada.
- [x] Seletores controlados para CST ICMS, CSOSN, natureza da receita e cClassTrib.
- [x] Preenchimento derivado de alíquotas para combinações já catalogadas.
- [x] Validação de coerência entre NCM, natureza, CST IBS/CBS e cClassTrib.
- [x] Cadastro de produto com EAN, custo, preço, margem, estoque, lote, fabricação e vencimento na demonstração.
- [x] API persistente para criar, consultar e atualizar categorias e produtos.
- [x] Telas produtivas `/portal/produtos` e `/portal/categorias`, conectadas à API e separadas por abas operacionais.
- [x] Estoque protegido contra edição direta no cadastro; saldo muda somente pelos fluxos auditáveis de movimentação.
- [x] Estratégia comercial por produto: destaque, promoção, alta margem, alto giro, queima, prioridade por validade e lançamento.
- [x] Promoção vigente calculada novamente pela API no fechamento da venda e contexto comercial preservado no item.
- [x] Produtos estratégicos identificados e priorizados no seletor do caixa sem ignorar estoque, validade ou controle sanitário.

### Roadmap do que falta

- [x] Criar importação em massa por CSV/XLSX com pré-validação e relatório de erros.
- [x] Criar histórico imutável e comparação visual entre a regra atual e a versão de destino.
- [x] Implementar aprovação em quatro olhos antes de aplicar importação ou propagação fiscal em massa.
- [x] Criar simulação de impacto antes de propagar a categoria aos produtos, com bloqueio se a base mudar.
- [x] Estruturar GTIN, registro ANVISA, fabricante, fornecedor, composição e princípio ativo na importação e no banco.
- [x] Composição, princípio ativo, laboratório e registro ANVISA disponíveis no formulário individual e na importação em massa.

## 6. Catálogo legal nacional e matriz tributária

### Já está pronto

- [x] Catálogos internos de códigos CST PIS/COFINS, CST ICMS e CSOSN.
- [x] Estrutura persistente para entradas de catálogo, vigência, fonte e versão.
- [x] Conjunto inicial de naturezas de receita para medicamentos e higiene/perfumaria.
- [x] Conjunto inicial de cClassTrib e alíquotas IBS/CBS.
- [x] Testes que impedem combinações inválidas no conjunto atualmente coberto.
- [x] Matriz versionada por `NCM + CEST + UF origem + UF destino + regime + tipo de operação + vigência`, com prioridade, resultado e fontes.
- [x] Regra aprovada não pode ser alterada na mesma versão; qualquer revisão exige nova versão.

### Roadmap do que falta

- [ ] **Bloqueador fiscal:** substituir o conjunto inicial por tabelas oficiais completas, versionadas e homologadas.
- [~] Importação, hash e diff estão prontos para cClassTrib, CST, NCM, CEST e IBS/CBS; falta o conector periódico para baixar cada publicação oficial automaticamente.
- [x] Modelar regras efetivas por `NCM + CEST + UF origem + UF destino + regime + tipo de operação + vigência`.
- [~] Estruturas separadas de ICMS-ST, MVA, FCP, benefícios e reduções estão prontas; falta importar e homologar o conteúdo legal efetivo de cada UF.
- [~] O pacote de matriz do Distrito Federal está pronto e isolado; falta popular higiene, maquiagem e medicamentos com os dados oficiais homologados.
- [x] Guardar fonte oficial, dispositivo legal, hash do pacote, data da publicação, importador e responsável pela aprovação.
- [x] Criar alerta de regra ou item vencido, próximo do vencimento, conflitante, sem fonte, sem revisor ou com contagem divergente.
- [x] Exigir aprovação em quatro olhos para ativar catálogos e pacotes da matriz DF.
- [x] Painel interno `/portal/interno/catalogos-fiscais` com cobertura, pendências, vigências, conflitos e fontes primárias.
- [ ] Avaliar fornecedor especializado de conteúdo fiscal; o motor deve manter independência e trilha da origem da informação.

Referências oficiais a acompanhar:

- [Tabelas vigentes do Portal da NF-e, inclusive cClassTrib e alíquotas CBS](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=%2FNJarYc9nus%3D)
- [Notas Técnicas vigentes da NF-e/NFC-e](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=04BIflQt1aY%3D)

## 7. Rastreabilidade fiscal e prevenção de tributação duplicada

### Já está pronto

- [x] Registro de proveniência tributária por produto e lote.
- [x] Preservação do documento/snapshot recebido sem sobrescrever a origem.
- [x] Revisão humana e evidência obrigatória para aprovação fiscal.
- [x] Saldo fiscal consumido junto com o saldo físico do lote.
- [x] Bloqueio de saída com CST 60/CSOSN 500 sem retenção de ICMS-ST comprovada.
- [x] Bloqueio de novo débito de PIS/COFINS em revenda monofásica comprovada.
- [x] Bloqueio de crédito indevido em operação monofásica.
- [x] Validação de CFOP interno versus operação interestadual.
- [x] Retrato fiscal imutável vinculado à venda e cálculo separado de potencial protegido.
- [x] Onze testes específicos das decisões críticas da cadeia tributária e do núcleo DF-e.
- [x] A entrada concluída por NF-e cria lote, movimento de estoque e proveniência tributária vinculados ao hash do XML.

### Roadmap do que falta

- [x] Conectar a rastreabilidade ao XML importado/recebido e preservar a alternativa manual somente como contingência controlada.
- [ ] Homologar todas as decisões com contador/tributarista e casos reais anonimizados.
- [ ] Ampliar testes para devolução, transferência, bonificação, perda, uso/consumo e operações interestaduais.
- [ ] Criar reconciliação entre entrada, estoque, saída, SPED e apuração mensal.
- [ ] Gerar dossiê de auditoria por item, com fundamento, evidências e quem aprovou.
- [ ] Bloquear venda quando a evidência necessária estiver ausente, vencida ou incompatível com a UF/operação.

> O objetivo do sistema é aplicar corretamente a legislação e impedir recolhimento duplicado ou indevido. Qualquer economia deve decorrer de enquadramento legal comprovado, nunca de ocultação, omissão ou classificação artificial.

## 8. Captura de DF-e e manifestação do destinatário

### Já está pronto

- [x] Cofre de certificado A1 por empresa com AES-256-GCM, fingerprint, validade, ambiente e rotação do certificado ativo.
- [x] Cliente SOAP/mTLS configurável para `NFeDistribuicaoDFe`, com cursor por empresa/ambiente, `ultNSU`, `maxNSU` e intervalo de segurança.
- [x] Importação manual de XML para homologação e contingência sem depender de credenciais externas.
- [x] XML bruto e SHA-256 persistidos; trigger PostgreSQL impede alteração posterior da fonte.
- [x] Parser de resumo, NF-e completa e evento, com itens e grupos tributários separados das sugestões.
- [x] Eventos de Ciência, Confirmação, Desconhecimento e Operação não Realizada, assinados com o A1 e transmitidos somente quando a integração é explicitamente habilitada.
- [x] Conferência física por item com produto, quantidade, lote, fabricação, validade e custo; conclusão atualiza estoque e proveniência de forma transacional.
- [x] Painel do portal para fila de NF-e, XML, consulta SEFAZ, certificado, divergências e conferência.

### Roadmap do que falta

- [x] Criar cofre e rotação para certificado digital A1 por empresa.
- [x] Implementar cliente SOAP/mTLS do `NFeDistribuicaoDFe` no Ambiente Nacional.
- [x] Persistir `ultNSU`, `maxNSU`, documentos processados e bloqueios de consumo indevido.
- [~] Armazenar XML bruto imutável e validar estrutura/tipo; falta incorporar e versionar o pacote XSD oficial para validação completa offline.
- [x] Implementar eventos de Ciência da Operação, Confirmação, Desconhecimento e Operação não Realizada.
- [x] Criar fila de conferência física antes da manifestação conclusiva.
- [ ] Tratar cancelamento, carta de correção, duplicidade, indisponibilidade e reprocessamento idempotente.
- [ ] Separar NF-e, CT-e e MDF-e: possuem documentos, eventos e serviços próprios; não devem compartilhar regras técnicas por suposição.
- [~] Documentos e certificado já possuem tela; falta histórico técnico detalhado de cada chamada SOAP e do cursor NSU.

Referências oficiais:

- [Web services do Ambiente Nacional, incluindo NFeDistribuicaoDFe e RecepcaoEvento](https://www.nfe.fazenda.gov.br/portal/WebServices.aspx?tipoConteudo=o9MkXc%2BhmKs%3D)
- [Nota Técnica do serviço de distribuição de DF-e](https://www.nfe.fazenda.gov.br/Portal/exibirArquivo.aspx?conteudo=C%2FxkRclIh74%3D)
- [Esquemas XML oficiais](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w%3D)

## 9. Tradução e saneamento do XML de entrada

### Já está pronto

- [x] Funções de decisão para ST, monofásico, crédito e coerência do CFOP de saída.
- [x] Registro de divergência, evidência, revisão e regra aplicada.
- [x] Parser seguro normaliza emitente, destinatário, itens, NCM, CEST, CFOP e grupos de ICMS/PIS/COFINS sem reescrever a origem.
- [x] O “de-para” compara a NF-e com a matriz vigente e registra divergências com fonte, regra e valor sugerido.
- [x] A decisão humana “aceitar sugestão” ou “manter origem” alimenta a proveniência aplicada no estoque.

### Roadmap do que falta

- [x] Criar parser seguro do XML e normalizador de emitente, destinatário, itens, impostos e totais; lote/fabricação/validade são confirmados fisicamente.
- [x] Comparar o XML do fornecedor com a matriz vigente na data da operação.
- [x] Implementar conversão controlada de CFOP/CST por sugestão aprovada sem alterar o XML original.
- [ ] Criar pendência financeira quando houver imposto aparentemente cobrado de forma indevida.
- [ ] Criar regras de exceção por fornecedor, produto, UF e vigência.
- [ ] Impedir que um “de-para” automático transforme hipótese em fato sem evidência e aprovação.
- [ ] Medir falsos positivos, reversões humanas e impacto por regra.

## 10. Assistente de IA fiscal

### Já está pronto

- [x] Assistente compacto na tela de produtos e categorias.
- [x] Sugestão de categoria e NCM baseada em dados do cadastro na demonstração.
- [x] Botões explícitos para aceitar categoria/NCM e recalcular campos.
- [x] Persistência de análises, confiança, justificativa, evidências e revisão humana na API.
- [x] Aviso de que a sugestão depende de validação profissional.
- [x] Assistente local sem custo externo que recupera categoria, regra do regime, matriz de UF/operação e fontes aprovadas.
- [x] Confiança limitada, riscos explícitos e bloqueio de aprovação quando não existe fonte legal cadastrada.
- [x] Revisão humana auditada, rejeição justificada e substituição controlada de análises antigas.
- [x] Métricas de cobertura de fontes, confiança e concordância humana por empresa.

### Roadmap do que falta

- [ ] Conectar um modelo de IA real; hoje a sugestão visual é determinística e limitada ao catálogo local.
- [ ] Implementar RAG somente sobre fontes fiscais aprovadas e vigentes.
- [x] Implementar a etapa local de recuperação somente sobre fontes e regras cadastradas; conexão semântica/RAG externo permanece opcional.
- [~] Citação, vigência, UF e premissas já são estruturadas; falta guardar o trecho legal versionado para validação textual.
- [x] O motor local não gera promessa livre de “não pagar imposto” e mantém economia em zero sem cálculo homologado.
- [x] Criar avaliação de compatibilidade entre descrição, composição, registro ANVISA, categoria e NCM, com bloqueio de aprovação em caso de conflito.
- [x] Registrar correções humanas como memória consultiva e destacar recorrência sem transformar repetição em regra legal automática.
- [x] Registrar decisões e justificativas humanas sem promover repetição a regra legal automática.
- [x] Criar conjunto de avaliação com casos coerentes, contraditórios, incompletos e adversariais.
- [~] Confiança, concordância e cobertura de fontes já são monitoradas; falta correlacionar incidentes e economia homologada por versão.

## 11. Venda, estoque, lotes e PDV

### Já está pronto

- [x] Serviço de processamento de venda idempotente.
- [x] Consumo de lotes por vencimento e baixa de estoque.
- [x] Retrato de custo, imposto, lucro e regra fiscal por item vendido.
- [x] Provisão mensal e criação de alerta de reposição.
- [x] Demonstração de frente de caixa e cálculo de margem/tributo.
- [x] Cadastro persistente de matriz, filiais e PDVs ativos.
- [x] Sessão operacional com abertura e limite de um caixa aberto por PDV.
- [x] Venda e pagamentos registrados na mesma transação do estoque e da memória fiscal.
- [x] Suprimento e sangria idempotentes, com motivo, usuário e auditoria.
- [x] Fechamento conciliado por dinheiro, Pix, crédito, débito, vale e outros.
- [x] Diferenças por meio não são mascaradas por compensação no total geral.
- [x] Conciliação imutável por hash e revisão gerencial separada.
- [x] Janela `/portal/caixa` com carrinho, recebimentos, gaveta, fechamento e histórico.
- [x] Desconto com preço original preservado, limite por perfil e validação novamente na API.
- [x] Cancelamento total e devolução parcial sem apagar a venda original.
- [x] Recomposição transacional de produto, lote, proveniência fiscal, movimento, provisão e caixa.
- [x] Itens avariados, vencidos ou não vendáveis ficam registrados sem retornar ao estoque disponível.
- [x] Reembolso em dinheiro afeta a gaveta; Pix/cartões ficam bloqueados até confirmação real do provedor.
- [x] NFC-e autorizada gera pendência fiscal e nunca é marcada como cancelada sem evento oficial.
- [x] Janela `/portal/pos-venda` separa operação, pendências fiscais e reembolsos externos.
- [x] Consumidor opcional na venda comum e obrigatório quando a política do produto exigir identificação.
- [x] Vendedor ativo registrado na venda e preservado no snapshot operacional.
- [x] Credencial farmacêutica com conselho, registro, UF, vigência, status e verificação gerencial.
- [x] Política de controle por produto com versão, fundamento, identificação, receita, retenção, idade e farmacêutico.
- [x] Prescrição e confirmação de retenção gravadas em registro imutável por item controlado.
- [x] Bloqueio transacional quando comprador, idade, prescrição ou responsável não atendem à política.
- [x] Janela `/portal/controle-medicamentos` para políticas, credenciais e trilha de vendas controladas.

### Roadmap do que falta

- [~] A frente de caixa está conectada à API; falta piloto em dispositivos e operação real da loja.
- [x] Implementar abertura, sangria, suprimento, fechamento e conciliação de caixa.
- [~] Dinheiro, Pix, cartões, vale e outros já são registrados; descontos e estornos locais estão prontos, mas confirmação/desfazimento TEF e Pix ainda dependem do provedor.
- [~] Consumidor/CPF, vendedor, farmacêutico e regras configuráveis estão prontos; falta integrar os registros oficiais externos exigidos para cada classe após homologação profissional.
- [x] Criar reserva, transferência, inventário, perdas e ajuste de estoque com autorização.
- [x] Separar saldo físico, reservado, disponível e em trânsito por loja e lote.
- [x] Exigir segundo usuário no recebimento de transferência e na aprovação de divergências.
- [x] Fornecedores, pedidos, aprovação, recebimento fiscal e contas a pagar integrados.
- [x] Operação offline segura com app shell instalável e rota local `/caixa-offline` para reabrir a interface sem conexão.
- [x] Banco local IndexedDB criptografado com AES-GCM, fila de comandos e identificadores idempotentes gerados no dispositivo.
- [x] Snapshot versionado de catálogo, preços, regras fiscais, saldo disponível e bloqueios sanitários.
- [x] Revalidação no servidor e conflito explícito sem sobrescrever venda, saldo ou evidência confirmados.
- [x] Estado online/offline, validade do snapshot, tamanho da fila e ação de sincronização visíveis no caixa.
- [x] Venda controlada, pagamento externo, regra divergente, snapshot vencido e saldo não confiável são bloqueados offline.
- [x] Fechamento do caixa bloqueado enquanto existirem comandos offline locais ou recebidos ainda pendentes.
- [x] Gestão administrativa no caixa para suspender, revogar e reativar dispositivos; dispositivo bloqueado não sincroniza.
- [x] App shell offline instalável, cache restrito à interface genérica e ativos estáticos, sem armazenar HTML autenticado do portal.
- [x] PIN local de seis dígitos derivado com PBKDF2 e payload criptografado por AES-GCM; dados não são exibidos antes do desbloqueio.
- [ ] Executar piloto em dispositivos reais, incluindo queda de energia, relógio incorreto, fila longa e conexão intermitente.

## 12. Emissão de NFC-e

### Já está pronto

- [x] A venda produz dados fiscais e uma memória imutável que alimenta a preparação sem recálculo paralelo.
- [x] Documento local, série, numeração serializada, chave de 44 dígitos, status e tentativas foram modelados.
- [x] Preparação idempotente por venda/ambiente, payload SHA-256 e trigger de imutabilidade.
- [x] CPF/CNPJ do consumidor, meio de pagamento, emissão normal e contingência offline entram na pré-validação.
- [x] Central `/portal/nfce` separa vendas elegíveis, rascunhos e bloqueios operacionais.
- [x] Transmissão permanece bloqueada por padrão e cada tentativa é auditada.

### Roadmap do que falta

- [~] Completar eventos, recibos e transições após integrar o autorizador homologado.
- [ ] Implementar certificado, CSC, QR Code, assinatura XML e autorização por UF.
- [~] O XML local de conferência está disponível; gerar, assinar e validar o XML oficial exige incorporar o XSD vigente.
- [ ] Implementar autorização, rejeição, cancelamento, inutilização e consulta.
- [~] A contingência já pode ser preparada e distinguida na chave; falta transmissão posterior e reconciliação com a SEFAZ.
- [ ] Gerar DANFE NFC-e e disponibilizar impressão e envio digital.
- [~] IBS/CBS e `cClassTrib` são preservados no payload; falta validar o leiaute oficial vigente.
- [ ] Homologar em ambiente de testes de cada UF antes de liberar produção.

Referência oficial: [Manual de Orientação do Contribuinte — NF-e e NFC-e](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=ndIjl%2BiEFdE%3D)

## 13. Alertas, compras e inteligência de estoque

### Já está pronto

- [x] Rotina diária idempotente com histórico de execução.
- [x] Alertas de estoque baixo e oportunidade de compra com margem a partir de 25%.
- [x] Cobertura estimada e sugestão de quantidade para 30 dias.
- [x] Alertas progressivos de vencimento em 90, 60 e 30 dias.
- [x] Sinalização de faturas vencidas.
- [x] Encerramento automático quando a condição deixa de existir.
- [x] Central de alertas com reconhecimento pelo usuário.
- [x] Central de compras por loja com saldo físico, reservado, disponível e pedidos aprovados em trânsito.
- [x] Fornecedor, prazo de entrega, pedido mínimo, embalagem, último custo e vínculo preferencial por produto.
- [x] Pedido em rascunho, aprovação gerencial, cancelamento justificado e recebimento parcial/concluído.
- [x] Vínculo seguro com NF-e conferida, validando CNPJ e sem duplicar a entrada no estoque.
- [x] Título em rascunho criado pela NF-e recebida, sem presumir vencimento ou forma de pagamento.
- [x] Parcelamento validado, baixa total/parcial, cancelamento sem pagamento e estorno por segundo usuário.
- [x] Janela própria do financeiro do cliente com vencidos, próximos vencimentos, saldo aberto e histórico.
- [x] Cotação concorrencial por loja, produto e quantidade com no mínimo dois fornecedores.
- [x] Proposta com preço, frete, descontos, bonificação, tributo não recuperável, condição e prazo.
- [x] Custo líquido total/unitário, rateios auditáveis, comparação e estimativa de margem.
- [x] Proposta vencedora convertida em pedido aprovado, preservando memória das demais propostas.
- [x] Devolução vinculada à NF-e com escolha de um, alguns ou todos os itens.
- [x] Quantidade total ou fracionada por item, limitada pelo saldo físico, reservado e fiscal.
- [x] Reversão transacional de estoque, lote, pedido, proveniência e saldo financeiro ainda aberto.
- [x] Crédito pendente ao fornecedor quando o valor já foi pago ou não existe título disponível.
- [x] Rascunho fiscal de devolução com chave e item da NF-e original, sem simular autorização SEFAZ.

### Roadmap do que falta

- [x] Loja, cobertura, prazo, embalagem, sazonalidade e promoções calibram a sugestão de compra.
- [x] A previsão por produto/loja explica saldo, reservas, trânsito, venda em 30 dias, cobertura, margem, prazo e ajustes sazonais/promocionais.
- [~] Fornecedores, cotação, pedidos e recebimento estão integrados; falta acompanhamento externo da entrega.
- [x] Estoque em trânsito, múltiplas filiais, mínimo de compra e bonificações entram na operação.
- [x] Aprovação de pedido por papel e limite financeiro configurável, com escalonamento ao proprietário.
- [x] Ruptura evitada, perda evitada, giro e acurácia da recomendação medidos pelo ciclo diário.
- [ ] Integrar conta bancária, boleto/Pix, conciliação e confirmação externa dos pagamentos.
- [ ] **Adiado:** centro de custo, plano de contas, retenções e DRE contábil formal; não bloqueiam o ecossistema operacional atual.
- [ ] Autorizar a NF-e de devolução modelo 55 na SEFAZ após homologação do emissor e das regras tributárias.
- [ ] Compensar e conciliar externamente os créditos de devoluções já pagas.

## 14. Relatórios do cliente

### Já está pronto

- [x] Janela de Gestão com receita, custo, tributo, lucro, margem, variação e produtos líderes.
- [x] Janela de Operação com vendas do dia, estoque, alertas e lotes a vencer.
- [x] Janela Fiscal com categorias, regras, pendências, análises e economia aprovada.
- [x] Janela de Usuários com perfis, situação e atividade.
- [x] Controle de acesso específico para cada relatório.
- [x] Indicadores calculados pela API sobre dados persistidos da empresa.

### Roadmap do que falta

- [x] Gestão possui filtros padronizados por período, loja, PDV, categoria, produto e vendedor.
- [x] Drill-down gerencial alcança venda, item, lote e contexto fiscal preservado.
- [x] Exportações CSV, XLSX e PDF disponíveis e auditadas.
- [ ] Criar relatórios agendados e distribuição por e-mail.
- [~] DRE gerencial, recebimentos, curva ABC e perdas prontos; giro e ruptura históricos permanecem pendentes.
- [~] Fechamento gerencial imutável por competência pronto; reconciliação fiscal oficial permanece pendente.
- [ ] Definir indicadores, fórmulas e permissões em um dicionário de dados.

## 15. Comercial, onboarding, planos e faturamento SaaS

### Já está pronto

- [x] Planos Basic, Smart, Fiscal Inteligente e Ultimate no seed.
- [x] Mensalidades, setup, módulos e Success Fee modelados.
- [x] Uma loja e um PDV por loja incluídos.
- [x] R$ 1.000 por filial adicional ativa e R$ 280 por PDV extra ativo.
- [x] Setup comum de R$ 890 e Ultimate com entrada de R$ 5.000 + 4 parcelas de R$ 1.250.
- [x] Success Fee de 10% somente sobre economia verificada com evidências.
- [x] Fatura discriminada, memória de cálculo e idempotência por competência.
- [x] Pipeline comercial, ativação do contrato e cronograma de onboarding.
- [x] Webhook financeiro com HMAC, janela temporal e proteção contra repetição.

### Roadmap do que falta

- [ ] **Bloqueador comercial:** escolher e conectar o gateway real de cobrança.
- [ ] Validar assinatura nativa do provedor antes de normalizar o webhook interno.
- [ ] Criar cobrança recorrente, boleto/Pix, nota fiscal de serviço e conciliação bancária.
- [ ] Definir no contrato regras de competência, atraso, suspensão, reajuste e ausência de pró-rata.
- [ ] Criar cupons, negociação, troca de plano, cancelamento e reativação.
- [ ] Automatizar régua de cobrança e comunicação de inadimplência.

## 16. E-mail e comunicação transacional

### Já está pronto

- [x] Fila persistente e auditável de entregas.
- [x] Adaptador HTTP genérico para relay de e-mail.
- [x] Convite manual seguro quando não existe relay configurado.
- [x] Registro de tentativas, resposta do provedor e incidentes.

### Roadmap do que falta

- [ ] **Bloqueador:** escolher o provedor e configurar relay, chave, remetente, SPF, DKIM e DMARC.
- [ ] Criar templates versionados para convite, cobrança, segurança, alertas e suporte.
- [ ] Processar bounce, complaint, unsubscribe e supressão.
- [ ] Criar preferências de comunicação por usuário sem desativar avisos obrigatórios de segurança.

## 17. Helpdesk e atendimento

### Já está pronto

- [x] Tickets, mensagens, prioridade, área, responsável e status persistidos.
- [x] API de abertura e consulta de tickets pelo cliente.
- [x] Fila interna para helpdesk com atribuição e mudança de status.
- [x] Auditoria das ações internas.

### Roadmap do que falta

- [x] Janela do cliente para abrir, acompanhar e responder chamados, com histórico e estados operacionais.
- [ ] Implementar anexos seguros, tipos permitidos, antivírus e retenção.
- [ ] Criar SLA por plano, escalonamento, plantão e notificações.
- [ ] Criar base de conhecimento e vínculo entre incidente, release e ticket.
- [ ] Medir primeira resposta, resolução, reabertura e satisfação.

## 18. Desenvolvimento, releases e liberações

### Já está pronto

- [x] Cadastro de releases e estado de aprovação.
- [x] Aprovações por área e liberação por cliente.
- [x] Área interna de desenvolvimento separada.
- [x] Registro de incidentes e vínculo operacional para acompanhamento.

### Roadmap do que falta

- [ ] Integrar CI/CD, testes, artefato, commit e deployment à release.
- [ ] Criar feature flags por cliente e rollout gradual.
- [ ] Implementar aprovação obrigatória de segurança e fiscal para mudanças críticas.
- [ ] Criar rollback automatizado e registro do resultado.
- [ ] Criar portal de desenvolvedores externo, chaves com escopo, quotas e documentação versionada.

## 19. Observabilidade e operação da plataforma

### Já está pronto

- [x] Health checks de processo e banco.
- [x] Endpoint protegido de métricas.
- [x] Agrupamento de falhas por impressão digital.
- [x] Reabertura automática de incidente recorrente.
- [x] Central interna para assumir e resolver incidentes.
- [x] Preflight de produção com resultado `PASS`, `WARN` ou `BLOCKED`.

### Roadmap do que falta

- [ ] **Bloqueador:** conectar logs, métricas e alertas a um serviço externo.
- [ ] Definir SLOs de disponibilidade, latência, erros e filas.
- [ ] Criar alertas de negócio para falha fiscal, atraso de DF-e, emissão e faturamento.
- [ ] Adicionar tracing distribuído e correlação por requisição, empresa e operação.
- [ ] Criar runbooks, escala de plantão e página pública de status.

## 20. Privacidade, continuidade e recuperação

### Já está pronto

- [x] Protocolos para direitos do titular e prazos operacionais.
- [x] Fluxo interno de análise, conclusão, rejeição e retenção justificada.
- [x] Agenda e registro de testes de recuperação.
- [x] Documentação de go-live, RPO/RTO e rollback.

### Roadmap do que falta

- [ ] **Bloqueador:** contratar backup/PITR compatível com produção e comprovar restauração isolada.
- [ ] Criar inventário de dados, bases legais, operadores e prazo por classe de dado.
- [ ] Automatizar exportação e anonimização com revisão de segurança.
- [ ] Criar plano de resposta a incidente e comunicação de violação.
- [ ] Realizar teste de recuperação no mínimo trimestral e guardar evidências.
- [ ] Revisar LGPD, contratos e responsabilidades com assessoria jurídica.

## Ordem recomendada das próximas fases

### Fase 0 — correções e linha de base

- [x] Reposicionar o aviso de salvamento no topo central, sem sobrepor a IA.
- [x] Compilar demonstração, API e portal.
- [x] Executar os testes fiscais existentes.
- [ ] Congelar um conjunto de casos fiscais reais anonimizados para homologação.

### Fase 1 — cadastros produtivos e estratégia comercial

- [x] Categorias e produtos persistentes no portal de produção.
- [x] Catálogos controlados e herança fiscal por categoria.
- [x] Estratégia comercial, vigência e preço promocional auditável.
- [x] Identificação dos produtos estratégicos no caixa.
- [x] Importação em massa e simulação de propagação fiscal.

### Fase 2 — caixa offline e sincronização

- [x] Banco local criptografado, fila idempotente e sessão do PDV vinculada ao dispositivo.
- [x] Snapshot versionado de catálogo, preço, regra, controle sanitário e saldo vendável.
- [x] Protocolo de envio, confirmação, retentativa e resolução explícita de conflitos.
- [x] Indicadores operacionais e bloqueio seguro quando o snapshot estiver vencido.
- [x] App shell instalável, PIN local e gestão administrativa dos dispositivos.
- [ ] Piloto de resiliência em hardware real antes de liberar o modo offline comercialmente.

### Fase 3 — SEFAZ, NFC-e e catálogos oficiais

- [x] Configuração separada por empresa, UF e ambiente, com endpoints HTTPS, série, QR Code v2/v3 e CSC criptografado quando aplicável.
- [x] Checklist de prontidão unificando cadastro fiscal, certificado A1, configuração, catálogos ativos e homologação.
- [x] Ciclo versionado dos catálogos oficiais: descoberta, importação com hash, comparação, revisão, ativação e substituição.
- [x] Governança fiscal interna com fontes governamentais permitidas, quatro olhos, alertas de cobertura/vigência/conflito e painel de homologação.
- [ ] Homologar certificado, QR Code, assinatura, XSDs e endpoints reais por UF.
- [ ] Completar autorização, rejeição, cancelamento, inutilização, DANFE e reconciliação da contingência.
- [~] Fontes oficiais de IBS/CBS, cClassTrib e meios de pagamento estão registradas e versionáveis; falta importar e homologar o conteúdo integral publicado.
- [ ] Popular e homologar a matriz tributária do escopo piloto com evidências.

### Fase 4 — IA fiscal e comercial evoluída

- [x] Sugestão local explicável, aplicação humana e métricas de decisão.
- [x] Compatibilidade entre descrição, composição, registro sanitário, categoria e NCM, com candidato somente quando localizado no catálogo oficial ativo.
- [x] Aprendizado assistido por correções, sem transformar repetição em lei ou alterar cadastro automaticamente.
- [x] Ranking Nexus combina margem, giro, ruptura, validade, sazonalidade e aderência de reposição, com pontuação e justificativa visíveis.
- [~] Conjunto de avaliação fiscal iniciado com casos coerentes, contraditórios, incompletos e adversariais; falta ampliar com casos comerciais e amostras homologadas.

### Fase 5 — fundação em ambiente de homologação

- [x] Blueprint Render com PostgreSQL pago, PITR declarado, migrations em pre-deploy, seed inicial e Cron Job.
- [x] Contrato Vercel com build Next.js, região alinhada à API e verificação da ponte `/api/health`.
- [x] Quality gate de API, Prisma e frontend preparado para o repositório Git.
- [ ] Conectar o repositório, confirmar os custos e criar os projetos reais na Render e na Vercel.
- [ ] Definir domínios e segredos reais e executar o primeiro deploy.
- [ ] E-mail, gateway, observabilidade e backups.
- [ ] Executar preflight até não existir item `BLOCKED`.

### Fase 6 — completar a operação do cliente no portal de produção

- [x] Produtos, categorias, lotes, estoque, cotação, compras, contas a pagar e PDV estão conectados à API.
- [x] Perfis de proprietário, administrador, gestor, compras, financeiro, farmacêutico, caixa e consulta possuem menus e rotas segregados.
- [x] O caixa abre diretamente no PDV e não acessa alertas, compras, estoque administrativo ou recebimento de NF-e.
- [x] Painel de controle reúne ruptura, giro, margem, lotes a vencer e sugestão de compra ajustada ao saldo aproveitável antes do vencimento.
- [x] Gestão possui filtros, drill-down detalhado e exportações auditadas em CSV, PDF e XLSX.
- [x] Helpdesk do cliente, respostas, estados e consentimento de suporte temporário implementados.
- [ ] Homologar a matriz de permissões com usuários reais de cada perfil e registrar os casos de aceite.

### Fase 7 — saneador fiscal MVP do Distrito Federal

- [~] Importador e governança do catálogo oficial estão prontos; falta carregar e homologar o conteúdo integral para higiene, maquiagem e medicamentos.
- [x] Estrutura, API e cruzamento da matriz DF por origem/destino, regime, NCM, CEST, operação e vigência.
- [ ] Popular e homologar o conteúdo legal efetivo da matriz do DF.
- [ ] Casos de ST, monofásico e IBS/CBS homologados com evidências.
- [x] Regra de bloqueio e simulação antes da alteração em massa.

### Fase 8 — DF-e, manifestação e saneamento de entrada

- [x] Cofre A1, cliente de distribuição por NSU e XML imutável.
- [x] Ciência, conferência física e manifestação conclusiva.
- [x] Parser, de-para, divergência de fornecedor e rastreabilidade até a saída.
- [ ] Homologar certificado, endpoints, XSDs e eventos reais antes de ativar transmissão.

### Fase 9 — IA fiscal auditável

- [x] Recuperação local sobre fonte aprovada, citação e vigência cadastradas, sem API paga.
- [x] Sugestão aplicável somente com revisão humana e sem alteração automática do cadastro.
- [x] Métricas de confiança, cobertura de fontes, concordância e decisões humanas auditadas.
- [ ] Avaliar RAG semântico externo apenas quando o catálogo homologado justificar o custo.

### Fase 10 — NFC-e e frente de caixa fiscal

- [x] Fundamento local: numeração, chave, payload, XML de conferência, idempotência, hash e auditoria.
- [x] Proteções: preparação de produção e transmissão SEFAZ desligadas por padrão.
- [x] Governança: configuração homologatória auditada, segredo protegido, painel de prontidão e catálogo oficial que só entra no cálculo após ativação interna.
- [~] Emissão: preparação e contingência local prontas; autorização, cancelamento, inutilização e DANFE dependem da homologação externa.
- [x] Caixa local: abertura, venda transacional, recebimentos, sangria, suprimento, fechamento e conciliação por meio.
- [x] Gestão: histórico de fechamentos, divergência justificada e revisão gerencial auditada.
- [x] Pós-venda local: desconto por perfil, cancelamento total, devolução parcial, recomposição de origem e pendências externas explícitas.
- [x] Contexto da dispensação: consumidor, vendedor, farmacêutico verificado e política controlada por produto.
- [ ] Homologação por UF e Reforma Tributária.
- [~] Venda, pagamento e estoque já estão conciliados; falta autorização NFC-e e fechamento fiscal por competência.

### Fase 11 — escala comercial

- [ ] Piloto controlado, contrato, onboarding e suporte com SLA.
- [ ] Rollout gradual por cliente e feature flags.
- [ ] Expansão fiscal estado a estado, sempre com homologação.
- [~] Painel Prime preservado como demonstração futura, desligado por padrão por `PRIME_ENABLED`/`NEXT_PUBLIC_PRIME_ENABLED`; a expansão funcional permanece fora do escopo atual.
- [ ] Ranking comercial neutro e auditável, sem fornecedor fixo ou preferência oculta por laboratório.

## Critério para declarar o SaaS pronto para o primeiro cliente

O sistema só deve ser considerado pronto quando todos os itens abaixo estiverem concluídos:

- [ ] Preflight de produção com `ready: true` e nenhum bloqueio.
- [ ] Backup restaurado e comprovado em ambiente isolado.
- [ ] Autenticação, permissões, isolamento multiempresa e auditoria testados.
- [ ] Fluxo real de produto → entrada/lote → venda → estoque → relatório concluído.
- [ ] Regra fiscal do escopo piloto homologada por responsável técnico.
- [ ] E-mail, cobrança e observabilidade funcionando com provedores reais.
- [ ] Termos, privacidade, suporte, SLA e responsabilidades contratuais aprovados.
- [ ] Piloto sem dados sensíveis concluído antes do primeiro cliente real.
