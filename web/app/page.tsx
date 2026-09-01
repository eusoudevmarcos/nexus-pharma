import Link from "next/link";
import { PlanGrid } from "@/components/plan-grid";
import { audiences, departments, features, securityItems, storeJourney } from "@/lib/content";

export default function Home() {
  return (
    <>
      <section className="hero shell">
        <div className="hero-copy">
          <span className="eyebrow">DA OPERAÇÃO DA LOJA À INTELIGÊNCIA FISCAL</span>
          <h1>Atenda, venda e proteja a margem em uma única plataforma.</h1>
          <p className="hero-lead">
            O Nexus Pharma conecta o atendimento no balcão, a venda no caixa, o estoque, as compras, o financeiro e a tributação para a farmácia operar com agilidade hoje e se preparar para IBS e CBS.
          </p>
          <div className="hero-actions">
            <Link className="button" href="#como-funciona">Ver como funciona</Link>
            <Link className="button button-outline" href="/planos">Conhecer planos</Link>
          </div>
          <div className="hero-proof">
            <span><b>✓</b> Regras versionadas</span>
            <span><b>✓</b> Revisão humana</span>
            <span><b>✓</b> Dados por empresa</span>
          </div>
        </div>

        <div className="product-preview" aria-label="Exemplo do painel Nexus Pharma">
          <div className="preview-top">
            <div><span>Visão inteligente</span><strong>Reposição &amp; margem</strong></div>
            <span className="live-dot">Atualizado</span>
          </div>
          <div className="preview-metrics">
            <div><span>Itens críticos</span><strong>18</strong><small>6 com alto giro</small></div>
            <div><span>Margem média</span><strong>32,4%</strong><small>+2,8% no mês</small></div>
          </div>
          <div className="preview-list">
            <div className="preview-heading"><strong>Prioridade de compra</strong><span>Ver todos</span></div>
            <div className="product-line"><span className="product-symbol">A</span><div><strong>Medicamento A</strong><small>Estoque para 2 dias</small></div><b>41% margem</b></div>
            <div className="product-line"><span className="product-symbol light">S</span><div><strong>Suplemento B</strong><small>Alto giro · 8 un.</small></div><b>36% margem</b></div>
            <div className="ai-insight"><span>IA</span><p><strong>Oportunidade encontrada</strong>Repor primeiro os itens de maior giro preserva o caixa e a margem.</p></div>
          </div>
          <div className="classification-chip"><span>Classificação fiscal</span><b>Hipótese pronta para revisão</b></div>
        </div>
      </section>

      <section className="trust-strip">
        <div className="shell trust-grid">
          <div><strong>1 regra</strong><span>alimenta produtos vinculados</span></div>
          <div><strong>4 sinais</strong><span>saldo, giro, validade e margem</span></div>
          <div><strong>100%</strong><span>das alterações com histórico</span></div>
          <div><strong>1 fluxo</strong><span>do balcão à gestão</span></div>
        </div>
      </section>

      <section className="section shell" id="recursos">
        <div className="section-heading split-heading">
          <div><span className="eyebrow">O QUE A NEXUS ORGANIZA</span><h2>Menos telas soltas. Mais contexto para decidir.</h2></div>
          <p>A plataforma conecta o dado fiscal ao comportamento comercial do produto, sem transformar uma sugestão automática em regra definitiva.</p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.number}>
              <div><span className="feature-number">{feature.number}</span><span className="feature-tag">{feature.tag}</span></div>
              <h3>{feature.title}</h3><p>{feature.description}</p>
            </article>
          ))}
        </div>
        <Link className="text-link" href="/recursos">Explorar todos os recursos <span>→</span></Link>
      </section>

      <section className="section soft-section" id="como-funciona">
        <div className="shell">
          <div className="section-heading centered"><span className="eyebrow">COMO FUNCIONA</span><h2>Da entrada do produto à decisão de compra.</h2><p>Um fluxo simples, rastreável e preparado para receber novas regras.</p></div>
          <div className="steps-grid">
            <article><span>1</span><h3>Organize a base</h3><p>Cadastre categorias, produtos, lotes e vínculos comerciais uma única vez.</p></article>
            <article><span>2</span><h3>Revise com inteligência</h3><p>A IA reúne contexto e evidências. A equipe responsável valida antes de aplicar.</p></article>
            <article><span>3</span><h3>Decida com resultado</h3><p>Acompanhe o que está em baixa, vende mais e entrega a melhor margem.</p></article>
          </div>
        </div>
      </section>

      <section className="section shell store-journey-section">
        <div className="section-heading split-heading"><div><span className="eyebrow">OPERAÇÃO REAL DE FARMÁCIA</span><h2>Do primeiro atendimento ao fechamento da venda.</h2></div><p>O balcão orienta e confirma o pedido. O caixa recebe e conclui. Cada responsabilidade fica no lugar certo e o consumidor não precisa repetir tudo.</p></div>
        <div className="store-journey">{storeJourney.map((step) => <article key={step.number}><span>{step.number}</span><h3>{step.title}</h3><p>{step.copy}</p></article>)}</div>
      </section>

      <section className="section soft-section"><div className="shell"><div className="section-heading centered"><span className="eyebrow">TODOS OS SETORES CONECTADOS</span><h2>Uma plataforma completa, com uma janela para cada função.</h2><p>Cada equipe acessa somente o necessário; os dados se encontram na gestão e na trilha de auditoria.</p></div><div className="department-grid">{departments.map((department, index) => <article key={department.title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{department.title}</h3><p>{department.copy}</p></article>)}</div></div></section>

      <section className="section shell">
        <div className="section-heading split-heading">
          <div><span className="eyebrow">UMA PLATAFORMA, VÁRIAS ROTINAS</span><h2>Cada pessoa vê o que precisa para trabalhar.</h2></div>
          <p>Permissões e áreas próprias ajudam a equipe a resolver demandas sem expor informações fora do contexto.</p>
        </div>
        <div className="audience-grid">
          {audiences.map((audience, index) => <article key={audience.title}><span>0{index + 1}</span><h3>{audience.title}</h3><p>{audience.copy}</p></article>)}
        </div>
      </section>

      <section className="section navy-section">
        <div className="shell security-layout">
          <div className="security-copy"><span className="eyebrow light-eyebrow">SEGURANÇA DESDE A BASE</span><h2>Inteligência com controle, não no piloto automático.</h2><p>O motor fiscal trabalha como assistente: explica, registra evidências e pede revisão humana antes de alterar uma regra operacional.</p><Link className="button button-light" href="/seguranca">Conhecer a segurança</Link></div>
          <div className="security-list">{securityItems.slice(0, 4).map((item) => <div key={item}><span>✓</span><p>{item}</p></div>)}</div>
        </div>
      </section>

      <section className="section shell" id="planos">
        <div className="section-heading centered"><span className="eyebrow">PLANOS PARA CADA MOMENTO</span><h2>Comece organizado. Evolua sem trocar de sistema.</h2><p>A estrutura cresce com a farmácia, da primeira operação a uma rede com múltiplas empresas.</p></div>
        <PlanGrid compact />
      </section>

      <section className="section final-cta shell">
        <div><span className="eyebrow light-eyebrow">PRÓXIMO PASSO</span><h2>Transforme cada atendimento, produto e regra fiscal em uma decisão melhor.</h2></div>
        <Link className="button button-yellow" href="/entrar">Solicitar acesso</Link>
      </section>
    </>
  );
}
