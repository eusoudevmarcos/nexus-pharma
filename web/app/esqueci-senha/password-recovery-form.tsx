"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";

export function PasswordRecoveryForm() {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [developmentUrl, setDevelopmentUrl] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setMessage(""); const form = new FormData(event.currentTarget); try { const response = await fetch("/api/session/password/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.get("email") }) }); const body = await response.json() as { message?: string; developmentResetUrl?: string }; setMessage(body.message ?? "Se a conta existir, enviaremos as instruções."); setDevelopmentUrl(body.developmentResetUrl ?? ""); } finally { setBusy(false); } }
  return <form className="login-form" onSubmit={submit}><label>E-mail<input autoComplete="email" name="email" required type="email"/></label>{message && <p className="portal-feedback success" role="status">{message}</p>}{developmentUrl && <Link href={developmentUrl}>Abrir link local de redefinição</Link>}<button className="button" disabled={busy} type="submit">{busy ? "Solicitando…" : "Enviar instruções"}</button><Link href="/entrar">Voltar ao login</Link></form>;
}
