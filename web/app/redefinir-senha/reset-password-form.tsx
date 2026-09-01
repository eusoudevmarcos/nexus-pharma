"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";

export function ResetPasswordForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false); const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const password = String(form.get("password") ?? ""); if (password !== form.get("confirmation")) { setFeedback({ ok: false, text: "As senhas não coincidem." }); return; } setBusy(true); try { const response = await fetch("/api/session/password/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, nova_senha: password }) }); const body = await response.json() as { message?: string }; setFeedback({ ok: response.ok, text: body.message ?? "Não foi possível redefinir." }); } finally { setBusy(false); } }
  return <form className="login-form" onSubmit={submit}>{!token && <p className="form-error">O link não contém um token válido.</p>}<label>Nova senha<input autoComplete="new-password" minLength={12} name="password" required type="password"/></label><label>Confirmar senha<input autoComplete="new-password" minLength={12} name="confirmation" required type="password"/></label>{feedback && <p className={feedback.ok ? "portal-feedback success" : "form-error"} role="status">{feedback.text}</p>}<button className="button" disabled={busy || !token || feedback?.ok} type="submit">{busy ? "Protegendo…" : "Redefinir senha"}</button>{feedback?.ok && <Link href="/entrar">Entrar com a nova senha</Link>}</form>;
}
