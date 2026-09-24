"use client";

import { useState } from "react";

type Day = { day: string; units: number };

const units = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
// "2026-09-24" → "24/09"; o dia já vem calculado no fuso de São Paulo pela API.
const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const longDate = (day: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

/** Teto "redondo" para o eixo: 1, 2 ou 5 × 10ⁿ acima do maior valor. */
function niceCeiling(max: number) {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 5, 10].find((factor) => factor * magnitude >= max) ?? 10;
  return step * magnitude;
}

/**
 * Vendas por dia (série única, sem legenda: o título diz o que é). Hoje fica
 * mais claro e rotulado como parcial. Cada coluna inteira é alvo de hover e de
 * foco pelo teclado; os valores também ficam na tabela logo abaixo.
 */
export function SellOutTrend({ daily }: { daily: Day[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...daily.map((item) => item.units), 0);
  const ceiling = niceCeiling(max);
  const peak = daily.findIndex((item) => item.units === max && max > 0);
  const last = daily.length - 1;
  const total = daily.reduce((sum, item) => sum + item.units, 0);
  return (
    <figure className="prime-trend" aria-label={`Vendas por dia nos últimos ${daily.length} dias: ${units(total)} unidades no período`}>
      <figcaption>
        <span>VENDAS POR DIA</span>
        <strong>Últimos {daily.length} dias, em unidades</strong>
      </figcaption>
      <div className="prime-trend-plot">
        <div aria-hidden="true" className="prime-trend-grid">
          {[1, 0.5, 0].map((fraction) => (
            <div key={fraction} style={{ bottom: `${fraction * 100}%` }}><span>{units(ceiling * fraction)}</span></div>
          ))}
        </div>
        <div className="prime-trend-bars">
          {daily.map((item, index) => {
            const isToday = index === last;
            const labelled = isToday || index === peak;
            return (
              <button
                aria-label={`${longDate(item.day)}${isToday ? " (hoje, parcial)" : ""}: ${units(item.units)} unidades`}
                className={`prime-trend-col${active === index ? " active" : ""}`}
                key={item.day}
                onBlur={() => setActive(null)}
                onFocus={() => setActive(index)}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                type="button"
              >
                {labelled && item.units > 0 && <span className="prime-trend-value" style={{ bottom: `calc(${(item.units / ceiling) * 100}% + 4px)` }}>{units(item.units)}</span>}
                <span className={`prime-trend-bar${isToday ? " today" : ""}`} style={{ height: `${(item.units / ceiling) * 100}%` }} />
                {active === index && (
                  <span className="prime-trend-tooltip" role="status">
                    <b>{units(item.units)} un.</b>
                    <small>{longDate(item.day)}{isToday ? " · hoje, parcial" : ""}</small>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div aria-hidden="true" className="prime-trend-axis">
        {daily.map((item, index) => <span key={item.day}>{index === last ? "hoje" : index % 3 === 0 ? shortDate(item.day) : ""}</span>)}
      </div>
      <details className="prime-trend-table">
        <summary>Ver em tabela</summary>
        <table>
          <thead><tr><th scope="col">Dia</th><th scope="col">Unidades</th></tr></thead>
          <tbody>{daily.map((item, index) => <tr key={item.day}><td>{longDate(item.day)}{index === last ? " (parcial)" : ""}</td><td>{units(item.units)}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}
