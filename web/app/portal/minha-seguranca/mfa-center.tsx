"use client";

import { useState } from "react";

export type MfaStatus = {
  required: boolean; configured: boolean; enabled: boolean; status: "NOT_CONFIGURED" | "PENDING" | "ACTIVE" | "DISABLED"; verifiedAt: string | null; recoveryCodesRemaining: number;
  session: { assuranceLevel: number; verifiedAt: string | null; stepUpValidUntil: string | null };
};
type Enrollment = { secret: string; otpauthUri: string; recoveryCodes: string[] };

const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "não realizada";

export function MfaCenter({ initialStatus }: { initialStatus: MfaStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [showDisable, setShowDisable] = useState(false);
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function api<T>(action: string, payload?: unknown) {
    setBusy(action); setError(""); setMessage("");
    const response = await fetch(`/api/session/mfa/${action}`, { method: payload ? "POST" : "GET", headers: payload ? { "content-type": "application/json" } : undefined, body: payload ? JSON.stringify(payload) : undefined });
    const body = await response.json().catch(() => ({})) as T & { message?: string };
    setBusy("");
    if (!response.ok) { setError(body.message ?? "Não foi possível concluir a operação."); throw new Error(body.message); }
    return body;
  }

  async function refreshStatus() { const next = await api<MfaStatus>("status"); setStatus(next); }
  async function enroll(formData: FormData) { try { setEnrollment(await api<Enrollment>("enroll", { senha: formData.get("senha") })); setShowEnrollment(false); } catch {} }
  async function activate(formData: FormData) { try { await api("activate", { codigo: formData.get("codigo") }); setEnrollment(null); await refreshStatus(); setMessage("Autenticação em duas etapas ativada com sucesso."); } catch {} }
  async function stepUp(formData: FormData) { try { const result = await api<{ expiresAt: string; recoveryCodeUsed: boolean }>("step-up", { codigo: formData.get("codigo") }); await refreshStatus(); setMessage(`Identidade confirmada até ${dateTime(result.expiresAt)}.${result.recoveryCodeUsed ? " Um código de recuperação foi consumido." : ""}`); } catch {} }
  async function disable(formData: FormData) { try { await api("disable", { senha: formData.get("senha"), codigo: formData.get("codigo"), confirmacao: formData.get("confirmacao") }); setShowDisable(false); await refreshStatus(); setMessage("MFA desativado. As outras sessões foram encerradas."); } catch {} }
  async function changePassword(formData: FormData) {
    setBusy("password"); setError(""); setMessage("");
    const next = String(formData.get("nova_senha") ?? "");
    if (next !== formData.get("confirmacao")) { setBusy(""); setError("As novas senhas não coincidem."); return; }
    const response = await fetch("/api/session/password/change", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ senha_atual: formData.get("senha_atual"), nova_senha: next }) });
    const body = await response.json().catch(() => ({})) as { message?: string }; setBusy("");
    if (!response.ok) { setError(body.message ?? "Não foi possível alterar a senha."); return; }
    setMessage(body.message ?? "Senha alterada com segurança.");
  }

  const stepUpActive = Boolean(status.session.stepUpValidUntil && new Date(status.session.stepUpValidUntil) > new Date());
  return <div className="mfa-center">
    {status.required && !status.enabled && <div className="mfa-required"><span>!</span><div><strong>MFA obrigatório para o seu perfil</strong><p>Ative a segunda etapa antes de gerenciar usuários, revisar acessos ou homologar regras críticas.</p></div></div>}
    {!status.configured && <div className="mfa-environment-block"><strong>Ambiente ainda não preparado</strong><p>Defina <code>MFA_ENCRYPTION_KEY</code> com uma chave exclusiva de 32 bytes na API do Render.</p></div>}
    {message && <div className="mfa-feedback success">{message}</div>}{error && <div className="mfa-feedback error" role="alert">{error}</div>}
    <div className="mfa-status-grid"><article><span>SEGUNDA ETAPA</span><strong>{status.enabled ? "Ativa" : "Inativa"}</strong><p>{status.enabled ? `Verificada em ${dateTime(status.verifiedAt)}` : "Somente e-mail e senha protegem a conta."}</p></article><article><span>SESSÃO ATUAL</span><strong>{stepUpActive ? "Identidade confirmada" : "Confirmação necessária"}</strong><p>{stepUpActive ? `Válida até ${dateTime(status.session.stepUpValidUntil)}` : "Ações críticas solicitarão um novo código."}</p></article><article><span>RECUPERAÇÃO</span><strong>{status.recoveryCodesRemaining}</strong><p>códigos de uso único disponíveis</p></article></div>
    {!status.enabled && !enrollment && <article className="mfa-panel"><div><span>APLICATIVO AUTENTICADOR</span><h2>Adicione uma segunda prova de identidade</h2><p>Compatível com Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden e outros aplicativos TOTP.</p></div><button className="button" disabled={!status.configured || busy === "enroll"} onClick={() => setShowEnrollment((value) => !value)} type="button">{showEnrollment ? "Cancelar" : "Configurar autenticador"}</button>{showEnrollment && <form action={enroll}><label>Confirme sua senha atual<input autoComplete="current-password" name="senha" required type="password" /></label><button className="button" disabled={busy === "enroll"} type="submit">{busy === "enroll" ? "Preparando…" : "Gerar configuração segura"}</button></form>}</article>}
    {enrollment && <article className="mfa-enrollment"><div className="mfa-enrollment-step"><span>01</span><div><strong>Adicione a chave ao autenticador</strong><p>Use a configuração manual e informe a chave abaixo. O código muda a cada 30 segundos.</p><div className="mfa-secret"><code>{enrollment.secret}</code><button onClick={() => navigator.clipboard.writeText(enrollment.secret)} type="button">Copiar</button></div><details><summary>Mostrar URI técnica</summary><code>{enrollment.otpauthUri}</code></details></div></div><div className="mfa-enrollment-step"><span>02</span><div><strong>Guarde os códigos de recuperação</strong><p>Eles serão exibidos somente agora. Cada código funciona uma única vez.</p><div className="mfa-recovery-codes">{enrollment.recoveryCodes.map((code) => <code key={code}>{code}</code>)}</div><button onClick={() => navigator.clipboard.writeText(enrollment.recoveryCodes.join("\n"))} type="button">Copiar todos</button></div></div><form action={activate} className="mfa-activation"><label>03 · Confirme o primeiro código<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} minLength={6} name="codigo" placeholder="000000" required /></label><button className="button" disabled={busy === "activate"} type="submit">{busy === "activate" ? "Validando…" : "Ativar proteção"}</button></form></article>}
    {status.enabled && <div className="mfa-active-layout"><article className="mfa-panel step-up"><div><span>CONFIRMAÇÃO TEMPORÁRIA</span><h2>Liberar ações críticas</h2><p>Confirme novamente sua identidade. A autorização reforçada permanece válida por dez minutos nesta sessão.</p></div><form action={stepUp}><input aria-label="Código do autenticador" autoComplete="one-time-code" inputMode="numeric" name="codigo" placeholder="Código ou recuperação" required /><button className="button" disabled={busy === "step-up"} type="submit">Confirmar identidade</button></form></article><article className="mfa-panel danger-zone"><div><span>ZONA DE SEGURANÇA</span><h2>Desativar segunda etapa</h2><p>Exige senha, código atual e encerra todas as outras sessões.</p></div><button onClick={() => setShowDisable((value) => !value)} type="button">{showDisable ? "Cancelar" : "Revisar desativação"}</button>{showDisable && <form action={disable}><label>Senha atual<input autoComplete="current-password" name="senha" required type="password" /></label><label>Código atual<input autoComplete="one-time-code" name="codigo" required /></label><label>Digite <strong>DESATIVAR MFA</strong><input name="confirmacao" pattern="DESATIVAR MFA" required /></label><button className="button danger-button" disabled={busy === "disable"} type="submit">Desativar e encerrar sessões</button></form>}</article></div>}
    <article className="mfa-panel password-change-panel"><div><span>CREDENCIAL PRINCIPAL</span><h2>Alterar senha</h2><p>A nova senha deve ter pelo menos 12 caracteres, maiúscula, minúscula, número e símbolo. As outras sessões serão encerradas.</p></div><form action={changePassword}><label>Senha atual<input autoComplete="current-password" name="senha_atual" required type="password"/></label><label>Nova senha<input autoComplete="new-password" minLength={12} name="nova_senha" required type="password"/></label><label>Confirmar nova senha<input autoComplete="new-password" minLength={12} name="confirmacao" required type="password"/></label><button className="button" disabled={busy === "password"} type="submit">{busy === "password" ? "Alterando…" : "Alterar senha"}</button></form></article>
  </div>;
}
