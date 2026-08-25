import Link from "next/link";
import { getPlans } from "@/lib/api";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

export async function PlanGrid({ compact = false }: { compact?: boolean }) {
  const plans = await getPlans();
  return (
    <div className={compact ? "plan-grid compact" : "plan-grid"}>
      {plans.map((plan) => (
        <article className={plan.featured ? "plan-card featured" : "plan-card"} key={plan.code}>
          {plan.featured && <span className="plan-badge">MAIS ESCOLHIDO</span>}
          <span className="plan-code">{plan.code}</span><h3>{plan.name}</h3><p>{plan.description}</p>
          <div className="plan-price"><strong>{money.format(plan.monthlyPrice)}</strong><span>/mês</span></div>
          <small className="plan-setup">{plan.hasFineTuning ? <>Setup de {money.format(plan.setupPrice)}: entrada de R$ 5.000,00 + 4× R$ 1.250,00</> : <>Setup único de {money.format(plan.setupPrice)}</>}</small>
          <ul>{plan.features.map((feature) => <li key={feature}><span>✓</span>{feature}</li>)}</ul>
          <Link className={plan.featured ? "button" : "button button-outline"} href="/entrar">Solicitar acesso</Link>
        </article>
      ))}
    </div>
  );
}
