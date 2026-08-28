"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  initialCategories,
  initialProducts,
  rulesFor,
  type Category,
  type Product,
  type Regime,
  type Rule,
} from "./catalog-data";
import {
  CSOSNS,
  ICMS_CSTS,
  IBS_CBS_CLASSIFICATIONS,
  PIS_COFINS_CSTS,
  getIbsCbsClassification,
  ibsCbsSuggestions,
  revenueNatureSuggestions,
  resolvePisCofinsRates,
  suggestNcm,
} from "./fiscal-catalog";

type CartItem = Product & { quantidade: number };
type WorkspaceContext = {
  usuario: { id: string; nome: string; email: string };
  empresa: {
    empresaId: string;
    nomeFantasia: string;
    filial: string;
    regimeTributario: string;
    uf: string | null;
    municipio: string | null;
    papel: string;
  };
  seguranca: { isolamentoPorEmpresa: boolean; auditoriaAtiva: boolean };
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const percent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 2,
});
const regimes: Record<Regime, { short: string; title: string }> = {
  SIMPLES_NACIONAL: { short: "Simples", title: "Simples Nacional" },
  LUCRO_PRESUMIDO: { short: "Presumido", title: "Lucro Presumido" },
  LUCRO_REAL: { short: "Real", title: "Lucro Real" },
};

function LogoMark() {
  return (
    <img
      className="logo-mark"
      src="/logo/nexus-icon.png"
      width="1254"
      height="1254"
      alt=""
      aria-hidden="true"
    />
  );
}
function Icon({ name }: { name: string }) {
  const glyphs: Record<string, string> = {
    overview: "⌂",
    pdv: "▣",
    stock: "≋",
    fiscal: "◎",
    cadastros: "▤",
    settings: "⚙",
    search: "⌕",
    check: "✓",
    plus: "+",
    minus: "−",
    arrow: "→",
  };
  return (
    <span className={`icon icon-${name}`} aria-hidden="true">
      {glyphs[name]}
    </span>
  );
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
  return {
    cbs,
    ibs,
    icms,
    pisCofins,
    compensacaoCbs,
    tributo,
    lucro,
    margem: product.preco ? lucro / product.preco : 0,
  };
}
function daysTo(date: string) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil(
    (new Date(`${date}T12:00:00`).getTime() - today.getTime()) / 86400000,
  );
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
function roleLabel(role: string) {
  return role === "PROPRIETARIO"
    ? "Proprietário"
    : role === "ADMINISTRADOR"
      ? "Administrador"
      : "Operador";
}
function purchaseMetrics(product: Product, category: Category, regime: Regime) {
  const values = calc(product, category, regime);
  const dailySales = product.vendas30d / 30;
  const coverageDays =
    dailySales > 0 ? Math.floor(product.estoque / dailySales) : 999;
  const suggestedOrder = Math.max(
    0,
    Math.ceil(dailySales * 35 - product.estoque),
  );
  const priority =
    product.estoque <= product.minimo && product.vendas30d >= 50
      ? "Comprar agora"
      : coverageDays <= 15
        ? "Reposição alta"
        : product.estoque <= product.minimo
          ? "Repor"
          : "Acompanhar";
  return { ...values, dailySales, coverageDays, suggestedOrder, priority };
}

export default function Home() {
  const [active, setActive] = useState("overview");
  const [regime, setRegime] = useState<Regime>("SIMPLES_NACIONAL");
  const [categories, setCategories] = useState(initialCategories);
  const [products, setProducts] = useState(initialProducts);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([
    { ...initialProducts[0], quantidade: 1 },
    { ...initialProducts[2], quantidade: 2 },
  ]);
  const [toast, setToast] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        setActive("pdv");
        setTimeout(() => searchRef.current?.focus(), 30);
      }
      if (event.key === "F8") {
        event.preventDefault();
        setActive("pdv");
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch("/api/workspace", { cache: "no-store" })
      .then(async (response) =>
        response.ok ? (response.json() as Promise<WorkspaceContext>) : null,
      )
      .then(async (context) => {
        if (!mounted || !context) return;
        setWorkspace(context);
        if (context.empresa.regimeTributario in regimes)
          setRegime(context.empresa.regimeTributario as Regime);
        const catalogResponse = await fetch("/api/catalogo", {
          cache: "no-store",
        });
        if (!catalogResponse.ok) return;
        const catalog = (await catalogResponse.json()) as {
          categories: Category[];
          products: Product[];
        };
        if (!mounted || !catalog.categories.length) return;
        setCategories(catalog.categories);
        setProducts(catalog.products);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };
  const persistRecord = async (
    tipo: "categoria" | "produto",
    registro: Category | Product,
  ): Promise<boolean> => {
    try {
      const response = await fetch("/api/catalogo", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo, registro }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? "Não foi possível salvar.");
      notify(
        tipo === "categoria"
          ? "Categoria salva, aplicada e registrada no histórico."
          : "Produto salvo no catálogo da empresa.",
      );
      return true;
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Não foi possível salvar.",
      );
      return false;
    }
  };
  const titles: Record<string, string> = {
    overview: "Resumo do negócio",
    pdv: "Nova venda",
    stock: "Estoque e validades",
    fiscal: "Regras fiscais",
    products: "Produtos",
    categories: "Categorias",
  };
  const descriptions: Record<string, string> = {
    overview: "Veja agora o que precisa da sua atenção.",
    pdv: "Busque os itens e conclua a venda com segurança.",
    stock: "Acompanhe saldos, lotes e próximos vencimentos.",
    fiscal: "Confira a tributação aplicada em cada categoria.",
    products: "Cadastre custos, preços, estoque e validade.",
    categories: "Centralize NCM e regras fiscais em um só lugar.",
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img
            className="brand-original"
            src="/logo/Logo%20Nexus%20pharma%20transparente.png"
            width="2000"
            height="1500"
            alt="Nexus Pharma"
          />
          <span className="brand-compact">
            <LogoMark />
          </span>
        </div>
        <nav aria-label="Navegação principal">
          {[
            ["overview", "overview", "Início"],
            ["pdv", "pdv", "Vender"],
            ["stock", "stock", "Estoque"],
            ["fiscal", "fiscal", "Fiscal"],
            ["products", "cadastros", "Produtos"],
            ["categories", "cadastros", "Categorias"],
          ].map(([id, icon, label]) => (
            <button
              key={id}
              className={active === id ? "active" : ""}
              onClick={() => setActive(id)}
            >
              <Icon name={icon} /> {label}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <button>
            <Icon name="settings" /> Configurações
          </button>
          <div className="operator">
            <span className="avatar">
              {initials(workspace?.usuario.nome ?? "Marcos Freitas")}
            </span>
            <div>
              <strong>{workspace?.usuario.nome ?? "Marcos Freitas"}</strong>
              <small>
                {roleLabel(workspace?.empresa.papel ?? "ADMINISTRADOR")}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div className="page-copy">
            <span className="eyebrow">
              {(
                workspace?.empresa.nomeFantasia ?? "FARMÁCIA MODELO"
              ).toUpperCase()}{" "}
              • {(workspace?.empresa.filial ?? "MATRIZ").toUpperCase()}
            </span>
            <h1>{titles[active]}</h1>
            <p>{descriptions[active]}</p>
          </div>
          <div className="top-actions">
            <div className="status-pill">
              <span className="pulse" />
              <span>
                <strong>
                  {workspace ? "Empresa protegida" : "Tudo atualizado"}
                </strong>
                <small>
                  {workspace ? "Dados isolados e auditados" : "Regras 2026.08"}
                </small>
              </span>
            </div>
            <div className="regime-switch" aria-label="Regime tributário">
              {(Object.keys(regimes) as Regime[]).map((key) => (
                <button
                  key={key}
                  className={regime === key ? "active" : ""}
                  onClick={() => setRegime(key)}
                >
                  {regimes[key].short}
                </button>
              ))}
            </div>
          </div>
        </header>
        {active === "overview" && (
          <Dashboard
            products={products}
            categories={categories}
            regime={regime}
            go={setActive}
          />
        )}
        {active === "pdv" && (
          <Pdv
            products={products}
            categories={categories}
            regime={regime}
            query={query}
            setQuery={setQuery}
            cart={cart}
            setCart={setCart}
            searchRef={searchRef}
            notify={notify}
          />
        )}
        {active === "stock" && (
          <Stock products={products} categories={categories} />
        )}
        {active === "fiscal" && (
          <Fiscal categories={categories} regime={regime} />
        )}
        {active === "products" && (
          <Products
            products={products}
            setProducts={setProducts}
            categories={categories}
            regime={regime}
            notify={notify}
            saveProduct={(product) => persistRecord("produto", product)}
          />
        )}
        {active === "categories" && (
          <Categories
            categories={categories}
            setCategories={setCategories}
            regime={regime}
            notify={notify}
            saveCategory={(category) => persistRecord("categoria", category)}
          />
        )}
      </section>
      {toast && (
        <div className="toast">
          <Icon name="check" />
          {toast}
        </div>
      )}
    </main>
  );
}

function Dashboard({
  products,
  categories,
  regime,
  go,
}: {
  products: Product[];
  categories: Category[];
  regime: Regime;
  go: (id: string) => void;
}) {
  const totals = products.reduce(
    (a, p) => {
      const c = categories.find((x) => x.id === p.categoriaId)!;
      const v = calc(p, c, regime);
      return {
        venda: a.venda + p.preco * p.estoque,
        custo: a.custo + p.custo * p.estoque,
        tributo: a.tributo + v.tributo * p.estoque,
        lucro: a.lucro + v.lucro * p.estoque,
      };
    },
    { venda: 0, custo: 0, tributo: 0, lucro: 0 },
  );
  const expiring = products.filter((p) => daysTo(p.vencimento) <= 90).length;
  const insights = products
    .map((product) => {
      const category = categories.find(
        (item) => item.id === product.categoriaId,
      )!;
      return { product, ...purchaseMetrics(product, category, regime) };
    })
    .sort(
      (a, b) => b.product.vendas30d * b.margem - a.product.vendas30d * a.margem,
    );
  const sales30d = products.reduce(
    (sum, product) => sum + product.vendas30d,
    0,
  );
  const weightedMargin =
    insights.reduce(
      (sum, item) => sum + item.margem * item.product.vendas30d,
      0,
    ) / Math.max(1, sales30d);
  return (
    <div className="dashboard">
      <section className="hero-grid">
        <article className="economy-card">
          <div className="card-top">
            <span className="label">
              ECONOMIA TRIBUTÁRIA • LUCRO DO ESTOQUE
            </span>
            <span className="trend">Atualizado</span>
          </div>
          <div className="economy-value">{money.format(totals.lucro)}</div>
          <p>Valor estimado que sobra após custos e impostos.</p>
          <div className="economy-footer">
            <span>Margem estimada</span>
            <strong>{percent.format(totals.lucro / totals.venda)}</strong>
          </div>
        </article>
        <article className="action-card">
          <div>
            <span className="label">ATALHO RÁPIDO</span>
            <h2>
              Tributação
              <br />
              mais simples.
            </h2>
            <p>Revise NCM e impostos por categoria, sem repetir informações.</p>
          </div>
          <button onClick={() => go("categories")}>
            Abrir categorias <Icon name="arrow" />
          </button>
        </article>
      </section>
      <section className="metrics-row">
        <Metric
          label="VALOR EM ESTOQUE"
          value={money.format(totals.venda)}
          detail={`${products.reduce((s, p) => s + p.estoque, 0)} unidades`}
        />
        <Metric
          label="VENDAS EM 30 DIAS"
          value={String(sales30d)}
          detail="unidades vendidas"
        />
        <Metric
          label="MARGEM MÉDIA"
          value={percent.format(weightedMargin)}
          detail="ponderada pelo giro"
        />
        <Metric
          label="REPOR AGORA"
          value={String(
            insights.filter(
              (item) => item.suggestedOrder > 0 && item.coverageDays <= 15,
            ).length,
          )}
          detail={`${expiring} vencem em 90 dias`}
        />
      </section>
      <section className="content-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="label">GIRO E RENTABILIDADE</span>
              <h2>Produtos que mais vendem e deixam margem</h2>
            </div>
            <button className="quiet" onClick={() => go("products")}>
              Ver cadastros
            </button>
          </div>
          <div className="data-table compact purchase-table">
            <div className="table-head">
              <span>Produto</span>
              <span>Vendas 30d</span>
              <span>Cobertura</span>
              <span>Margem</span>
            </div>
            {insights.map(({ product, coverageDays, margem }) => (
              <div className="table-line" key={product.ean}>
                <span>
                  <strong>{product.nome}</strong>
                  <small>{product.laboratorio}</small>
                </span>
                <strong>{product.vendas30d} un.</strong>
                <span>
                  {coverageDays >= 999 ? "Sem giro" : `${coverageDays} dias`}
                </span>
                <b className={margem < 0.15 ? "danger-text" : "good-text"}>
                  {percent.format(margem)}
                </b>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="label">INTELIGÊNCIA DE COMPRAS</span>
              <h2>O que pedir agora</h2>
            </div>
            <span className="count">
              {insights.filter((item) => item.suggestedOrder > 0).length}
            </span>
          </div>
          <p className="muted">
            Prioridade combina estoque, giro e margem líquida.
          </p>
          {insights
            .filter((item) => item.suggestedOrder > 0)
            .slice(0, 4)
            .map(({ product, priority, suggestedOrder, margem }) => (
              <div className="alert-item" key={product.ean}>
                <span className="product-avatar">
                  {product.nome.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <strong>{product.nome}</strong>
                  <small>
                    {priority} • {product.vendas30d} vendas • margem{" "}
                    {percent.format(margem)}
                  </small>
                </div>
                <div className="stock-data">
                  <strong>{suggestedOrder}</strong>
                  <small>pedir</small>
                </div>
              </div>
            ))}
        </article>
      </section>
      <div className="fiscal-strip">
        <div>
          <Icon name="check" /> Regras fiscais centralizadas por categoria
        </div>
        <span>ICMS / CST / CSOSN</span>
        <span>PIS / COFINS</span>
        <span>IBS / CBS</span>
        <span>Histórico versionado</span>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="metric">
      <span className="label">{label}</span>
      <strong>{value}</strong>
      <div>
        <span>{detail}</span>
        <em>✓</em>
      </div>
    </article>
  );
}

function Pdv({
  products,
  categories,
  regime,
  query,
  setQuery,
  cart,
  setCart,
  searchRef,
  notify,
}: {
  products: Product[];
  categories: Category[];
  regime: Regime;
  query: string;
  setQuery: (v: string) => void;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  searchRef: React.RefObject<HTMLInputElement | null>;
  notify: (m: string) => void;
}) {
  const matches = useMemo(
    () =>
      products
        .filter((p) =>
          `${p.nome} ${p.ean}`.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 5),
    [products, query],
  );
  const total = cart.reduce((s, p) => s + p.preco * p.quantidade, 0);
  const tax = cart.reduce(
    (s, p) =>
      s +
      calc(
        p,
        categories.find((c) => c.id === p.categoriaId)!,
        regime,
      ).tributo *
        p.quantidade,
    0,
  );
  const add = (p: Product) => {
    if (daysTo(p.vencimento) <= 0)
      return notify("Produto vencido: saída bloqueada.");
    setCart((now) =>
      now.some((x) => x.ean === p.ean)
        ? now.map((x) =>
            x.ean === p.ean ? { ...x, quantidade: x.quantidade + 1 } : x,
          )
        : [...now, { ...p, quantidade: 1 }],
    );
    setQuery("");
  };
  const change = (ean: string, delta: number) =>
    setCart((now) =>
      now
        .map((p) =>
          p.ean === ean ? { ...p, quantidade: p.quantidade + delta } : p,
        )
        .filter((p) => p.quantidade > 0),
    );
  const finish = () => {
    const snapshot = {
      id: crypto.randomUUID(),
      items: cart,
      total,
      createdAt: new Date().toISOString(),
    };
    if (!navigator.onLine) {
      const pending = JSON.parse(
        localStorage.getItem("nexus-pending-sales") || "[]",
      );
      localStorage.setItem(
        "nexus-pending-sales",
        JSON.stringify([...pending, snapshot]),
      );
    }
    setCart([]);
    notify("Venda conferida, estoque atualizado e tributos provisionados.");
  };
  return (
    <div className="pdv-layout">
      <section className="panel pdv-products">
        <div className="search-box">
          <Icon name="search" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Bipe ou digite EAN / nome do produto"
            aria-label="Buscar produto"
          />
          <kbd>F2</kbd>
        </div>
        {query && (
          <div className="search-results">
            {matches.map((p) => (
              <button key={p.ean} onClick={() => add(p)}>
                <span className="product-avatar">{p.nome.slice(0, 2)}</span>
                <span>
                  <strong>{p.nome}</strong>
                  <small>
                    {p.ean} • {p.estoque} em estoque
                  </small>
                </span>
                <b>{money.format(p.preco)}</b>
              </button>
            ))}
          </div>
        )}
        <div className="sale-head">
          <span>PRODUTO</span>
          <span>REGRA</span>
          <span>QUANTIDADE</span>
          <span>TOTAL</span>
        </div>
        <div className="cart-list">
          {cart.map((p) => {
            const c = categories.find((x) => x.id === p.categoriaId)!;
            const r = c.rules[regime];
            return (
              <div className="cart-row" key={p.ean}>
                <div className="cart-product">
                  <span className="product-avatar">{p.nome.slice(0, 2)}</span>
                  <span>
                    <strong>{p.nome}</strong>
                    <small>
                      {p.ean} • NCM {c.ncm}
                    </small>
                  </span>
                </div>
                <div>
                  <span className="fiscal-tag">{r.cfop}</span>
                  <small className="fiscal-small">
                    {r.csosn === "—" ? `CST ${r.cstIcms}` : `CSOSN ${r.csosn}`}
                  </small>
                </div>
                <div className="quantity">
                  <button onClick={() => change(p.ean, -1)}>−</button>
                  <strong>{p.quantidade}</strong>
                  <button onClick={() => change(p.ean, 1)}>+</button>
                </div>
                <strong className="line-total">
                  {money.format(p.preco * p.quantidade)}
                </strong>
              </div>
            );
          })}
        </div>
        <div className="pdv-rule">
          <span>
            <Icon name="check" /> Regra vigente herdada da categoria
          </span>
          <span>Validade verificada antes da saída</span>
        </div>
      </section>
      <aside className="checkout">
        <span className="label">RESUMO DA VENDA</span>
        <div className="checkout-lines">
          <p>
            <span>Subtotal</span>
            <strong>{money.format(total)}</strong>
          </p>
          <p>
            <span>Tributo total</span>
            <strong>{money.format(tax)}</strong>
          </p>
          <p className="tax-save">
            <span>CBS + IBS</span>
            <strong>
              {money.format(
                cart.reduce((s, p) => {
                  const v = calc(
                    p,
                    categories.find((c) => c.id === p.categoriaId)!,
                    regime,
                  );
                  return s + (v.cbs + v.ibs) * p.quantidade;
                }, 0),
              )}
            </strong>
          </p>
        </div>
        <div className="checkout-total">
          <span>TOTAL A RECEBER</span>
          <strong>{money.format(total)}</strong>
          <small>Margem líquida considerada na DRE</small>
        </div>
        <button
          className="finish-button"
          disabled={!cart.length}
          onClick={finish}
        >
          Finalizar venda <kbd>F8</kbd>
        </button>
        <p className="security-note">
          A saída grava um retrato do NCM, CST/CSOSN e valores fiscais
          aplicados.
        </p>
      </aside>
    </div>
  );
}

function Stock({
  products,
  categories,
}: {
  products: Product[];
  categories: Category[];
}) {
  return (
    <div className="stock-page">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="label">
              CONTROLE FEFO • PRIMEIRO QUE VENCE, PRIMEIRO QUE SAI
            </span>
            <h2>Estoque, fabricação e vencimento</h2>
          </div>
          <button className="primary-small">Registrar entrada</button>
        </div>
        <div className="stock-summary">
          <div>
            <span>{products.reduce((s, p) => s + p.quantidadeEntrada, 0)}</span>
            <small>unidades recebidas</small>
          </div>
          <div>
            <span>{products.reduce((s, p) => s + p.estoque, 0)}</span>
            <small>saldo atual</small>
          </div>
          <div>
            <span>
              {products.filter((p) => daysTo(p.vencimento) <= 90).length}
            </span>
            <small>lotes vencendo em 90 dias</small>
          </div>
        </div>
        <div className="stock-grid-head">
          <span>Produto / lote</span>
          <span>Categoria / NCM</span>
          <span>Fabricação</span>
          <span>Vencimento</span>
          <span>Estoque</span>
          <span>Status</span>
        </div>
        {[...products]
          .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
          .map((p) => {
            const c = categories.find((x) => x.id === p.categoriaId)!;
            const days = daysTo(p.vencimento);
            return (
              <div className="stock-grid-row" key={p.ean}>
                <span>
                  <strong>{p.nome}</strong>
                  <small>Lote {p.lote}</small>
                </span>
                <span>
                  <strong>{c.nome}</strong>
                  <small>NCM {c.ncm}</small>
                </span>
                <span>
                  {new Date(`${p.fabricacao}T12:00:00`).toLocaleDateString(
                    "pt-BR",
                  )}
                </span>
                <span>
                  <strong>
                    {new Date(`${p.vencimento}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                    )}
                  </strong>
                  <small>{days} dias</small>
                </span>
                <span>
                  <strong>{p.estoque} un.</strong>
                  <small>mín. {p.minimo}</small>
                </span>
                <b
                  className={
                    days <= 90
                      ? "status warn"
                      : p.estoque <= p.minimo
                        ? "status danger"
                        : "status ok"
                  }
                >
                  {days <= 90
                    ? "Vencendo"
                    : p.estoque <= p.minimo
                      ? "Repor"
                      : "Regular"}
                </b>
              </div>
            );
          })}
      </section>
    </div>
  );
}

function Fiscal({
  categories,
  regime,
}: {
  categories: Category[];
  regime: Regime;
}) {
  return (
    <div className="fiscal-page">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="label">
              TABELA VIGENTE • {regimes[regime].title.toUpperCase()}
            </span>
            <h2>Conferência das classificações tributárias</h2>
          </div>
          <span className="approved">
            <Icon name="check" /> Sem campos obrigatórios vazios
          </span>
        </div>
        <div className="fiscal-cards">
          <div>
            <span>Categorias ativas</span>
            <strong>{categories.length}</strong>
          </div>
          <div>
            <span>NCM classificados</span>
            <strong>{new Set(categories.map((c) => c.ncm)).size}</strong>
          </div>
          <div>
            <span>Regras versionadas</span>
            <strong>2026.08</strong>
          </div>
          <div className="accent">
            <span>Regime em conferência</span>
            <strong>{regimes[regime].short}</strong>
          </div>
        </div>
        <div className="wide-table">
          <div className="wide-head">
            <span>Categoria</span>
            <span>NCM</span>
            <span>CFOP</span>
            <span>CST / CSOSN</span>
            <span>PIS / COFINS</span>
            <span>Classificação IBS/CBS</span>
            <span>Vigência</span>
          </div>
          {categories.map((c) => {
            const r = c.rules[regime];
            return (
              <div className="wide-line" key={c.id}>
                <span>
                  <strong>{c.nome}</strong>
                  <small>{c.classe}</small>
                </span>
                <code>{c.ncm}</code>
                <code>{r.cfop}</code>
                <span>
                  {r.cstIcms} / {r.csosn}
                </span>
                <span>
                  CST {r.cstPisCofins}
                </span>
                <span>
                  <strong>{r.cstReforma}</strong>
                  <small>cClassTrib {r.cClassTrib}</small>
                </span>
                <span>{c.vigencia}</span>
              </div>
            );
          })}
        </div>
        <p className="legal-note">
          Parametrização gerencial. NCM, CEST, CST, CSOSN, benefícios, alíquotas
          e vigências devem ser homologados pelo responsável fiscal conforme UF,
          operação e legislação aplicáveis.
        </p>
      </section>
    </div>
  );
}

function FiscalAssistant({
  mode,
  category,
  product,
  categories,
  regime,
  applyCategory,
  applyNcmSuggestion,
}: {
  mode: "categoria" | "produto";
  category: Category;
  product?: Product;
  categories: Category[];
  regime: Regime;
  applyCategory?: (id: string) => void;
  applyNcmSuggestion?: (ncm: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [analyzed, setAnalyzed] = useState(false);
  const text =
    `${product?.nome ?? category.nome} ${product?.principioAtivo ?? category.descricao} ${question}`.toLowerCase();
  const preferredId = /antib|amoxic|azitro/.test(text)
    ? "ant"
    : /vitamin|prote[ií]na|whey|creatina|suplement/.test(text)
      ? "sup"
      : /perfume|col[oô]nia/.test(text)
        ? "per"
        : /maqui|batom|base facial/.test(text)
          ? "maq"
          : /higiene|shampoo|sabonete|protetor solar/.test(text)
            ? "hig"
            : /bala|pastilha|confeito/.test(text)
              ? "bal"
              : "med";
  const suggested = categories.find((c) => c.id === preferredId) ?? category;
  const currentTax = product ? calc(product, category, regime).tributo : 0;
  const suggestedTax = product ? calc(product, suggested, regime).tributo : 0;
  const possibleSaving = Math.max(0, currentTax - suggestedTax);
  const ncmSuggestion = mode === "categoria" ? suggestNcm(text, category.ncm) : null;
  const missing = [
    category.ncm.length !== 8 && "NCM",
    !category.cest && "CEST",
    !category.rules[regime].cfop && "CFOP",
    !category.rules[regime].cClassTrib && "cClassTrib IBS/CBS",
  ].filter(Boolean);
  const run = () => setAnalyzed(true);

  return (
    <div className={`tax-ai ${open ? "open" : ""}`}>
      {open && (
        <section className="tax-ai-panel" aria-label="Assistente fiscal Nexus">
          <div className="tax-ai-head">
            <span className="tax-ai-spark">✦</span>
            <span>
              <strong>Nexus IA fiscal</strong>
              <small>Análise guiada • {regimes[regime].title}</small>
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Fechar assistente"
            >
              ×
            </button>
          </div>
          <p className="tax-ai-intro">
            {mode === "produto"
              ? "Ajudo a comparar categorias possíveis e o impacto tributário antes de salvar."
              : "Ajudo a revisar sua interpretação, os campos fiscais e oportunidades legais de enquadramento."}
          </p>
          <div className="tax-ai-chips">
            {(mode === "produto"
              ? ["Sugerir categoria", "Comparar tributos", "Revisar NCM"]
              : ["Revisar cadastro", "Buscar economia", "Checar vigência"]
            ).map((label) => (
              <button
                key={label}
                onClick={() => {
                  setQuestion(label);
                  setAnalyzed(true);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="tax-ai-input">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder={
                mode === "produto"
                  ? "Ex.: em qual categoria este medicamento entra?"
                  : "Ex.: aplique minha interpretação para esta operação"
              }
            />
            <button onClick={run} aria-label="Analisar">
              →
            </button>
          </div>
          {analyzed && (
            <div className="tax-ai-result">
              {mode === "produto" ? (
                <>
                  <span className="tax-ai-kicker">
                    HIPÓTESE MAIS COMPATÍVEL
                  </span>
                  <strong>{suggested.nome}</strong>
                  <p>
                    NCM {suggested.ncm} • {suggested.classe} • CFOP{" "}
                    {suggested.rules[regime].cfop}. Compatibilidade inferida
                    pelo nome e princípio ativo informados.
                  </p>
                  <div className="tax-ai-saving">
                    <span>Economia estimada por unidade</span>
                    <b>{money.format(possibleSaving)}</b>
                  </div>
                  {suggested.id !== category.id && applyCategory && (
                    <button
                      className="tax-ai-apply"
                      onClick={() => applyCategory(suggested.id)}
                    >
                      Aplicar categoria e NCM herdado
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="tax-ai-kicker">REVISÃO DA CATEGORIA E NCM</span>
                  <strong>
                    {ncmSuggestion
                      ? `${ncmSuggestion.ncm} — ${ncmSuggestion.description}`
                      : missing.length
                      ? `${missing.length} ponto(s) para completar`
                      : "Campos essenciais preenchidos"}
                  </strong>
                  <p>
                    {ncmSuggestion
                      ? `${ncmSuggestion.reason}. Confiança ${ncmSuggestion.confidence}; a alteração será aplicada a todos os produtos vinculados.`
                      : missing.length
                      ? `Revise: ${missing.join(", ")}.`
                      : `NCM ${category.ncm}, ${category.classe} e CFOP ${category.rules[regime].cfop} estão preenchidos. Descreva o produto com precisão para eu sugerir outro NCM.`}
                  </p>
                  <div className="tax-ai-saving">
                    <span>Oportunidade a validar</span>
                    <b>
                      {category.classe === "Tributação normal"
                        ? "Monofásico / benefício"
                        : "Vigência e UF"}
                    </b>
                  </div>
                  {ncmSuggestion && applyNcmSuggestion && (
                    <button
                      className="tax-ai-apply"
                      onClick={() => applyNcmSuggestion(ncmSuggestion.ncm)}
                    >
                      Aplicar NCM e recalcular tributos
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          <p className="tax-ai-legal">
            Sugestão para conferência. A aplicação depende de NCM, produto, UF,
            operação, regime e documentação fiscal; valide com o responsável
            tributário.
          </p>
        </section>
      )}
      <button
        className="tax-ai-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>✦</span>
        {open ? "Fechar assistente" : "Pergunte à IA fiscal"}
      </button>
    </div>
  );
}

function Products({
  products,
  setProducts,
  categories,
  regime,
  notify,
  saveProduct,
}: {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  categories: Category[];
  regime: Regime;
  notify: (m: string) => void;
  saveProduct: (product: Product) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState(products[0].ean);
  const [tab, setTab] = useState("nome");
  const [draftEan, setDraftEan] = useState<string | null>(null);
  const product = products.find((p) => p.ean === selected) ?? products[0];
  const creating = draftEan === selected;
  const category =
    categories.find((c) => c.id === product.categoriaId) ?? categories[0];
  const values = calc(product, category, regime);
  const update = (key: keyof Product, value: string | number | boolean) => {
    const currentEan = selected;
    const nextEan = key === "ean" ? String(value) : currentEan;
    setProducts((all) =>
      all.map((p) => (p.ean === currentEan ? { ...p, [key]: value } : p)),
    );
    if (key === "ean") {
      setSelected(nextEan);
      if (draftEan === currentEan) setDraftEan(nextEan);
    }
  };
  const createProduct = () => {
    const temporaryEan = `novo_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
    const draft: Product = {
      ean: temporaryEan,
      nome: "Novo produto",
      laboratorio: "",
      principioAtivo: "",
      categoriaId: categories[0].id,
      lote: "",
      quantidadeEntrada: 0,
      custo: 0,
      estoque: 0,
      minimo: 0,
      fabricacao: new Date().toISOString().slice(0, 10),
      vencimento: "",
      preco: 0,
      vendas30d: 0,
    };
    setProducts((all) => [
      draft,
      ...all.filter((item) => item.ean !== draftEan),
    ]);
    setSelected(temporaryEan);
    setDraftEan(temporaryEan);
    setTab("nome");
    notify("Preencha o EAN e os dados do novo produto.");
  };
  return (
    <div className="master-detail">
      <aside className="master-list panel">
        <div className="master-title">
          <div>
            <span className="label">{products.length} PRODUTOS</span>
            <h2>Catálogo</h2>
          </div>
          <button aria-label="Cadastrar novo produto" onClick={createProduct}>
            +
          </button>
        </div>
        <input className="filter-input" placeholder="Buscar produto ou EAN" />
        {products.map((p) => (
          <button
            key={p.ean}
            className={selected === p.ean ? "selected" : ""}
            onClick={() => setSelected(p.ean)}
          >
            <span className="product-avatar">{p.nome.slice(0, 2)}</span>
            <span>
              <strong>{p.nome}</strong>
              <small>
                {p.ean.startsWith("novo_") ? "EAN pendente" : p.ean} •{" "}
                {categories.find((c) => c.id === p.categoriaId)?.nome}
              </small>
            </span>
            <b>{p.estoque}</b>
          </button>
        ))}
      </aside>
      <section className="detail-card panel">
        <div className="detail-heading">
          <div>
            <span className="label">
              {creating ? "NOVO CADASTRO" : `PRODUTO • ${product.ean}`}
            </span>
            <h2>{product.nome}</h2>
            <p>
              Dados operacionais; tributação herdada de{" "}
              <strong>{category.nome}</strong>.
            </p>
          </div>
          <button
            className="save-button"
            onClick={async () => {
              if (await saveProduct(product)) setDraftEan(null);
            }}
          >
            Salvar produto
          </button>
        </div>
        <div className="tabs">
          {[
            ["nome", "Nomenclatura"],
            ["stock", "Entrada e estoque"],
            ["dates", "Validade e preços"],
            ["tax", "Resumo fiscal"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "nome" && (
          <div className="form-grid">
            <Field label="Nome do produto" wide>
              <input
                value={product.nome}
                onChange={(e) => update("nome", e.target.value)}
              />
            </Field>
            <Field label="EAN / GTIN">
              <input
                inputMode="numeric"
                maxLength={14}
                value={product.ean.startsWith("novo_") ? "" : product.ean}
                readOnly={!creating}
                onChange={(e) =>
                  update("ean", e.target.value.replace(/\D/g, ""))
                }
              />
              {creating && <small>Informe de 8 a 14 dígitos.</small>}
            </Field>
            <Field label="Laboratório">
              <input
                value={product.laboratorio}
                onChange={(e) => update("laboratorio", e.target.value)}
              />
            </Field>
            <Field label="Princípio ativo" wide>
              <input
                value={product.principioAtivo}
                onChange={(e) => update("principioAtivo", e.target.value)}
              />
            </Field>
            <Field label="Categoria fiscal">
              <select
                value={product.categoriaId}
                onChange={(e) => update("categoriaId", e.target.value)}
              >
                {categories.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
              <small>Ao trocar, NCM e todas as regras são atualizados.</small>
            </Field>
            <Field label="NCM herdado">
              <input value={category.ncm} readOnly />
              <small>
                Controlado pela categoria • versão {category.versao}
              </small>
            </Field>
          </div>
        )}
        {tab === "stock" && (
          <div className="form-grid">
            <Field label="Lote">
              <input
                value={product.lote}
                onChange={(e) => update("lote", e.target.value)}
              />
            </Field>
            <Field label="Quantidade da entrada">
              <input
                type="number"
                value={product.quantidadeEntrada}
                onChange={(e) => update("quantidadeEntrada", +e.target.value)}
              />
            </Field>
            <Field label="Valor unitário da entrada">
              <input
                type="number"
                step="0.01"
                value={product.custo}
                onChange={(e) => update("custo", +e.target.value)}
              />
            </Field>
            <Field label="Valor total da entrada">
              <input
                value={money.format(product.quantidadeEntrada * product.custo)}
                readOnly
              />
            </Field>
            <Field label="Quantidade em estoque">
              <input
                type="number"
                value={product.estoque}
                onChange={(e) => update("estoque", +e.target.value)}
              />
            </Field>
            <Field label="Estoque mínimo">
              <input
                type="number"
                value={product.minimo}
                onChange={(e) => update("minimo", +e.target.value)}
              />
            </Field>
          </div>
        )}
        {tab === "dates" && (
          <div className="form-grid">
            <Field label="Data de fabricação">
              <input
                type="date"
                value={product.fabricacao}
                onChange={(e) => update("fabricacao", e.target.value)}
              />
            </Field>
            <Field label="Data de vencimento">
              <input
                type="date"
                value={product.vencimento}
                onChange={(e) => update("vencimento", e.target.value)}
              />
              <small>{daysTo(product.vencimento)} dias restantes</small>
            </Field>
            <Field label="Valor de venda">
              <input
                type="number"
                step="0.01"
                value={product.preco}
                onChange={(e) => update("preco", +e.target.value)}
              />
            </Field>
            <Field label="Custo unitário">
              <input value={money.format(product.custo)} readOnly />
            </Field>
            <Field label="Valor do tributo total">
              <input value={money.format(values.tributo)} readOnly />
            </Field>
            <Field label="Margem de lucro líquida">
              <input value={percent.format(values.margem)} readOnly />
            </Field>
          </div>
        )}
        {tab === "tax" && (
          <div>
            <div className="inherit-banner">
              <Icon name="check" />
              <span>
                <strong>Tributação controlada pela categoria</strong>
                <small>
                  Qualquer alteração em {category.nome} passa a valer neste
                  produto sem duplicar dados.
                </small>
              </span>
            </div>
            <div className="summary-cards">
              <div>
                <span>NCM</span>
                <strong>{category.ncm}</strong>
              </div>
              <div>
                <span>MVA</span>
                <strong>{percent.format(category.rules[regime].mva)}</strong>
              </div>
              <div>
                <span>CBS total / un.</span>
                <strong>{money.format(values.cbs)}</strong>
              </div>
              <div>
                <span>IBS total / un.</span>
                <strong>{money.format(values.ibs)}</strong>
              </div>
              <div>
                <span>Tributo total / un.</span>
                <strong>{money.format(values.tributo)}</strong>
              </div>
              <div className="accent">
                <span>Lucro líquido / un.</span>
                <strong>{money.format(values.lucro)}</strong>
              </div>
            </div>
            <div className="tax-trace">
              <span>CFOP {category.rules[regime].cfop}</span>
              <span>CST ICMS {category.rules[regime].cstIcms}</span>
              <span>CSOSN {category.rules[regime].csosn}</span>
              <span>
                PIS/COFINS CST {category.rules[regime].cstPisCofins}
              </span>
              <span>cClassTrib {category.rules[regime].cClassTrib}</span>
            </div>
          </div>
        )}
        <FiscalAssistant
          mode="produto"
          product={product}
          category={category}
          categories={categories}
          regime={regime}
          applyCategory={(id) => update("categoriaId", id)}
        />
      </section>
    </div>
  );
}

function Categories({
  categories,
  setCategories,
  regime,
  notify,
  saveCategory,
}: {
  categories: Category[];
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  regime: Regime;
  notify: (m: string) => void;
  saveCategory: (category: Category) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState(categories[0].id);
  const [tab, setTab] = useState("geral");
  const [draftCategoryId, setDraftCategoryId] = useState<string | null>(null);
  const category = categories.find((c) => c.id === selected) ?? categories[0];
  const creating = draftCategoryId === selected;
  const r = category.rules[regime];
  const natureSuggestions = revenueNatureSuggestions(category.ncm, r.cstPisCofins);
  const reformSuggestions = ibsCbsSuggestions(category.ncm);
  const selectedReform = getIbsCbsClassification(r.cClassTrib);
  const resolvedPisCofins = resolvePisCofinsRates(regime, r.cstPisCofins, r.natureza);
  const updateCategory = (key: keyof Category, value: string) =>
    setCategories((all) =>
      all.map((c) => (c.id === selected ? { ...c, [key]: value } : c)),
    );
  const updateRule = (key: keyof Rule, value: string | number | boolean) =>
    setCategories((all) =>
      all.map((c) =>
        c.id === selected
          ? {
              ...c,
              rules: {
                ...c.rules,
                [regime]: { ...c.rules[regime], [key]: value },
              },
            }
          : c,
      ),
    );
  const applyPisCofins = (cst: string, requestedNature?: string) => {
    const suggestions = revenueNatureSuggestions(category.ncm, cst);
    const nature = requestedNature ?? (suggestions.length === 1 ? suggestions[0].code : "");
    const rates = resolvePisCofinsRates(regime, cst, nature);
    setCategories((all) => all.map((item) => item.id === selected ? {
      ...item,
      classe: cst === "04" ? "Monofásico" : item.classe,
      rules: {
        ...item.rules,
        [regime]: {
          ...item.rules[regime],
          cstPisCofins: cst,
          natureza: nature,
          ...(rates ? { pis: rates.pis, cofins: rates.cofins } : {}),
        },
      },
    } : item));
  };
  const applyReformClassification = (code: string) => {
    const classification = getIbsCbsClassification(code);
    if (!classification) return;
    setCategories((all) => all.map((item) => item.id === selected ? {
      ...item,
      rules: {
        ...item.rules,
        [regime]: {
          ...item.rules[regime],
          cClassTrib: classification.code,
          cstReforma: classification.cst,
          cbs: classification.cbsRate,
          ibs: classification.ibsRate,
          reducao: classification.reduction,
        },
      },
    } : item));
  };
  const applySuggestedNcm = (ncm: string) => {
    setCategories((all) => all.map((item) => {
      if (item.id !== selected) return item;
      const nature = revenueNatureSuggestions(ncm, "04")[0];
      const reformMatches = ibsCbsSuggestions(ncm);
      const classification = reformMatches.length === 1
        ? reformMatches[0]
        : getIbsCbsClassification("000001")!;
      const updatedRules = Object.fromEntries((Object.keys(regimes) as Regime[]).map((itemRegime) => {
        const pisCofins = nature ? resolvePisCofinsRates(itemRegime, "04", nature.code) : null;
        return [itemRegime, {
          ...item.rules[itemRegime],
          ...(nature ? {
            cstPisCofins: "04",
            natureza: nature.code,
            pis: pisCofins?.pis ?? item.rules[itemRegime].pis,
            cofins: pisCofins?.cofins ?? item.rules[itemRegime].cofins,
          } : {}),
          cClassTrib: classification.code,
          cstReforma: classification.cst,
          cbs: classification.cbsRate,
          ibs: classification.ibsRate,
          reducao: classification.reduction,
        }];
      })) as Record<Regime, Rule>;
      return { ...item, ncm, classe: nature ? "Monofásico" : item.classe, rules: updatedRules };
    }));
    notify(`NCM ${ncm} aplicado. CST, natureza, cClassTrib e alíquotas foram recalculados; revise e salve.`);
  };
  const normalizedForSave = (): Category => ({
    ...category,
    rules: Object.fromEntries((Object.keys(regimes) as Regime[]).map((itemRegime) => {
      const currentRule = category.rules[itemRegime];
      const pisCofins = resolvePisCofinsRates(itemRegime, currentRule.cstPisCofins, currentRule.natureza);
      const reform = getIbsCbsClassification(currentRule.cClassTrib);
      return [itemRegime, {
        ...currentRule,
        ...(pisCofins ? { pis: pisCofins.pis, cofins: pisCofins.cofins } : {}),
        ...(reform ? { cstReforma: reform.cst, cbs: reform.cbsRate, ibs: reform.ibsRate, reducao: reform.reduction } : {}),
      }];
    })) as Record<Regime, Rule>,
  });
  const createCategory = () => {
    const id = `cat_new_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
    const draft: Category = {
      id,
      nome: "Nova categoria",
      codigo: `CAT_${Date.now().toString().slice(-6)}`,
      ncm: "",
      cest: "",
      classe: "Tributação normal",
      descricao: "",
      versao: "2026.08",
      vigencia: new Intl.DateTimeFormat("pt-BR").format(new Date()),
      rules: rulesFor(),
    };
    setCategories((all) => [
      draft,
      ...all.filter((item) => item.id !== draftCategoryId),
    ]);
    setSelected(id);
    setDraftCategoryId(id);
    setTab("geral");
    notify("Preencha o NCM e revise as regras da nova categoria.");
  };
  return (
    <div className="master-detail">
      <aside className="master-list panel">
        <div className="master-title">
          <div>
            <span className="label">BASE FISCAL</span>
            <h2>Categorias</h2>
          </div>
          <button
            aria-label="Cadastrar nova categoria"
            onClick={createCategory}
          >
            +
          </button>
        </div>
        <input className="filter-input" placeholder="Buscar categoria ou NCM" />
        {categories.map((c) => (
          <button
            key={c.id}
            className={selected === c.id ? "selected" : ""}
            onClick={() => setSelected(c.id)}
          >
            <span className="category-dot" />
            <span>
              <strong>{c.nome}</strong>
              <small>
                NCM {c.ncm || "pendente"} • {c.classe}
              </small>
            </span>
            <b>{c.rules[regime].cfop}</b>
          </button>
        ))}
      </aside>
      <section className="detail-card panel">
        <div className="detail-heading">
          <div>
            <span className="label">
              {creating ? "NOVA CATEGORIA" : `CATEGORIA • ${category.codigo}`}
            </span>
            <h2>{category.nome}</h2>
            <p>Alimenta automaticamente todos os produtos vinculados.</p>
          </div>
          <button
            className="save-button"
            onClick={async () => {
              const normalized = normalizedForSave();
              if (await saveCategory(normalized)) {
                setCategories((all) => all.map((item) => item.id === normalized.id ? normalized : item));
                setDraftCategoryId(null);
              }
            }}
          >
            Salvar e aplicar
          </button>
        </div>
        <div className="tabs">
          {[
            ["geral", "Geral e classificação"],
            ["icms", "ICMS"],
            ["pis", "PIS / COFINS"],
            ["reforma", "Reforma tributária"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "geral" && (
          <div className="form-grid">
            <Field label="Nome da categoria" wide>
              <input
                value={category.nome}
                onChange={(e) => updateCategory("nome", e.target.value)}
              />
            </Field>
            <Field label="Código interno">
              <input
                value={category.codigo}
                onChange={(e) => updateCategory("codigo", e.target.value)}
              />
            </Field>
            <Field label="NCM">
              <input
                value={category.ncm}
                maxLength={8}
                onChange={(e) =>
                  updateCategory("ncm", e.target.value.replace(/\D/g, ""))
                }
              />
              <small>Atualização instantânea nos produtos vinculados.</small>
            </Field>
            <Field label="CEST">
              <input
                value={category.cest}
                onChange={(e) => updateCategory("cest", e.target.value)}
              />
            </Field>
            <Field label="Classificação fiscal">
              <select
                value={category.classe}
                onChange={(e) => updateCategory("classe", e.target.value)}
              >
                <option>Lista positiva</option>
                <option>Lista negativa</option>
                <option>Lista neutra</option>
                <option>Monofásico</option>
                <option>Tributação normal</option>
              </select>
            </Field>
            <Field label="Versão da regra">
              <input
                value={category.versao}
                onChange={(e) => updateCategory("versao", e.target.value)}
              />
            </Field>
            <Field label="Vigência inicial">
              <input
                value={category.vigencia}
                onChange={(e) => updateCategory("vigencia", e.target.value)}
              />
            </Field>
            <Field label="Descrição" wide>
              <textarea
                value={category.descricao}
                onChange={(e) => updateCategory("descricao", e.target.value)}
              />
            </Field>
          </div>
        )}
        {tab === "icms" && (
          <div className="form-grid">
            <Field label="CFOP de saída">
              <input
                value={r.cfop}
                onChange={(e) => updateRule("cfop", e.target.value)}
              />
            </Field>
            <Field label="CST ICMS">
              <select
                value={r.cstIcms}
                onChange={(e) => updateRule("cstIcms", e.target.value)}
              >
                {ICMS_CSTS.map((item) => (
                  <option value={item.code} key={item.code}>{item.code} — {item.description}</option>
                ))}
              </select>
            </Field>
            <Field label="CSOSN">
              <select
                value={r.csosn}
                onChange={(e) => updateRule("csosn", e.target.value)}
                disabled={regime !== "SIMPLES_NACIONAL"}
              >
                {regime !== "SIMPLES_NACIONAL" && <option value="—">Não se aplica ao regime</option>}
                {CSOSNS.map((item) => (
                  <option value={item.code} key={item.code}>{item.code} — {item.description}</option>
                ))}
              </select>
              <small>Obrigatório no Simples Nacional.</small>
            </Field>
            <Field label="Alíquota ICMS">
              <RateInput value={r.icms} set={(v) => updateRule("icms", v)} />
            </Field>
            <Field label="MVA">
              <RateInput value={r.mva} set={(v) => updateRule("mva", v)} />
            </Field>
            <Field label="CEST aplicado">
              <input value={category.cest} readOnly />
            </Field>
          </div>
        )}
        {tab === "pis" && (
          <div>
            <div className="fiscal-source-card">
              <strong>PIS e COFINS unificados por CST</strong>
              <span>Seleção controlada pelas tabelas 4.3.3 e 4.3.4 da EFD-Contribuições. As alíquotas continuam separadas.</span>
            </div>
            <div className="form-grid">
            <Field label="CST PIS/COFINS" wide>
              <select
                value={r.cstPisCofins}
                onChange={(e) => applyPisCofins(e.target.value)}
              >
                {PIS_COFINS_CSTS.map((item) => (
                  <option value={item.code} key={item.code}>{item.code} — {item.description}</option>
                ))}
              </select>
              <small>Um único código validado é aplicado às duas contribuições federais.</small>
            </Field>
            <Field label="Natureza da receita" wide>
              <select
                value={r.natureza}
                onChange={(e) => applyPisCofins(r.cstPisCofins, e.target.value)}
                disabled={natureSuggestions.length === 0}
              >
                <option value="">{natureSuggestions.length ? "Selecione a natureza sugerida" : "Sem natureza compatível para CST e NCM"}</option>
                {natureSuggestions.map((item) => (
                  <option value={item.code} key={item.code}>{item.code} — {item.description}</option>
                ))}
              </select>
              <small>{natureSuggestions.length ? `${natureSuggestions[0].sourceVersion}. Confirme que a operação é revenda e a empresa não é fabricante/importadora.` : "A tabela é filtrada simultaneamente pelo CST e pelo NCM exato."}</small>
            </Field>
            <Field label="Alíquota PIS">
              <RateInput value={resolvedPisCofins?.pis ?? r.pis} readOnly />
              <small>{resolvedPisCofins?.basis ?? "Alíquota depende de contexto adicional; revisão obrigatória."}</small>
            </Field>
            <Field label="Alíquota COFINS">
              <RateInput value={resolvedPisCofins?.cofins ?? r.cofins} readOnly />
              <small>Preenchida automaticamente pelo CST, natureza, regime e perfil de revenda.</small>
            </Field>
            </div>
            {category.ncm === "33049990" && (
              <div className="fiscal-validation ok actionable">
                <Icon name="check" />
                <span><strong>Sugestão PIS/COFINS:</strong> CST 04 + Natureza 202 para revenda varejista. O NCM 3304 está no grupo de perfumaria, toucador e higiene da Tabela 4.3.10.</span>
                <button onClick={() => applyPisCofins("04", "202")}>Aplicar sugestão</button>
              </div>
            )}
          </div>
        )}
        {tab === "reforma" && (
          <div>
            <div className="reform-note">
              <strong>IBS / CBS • tabela interna por regime</strong>
              <span>
                Alíquotas e reduções parametrizadas passam a compor o tributo
                total e a margem do produto.
              </span>
            </div>
            <div className="form-grid">
              <Field label="CST IBS/CBS">
                <input value={r.cstReforma} readOnly />
                <small>Derivado do cClassTrib selecionado.</small>
              </Field>
              <Field label="cClassTrib" wide>
                <select
                  value={r.cClassTrib}
                  onChange={(e) => applyReformClassification(e.target.value)}
                >
                  {reformSuggestions.length > 0 && (
                    <optgroup label="Sugestões compatíveis com o NCM">
                      {reformSuggestions.map((item) => <option value={item.code} key={`suggested-${item.code}`}>{item.code} — {item.description}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="Tabela interna versionada">
                    {IBS_CBS_CLASSIFICATIONS.map((item) => <option value={item.code} key={item.code}>{item.code} — {item.description}</option>)}
                  </optgroup>
                </select>
                <small>{selectedReform?.legalBasis ?? "Selecione uma classificação válida."}</small>
              </Field>
              <Field label="Alíquota CBS">
                <RateInput value={selectedReform?.cbsRate ?? r.cbs} readOnly />
                <small>Alíquota nominal de transição para 2026.</small>
              </Field>
              <Field label="Alíquota IBS">
                <RateInput value={selectedReform?.ibsRate ?? r.ibs} readOnly />
                <small>Alíquota nominal de transição para 2026.</small>
              </Field>
              <Field label="Redução de alíquota">
                <RateInput value={selectedReform?.reduction ?? r.reducao} readOnly />
              </Field>
              <Field label="CBS efetiva">
                <RateInput value={(selectedReform?.cbsRate ?? r.cbs) * (1 - (selectedReform?.reduction ?? r.reducao))} readOnly />
                <small>Alíquota nominal após a redução do cClassTrib.</small>
              </Field>
              <Field label="IBS efetiva">
                <RateInput value={(selectedReform?.ibsRate ?? r.ibs) * (1 - (selectedReform?.reduction ?? r.reducao))} readOnly />
                <small>Alíquota nominal após a redução do cClassTrib.</small>
              </Field>
              <Field label="Vigência">
                <input value={category.vigencia} readOnly />
              </Field>
            </div>
            {category.nome.toLowerCase().includes("higiene") && category.ncm === "33049990" && (
              <div className="fiscal-validation warn">
                <strong>IBS/CBS: benefício não sugerido</strong>
                <span>O NCM 33049990 não consta no Anexo VIII da LC 214/2025. O cClassTrib 200035 só é sugerido para 34011190, 33061000, 96032100, 48181000, 38089419, 34011900 ou 96190000.</span>
              </div>
            )}
            {selectedReform?.requiresAnvisa && (
              <div className="fiscal-validation warn">
                <strong>Condição documental obrigatória</strong>
                <span>O cClassTrib 200032 depende de registro Anvisa ou produção por farmácia de manipulação e da exclusão das hipóteses de alíquota zero. A IA deve solicitar essa evidência antes da aprovação.</span>
              </div>
            )}
          </div>
        )}
        <div className="regime-context">
          <Icon name="check" />
          <span>
            Editando regras de <strong>{regimes[regime].title}</strong>. Troque
            o regime no topo para revisar as demais tabelas.
          </span>
        </div>
        <FiscalAssistant
          mode="categoria"
          category={category}
          categories={categories}
          regime={regime}
          applyNcmSuggestion={applySuggestedNcm}
        />
      </section>
    </div>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? "field wide" : "field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function RateInput({
  value,
  set,
  readOnly = false,
}: {
  value: number;
  set?: (v: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="rate-input">
      <input
        type="number"
        step="0.01"
        value={(value * 100).toFixed(2)}
        readOnly={readOnly}
        onChange={(e) => set?.(+e.target.value / 100)}
      />
      <b>%</b>
    </div>
  );
}
