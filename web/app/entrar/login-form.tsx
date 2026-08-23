"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/session/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const body = await response.json().catch(() => ({}));
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
    <label>E-mail<input name="email" type="email" autoComplete="email" placeholder="voce@empresa.com.br" required /></label>
    <label>Senha<input name="password" type="password" autoComplete="current-password" placeholder="Sua senha" minLength={8} required /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button" disabled={loading} type="submit">{loading ? "Entrando..." : "Entrar com segurança"}</button>
    <a href="mailto:suporte@nexuspharma.com.br?subject=Ajuda%20com%20meu%20acesso">Preciso de ajuda com meu acesso</a>
  </form>;
}
