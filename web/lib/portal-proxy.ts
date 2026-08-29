import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "./api";
import { sessionCookieNames } from "./session-cookies";

export async function proxyPortal(path: string, init: RequestInit) {
  const jar = await cookies();
  const token = jar.get(sessionCookieNames.access)?.value;
  const companyId = jar.get(sessionCookieNames.company)?.value;
  if (!token || !companyId) {
    return NextResponse.json({ message: "Sessão ou empresa não selecionada." }, { status: 401 });
  }
  if (!apiUrl()) return NextResponse.json({ message: "API não configurada." }, { status: 503 });
  const upstream = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: {
      ...(init.body && { "content-type": "application/json" }),
      authorization: `Bearer ${token}`,
      "x-company-id": companyId,
    },
    cache: "no-store",
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: "API indisponível." }, { status: 503 });
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  const contentType = upstream.headers.get("content-type") ?? "";
  if (upstream.ok && (contentType.includes("application/xml") || contentType.includes("text/xml"))) {
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: {
        "content-type": contentType,
        ...(upstream.headers.get("content-disposition") ? { "content-disposition": upstream.headers.get("content-disposition")! } : {}),
        "cache-control": "no-store, max-age=0",
      },
    });
  }
  if (upstream.ok && contentType.includes("text/csv")) {
    return new NextResponse(await upstream.text(), { status: upstream.status, headers: { "content-type": contentType, "content-disposition": upstream.headers.get("content-disposition") ?? "attachment", "cache-control": "no-store, max-age=0" } });
  }
  const body = await upstream.json().catch(() => ({})) as { erro?: string; message?: string; validacoes?: Array<{ message?: string }> };
  if (!upstream.ok) {
    const messages: Record<string, string> = {
      USUARIO_JA_VINCULADO: "Este usuário já pertence à empresa.",
      CONVITE_JA_ENVIADO: "Já existe um convite válido para este e-mail.",
      ULTIMO_PROPRIETARIO: "A empresa precisa manter ao menos um proprietário ativo.",
      AUTO_SUSPENSAO_NAO_PERMITIDA: "Você não pode suspender o próprio acesso.",
      PROPRIETARIO_PROTEGIDO: "Somente um proprietário pode alterar este acesso.",
      TRANSMISSAO_SEFAZ_DESABILITADA: "A conexão com a SEFAZ está protegida até a homologação ser habilitada no ambiente.",
      DFE_CHAVE_DE_CRIPTOGRAFIA_NAO_CONFIGURADA: "Configure a chave segura do cofre DF-e antes de instalar o certificado.",
      CERTIFICADO_A1_ATIVO_NAO_ENCONTRADO: "Instale um certificado A1 válido para este CNPJ e ambiente.",
      CNPJ_E_UF_DA_EMPRESA_OBRIGATORIOS: "Complete o CNPJ e a UF da empresa antes de consultar a SEFAZ.",
      XML_NAO_DESTINADO_A_EMPRESA: "O destinatário deste XML não corresponde ao CNPJ da empresa ativa.",
      DIVERGENCIAS_CRITICAS_PENDENTES: "Resolva as divergências críticas antes de concluir a entrada.",
      SUGESTAO_SEM_FONTE_NAO_PODE_SER_APROVADA: "Cadastre e valide ao menos uma fonte legal antes de aprovar a sugestão.",
      ANALISE_FINALIZADA_NAO_PODE_SER_REPROCESSADA: "Esta análise já foi finalizada. Crie uma nova análise para revisar o enquadramento.",
      REJEICAO_EXIGE_JUSTIFICATIVA: "Informe uma justificativa de pelo menos 10 caracteres para rejeitar.",
      NFCE_TRANSMISSAO_SEFAZ_DESABILITADA: "A transmissão da NFC-e está bloqueada até a homologação oficial.",
      NFCE_ADAPTADOR_SEFAZ_NAO_HOMOLOGADO: "O adaptador NFC-e ainda não foi homologado para transmissão.",
      NFCE_DOCUMENTO_NAO_ENCONTRADO: "Rascunho NFC-e não encontrado.",
      PDV_ATIVO_NAO_ENCONTRADO: "Selecione um PDV ativo desta empresa.",
      PDV_JA_POSSUI_CAIXA_ABERTO: "Este PDV já possui um caixa aberto.",
      DIVERGENCIA_CAIXA_EXIGE_JUSTIFICATIVA: "Informe uma justificativa de pelo menos 10 caracteres para a diferença de caixa.",
      CANCELAMENTO_TOTAL_EXIGE_GESTOR: "O cancelamento total exige perfil de proprietário, administrador ou gestor.",
      VENDA_JA_CANCELADA: "Esta venda já foi cancelada e não aceita novo estorno.",
      VENDA_SEM_PAGAMENTOS_REGISTRADOS: "A venda não possui pagamentos registrados para reembolso.",
      ESTORNO_SEM_ITENS: "Selecione ao menos um item com quantidade para devolver.",
      ITEM_ESTORNO_DUPLICADO: "Um item foi informado mais de uma vez na devolução.",
      LOTE_DEVOLVIDO_VENCIDO_NAO_PODE_RETORNAR_AO_ESTOQUE: "Produto vencido não pode retornar ao estoque vendável.",
      VENDEDOR_ATIVO_NAO_ENCONTRADO: "Selecione um vendedor com acesso ativo à empresa.",
      CREDENCIAL_FARMACEUTICA_NAO_VERIFICADA_OU_FORA_DA_VIGENCIA: "Selecione uma credencial farmacêutica verificada e vigente.",
      DOCUMENTO_DO_COMPRADOR_INVALIDO: "O CPF/CNPJ informado para o comprador é inválido.",
      USUARIO_NAO_E_FARMACEUTICO_ATIVO: "O usuário precisa estar ativo com o perfil Farmacêutico.",
      NFCE_DOCUMENTO_DO_CONSUMIDOR_DIVERGE_DA_VENDA: "O documento do consumidor não pode divergir do registrado na venda.",
      SESSAO_CAIXA_NAO_ENCONTRADA_OU_FECHADA: "Abra um caixa para registrar o movimento financeiro do pós-venda.",
      SALDO_DISPONIVEL_DA_LOJA_INSUFICIENTE: "O saldo disponível desta loja é insuficiente ou está reservado.",
      APROVACAO_EXIGE_SEGUNDO_USUARIO: "A aprovação deve ser realizada por outro gestor.",
      RECEBIMENTO_EXIGE_SEGUNDO_USUARIO: "O recebimento deve ser confirmado por uma pessoa diferente de quem expediu.",
      INVENTARIO_POSSUI_ITENS_NAO_CONTADOS: "Conte todos os lotes antes de enviar o inventário para aprovação.",
      FECHAMENTO_GERENCIAL_BLOQUEADO: "Conclua as pendências operacionais antes de fechar a competência.",
      PEDIDO_ABAIXO_DO_MINIMO_DO_FORNECEDOR: "O valor do pedido está abaixo do mínimo cadastrado para este fornecedor.",
      FORNECEDOR_CNPJ_JA_CADASTRADO: "Este CNPJ já está cadastrado como fornecedor da empresa.",
      CNPJ_DA_NFE_DIFERE_DO_FORNECEDOR_DO_PEDIDO: "O CNPJ emitente da NF-e não corresponde ao fornecedor deste pedido.",
      LOJA_DA_NFE_DIFERE_DO_PEDIDO: "A loja que recebeu a NF-e não corresponde à loja de destino deste pedido.",
      NFE_NAO_CONTEM_ITENS_PENDENTES_DO_PEDIDO: "A NF-e não contém quantidade pendente de nenhum item deste pedido.",
      SOMA_DAS_PARCELAS_DIFERE_DO_TITULO: "A soma das parcelas precisa ser exatamente igual ao valor total da NF-e.",
      PAGAMENTO_MAIOR_QUE_SALDO_DA_PARCELA: "O valor informado ultrapassa o saldo restante desta parcela.",
      ESTORNO_PAGAMENTO_EXIGE_SEGUNDO_USUARIO: "O estorno deve ser confirmado por outra pessoa autorizada.",
      TITULO_COM_PAGAMENTO_NAO_PODE_SER_CANCELADO: "Um título com pagamento registrado deve ter a baixa estornada antes do cancelamento.",
      COTACAO_EXIGE_AO_MENOS_DOIS_FORNECEDORES: "Inclua pelo menos dois fornecedores para abrir uma cotação concorrencial.",
      PROPOSTA_DEVE_CONTER_TODOS_OS_ITENS_DA_COTACAO: "Preencha preço e quantidade de todos os itens solicitados.",
      DESCONTOS_SUPERAM_O_VALOR_DA_PROPOSTA: "Os descontos informados ultrapassam o valor das mercadorias.",
      PROPOSTA_NAO_ATENDE_TODAS_AS_QUANTIDADES: "A proposta não cobre todas as quantidades solicitadas.",
      PROPOSTA_ABAIXO_DO_MINIMO_DO_FORNECEDOR: "A proposta vencedora está abaixo do pedido mínimo deste fornecedor.",
      PROPOSTA_FORA_DA_VALIDADE: "A validade comercial desta proposta expirou.",
      DEVOLUCAO_SEM_ITENS: "Selecione ao menos um item para devolver.",
      DEVOLUCAO_DE_UM_ITEM_EXIGE_APENAS_UM_ITEM: "Na opção de um item, selecione somente um produto.",
      DEVOLUCAO_DE_ALGUNS_ITENS_EXIGE_DOIS_OU_MAIS: "Na opção de alguns itens, selecione pelo menos dois produtos.",
      DEVOLUCAO_TOTAL_EXIGE_TODOS_OS_ITENS_DISPONIVEIS: "A opção todos exige a seleção de todos os itens ainda disponíveis desta NF-e.",
      QUANTIDADE_DE_DEVOLUCAO_SUPERA_O_SALDO_DISPONIVEL: "A quantidade informada excede o saldo devolvível da nota, do lote ou da loja.",
      SALDO_FISCAL_INSUFICIENTE_PARA_DEVOLUCAO: "A origem fiscal já foi consumida e não possui saldo suficiente para esta devolução.",
      SALDO_CONSOLIDADO_INSUFICIENTE_PARA_DEVOLUCAO: "O estoque consolidado não possui saldo suficiente para esta devolução.",
      SALDO_DAS_PARCELAS_DIVERGE_DO_TITULO: "As parcelas não conciliam com o saldo do título; revise o financeiro antes da devolução.",
      EAN_JA_CADASTRADO: "Este EAN/GTIN já pertence a outro produto da empresa.",
      CODIGO_DA_CATEGORIA_JA_EXISTE: "Este código interno já pertence a outra categoria.",
      ESTRATEGIA_COMERCIAL_INVALIDA: "Revise preço, vigência e motivo da estratégia comercial.",
      REFERENCIA_FISCAL_INVALIDA: "A combinação fiscal informada não é compatível com os catálogos controlados.",
      DISPOSITIVO_OFFLINE_BLOQUEADO: "Este dispositivo foi suspenso ou revogado pela gestão.",
      DISPOSITIVO_OFFLINE_NAO_AUTORIZADO: "Registre novamente este caixa antes de preparar o modo offline.",
      SNAPSHOT_OFFLINE_NAO_AUTORIZADO: "O snapshot não pertence ao dispositivo ou à empresa ativa.",
      SNAPSHOT_OFFLINE_CORROMPIDO: "A integridade do catálogo offline não pôde ser confirmada.",
      CAIXA_POSSUI_COMANDOS_OFFLINE_PENDENTES: "Sincronize as vendas offline antes de fechar o caixa.",
      ALTERACAO_DO_DISPOSITIVO_INVALIDA: "Informe uma situação válida e o motivo administrativo da alteração.",
      DISPOSITIVO_OFFLINE_NAO_ENCONTRADO: "O dispositivo informado não pertence à empresa ativa.",
    };
    const dfeFallback = body.erro && /^(DFE_|NFCE_|CAIXA_|SESSAO_CAIXA_|PDV_|SANGRIA_|DIVERGENCIA_CAIXA_|CONCILIACAO_|TOTAL_PAGAMENTOS_|ESTORNO_|DEVOLUCAO_|VENDA_|VENDEDOR_|ITEM_VENDA_|ITEM_ESTORNO_|QUANTIDADE_DEVOLUCAO_|QUANTIDADE_DE_DEVOLUCAO_|LOTE_DEVOLVIDO_|SALDO_PAGAMENTO_|SALDO_DA_LOJA_|SALDO_DISPONIVEL_|SALDO_CONSOLIDADO_|SALDO_FISCAL_|DINHEIRO_INSUFICIENTE_|ESTOQUE_ALTERADO_|DESCONTO_|DESCONTOS_|CANCELAMENTO_TOTAL_|RESERVA_|TRANSFERENCIA_|LOTE_DUPLICADO_|LOTE_VENCIDO_|INVENTARIO_|CONTAGEM_|APROVACAO_|RECEBIMENTO_|AJUSTE_|PERDA_|FORNECEDOR_|VINCULO_FORNECEDOR_|PEDIDO_|COTACAO_|PROPOSTA_|ADJUDICACAO_|TITULO_|PARCELA_|PAGAMENTO_|SOMA_DAS_PARCELAS_|CONFIGURACAO_DO_TITULO_|BAIXA_DE_PAGAMENTO_|ESTORNO_PAGAMENTO_|FILTROS_DE_CONTAS_|FILTROS_DE_COMPRA_|FECHAMENTO_GERENCIAL_|FILTROS_GERENCIAIS_|CREDENCIAL_FARMACEUTICA_|DOCUMENTO_DO_COMPRADOR_|USUARIO_NAO_E_FARMACEUTICO_|POLITICA_DE_CONTROLE_|CERTIFICADO_|TRANSMISSAO_SEFAZ_|CNPJ_|XML_|CONFERENCIA_|DIVERGENCIAS_|ITEM_|NFE_|SEFAZ_|ANALISE_|SUGESTAO_|REJEICAO_)/.test(body.erro)
      ? `Validação controlada: ${body.erro.toLowerCase().replaceAll("_", " ")}.`
      : null;
    const controlledSaleMessage = body.erro?.startsWith("VENDA_CONTROLADA_BLOQUEADA:")
      ? `Venda controlada bloqueada: ${body.erro.split(":").slice(2).join(", ").toLowerCase().replaceAll("_", " ")}.`
      : null;
    const validationMessage = body.validacoes?.map((item) => item.message).filter(Boolean).join(" ");
    return NextResponse.json({ message: body.message ?? validationMessage ?? messages[body.erro ?? ""] ?? controlledSaleMessage ?? dfeFallback ?? "Não foi possível concluir a operação." }, { status: upstream.status });
  }
  return NextResponse.json(body, { status: upstream.status });
}
