"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Regime = "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL";
type Product = {
  ean: string;
  nome: string;
  laboratorio: string;
  preco: number;
  estoque: number;
  minimo: number;
  categoria: "LISTA_POSITIVA" | "LISTA_NEGATIVA" | "LISTA_NEUTRA";
  cimed: boolean;
};
type CartItem = Product & { quantidade: number };

const products: Product[] = [
  { ean: "7896523200325", nome: "Cimegripe 20 cápsulas", laboratorio: "CIMED", preco: 18.9, estoque: 7, minimo: 12, categoria: "LISTA_POSITIVA", cimed: true },
  { ean: "7896523200578", nome: "Lavitan A-Z 60 comprimidos", laboratorio: "CIMED", preco: 34.5, estoque: 18, minimo: 10, categoria: "LISTA_NEGATIVA", cimed: true },
  { ean: "7896004710893", nome: "Dipirona 500mg 10 comprimidos", laboratorio: "GENÉRICO", preco: 8.49, estoque: 24, minimo: 8, categoria: "LISTA_POSITIVA", cimed: false },
  { ean: "7896422507051", nome: "Protetor solar FPS 60 120ml", laboratorio: "DERMA", preco: 52.9, estoque: 5, minimo: 7, categoria: "LISTA_NEUTRA", cimed: false },
];

const regimeCopy: Record<Regime, { short: string; title: string; rate: number; csosn: string; cst: string }> = {
  SIMPLES_NACIONAL: { short: "Simples", title: "Simples Nacional", rate: 0.073, csosn: "500", cst: "05" },
  LUCRO_PRESUMIDO: { short: "Presumido", title: "Lucro Presumido", rate: 0.118, csosn: "—", cst: "05" },
  LUCRO_REAL: { short: "Real", title: "Lucro Real", rate: 0.142, csosn: "—", cst: "05" },
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function LogoMark() {
  return <span className="logo-mark" aria-hidden="true"><i /><i /></span>;
}

function Icon({ name }: { name: string }) {
  const glyphs: Record<string, string> = {
    overview: "⌁", pdv: "▣", stock: "≋", fiscal: "◫", settings: "⚙",
    search: "⌕", arrow: "↗", alert: "!", check: "✓", plus: "+", minus: "−",
  };
  return <span className={`icon icon-${name}`} aria-hidden="true">{glyphs[name]}</span>;
}

export default function Home() {
  const [regime, setRegime] = useState<Regime>("SIMPLES_NACIONAL");
  const [active, setActive] = useState("overview");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([
    { ...products[0], quantidade: 1 },
    { ...products[2], quantidade: 2 },
  ]);
  const [payment, setPayment] = useState("Pix");
  const [online, setOnline] = useState(true);
  const [closing, setClosing] = useState(false);
  const [toast, setToast] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        setActive("pdv");
        setTimeout(() => searchRef.current?.focus(), 30);
      }
      if (event.key === "F8") {
        event.preventDefault();
        setActive("pdv");
        setClosing(true);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("keydown", keyboard);
    };
  }, []);

  const regimeData = regimeCopy[regime];
  const subtotal = cart.reduce((sum, item) => sum + item.preco * item.quantidade, 0);
  const segregated = cart
    .filter((item) => item.categoria !== "LISTA_NEUTRA")
    .reduce((sum, item) => sum + item.preco * item.quantidade, 0);
  const currentEconomy = segregated * regimeData.rate;
  const monthlyEconomy = 6842.17 * (regimeData.rate / 0.073);
  const monthlyTax = 4281.32 * (regimeData.rate / 0.073);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return products.slice(0, 2);
    return products.filter((product) =>
      `${product.nome} ${product.ean}`.toLowerCase().includes(normalized),
    );
  }, [query]);

  function addProduct(product: Product) {
    setCart((current) => {
      const found = current.find((item) => item.ean === product.ean);
      return found
        ? current.map((item) => item.ean === product.ean ? { ...item, quantidade: item.quantidade + 1 } : item)
        : [...current, { ...product, quantidade: 1 }];
    });
    setQuery("");
  }

  function changeQuantity(ean: string, delta: number) {
    setCart((current) =>
      current
        .map((item) => item.ean === ean ? { ...item, quantidade: Math.max(0, item.quantidade + delta) } : item)
        .filter((item) => item.quantidade > 0),
    );
  }

  function finishSale() {
    const snapshot = { id: crypto.randomUUID(), items: cart, total: subtotal, payment, createdAt: new Date().toISOString() };
    if (!online) {
      const pending = JSON.parse(localStorage.getItem("nexus-pending-sales") || "[]");
      localStorage.setItem("nexus-pending-sales", JSON.stringify([...pending, snapshot]));
    }
    setClosing(false);
    setCart([]);
    setToast(online ? "Venda fiscalizada e provisionada." : "Venda salva no dispositivo para sincronizar.");
    window.setTimeout(() => setToast(""), 3500);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <LogoMark />
          <div><strong>NEXUS</strong><span>PHARMA</span></div>
        </div>
        <nav aria-label="Navegação principal">
          {[
            ["overview", "overview", "Visão geral"],
            ["pdv", "pdv", "Balcão / PDV"],
            ["stock", "stock", "Estoque fiscal"],
            ["fiscal", "fiscal", "Conferência"],
          ].map(([id, icon, label]) => (
            <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)}>
              <Icon name={icon} /> {label}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <button><Icon name="settings" /> Configurações</button>
          <div className="operator">
            <span className="avatar">MF</span>
            <div><strong>Marcos Freitas</strong><small>Administrador</small></div>
            <span className="more">•••</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">FARMÁCIA MODELO • MATRIZ</span>
            <h1>{active === "pdv" ? "Balcão de vendas" : active === "stock" ? "Estoque fiscal" : active === "fiscal" ? "Conferência contábil" : "Bom dia, Marcos."}</h1>
          </div>
          <div className="top-actions">
            <div className="status-pill"><span className={online ? "pulse" : "pulse offline"} />{online ? "Online" : "Offline • cache ativo"}</div>
            <div className="regime-switch" aria-label="Regime tributário">
              {(Object.keys(regimeCopy) as Regime[]).map((key) => (
                <button key={key} onClick={() => setRegime(key)} className={regime === key ? "active" : ""}>{regimeCopy[key].short}</button>
              ))}
            </div>
          </div>
        </header>

        {active === "pdv" ? (
          <PdvView
            query={query}
            setQuery={setQuery}
            searchRef={searchRef}
            matches={matches}
            addProduct={addProduct}
            cart={cart}
            changeQuantity={changeQuantity}
            subtotal={subtotal}
            segregated={segregated}
            economy={currentEconomy}
            payment={payment}
            setPayment={setPayment}
            closing={closing}
            setClosing={setClosing}
            finishSale={finishSale}
            regimeData={regimeData}
          />
        ) : active === "stock" ? (
          <StockView />
        ) : active === "fiscal" ? (
          <FiscalView regimeData={regimeData} monthlyTax={monthlyTax} />
        ) : (
          <Dashboard
            regimeData={regimeData}
            monthlyEconomy={monthlyEconomy}
            monthlyTax={monthlyTax}
            onOpenPdv={() => setActive("pdv")}
            onOpenStock={() => setActive("stock")}
          />
        )}
      </section>
      {toast && <div className="toast"><Icon name="check" /> {toast}</div>}
    </main>
  );
}

function Dashboard({ regimeData, monthlyEconomy, monthlyTax, onOpenPdv, onOpenStock }: {
  regimeData: (typeof regimeCopy)[Regime]; monthlyEconomy: number; monthlyTax: number; onOpenPdv: () => void; onOpenStock: () => void;
}) {
  return (
    <div className="dashboard">
      <section className="hero-grid">
        <article className="economy-card">
          <div className="card-top"><span className="label">ECONOMIA TRIBUTÁRIA • JULHO</span><span className="trend">↗ 12,4%</span></div>
          <div className="economy-value">{money.format(monthlyEconomy)}</div>
          <p>Valor preservado pela segregação correta das listas fiscais.</p>
          <div className="spark-bars">{[38, 52, 44, 67, 58, 74, 62, 84, 72, 96, 88, 100].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
          <div className="economy-footer"><span>Meta mensal</span><strong>82% alcançada</strong></div>
        </article>
        <article className="action-card">
          <div><span className="label">ATALHO OPERACIONAL</span><h2>Venda rápida,<br />fiscal certo.</h2></div>
          <button onClick={onOpenPdv}>Abrir balcão <Icon name="arrow" /></button>
          <small><kbd>F2</kbd> buscar produto <kbd>F8</kbd> fechar venda</small>
        </article>
      </section>

      <section className="metrics-row">
        <Metric label="VENDAS HOJE" value="R$ 12.840,60" detail="146 cupons" trend="+8,2%" />
        <Metric label="MARGEM REAL" value="28,6%" detail="após impostos" trend="+1,4 p.p." />
        <Metric label="TICKET MÉDIO" value="R$ 87,95" detail="últimos 30 dias" trend="+3,1%" />
        <Metric label="ITENS SEGREGADOS" value="68,4%" detail="do faturamento" trend="CFOP 5405" code />
      </section>

      <section className="content-grid">
        <article className="panel accounting">
          <div className="panel-heading">
            <div><span className="label">DRE • {regimeData.title.toUpperCase()}</span><h2>Conferência contábil express</h2></div>
            <button className="quiet">Exportar espelho ↗</button>
          </div>
          <div className="account-head"><span>APURAÇÃO DE JULHO</span><span>VALOR</span><span>% RECEITA</span></div>
          {[
            ["Total faturado", "R$ 148.920,40", "100%"],
            ["Faturamento segregado isento", "R$ 101.872,68", "68,4%"],
            ["Faturamento tributável normal", "R$ 47.047,72", "31,6%"],
            ["Imposto devido provisionado", money.format(monthlyTax), `${regimeData.rate * 100}`.replace(".", ",") + "%"],
          ].map((row, index) => (
            <div className={`account-row ${index === 3 ? "total" : ""}`} key={row[0]}>
              <span>{row[0]}{index === 1 && <small>Listas positiva + negativa</small>}</span>
              <strong>{row[1]}</strong><span>{row[2]}</span>
            </div>
          ))}
          <div className="account-note"><Icon name="check" /><span><strong>Apuração consistente.</strong> 1.204 itens validados pelas regras fiscais.</span><span className="updated">Atualizado há 4 min</span></div>
        </article>

        <article className="panel alerts">
          <div className="panel-heading">
            <div><span className="label">RUPTURA ZERO • VMI</span><h2>Alerta de compras</h2></div>
            <span className="count">3</span>
          </div>
          <p className="muted">Itens críticos priorizados por giro e estoque mínimo.</p>
          <AlertItem initials="CG" name="Cimegripe 20 cáps." stock="7 un." days="0,8 dia" cimed />
          <AlertItem initials="PS" name="Protetor FPS 60" stock="5 un." days="1,2 dia" />
          <AlertItem initials="DP" name="Dipirona 500mg" stock="8 un." days="1,6 dia" />
          <button className="full-button" onClick={onOpenStock}>Gerar pedido sugerido <span>→</span></button>
        </article>
      </section>
      <footer className="fiscal-strip">
        <div><span className="pulse" /><strong>Motor fiscal ativo</strong></div>
        <span>CFOP 5102 / 5405</span><span>CST PIS/COFINS 05</span><span>CBS/IBS provisionado</span><span>Última regra: hoje, 08:42</span>
      </footer>
    </div>
  );
}

function Metric({ label, value, detail, trend, code }: { label: string; value: string; detail: string; trend: string; code?: boolean }) {
  return <article className="metric"><span className="label">{label}</span><strong>{value}</strong><div><span>{detail}</span><em className={code ? "code" : ""}>{trend}</em></div></article>;
}

function AlertItem({ initials, name, stock, days, cimed }: { initials: string; name: string; stock: string; days: string; cimed?: boolean }) {
  return <div className="alert-item"><span className="product-avatar">{initials}</span><div><strong>{name}</strong><small>{cimed ? "CIMED • alerta enviado" : "Reposição sugerida"}</small></div><div className="stock-data"><strong>{stock}</strong><small>{days}</small></div></div>;
}

function PdvView(props: {
  query: string; setQuery: (value: string) => void; searchRef: React.RefObject<HTMLInputElement | null>;
  matches: Product[]; addProduct: (product: Product) => void; cart: CartItem[];
  changeQuantity: (ean: string, delta: number) => void; subtotal: number; segregated: number; economy: number;
  payment: string; setPayment: (value: string) => void; closing: boolean; setClosing: (value: boolean) => void;
  finishSale: () => void; regimeData: (typeof regimeCopy)[Regime];
}) {
  return (
    <div className="pdv-layout">
      <section className="panel pdv-products">
        <div className="search-box">
          <Icon name="search" />
          <input ref={props.searchRef} value={props.query} onChange={(e) => props.setQuery(e.target.value)} placeholder="Bipe ou digite EAN / nome do produto" aria-label="Buscar produto por EAN ou nome" />
          <kbd>F2</kbd>
        </div>
        {props.query && <div className="search-results">{props.matches.map((product) => <button key={product.ean} onClick={() => props.addProduct(product)}><span className="product-avatar">{product.nome.slice(0, 2).toUpperCase()}</span><span><strong>{product.nome}</strong><small>{product.ean} • {product.estoque} em estoque</small></span><b>{money.format(product.preco)}</b></button>)}</div>}
        <div className="sale-head"><span>PRODUTO</span><span>FISCAL</span><span>QTD.</span><span>SUBTOTAL</span></div>
        <div className="cart-list">
          {props.cart.length === 0 && <div className="empty-state"><LogoMark /><h3>Pronto para a próxima venda</h3><p>Busque pelo nome ou leia o código EAN.</p></div>}
          {props.cart.map((item) => (
            <div className="cart-row" key={item.ean}>
              <div className="cart-product"><span className="product-avatar">{item.nome.slice(0, 2).toUpperCase()}</span><span><strong>{item.nome}</strong><small>{item.ean}</small></span></div>
              <div><span className={item.categoria === "LISTA_NEUTRA" ? "fiscal-tag normal" : "fiscal-tag"}>{item.categoria === "LISTA_NEUTRA" ? "5102" : "5405"}</span><small className="fiscal-small">{item.categoria.replace("LISTA_", "")}</small></div>
              <div className="quantity"><button onClick={() => props.changeQuantity(item.ean, -1)}><Icon name="minus" /></button><strong>{item.quantidade}</strong><button onClick={() => props.changeQuantity(item.ean, 1)}><Icon name="plus" /></button></div>
              <strong className="line-total">{money.format(item.preco * item.quantidade)}</strong>
            </div>
          ))}
        </div>
        <div className="pdv-rule"><span><Icon name="check" /> Regras aplicadas para <strong>{props.regimeData.title}</strong></span><span>CFOP 5405 • CST {props.regimeData.cst} • CSOSN {props.regimeData.csosn}</span></div>
      </section>
      <aside className="checkout">
        <span className="label">FECHAMENTO DA VENDA</span>
        <div className="checkout-lines"><p><span>Subtotal</span><strong>{money.format(props.subtotal)}</strong></p><p><span>Descontos</span><strong>—</strong></p><p className="tax-save"><span>Base segregada</span><strong>{money.format(props.segregated)}</strong></p></div>
        <div className="checkout-total"><span>TOTAL</span><strong>{money.format(props.subtotal)}</strong><small>Economia fiscal nesta venda: {money.format(props.economy)}</small></div>
        <span className="label">FORMA DE PAGAMENTO</span>
        <div className="payment-grid">{["Dinheiro", "Cartão", "Pix", "PBM / Convênio"].map((item) => <button className={props.payment === item ? "active" : ""} key={item} onClick={() => props.setPayment(item)}>{item}</button>)}</div>
        <button className="finish-button" disabled={!props.cart.length} onClick={() => props.setClosing(true)}>Fechar venda <kbd>F8</kbd></button>
        <p className="security-note">Ao fechar, a venda será auditada, provisionada no DRE e o estoque será atualizado.</p>
        {props.closing && <div className="confirm-box"><div><Icon name="check" /><span><strong>Confirmar {props.payment}</strong><small>{money.format(props.subtotal)} • NFC-e 65</small></span></div><button onClick={props.finishSale}>Confirmar recebimento</button><button className="cancel" onClick={() => props.setClosing(false)}>Voltar</button></div>}
      </aside>
    </div>
  );
}

function StockView() {
  return <div className="stock-page"><section className="panel"><div className="panel-heading"><div><span className="label">RELATÓRIO DIÁRIO</span><h2>Reposição sugerida</h2></div><button className="primary-small">Criar pedido de compra</button></div><div className="stock-summary"><div><span>3</span><small>itens críticos</small></div><div><span>R$ 482</span><small>pedido estimado</small></div><div><span>1,2 d</span><small>cobertura média</small></div></div>{products.map((product) => <div className="stock-row" key={product.ean}><span className="product-avatar">{product.nome.slice(0, 2).toUpperCase()}</span><div><strong>{product.nome}</strong><small>{product.laboratorio} • EAN {product.ean}</small></div><span className="stock-bar"><i style={{ width: `${Math.min(100, product.estoque / product.minimo * 100)}%` }} /></span><div><strong>{product.estoque} un.</strong><small>mín. {product.minimo}</small></div><span className={product.estoque <= product.minimo ? "critical" : "healthy"}>{product.estoque <= product.minimo ? "Repor" : "Saudável"}</span></div>)}</section></div>;
}

function FiscalView({ regimeData, monthlyTax }: { regimeData: (typeof regimeCopy)[Regime]; monthlyTax: number }) {
  return <div className="fiscal-page"><section className="panel"><div className="panel-heading"><div><span className="label">COMPETÊNCIA 07/2026</span><h2>Memória de cálculo • {regimeData.title}</h2></div><span className="approved"><Icon name="check" /> Consistente</span></div><div className="fiscal-cards"><div><span>Receita bruta</span><strong>R$ 148.920,40</strong></div><div><span>Base segregada</span><strong>R$ 101.872,68</strong></div><div><span>Base tributável</span><strong>R$ 47.047,72</strong></div><div className="accent"><span>Imposto provisionado</span><strong>{money.format(monthlyTax)}</strong></div></div><div className="rule-table"><div><strong>Regra</strong><strong>Aplicação</strong><strong>Itens</strong><strong>Base</strong></div><div><span>CFOP 5405 • CST 05</span><span>Lista positiva / negativa</span><span>1.204</span><span>R$ 101.872,68</span></div><div><span>CFOP 5102 • tributação normal</span><span>Lista neutra / correlatos</span><span>582</span><span>R$ 47.047,72</span></div><div><span>CBS / IBS</span><span>Provisionamento de transição</span><span>1.786</span><span>{money.format(monthlyTax)}</span></div></div><p className="legal-note">Simulação gerencial para apoio à decisão. A escrituração e a apuração definitiva devem ser validadas pelo responsável contábil conforme a legislação vigente.</p></section></div>;
}
