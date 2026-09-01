"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(challenge ? "/api/session/login/mfa" : "/api/session/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(challenge ? { desafio: challenge, codigo: form.get("code") } : { email: form.get("email"), password: form.get("password") }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 202 && body.mfaRequired && body.challenge) {
        setChallenge(body.challenge);
        return;
      }
      if (!response.ok) throw new Error(body.message ?? "Não foi possível entrar. Confira seus dados.");
      router.push("/portal");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível entrar agora.");
    } finally {
      setLoading(false);
    }
  }

  return <form className="login-form" onSubmit={submit}>
    {!challenge ? <><label>E-mail<input name="email" type="email" autoComplete="email" placeholder="voce@empresa.com.br" required /></label>
    <label>Senha<input name="password" type="password" autoComplete="current-password" placeholder="Sua senha" minLength={8} required /></label></> : <div className="login-mfa-challenge"><span>SEGUNDA ETAPA</span><strong>Confirme sua identidade</strong><p>Digite o código de seis números do aplicativo autenticador ou use um código de recuperação.</p><label>Código de segurança<input autoComplete="one-time-code" autoFocus name="code" placeholder="000000 ou recuperação" required /></label></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button" disabled={loading} type="submit">{loading ? "Confirmando..." : challenge ? "Confirmar e entrar" : "Entrar com segurança"}</button>
    {challenge && <button className="login-back" onClick={() => { setChallenge(""); setError(""); }} type="button">Voltar para e-mail e senha</button>}
    <a href="/esqueci-senha">Esqueci minha senha</a>
  </form>;
}
