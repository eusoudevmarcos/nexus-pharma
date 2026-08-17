"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";

type Regime = "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL";
type Rule = {
  cfop: string; cstIcms: string; csosn: string; icms: number; mva: number;
  cstPis: string; cstCofins: string; natureza: string; pis: number; cofins: number;
  cstReforma: string; classificacao: string; cbs: number; ibs: number; reducao: number; compensarCbs: boolean;
};
type Category = {
  id: string; nome: string; codigo: string; ncm: string; cest: string; classe: string;
  descricao: string; versao: string; vigencia: string; rules: Record<Regime, Rule>;
};
type Product = {
  ean: string; nome: string; laboratorio: string; principioAtivo: string; categoriaId: string;
  lote: string; quantidadeEntrada: number; custo: number; estoque: number; minimo: number;
  fabricacao: string; vencimento: string; preco: number; cimed: boolean;
};
type CartItem = Product & { quantidade: number };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 2 });
const regimes: Record<Regime, { short: string; title: string }> = {
  SIMPLES_NACIONAL: { short: "Simples", title: "Simples Nacional" },
  LUCRO_PRESUMIDO: { short: "Presumido", title: "Lucro Presumido" },
  LUCRO_REAL: { short: "Real", title: "Lucro Real" },
};

function rule(overrides: Partial<Rule> = {}): Rule {
  return { cfop: "5102", cstIcms: "00", csosn: "102", icms: 0, mva: 0, cstPis: "01", cstCofins: "01", natureza: "", pis: .0065, cofins: .03, cstReforma: "000", classificacao: "TRIBUTAÇÃO INTEGRAL", cbs: .009, ibs: .001, reducao: 0, compensarCbs: true, ...overrides };
}
function rulesFor(overrides: Partial<Rule> = {}): Record<Regime, Rule> {
  return {
    SIMPLES_NACIONAL: rule({ ...overrides, cbs: 0, ibs: 0, compensarCbs: false }),
    LUCRO_PRESUMIDO: rule({ ...overrides, csosn: "—", pis: .0065, cofins: .03 }),
    LUCRO_REAL: rule({ ...overrides, csosn: "—", pis: .0165, cofins: .076 }),
  };
}

const initialCategories: Category[] = [
  { id: "med", nome: "Medicamentos", codigo: "MEDICAMENTOS", ncm: "30049069", cest: "1300402", classe: "Lista positiva", descricao: "Medicamentos de uso humano e genéricos", versao: "2026.08", vigencia: "01/08/2026", rules: rulesFor({ cfop: "5405", cstIcms: "60", csosn: "500", mva: .38, cstPis: "05", cstCofins: "05", natureza: "101", pis: 0, cofins: 0, cstReforma: "200", classificacao: "MEDICAMENTO REDUZIDO", cbs: .009, ibs: .001, reducao: .6 }) },
  { id: "ant", nome: "Antibióticos", codigo: "ANTIBIOTICOS", ncm: "30042099", cest: "1300200", classe: "Lista positiva", descricao: "Antimicrobianos sujeitos a controle", versao: "2026.08", vigencia: "01/08/2026", rules: rulesFor({ cfop: "5405", cstIcms: "60", csosn: "500", mva: .38, cstPis: "05", cstCofins: "05", natureza: "101", pis: 0, cofins: 0, cstReforma: "200", classificacao: "MEDICAMENTO REDUZIDO", cbs: .009, ibs: .001, reducao: .6 }) },
  { id: "hig", nome: "Higiene pessoal", codigo: "HIGIENE", ncm: "33049990", cest: "2001500", classe: "Tributação normal", descricao: "Cuidados pessoais, higiene bucal e corporal", versao: "2026.08", vigencia: "01/08/2026", rules: rulesFor({ mva: .42 }) },
  { id: "maq", nome: "Maquiagens", codigo: "MAQUIAGEM", ncm: "33049910", cest: "2001500", classe: "Tributação normal", descricao: "Cosméticos e maquiagem", versao: "2026.08", vigencia: "01/08/2026", rules: rulesFor({ mva: .52 }) },
  { id: "sup", nome: "Suplementos e esporte", codigo: "SUPLEMENTOS", ncm: "21069030", cest: "—", classe: "Tributação normal", descricao: "Nutrição esportiva, vitaminas e proteínas", versao: "2026.08", vigencia: "01/08/2026", rules: rulesFor() },
  { id: "per", nome: "Perfumaria", codigo: "PERFUMARIA", ncm: "33030020", cest: "2000700", classe: "Tributação normal", descricao: "Perfumes, colônias e cuidados", versao: "2026.08", vigencia: "01/08/2026", rules: rulesFor({ mva: .55 }) },
  { id: "bal", nome: "Balas e confeitos", codigo: "BALAS", ncm: "17049020", cest: "1700400", classe: "Monofásico", descricao: "Balas, pastilhas e confeitos", versao: "2026.08", vigencia: "01/08/2026", rules: rulesFor({ cstPis: "04", cstCofins: "04", pis: 0, cofins: 0 }) },
];

const initialProducts: Product[] = [
  { ean: "7896523200325", nome: "Cimegripe 20 cápsulas", laboratorio: "CIMED", principioAtivo: "Paracetamol + clorfeniramina", categoriaId: "med", lote: "CG260718", quantidadeEntrada: 24, custo: 10.42, estoque: 7, minimo: 12, fabricacao: "2026-05-10", vencimento: "2027-05-10", preco: 18.9, cimed: true },
  { ean: "7896523200578", nome: "Lavitan A-Z 60 comprimidos", laboratorio: "CIMED", principioAtivo: "Vitaminas e minerais", categoriaId: "sup", lote: "LV260331", quantidadeEntrada: 36, custo: 19.1, estoque: 18, minimo: 10, fabricacao: "2026-03-31", vencimento: "2027-03-31", preco: 34.5, cimed: true },
  { ean: "7896004710893", nome: "Dipirona 500 mg 10 comprimidos", laboratorio: "GENÉRICO", principioAtivo: "Dipirona monoidratada", categoriaId: "med", lote: "DP250912", quantidadeEntrada: 48, custo: 3.85, estoque: 24, minimo: 8, fabricacao: "2025-09-12", vencimento: "2026-09-22", preco: 8.49, cimed: false },
  { ean: "7896422507051", nome: "Protetor solar FPS 60 120 ml", laboratorio: "DERMA", principioAtivo: "Filtros UVA/UVB", categoriaId: "hig", lote: "PS260114", quantidadeEntrada: 12, custo: 31.2, estoque: 5, minimo: 7, fabricacao: "2026-01-14", vencimento: "2027-01-14", preco: 52.9, cimed: false },
];

function LogoMark() { return <img className="logo-mark" src="/logo/nexus-icon.png" width="50" height="50" alt="" aria-hidden="true" />; }
function Icon({ name }: { name: string }) {
  const glyphs: Record<string, string> = { overview: "⌂", pdv: "▣", stock: "≋", fiscal: "◎", cadastros: "▤", settings: "⚙", search: "⌕", check: "✓", plus: "+", minus: "−", arrow: "→" };
  return <span className={`icon icon-${name}`} aria-hidden="true">{glyphs[name]}</span>;
}
function calc(product: Product, category: Category, regime: Regime) {
  const r = category.rules[regime];
  const cbs = product.preco * r.cbs * (1 - r.reducao);
  const ibs = product.preco * r.ibs * (1 - r.reducao);
  const icms = product.preco * r.icms;
  const pisCofins = product.preco * (r.pis + r.cofins);
  const compensacaoCbs = r.compensarCbs ? Math.min(cbs, pisCofins) : 0;
  const tributo = icms + pisCofins + cbs + ibs - compensacaoCbs;
  const lucro = product.preco - product.custo - tributo;
  return { cbs, ibs, icms, pisCofins, compensacaoCbs, tributo, lucro, margem: product.preco ? lucro / product.preco : 0 };
}
function daysTo(date: string) { return Math.ceil((new Date(`${date}T12:00:00`).getTime() - new Date("2026-08-05T12:00:00").getTime()) / 86400000); }

export default function Home() {
  const [active, setActive] = useState("overview");
  const [regime, setRegime] = useState<Regime>("SIMPLES_NACIONAL");
  const [categories, setCategories] = useState(initialCategories);
  const [products, setProducts] = useState(initialProducts);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([{ ...initialProducts[0], quantidade: 1 }, { ...initialProducts[2], quantidade: 2 }]);
  const [toast, setToast] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "F2") { event.preventDefault(); setActive("pdv"); setTimeout(() => searchRef.current?.focus(), 30); }
      if (event.key === "F8") { event.preventDefault(); setActive("pdv"); }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3200); };
  const titles: Record<string, string> = { overview: "Resumo do negócio", pdv: "Nova venda", stock: "Estoque e validades", fiscal: "Regras fiscais", products: "Produtos", categories: "Categorias" };
  const descriptions: Record<string, string> = {
    overview: "Veja agora o que precisa da sua atenção.",
    pdv: "Busque os itens e conclua a venda com segurança.",
    stock: "Acompanhe saldos, lotes e próximos vencimentos.",
    fiscal: "Confira a tributação aplicada em cada categoria.",
    products: "Cadastre custos, preços, estoque e validade.",
    categories: "Centralize NCM e regras fiscais em um só lugar.",
  };

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-signature" aria-label="Nexus pharma">
          <LogoMark />
          <div className="brand-name">
            <strong>Ne<em>x</em>us</strong>
            <small>pharma</small>
          </div>
        </div>
        <span className="brand-compact"><LogoMark /></span>
      </div>
      <nav aria-label="Navegação principal">
        <span className="nav-label">Menu principal</span>
        {[["overview", "overview", "Início"], ["pdv", "pdv", "Vender"], ["stock", "stock", "Estoque"], ["fiscal", "fiscal", "Fiscal"], ["products", "cadastros", "Produtos"], ["categories", "cadastros", "Categorias"]].map(([id, icon, label]) =>
          <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)}><Icon name={icon} /> {label}</button>)}
      </nav>
      <div className="side-bottom"><button><Icon name="settings" /> Configurações</button><div className="operator"><span className="avatar">MF</span><div><strong>Marcos Freitas</strong><small>Administrador</small></div></div></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div className="page-copy"><span className="eyebrow">FARMÁCIA MODELO • MATRIZ</span><h1>{titles[active]}</h1><p>{descriptions[active]}</p></div><div className="top-actions"><div className="status-pill"><span className="pulse" /><span><strong>Tudo atualizado</strong><small>Regras 2026.08</small></span></div><div className="regime-switch" aria-label="Regime tributário">{(Object.keys(regimes) as Regime[]).map((key) => <button key={key} className={regime === key ? "active" : ""} onClick={() => setRegime(key)}>{regimes[key].short}</button>)}</div></div></header>
      {active === "overview" && <Dashboard products={products} categories={categories} regime={regime} go={setActive} />}
      {active === "pdv" && <Pdv products={products} categories={categories} regime={regime} query={query} setQuery={setQuery} cart={cart} setCart={setCart} searchRef={searchRef} notify={notify} />}
      {active === "stock" && <Stock products={products} categories={categories} />}
      {active === "fiscal" && <Fiscal categories={categories} regime={regime} />}
      {active === "products" && <Products products={products} setProducts={setProducts} categories={categories} regime={regime} notify={notify} />}
      {active === "categories" && <Categories categories={categories} setCategories={setCategories} regime={regime} notify={notify} />}
    </section>
    {toast && <div className="toast"><Icon name="check" />{toast}</div>}
  </main>;
}

function Dashboard({ products, categories, regime, go }: { products: Product[]; categories: Category[]; regime: Regime; go: (id: string) => void }) {
  const totals = products.reduce((a, p) => { const c = categories.find((x) => x.id === p.categoriaId)!; const v = calc(p, c, regime); return { venda: a.venda + p.preco * p.estoque, custo: a.custo + p.custo * p.estoque, tributo: a.tributo + v.tributo * p.estoque, lucro: a.lucro + v.lucro * p.estoque }; }, { venda: 0, custo: 0, tributo: 0, lucro: 0 });
  const expiring = products.filter((p) => daysTo(p.vencimento) <= 90).length;
  return <div className="dashboard">
    <section className="hero-grid"><article className="economy-card"><div className="card-top"><span className="label">ECONOMIA TRIBUTÁRIA • LUCRO DO ESTOQUE</span><span className="trend">Atualizado</span></div><div className="economy-value">{money.format(totals.lucro)}</div><p>Valor estimado que sobra após custos e impostos.</p><div className="economy-footer"><span>Margem estimada</span><strong>{percent.format(totals.lucro / totals.venda)}</strong></div></article><article className="action-card"><div><span className="label">ATALHO RÁPIDO</span><h2>Tributação<br />mais simples.</h2><p>Revise NCM e impostos por categoria, sem repetir informações.</p></div><button onClick={() => go("categories")}>Abrir categorias <Icon name="arrow" /></button></article></section>
    <section className="metrics-row"><Metric label="VALOR EM ESTOQUE" value={money.format(totals.venda)} detail={`${products.reduce((s, p) => s + p.estoque, 0)} unidades`} /><Metric label="CUSTO DO ESTOQUE" value={money.format(totals.custo)} detail="valor de entrada" /><Metric label="TRIBUTOS PROJETADOS" value={money.format(totals.tributo)} detail={regimes[regime].title} /><Metric label="VENCEM EM 90 DIAS" value={String(expiring)} detail="bloqueio na saída ao vencer" /></section>
    <section className="content-grid"><article className="panel"><div className="panel-heading"><div><span className="label">CONFERÊNCIA CONTÁBIL EXPRESS</span><h2>Memória de cálculo por produto</h2></div><button className="quiet" onClick={() => go("products")}>Ver cadastros</button></div><div className="data-table compact"><div className="table-head"><span>Produto</span><span>NCM herdado</span><span>Tributo/un.</span><span>Margem</span></div>{products.map((p) => { const c = categories.find((x) => x.id === p.categoriaId)!; const v = calc(p, c, regime); return <div className="table-line" key={p.ean}><span><strong>{p.nome}</strong><small>{c.nome}</small></span><code>{c.ncm}</code><strong>{money.format(v.tributo)}</strong><b className={v.margem < .15 ? "danger-text" : "good-text"}>{percent.format(v.margem)}</b></div>; })}</div></article><article className="panel"><div className="panel-heading"><div><span className="label">ALERTA DE COMPRAS</span><h2>Prioridades</h2></div><span className="count">{products.filter((p) => p.estoque <= p.minimo).length}</span></div><p className="muted">Reposição e vencimentos monitorados juntos.</p>{products.filter((p) => p.estoque <= p.minimo || daysTo(p.vencimento) <= 90).map((p) => <div className="alert-item" key={p.ean}><span className="product-avatar">{p.nome.slice(0, 2).toUpperCase()}</span><div><strong>{p.nome}</strong><small>{daysTo(p.vencimento) <= 90 ? `Vence em ${daysTo(p.vencimento)} dias` : "Estoque abaixo do mínimo"}</small></div><div className="stock-data"><strong>{p.estoque}</strong><small>un.</small></div></div>)}</article></section>
    <div className="fiscal-strip"><div><Icon name="check" /> Regras fiscais centralizadas por categoria</div><span>ICMS / CST / CSOSN</span><span>PIS / COFINS</span><span>IBS / CBS</span><span>Histórico versionado</span></div>
  </div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <article className="metric"><span className="label">{label}</span><strong>{value}</strong><div><span>{detail}</span><em>✓</em></div></article>; }

function Pdv({ products, categories, regime, query, setQuery, cart, setCart, searchRef, notify }: { products: Product[]; categories: Category[]; regime: Regime; query: string; setQuery: (v: string) => void; cart: CartItem[]; setCart: React.Dispatch<React.SetStateAction<CartItem[]>>; searchRef: React.RefObject<HTMLInputElement | null>; notify: (m: string) => void }) {
  const matches = useMemo(() => products.filter((p) => `${p.nome} ${p.ean}`.toLowerCase().includes(query.toLowerCase())).slice(0, 5), [products, query]);
  const total = cart.reduce((s, p) => s + p.preco * p.quantidade, 0);
  const tax = cart.reduce((s, p) => s + calc(p, categories.find((c) => c.id === p.categoriaId)!, regime).tributo * p.quantidade, 0);
  const add = (p: Product) => { if (daysTo(p.vencimento) <= 0) return notify("Produto vencido: saída bloqueada."); setCart((now) => now.some((x) => x.ean === p.ean) ? now.map((x) => x.ean === p.ean ? { ...x, quantidade: x.quantidade + 1 } : x) : [...now, { ...p, quantidade: 1 }]); setQuery(""); };
  const change = (ean: string, delta: number) => setCart((now) => now.map((p) => p.ean === ean ? { ...p, quantidade: p.quantidade + delta } : p).filter((p) => p.quantidade > 0));
  const finish = () => { const snapshot = { id: crypto.randomUUID(), items: cart, total, createdAt: new Date().toISOString() }; if (!navigator.onLine) { const pending = JSON.parse(localStorage.getItem("nexus-pending-sales") || "[]"); localStorage.setItem("nexus-pending-sales", JSON.stringify([...pending, snapshot])); } setCart([]); notify("Venda conferida, estoque atualizado e tributos provisionados."); };
  return <div className="pdv-layout"><section className="panel pdv-products"><div className="search-box"><Icon name="search" /><input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Bipe ou digite EAN / nome do produto" aria-label="Buscar produto" /><kbd>F2</kbd></div>{query && <div className="search-results">{matches.map((p) => <button key={p.ean} onClick={() => add(p)}><span className="product-avatar">{p.nome.slice(0, 2)}</span><span><strong>{p.nome}</strong><small>{p.ean} • {p.estoque} em estoque</small></span><b>{money.format(p.preco)}</b></button>)}</div>}<div className="sale-head"><span>PRODUTO</span><span>REGRA</span><span>QUANTIDADE</span><span>TOTAL</span></div><div className="cart-list">{cart.map((p) => { const c = categories.find((x) => x.id === p.categoriaId)!; const r = c.rules[regime]; return <div className="cart-row" key={p.ean}><div className="cart-product"><span className="product-avatar">{p.nome.slice(0, 2)}</span><span><strong>{p.nome}</strong><small>{p.ean} • NCM {c.ncm}</small></span></div><div><span className="fiscal-tag">{r.cfop}</span><small className="fiscal-small">{r.csosn === "—" ? `CST ${r.cstIcms}` : `CSOSN ${r.csosn}`}</small></div><div className="quantity"><button onClick={() => change(p.ean, -1)}>−</button><strong>{p.quantidade}</strong><button onClick={() => change(p.ean, 1)}>+</button></div><strong className="line-total">{money.format(p.preco * p.quantidade)}</strong></div>; })}</div><div className="pdv-rule"><span><Icon name="check" /> Regra vigente herdada da categoria</span><span>Validade verificada antes da saída</span></div></section><aside className="checkout"><span className="label">RESUMO DA VENDA</span><div className="checkout-lines"><p><span>Subtotal</span><strong>{money.format(total)}</strong></p><p><span>Tributo total</span><strong>{money.format(tax)}</strong></p><p className="tax-save"><span>CBS + IBS</span><strong>{money.format(cart.reduce((s, p) => { const v = calc(p, categories.find((c) => c.id === p.categoriaId)!, regime); return s + (v.cbs + v.ibs) * p.quantidade; }, 0))}</strong></p></div><div className="checkout-total"><span>TOTAL A RECEBER</span><strong>{money.format(total)}</strong><small>Margem líquida considerada na DRE</small></div><button className="finish-button" disabled={!cart.length} onClick={finish}>Finalizar venda <kbd>F8</kbd></button><p className="security-note">A saída grava um retrato do NCM, CST/CSOSN e valores fiscais aplicados.</p></aside></div>;
}

function Stock({ products, categories }: { products: Product[]; categories: Category[] }) {
  return <div className="stock-page"><section className="panel"><div className="panel-heading"><div><span className="label">CONTROLE FEFO • PRIMEIRO QUE VENCE, PRIMEIRO QUE SAI</span><h2>Estoque, fabricação e vencimento</h2></div><button className="primary-small">Registrar entrada</button></div><div className="stock-summary"><div><span>{products.reduce((s, p) => s + p.quantidadeEntrada, 0)}</span><small>unidades recebidas</small></div><div><span>{products.reduce((s, p) => s + p.estoque, 0)}</span><small>saldo atual</small></div><div><span>{products.filter((p) => daysTo(p.vencimento) <= 90).length}</span><small>lotes vencendo em 90 dias</small></div></div><div className="stock-grid-head"><span>Produto / lote</span><span>Categoria / NCM</span><span>Fabricação</span><span>Vencimento</span><span>Estoque</span><span>Status</span></div>{[...products].sort((a, b) => a.vencimento.localeCompare(b.vencimento)).map((p) => { const c = categories.find((x) => x.id === p.categoriaId)!; const days = daysTo(p.vencimento); return <div className="stock-grid-row" key={p.ean}><span><strong>{p.nome}</strong><small>Lote {p.lote}</small></span><span><strong>{c.nome}</strong><small>NCM {c.ncm}</small></span><span>{new Date(`${p.fabricacao}T12:00:00`).toLocaleDateString("pt-BR")}</span><span><strong>{new Date(`${p.vencimento}T12:00:00`).toLocaleDateString("pt-BR")}</strong><small>{days} dias</small></span><span><strong>{p.estoque} un.</strong><small>mín. {p.minimo}</small></span><b className={days <= 90 ? "status warn" : p.estoque <= p.minimo ? "status danger" : "status ok"}>{days <= 90 ? "Vencendo" : p.estoque <= p.minimo ? "Repor" : "Regular"}</b></div>; })}</section></div>;
}

function Fiscal({ categories, regime }: { categories: Category[]; regime: Regime }) {
  return <div className="fiscal-page"><section className="panel"><div className="panel-heading"><div><span className="label">TABELA VIGENTE • {regimes[regime].title.toUpperCase()}</span><h2>Conferência das classificações tributárias</h2></div><span className="approved"><Icon name="check" /> Sem campos obrigatórios vazios</span></div><div className="fiscal-cards"><div><span>Categorias ativas</span><strong>{categories.length}</strong></div><div><span>NCM classificados</span><strong>{new Set(categories.map((c) => c.ncm)).size}</strong></div><div><span>Regras versionadas</span><strong>2026.08</strong></div><div className="accent"><span>Regime em conferência</span><strong>{regimes[regime].short}</strong></div></div><div className="wide-table"><div className="wide-head"><span>Categoria</span><span>NCM</span><span>CFOP</span><span>CST / CSOSN</span><span>PIS / COFINS</span><span>Classificação IBS/CBS</span><span>Vigência</span></div>{categories.map((c) => { const r = c.rules[regime]; return <div className="wide-line" key={c.id}><span><strong>{c.nome}</strong><small>{c.classe}</small></span><code>{c.ncm}</code><code>{r.cfop}</code><span>{r.cstIcms} / {r.csosn}</span><span>{r.cstPis} / {r.cstCofins}</span><span><strong>{r.cstReforma}</strong><small>{r.classificacao}</small></span><span>{c.vigencia}</span></div>; })}</div><p className="legal-note">Parametrização gerencial. NCM, CEST, CST, CSOSN, benefícios, alíquotas e vigências devem ser homologados pelo responsável fiscal conforme UF, operação e legislação aplicáveis.</p></section></div>;
}

function Products({ products, setProducts, categories, regime, notify }: { products: Product[]; setProducts: React.Dispatch<React.SetStateAction<Product[]>>; categories: Category[]; regime: Regime; notify: (m: string) => void }) {
  const [selected, setSelected] = useState(products[0].ean);
  const [tab, setTab] = useState("nome");
  const product = products.find((p) => p.ean === selected) ?? products[0];
  const category = categories.find((c) => c.id === product.categoriaId) ?? categories[0];
  const values = calc(product, category, regime);
  const update = (key: keyof Product, value: string | number | boolean) => setProducts((all) => all.map((p) => p.ean === selected ? { ...p, [key]: value } : p));
  return <div className="master-detail"><aside className="master-list panel"><div className="master-title"><div><span className="label">{products.length} PRODUTOS</span><h2>Catálogo</h2></div><button onClick={() => notify("Novo cadastro pronto para preenchimento.")}>+</button></div><input className="filter-input" placeholder="Buscar produto ou EAN" />{products.map((p) => <button key={p.ean} className={selected === p.ean ? "selected" : ""} onClick={() => setSelected(p.ean)}><span className="product-avatar">{p.nome.slice(0, 2)}</span><span><strong>{p.nome}</strong><small>{p.ean} • {categories.find((c) => c.id === p.categoriaId)?.nome}</small></span><b>{p.estoque}</b></button>)}</aside><section className="detail-card panel"><div className="detail-heading"><div><span className="label">PRODUTO • {product.ean}</span><h2>{product.nome}</h2><p>Dados operacionais; tributação herdada de <strong>{category.nome}</strong>.</p></div><button className="save-button" onClick={() => notify("Produto salvo e cálculos atualizados.")}>Salvar produto</button></div><div className="tabs">{[["nome", "Nomenclatura"], ["stock", "Entrada e estoque"], ["dates", "Validade e preços"], ["tax", "Resumo fiscal"]].map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</div>{tab === "nome" && <div className="form-grid"><Field label="Nome do produto" wide><input value={product.nome} onChange={(e) => update("nome", e.target.value)} /></Field><Field label="EAN / GTIN"><input value={product.ean} readOnly /></Field><Field label="Laboratório"><input value={product.laboratorio} onChange={(e) => update("laboratorio", e.target.value)} /></Field><Field label="Princípio ativo" wide><input value={product.principioAtivo} onChange={(e) => update("principioAtivo", e.target.value)} /></Field><Field label="Categoria fiscal"><select value={product.categoriaId} onChange={(e) => update("categoriaId", e.target.value)}>{categories.map((c) => <option value={c.id} key={c.id}>{c.nome}</option>)}</select><small>Ao trocar, NCM e todas as regras são atualizados.</small></Field><Field label="NCM herdado"><input value={category.ncm} readOnly /><small>Controlado pela categoria • versão {category.versao}</small></Field></div>}{tab === "stock" && <div className="form-grid"><Field label="Lote"><input value={product.lote} onChange={(e) => update("lote", e.target.value)} /></Field><Field label="Quantidade da entrada"><input type="number" value={product.quantidadeEntrada} onChange={(e) => update("quantidadeEntrada", +e.target.value)} /></Field><Field label="Valor unitário da entrada"><input type="number" step="0.01" value={product.custo} onChange={(e) => update("custo", +e.target.value)} /></Field><Field label="Valor total da entrada"><input value={money.format(product.quantidadeEntrada * product.custo)} readOnly /></Field><Field label="Quantidade em estoque"><input type="number" value={product.estoque} onChange={(e) => update("estoque", +e.target.value)} /></Field><Field label="Estoque mínimo"><input type="number" value={product.minimo} onChange={(e) => update("minimo", +e.target.value)} /></Field></div>}{tab === "dates" && <div className="form-grid"><Field label="Data de fabricação"><input type="date" value={product.fabricacao} onChange={(e) => update("fabricacao", e.target.value)} /></Field><Field label="Data de vencimento"><input type="date" value={product.vencimento} onChange={(e) => update("vencimento", e.target.value)} /><small>{daysTo(product.vencimento)} dias restantes</small></Field><Field label="Valor de venda"><input type="number" step="0.01" value={product.preco} onChange={(e) => update("preco", +e.target.value)} /></Field><Field label="Custo unitário"><input value={money.format(product.custo)} readOnly /></Field><Field label="Valor do tributo total"><input value={money.format(values.tributo)} readOnly /></Field><Field label="Margem de lucro líquida"><input value={percent.format(values.margem)} readOnly /></Field></div>}{tab === "tax" && <div><div className="inherit-banner"><Icon name="check" /><span><strong>Tributação controlada pela categoria</strong><small>Qualquer alteração em {category.nome} passa a valer neste produto sem duplicar dados.</small></span></div><div className="summary-cards"><div><span>NCM</span><strong>{category.ncm}</strong></div><div><span>MVA</span><strong>{percent.format(category.rules[regime].mva)}</strong></div><div><span>CBS total / un.</span><strong>{money.format(values.cbs)}</strong></div><div><span>IBS total / un.</span><strong>{money.format(values.ibs)}</strong></div><div><span>Tributo total / un.</span><strong>{money.format(values.tributo)}</strong></div><div className="accent"><span>Lucro líquido / un.</span><strong>{money.format(values.lucro)}</strong></div></div><div className="tax-trace"><span>CFOP {category.rules[regime].cfop}</span><span>CST ICMS {category.rules[regime].cstIcms}</span><span>CSOSN {category.rules[regime].csosn}</span><span>PIS/COFINS {category.rules[regime].cstPis}/{category.rules[regime].cstCofins}</span><span>Class. {category.rules[regime].cstReforma}</span></div></div>}</section></div>;
}

function Categories({ categories, setCategories, regime, notify }: { categories: Category[]; setCategories: React.Dispatch<React.SetStateAction<Category[]>>; regime: Regime; notify: (m: string) => void }) {
  const [selected, setSelected] = useState(categories[0].id); const [tab, setTab] = useState("geral");
  const category = categories.find((c) => c.id === selected) ?? categories[0]; const r = category.rules[regime];
  const updateCategory = (key: keyof Category, value: string) => setCategories((all) => all.map((c) => c.id === selected ? { ...c, [key]: value } : c));
  const updateRule = (key: keyof Rule, value: string | number | boolean) => setCategories((all) => all.map((c) => c.id === selected ? { ...c, rules: { ...c.rules, [regime]: { ...c.rules[regime], [key]: value } } } : c));
  return <div className="master-detail"><aside className="master-list panel"><div className="master-title"><div><span className="label">BASE FISCAL</span><h2>Categorias</h2></div><button onClick={() => notify("Nova categoria pronta para classificação.")}>+</button></div><input className="filter-input" placeholder="Buscar categoria ou NCM" />{categories.map((c) => <button key={c.id} className={selected === c.id ? "selected" : ""} onClick={() => setSelected(c.id)}><span className="category-dot" /><span><strong>{c.nome}</strong><small>NCM {c.ncm} • {c.classe}</small></span><b>{c.rules[regime].cfop}</b></button>)}</aside><section className="detail-card panel"><div className="detail-heading"><div><span className="label">CATEGORIA • {category.codigo}</span><h2>{category.nome}</h2><p>Alimenta automaticamente todos os produtos vinculados.</p></div><button className="save-button" onClick={() => notify("Categoria salva. NCM e tributação atualizados nos produtos vinculados.")}>Salvar e aplicar</button></div><div className="tabs">{[["geral", "Geral e classificação"], ["icms", "ICMS"], ["pis", "PIS / COFINS"], ["reforma", "Reforma tributária"]].map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</div>{tab === "geral" && <div className="form-grid"><Field label="Nome da categoria" wide><input value={category.nome} onChange={(e) => updateCategory("nome", e.target.value)} /></Field><Field label="Código interno"><input value={category.codigo} onChange={(e) => updateCategory("codigo", e.target.value)} /></Field><Field label="NCM"><input value={category.ncm} maxLength={8} onChange={(e) => updateCategory("ncm", e.target.value.replace(/\D/g, ""))} /><small>Atualização instantânea nos produtos vinculados.</small></Field><Field label="CEST"><input value={category.cest} onChange={(e) => updateCategory("cest", e.target.value)} /></Field><Field label="Classificação fiscal"><select value={category.classe} onChange={(e) => updateCategory("classe", e.target.value)}><option>Lista positiva</option><option>Lista negativa</option><option>Lista neutra</option><option>Monofásico</option><option>Tributação normal</option></select></Field><Field label="Versão da regra"><input value={category.versao} onChange={(e) => updateCategory("versao", e.target.value)} /></Field><Field label="Vigência inicial"><input value={category.vigencia} onChange={(e) => updateCategory("vigencia", e.target.value)} /></Field><Field label="Descrição" wide><textarea value={category.descricao} onChange={(e) => updateCategory("descricao", e.target.value)} /></Field></div>}{tab === "icms" && <div className="form-grid"><Field label="CFOP de saída"><input value={r.cfop} onChange={(e) => updateRule("cfop", e.target.value)} /></Field><Field label="CST ICMS"><input value={r.cstIcms} onChange={(e) => updateRule("cstIcms", e.target.value)} /></Field><Field label="CSOSN"><input value={r.csosn} onChange={(e) => updateRule("csosn", e.target.value)} /><small>Obrigatório no Simples Nacional.</small></Field><Field label="Alíquota ICMS"><RateInput value={r.icms} set={(v) => updateRule("icms", v)} /></Field><Field label="MVA"><RateInput value={r.mva} set={(v) => updateRule("mva", v)} /></Field><Field label="CEST aplicado"><input value={category.cest} readOnly /></Field></div>}{tab === "pis" && <div className="form-grid"><Field label="CST PIS"><input value={r.cstPis} onChange={(e) => updateRule("cstPis", e.target.value)} /></Field><Field label="CST COFINS"><input value={r.cstCofins} onChange={(e) => updateRule("cstCofins", e.target.value)} /></Field><Field label="Natureza da receita" wide><input value={r.natureza} onChange={(e) => updateRule("natureza", e.target.value)} /></Field><Field label="Alíquota PIS"><RateInput value={r.pis} set={(v) => updateRule("pis", v)} /></Field><Field label="Alíquota COFINS"><RateInput value={r.cofins} set={(v) => updateRule("cofins", v)} /></Field></div>}{tab === "reforma" && <div><div className="reform-note"><strong>IBS / CBS • tabela interna por regime</strong><span>Alíquotas e reduções parametrizadas passam a compor o tributo total e a margem do produto.</span></div><div className="form-grid"><Field label="CST IBS/CBS"><input value={r.cstReforma} onChange={(e) => updateRule("cstReforma", e.target.value)} /></Field><Field label="Classificação tributária" wide><input value={r.classificacao} onChange={(e) => updateRule("classificacao", e.target.value)} /></Field><Field label="Alíquota CBS"><RateInput value={r.cbs} set={(v) => updateRule("cbs", v)} /></Field><Field label="Alíquota IBS"><RateInput value={r.ibs} set={(v) => updateRule("ibs", v)} /></Field><Field label="Redução de alíquota"><RateInput value={r.reducao} set={(v) => updateRule("reducao", v)} /></Field><Field label="Vigência"><input value={category.vigencia} readOnly /></Field></div></div>}<div className="regime-context"><Icon name="check" /><span>Editando regras de <strong>{regimes[regime].title}</strong>. Troque o regime no topo para revisar as demais tabelas.</span></div></section></div>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? "field wide" : "field"}><span>{label}</span>{children}</label>; }
function RateInput({ value, set }: { value: number; set: (v: number) => void }) { return <div className="rate-input"><input type="number" step="0.01" value={(value * 100).toFixed(2)} onChange={(e) => set(+e.target.value / 100)} /><b>%</b></div>; }
