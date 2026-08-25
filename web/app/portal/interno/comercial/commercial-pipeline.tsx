"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type CommercialPlan = { code: string; name: string; monthlyPrice: number; setupPrice: number; hasFineTuning: boolean };
export type PipelineCompany = { id: string; tradeName: string; legalName: string; status: string; onboardingStep: number; city: string | null; state: string | null; updatedAt: string; members: number; products: number; subscription: { status: string; contractStartedAt: string; plan: { code: string; name: string; monthlyPrice: number } } | null };
const statusLabels: Record<string, string> = { LEAD: "Lead", ONBOARDING: "Implantação", ACTIVE: "Ativa", SUSPENDED: "Suspensa", CANCELLED: "Cancelada" };
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const localDate = (value?: string) => value ? value.slice(0, 10) : new Date().toISOString().slice(0, 10);

function CompanyCard({ company, plans }: { company: PipelineCompany; plans: CommercialPlan[] }) {
  const router = useRouter();
  const [status, setStatus] = useState(company.status);
  const [step, setStep] = useState(company.onboardingStep);
  const [plan, setPlan] = useState(company.subscription?.plan.code ?? plans[0]?.code ?? "BASIC");
  const [contractStart, setContractStart] = useState(localDate(company.subscription?.contractStartedAt));
  const [busy, setBusy] = useState<"pipeline" | "contract" | null>(null);
  const [feedback, setFeedback] = useState("");
  const selectedPlan = plans.find((item) => item.code === plan);

  async function savePipeline() {
    setBusy("pipeline"); setFeedback("");
    const response = await fetch(`/api/portal/internal/companies/${company.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, etapa_onboarding: step }) });
    setFeedback(response.ok ? "Andamento atualizado." : "Não foi possível atualizar o andamento.");
    if (response.ok) router.refresh();
    setBusy(null);
  }

  async function saveContract() {
    setBusy("contract"); setFeedback("");
    const response = await fetch(`/api/portal/internal/companies/${company.id}/subscription`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ plano: plan, inicio_contrato: contractStart, status: "ACTIVE" }) });
    setFeedback(response.ok ? "Contrato ativado. Matriz, PDV e cronograma do setup foram criados." : "Não foi possível ativar o contrato; confira se existem faturas no plano atual.");
    if (response.ok) router.refresh();
    setBusy(null);
  }

  return <article className="commercial-company-card"><div className="internal-row company-row"><div><strong>{company.tradeName}</strong><small>{company.city && company.state ? `${company.city}/${company.state}` : company.legalName} · {company.members} usuários · {company.products} produtos</small></div><div><span>Plano</span><b>{company.subscription?.plan.name ?? "Sem assinatura"}</b></div><select aria-label={`Situação de ${company.tradeName}`} onChange={(event) => setStatus(event.target.value)} value={status}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label>Etapa<input max={10} min={1} onChange={(event) => setStep(Number(event.target.value))} type="number" value={step}/></label><button disabled={busy !== null || (status === company.status && step === company.onboardingStep)} onClick={savePipeline} type="button">{busy === "pipeline" ? "…" : "Salvar"}</button></div><div className="contract-row"><label>Plano contratado<select value={plan} onChange={(event) => setPlan(event.target.value)}>{plans.map((item) => <option key={item.code} value={item.code}>{item.name} · {brl.format(item.monthlyPrice)}/mês</option>)}</select></label><label>Início do contrato<input type="date" value={contractStart} onChange={(event) => setContractStart(event.target.value)}/></label><div><span>Onboarding gerado</span><strong>{selectedPlan?.hasFineTuning ? "R$ 5.000 + 4× R$ 1.250" : `Setup único de ${brl.format(selectedPlan?.setupPrice ?? 890)}`}</strong></div><button disabled={busy !== null || !contractStart} onClick={saveContract} type="button">{busy === "contract" ? "Ativando..." : company.subscription ? "Atualizar contrato" : "Ativar contrato"}</button></div>{feedback && <p className="contract-feedback">{feedback}</p>}</article>;
}

export function CommercialPipeline({ companies, plans }: { companies: PipelineCompany[]; plans: CommercialPlan[] }) {
  return <div className="internal-list commercial-contract-list">{companies.map((company) => <CompanyCard company={company} key={company.id} plans={plans}/>)}</div>;
}
