"use client";

import Link from "next/link";
import { useState } from "react";

export function InvitationForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ company: string; requiresLogin: boolean } | null>(null);
  async function submit(formData: FormData) {
    setLoading(true);
    setError("");
    const response = await fetch("/api/session/invitation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, nome: formData.get("nome"), senha: formData.get("senha") }),
    });
    const body = await response.json().catch(() => ({})) as { message?: string; company?: string; requiresLogin?: boolean };
    if (!response.ok) {
      setError(body.message ?? "Não foi possível aceitar o convite.");
      setLoading(false);
      return;
    }
    setResult({ company: body.company ?? "sua empresa", requiresLogin: Boolean(body.requiresLogin) });
  }
  if (result) return <div className="invitation-success"><span>✓</span><h2>Acesso confirmado</h2><p>Você já pode entrar no ambiente da <strong>{result.company}</strong>{result.requiresLogin ? " usando a senha da sua conta existente." : "."}</p><Link className="button button-yellow" href="/entrar">Entrar no Nexus</Link></div>;
  return <form action={submit} className="login-form">
    <label>Seu nome completo<input autoComplete="name" name="nome" required /></label>
    <label>Crie uma senha<input autoComplete="new-password" minLength={10} name="senha" required type="password" /></label>
    <small>Use no mínimo 10 caracteres, incluindo uma letra e um número.</small>
    {error && <p className="form-error">{error}</p>}
    <button className="button button-yellow" disabled={loading || !token} type="submit">{loading ? "Confirmando…" : "Aceitar convite"}</button>
  </form>;
}
