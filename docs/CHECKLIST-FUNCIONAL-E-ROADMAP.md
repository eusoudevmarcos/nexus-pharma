# Nexus Pharma — checklist funcional e roadmap de implementação

Este documento separa o que existe no código do que ainda depende de integração, homologação ou desenvolvimento. A demonstração visual da raiz (`app/`) não deve ser confundida com o portal SaaS de produção (`web/`) e a API persistente (`api/`).

## Legenda

- [x] Implementado e verificado no repositório.
- [~] Parcial: existe estrutura útil, mas falta integração, cobertura ou tela operacional para produção.
- [ ] Não implementado.
- **Bloqueador:** precisa estar concluído antes do primeiro cliente real.

## 1. Arquitetura SaaS, banco e multiempresa

### Já está pronto

- [x] API modular em Fastify e TypeScript.
- [x] PostgreSQL com Prisma como fonte do modelo de produção.
- [x] Dez migrations versionadas para identidade, operação, fiscal, faturamento, segurança, privacidade e rastreabilidade.
- [x] Estrutura declarativa do Render para API, banco e rotina diária.
- [x] Portal Next.js separado e preparado para Vercel.
- [x] Isolamento de dados por empresa e seleção explícita da empresa ativa.
- [x] Trilha de auditoria para operações sensíveis.
- [x] Verificação automatizada de build, modelo e contratos principais.

### Roadmap do que falta

- [ ] **Bloqueador:** provisionar PostgreSQL e API reais no Render.
- [ ] **Bloqueador:** aplicar `prisma migrate deploy` no ambiente final e executar o seed controlado.
- [ ] **Bloqueador:** publicar o portal na Vercel e configurar as origens HTTPS.
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

### Roadmap do que falta

- [ ] **Bloqueador:** configurar segredos fortes e exclusivos no ambiente de produção.
- [ ] Implementar recuperação e alteração de senha por fluxo seguro.
- [ ] Implementar MFA para proprietários, administradores e equipe interna.
- [ ] Adicionar política de senha, bloqueio adaptativo e confirmação de ações críticas.
- [ ] Executar SAST, DAST, análise de dependências e teste de intrusão independente.
- [ ] Planejar SSO corporativo e passkeys para uma fase posterior.

## 4. Usuários, permissões e áreas internas

### Já está pronto

- [x] Papéis da empresa: proprietário, administrador, gestor, financeiro, farmacêutico, operador e consulta.
- [x] Papéis internos: administração, desenvolvimento, helpdesk, financeiro e comercial.
- [x] Janelas separadas de Gestão, Operação, Fiscal, Alertas, Usuários e Privacidade.
- [x] Janelas internas separadas de Comercial, Suporte, Financeiro, Faturamento, Desenvolvimento, Monitoramento, Segurança, Privacidade e Go-live.
- [x] Convite, alteração de perfil, suspensão e reativação auditados.
- [x] Relatório de usuários e atividade dos últimos 30 dias.

### Roadmap do que falta

- [ ] Criar matriz visual de permissões por ação, não apenas por página.
- [ ] Permitir papéis personalizados sem quebrar os perfis padrão.
- [ ] Adicionar aprovação em duas etapas para permissões críticas.
- [ ] Criar exportação de acessos e revisão periódica obrigatória.
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

### Roadmap do que falta

- [ ] **Bloqueador operacional:** levar os formulários completos de categorias, produtos e lotes da demonstração para o portal de produção.
- [ ] Criar importação em massa por CSV/XLSX com pré-validação e relatório de erros.
- [ ] Criar histórico temporal e comparação visual entre versões de uma regra.
- [ ] Implementar aprovação em quatro olhos antes de aplicar alteração em massa.
- [ ] Criar simulação de impacto antes de propagar a categoria aos produtos.
- [ ] Adicionar GTIN, registro ANVISA quando aplicável, fabricante, fornecedor e composição/princípio ativo estruturados.

## 6. Catálogo legal nacional e matriz tributária

### Já está pronto

- [x] Catálogos internos de códigos CST PIS/COFINS, CST ICMS e CSOSN.
- [x] Estrutura persistente para entradas de catálogo, vigência, fonte e versão.
- [x] Conjunto inicial de naturezas de receita para medicamentos e higiene/perfumaria.
- [x] Conjunto inicial de cClassTrib e alíquotas IBS/CBS.
- [x] Testes que impedem combinações inválidas no conjunto atualmente coberto.

### Roadmap do que falta

- [ ] **Bloqueador fiscal:** substituir o conjunto inicial por tabelas oficiais completas, versionadas e homologadas.
- [ ] Criar sincronização e diff das tabelas oficiais de cClassTrib, CST IBS/CBS, alíquotas e notas técnicas.
- [ ] Modelar regras efetivas por `NCM + CEST + UF origem + UF destino + regime + tipo de operação + vigência`.
- [ ] Mapear ICMS-ST, MVA, FCP, benefícios, reduções, diferimento e antecipação por UF.
- [ ] Começar pelo Distrito Federal e pelos grupos de higiene, maquiagem e medicamentos; ampliar por UF somente após homologação.
- [ ] Guardar fonte oficial, dispositivo legal, hash do documento, data de captura e responsável pela aprovação.
- [ ] Criar alerta de regra vencida, revogada, conflitante ou sem fonte.
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
- [x] Oito testes específicos das decisões críticas da cadeia tributária.

### Roadmap do que falta

- [ ] Conectar a rastreabilidade ao XML oficial de entrada, e não a cadastro manual.
- [ ] Homologar todas as decisões com contador/tributarista e casos reais anonimizados.
- [ ] Ampliar testes para devolução, transferência, bonificação, perda, uso/consumo e operações interestaduais.
- [ ] Criar reconciliação entre entrada, estoque, saída, SPED e apuração mensal.
- [ ] Gerar dossiê de auditoria por item, com fundamento, evidências e quem aprovou.
- [ ] Bloquear venda quando a evidência necessária estiver ausente, vencida ou incompatível com a UF/operação.

> O objetivo do sistema é aplicar corretamente a legislação e impedir recolhimento duplicado ou indevido. Qualquer economia deve decorrer de enquadramento legal comprovado, nunca de ocultação, omissão ou classificação artificial.

## 8. Captura de DF-e e manifestação do destinatário

### Já está pronto

- [~] O banco consegue armazenar hash, snapshot, evidências e decisão fiscal depois que a origem é recebida.
- [~] A cadeia de revisão e aprovação pode ser reutilizada para documentos importados.

### Roadmap do que falta

- [ ] Criar cofre e rotação para certificado digital A1 por empresa.
- [ ] Implementar cliente SOAP/mTLS do `NFeDistribuicaoDFe` no Ambiente Nacional.
- [ ] Persistir `ultNSU`, `maxNSU`, documentos compactados, tentativas e bloqueios de consumo indevido.
- [ ] Validar cada XML com o XSD oficial vigente e armazenar XML bruto imutável.
- [ ] Implementar eventos de Ciência da Operação, Confirmação, Desconhecimento e Operação não Realizada.
- [ ] Criar fila de conferência física antes da manifestação conclusiva.
- [ ] Tratar cancelamento, carta de correção, duplicidade, indisponibilidade e reprocessamento idempotente.
- [ ] Separar NF-e, CT-e e MDF-e: possuem documentos, eventos e serviços próprios; não devem compartilhar regras técnicas por suposição.
- [ ] Criar painel de certificado, NSU, documentos pendentes e falhas de comunicação.

Referências oficiais:

- [Web services do Ambiente Nacional, incluindo NFeDistribuicaoDFe e RecepcaoEvento](https://www.nfe.fazenda.gov.br/portal/WebServices.aspx?tipoConteudo=o9MkXc%2BhmKs%3D)
- [Nota Técnica do serviço de distribuição de DF-e](https://www.nfe.fazenda.gov.br/Portal/exibirArquivo.aspx?conteudo=C%2FxkRclIh74%3D)
- [Esquemas XML oficiais](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w%3D)

## 9. Tradução e saneamento do XML de entrada

### Já está pronto

- [x] Funções de decisão para ST, monofásico, crédito e coerência do CFOP de saída.
- [x] Registro de divergência, evidência, revisão e regra aplicada.
- [~] A estrutura suporta o “de-para”, mas ainda recebe dados já estruturados pela API.

### Roadmap do que falta

- [ ] Criar parser seguro do XML e normalizador de emitente, destinatário, itens, impostos, lotes e totais.
- [ ] Comparar o XML do fornecedor com a matriz vigente na data da operação.
- [ ] Implementar cenários de conversão controlada de CFOP/CST sem alterar o XML original.
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

### Roadmap do que falta

- [ ] Conectar um modelo de IA real; hoje a sugestão visual é determinística e limitada ao catálogo local.
- [ ] Implementar RAG somente sobre fontes fiscais aprovadas e vigentes.
- [ ] Exigir citação verificável de fonte, trecho, vigência, UF e premissas em cada sugestão.
- [ ] Bloquear respostas que prometam “não pagar imposto” sem hipótese legal comprovada.
- [ ] Criar avaliação de compatibilidade entre descrição, composição, registro e NCM.
- [ ] Aprender com correções humanas sem transformar repetição em regra legal automática.
- [ ] Criar conjunto de avaliação com casos aprovados, contraditórios e adversariais.
- [ ] Monitorar confiança, concordância humana, economia homologada e incidentes por versão do modelo.

## 11. Venda, estoque, lotes e PDV

### Já está pronto

- [x] Serviço de processamento de venda idempotente.
- [x] Consumo de lotes por vencimento e baixa de estoque.
- [x] Retrato de custo, imposto, lucro e regra fiscal por item vendido.
- [x] Provisão mensal e criação de alerta de reposição.
- [x] Demonstração de frente de caixa e cálculo de margem/tributo.
- [x] Cadastro persistente de matriz, filiais e PDVs ativos.

### Roadmap do que falta

- [ ] **Bloqueador operacional:** construir a frente de caixa de produção conectada à API.
- [ ] Implementar abertura, sangria, suprimento, fechamento e conciliação de caixa.
- [ ] Integrar meios de pagamento, TEF/Pix, descontos, cancelamentos e devoluções.
- [ ] Criar cliente, CPF na nota, vendedor, farmacêutico e regras para produtos controlados quando aplicável.
- [ ] Criar reserva, transferência, inventário, perdas e ajuste de estoque com autorização.
- [ ] Implementar compras, fornecedores, pedidos, recebimento e contas a pagar.
- [ ] Definir operação offline e sincronização segura para indisponibilidade de internet.

## 12. Emissão de NFC-e

### Já está pronto

- [~] A venda já produz dados fiscais e uma memória imutável que poderão alimentar a emissão.
- [~] A arquitetura suporta adaptador de serviço externo, idempotência e auditoria.

### Roadmap do que falta

- [ ] Modelar documento fiscal, numeração, série, status, protocolo, recibo e eventos.
- [ ] Implementar certificado, CSC, QR Code, assinatura XML e autorização por UF.
- [ ] Gerar e validar XML conforme MOC, XSD e notas técnicas vigentes.
- [ ] Implementar autorização, rejeição, cancelamento, inutilização e consulta.
- [ ] Implementar contingência offline, reconciliação posterior e prevenção de duplicidade.
- [ ] Gerar DANFE NFC-e e disponibilizar impressão e envio digital.
- [ ] Incluir os campos IBS/CBS e validações vigentes da Reforma Tributária.
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

### Roadmap do que falta

- [ ] Calibrar parâmetros por empresa, loja, sazonalidade e prazo do fornecedor.
- [ ] Criar previsão por produto/loja e explicar os fatores usados.
- [ ] Integrar fornecedores, cotação, pedido de compra e acompanhamento de entrega.
- [ ] Considerar estoque em trânsito, múltiplas filiais, mínimo de compra e bonificações.
- [ ] Criar aprovação de pedido e limite financeiro por papel.
- [ ] Medir ruptura evitada, perda evitada, giro e acurácia da recomendação.

## 14. Relatórios do cliente

### Já está pronto

- [x] Janela de Gestão com receita, custo, tributo, lucro, margem, variação e produtos líderes.
- [x] Janela de Operação com vendas do dia, estoque, alertas e lotes a vencer.
- [x] Janela Fiscal com categorias, regras, pendências, análises e economia aprovada.
- [x] Janela de Usuários com perfis, situação e atividade.
- [x] Controle de acesso específico para cada relatório.
- [x] Indicadores calculados pela API sobre dados persistidos da empresa.

### Roadmap do que falta

- [ ] Criar filtros consistentes por período, loja, PDV, categoria e produto em todas as janelas.
- [ ] Adicionar drill-down até venda, item, lote, regra e evidência.
- [ ] Criar exportações PDF, XLSX e CSV com auditoria.
- [ ] Criar relatórios agendados e distribuição por e-mail.
- [ ] Implementar DRE gerencial, fluxo de caixa, curva ABC, giro, ruptura e perdas.
- [ ] Criar fechamento e reconciliação fiscal por competência.
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

- [ ] Criar janela completa do cliente para abrir, acompanhar e responder chamados.
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

### Fase 1 — colocar a fundação em ambiente de homologação

- [ ] Render + PostgreSQL + migrations + seed.
- [ ] Vercel + domínio de homologação + conexão segura com a API.
- [ ] E-mail, gateway, observabilidade e backups.
- [ ] Executar preflight até não existir item `BLOCKED`.

### Fase 2 — completar a operação do cliente no portal de produção

- [ ] Produtos, categorias, lotes, estoque, compras e PDV conectados à API.
- [ ] Relatórios com filtros, drill-down e exportação.
- [ ] Helpdesk do cliente e fluxos de aprovação.

### Fase 3 — saneador fiscal MVP do Distrito Federal

- [ ] Catálogo oficial versionado para higiene, maquiagem e medicamentos.
- [ ] Matriz DF por origem/destino, regime, NCM, CEST, operação e vigência.
- [ ] Casos de ST, monofásico e IBS/CBS homologados com evidências.
- [ ] Regra de bloqueio e simulação antes da alteração em massa.

### Fase 4 — DF-e, manifestação e saneamento de entrada

- [ ] Certificado A1, distribuição por NSU e XML imutável.
- [ ] Ciência, conferência física e manifestação conclusiva.
- [ ] Parser, de-para, divergência de fornecedor e rastreabilidade até a saída.

### Fase 5 — IA fiscal auditável

- [ ] RAG sobre fonte aprovada, citação e vigência obrigatórias.
- [ ] Sugestão aplicável somente com revisão humana.
- [ ] Avaliações, métricas de confiança e aprendizado controlado.

### Fase 6 — NFC-e e frente de caixa fiscal

- [ ] Emissão, autorização, contingência, cancelamento, inutilização e DANFE.
- [ ] Homologação por UF e Reforma Tributária.
- [ ] Conciliação entre venda, pagamento, NFC-e, estoque e apuração.

### Fase 7 — escala comercial

- [ ] Piloto controlado, contrato, onboarding e suporte com SLA.
- [ ] Rollout gradual por cliente e feature flags.
- [ ] Expansão fiscal estado a estado, sempre com homologação.

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

