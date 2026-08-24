"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CompanyMembership } from "@/lib/portal";

export function CompanySelector({ memberships }: { memberships: CompanyMembership[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function select(companyId: string) {
    setLoading(companyId);
    setError("");
    const response = await fetch("/api/session/company", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyId }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      setError(body.message ?? "Não foi possível abrir a empresa.");
      setLoading(null);
      return;
    }
    router.push("/portal");
    router.refresh();
  }
  return <>
    {error && <p className="form-error">{error}</p>}
    <div className="company-grid">
      {memberships.map(({ company, role }) => <button className="company-card" disabled={Boolean(loading)} key={company.id} onClick={() => select(company.id)} type="button">
        <span>{company.status}</span><strong>{company.tradeName}</strong><small>{role}</small><b>{loading === company.id ? "Abrindo…" : "Acessar →"}</b>
      </button>)}
    </div>
  </>;
}
