"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type PipelineCompany = { id: string; tradeName: string; legalName: string; status: string; onboardingStep: number; city: string | null; state: string | null; updatedAt: string; members: number; products: number; subscription: { status: string; plan: { name: string; monthlyPrice: number } } | null };
const statusLabels: Record<string, string> = { LEAD: "Lead", ONBOARDING: "Implantação", ACTIVE: "Ativa", SUSPENDED: "Suspensa", CANCELLED: "Cancelada" };

function CompanyRow({ company }: { company: PipelineCompany }) {
  const router = useRouter();
  const [status, setStatus] = useState(company.status);
  const [step, setStep] = useState(company.onboardingStep);
  const [busy, setBusy] = useState(false);
  async function save() { setBusy(true); const response = await fetch(`/api/portal/internal/companies/${company.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, etapa_onboarding: step }) }); if (response.ok) router.refresh(); setBusy(false); }
  return <div className="internal-row company-row"><div><strong>{company.tradeName}</strong><small>{company.city && company.state ? `${company.city}/${company.state}` : company.legalName} · {company.members} usuários · {company.products} produtos</small></div><div><span>Plano</span><b>{company.subscription?.plan.name ?? "Sem assinatura"}</b></div><select aria-label={`Situação de ${company.tradeName}`} onChange={(event) => setStatus(event.target.value)} value={status}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label>Etapa<input max={10} min={1} onChange={(event) => setStep(Number(event.target.value))} type="number" value={step}/></label><button disabled={busy || (status === company.status && step === company.onboardingStep)} onClick={save} type="button">{busy ? "…" : "Salvar"}</button></div>;
}

export function CommercialPipeline({ companies }: { companies: PipelineCompany[] }) {
  return <div className="internal-list">{companies.map((company) => <CompanyRow company={company} key={company.id}/>)}</div>;
}
