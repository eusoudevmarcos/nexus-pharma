import { config } from "../config.js";
import { prisma } from "../infra/prisma.js";
import { recordOperationalIncident } from "./observability.js";

type InvitationMessage = {
  invitationId: string;
  companyId: string;
  companyName: string;
  recipient: string;
  role: string;
  token: string;
};

type PasswordResetMessage = { recipient: string; token: string };

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);

export async function deliverInvitationEmail(message: InvitationMessage) {
  const inviteUrl = `${config.WEB_APP_URL.replace(/\/$/, "")}/convite?token=${encodeURIComponent(message.token)}`;
  const subject = `Convite para acessar ${message.companyName} no Nexus Pharma`;
  const delivery = await prisma.emailDelivery.create({
    data: {
      companyId: message.companyId,
      invitationId: message.invitationId,
      recipient: message.recipient,
      template: "USER_INVITATION",
      subject,
      provider: config.EMAIL_RELAY_URL ? "relay" : "manual",
      status: config.EMAIL_RELAY_URL ? "PROCESSING" : "QUEUED",
      attempts: config.EMAIL_RELAY_URL ? 1 : 0,
    },
  });

  if (!config.EMAIL_RELAY_URL) {
    return { delivery, inviteUrl, automatic: false };
  }

  const companyName = escapeHtml(message.companyName);
  const role = escapeHtml(message.role);
  const html = `<div style="font-family:Arial,sans-serif;color:#102331;max-width:560px;margin:auto"><div style="border-radius:18px;background:#063a5c;padding:28px;color:white"><h1 style="margin:0;font-size:24px">Você foi convidado</h1><p style="color:#d7e7ef">${companyName} liberou o perfil ${role} para você no Nexus Pharma.</p><a href="${inviteUrl}" style="display:inline-block;margin-top:12px;border-radius:12px;background:#ffca05;color:#03283f;padding:14px 22px;text-decoration:none;font-weight:bold">Aceitar convite</a></div><p style="font-size:12px;color:#64717b">Este link expira em 72 horas e funciona uma única vez. Se você não esperava este convite, ignore esta mensagem.</p></div>`;
  const text = `Você foi convidado para acessar ${message.companyName} no Nexus Pharma com o perfil ${message.role}. Aceite em: ${inviteUrl}. O link expira em 72 horas e funciona uma única vez.`;

  try {
    const response = await fetch(config.EMAIL_RELAY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.EMAIL_RELAY_KEY && { authorization: `Bearer ${config.EMAIL_RELAY_KEY}` }),
      },
      body: JSON.stringify({
        from: config.EMAIL_FROM,
        to: [message.recipient],
        subject,
        html,
        text,
        metadata: { delivery_id: delivery.id, template: "USER_INVITATION" },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const result = (await response.json().catch(() => ({}))) as { id?: string; message_id?: string; error?: string };
    if (!response.ok) throw new Error(result.error ?? `HTTP_${response.status}`);
    const updated = await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "SENT",
        providerMessageId: result.id ?? result.message_id ?? null,
        sentAt: new Date(),
        lastError: null,
      },
    });
    return { delivery: updated, inviteUrl, automatic: true };
  } catch (error) {
    const messageText = error instanceof Error ? error.message.slice(0, 1000) : "ERRO_DESCONHECIDO";
    const updated = await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", lastError: messageText },
    });
    await recordOperationalIncident({
      source: "email",
      severity: "WARNING",
      title: "Falha na entrega de convite",
      detail: messageText,
      metadata: { deliveryId: delivery.id, provider: "relay" },
      fingerprintKey: `email:invitation:${messageText}`,
    }).catch(() => undefined);
    return { delivery: updated, inviteUrl, automatic: false };
  }
}

export async function deliverPasswordResetEmail(message: PasswordResetMessage) {
  const resetUrl = `${config.WEB_APP_URL.replace(/\/$/, "")}/redefinir-senha?token=${encodeURIComponent(message.token)}`;
  const subject = "Redefinição segura de senha — Nexus Pharma";
  const delivery = await prisma.emailDelivery.create({ data: { recipient: message.recipient, template: "PASSWORD_RESET", subject, provider: config.EMAIL_RELAY_URL ? "relay" : "manual", status: config.EMAIL_RELAY_URL ? "PROCESSING" : "QUEUED", attempts: config.EMAIL_RELAY_URL ? 1 : 0 } });
  if (!config.EMAIL_RELAY_URL) return { delivery, resetUrl, automatic: false };
  const html = `<div style="font-family:Arial,sans-serif;color:#102331;max-width:560px;margin:auto"><div style="border-radius:18px;background:#063a5c;padding:28px;color:white"><h1 style="margin:0;font-size:24px">Redefina sua senha</h1><p style="color:#d7e7ef">Recebemos uma solicitação para alterar a senha da sua conta Nexus Pharma.</p><a href="${resetUrl}" style="display:inline-block;margin-top:12px;border-radius:12px;background:#ffca05;color:#03283f;padding:14px 22px;text-decoration:none;font-weight:bold">Criar nova senha</a></div><p style="font-size:12px;color:#64717b">O link expira em 30 minutos, funciona uma única vez e encerra as sessões existentes. Se você não solicitou, ignore esta mensagem.</p></div>`;
  const text = `Redefina sua senha Nexus Pharma em: ${resetUrl}. O link expira em 30 minutos e funciona uma única vez.`;
  try {
    const response = await fetch(config.EMAIL_RELAY_URL, { method: "POST", headers: { "content-type": "application/json", ...(config.EMAIL_RELAY_KEY && { authorization: `Bearer ${config.EMAIL_RELAY_KEY}` }) }, body: JSON.stringify({ from: config.EMAIL_FROM, to: [message.recipient], subject, html, text, metadata: { delivery_id: delivery.id, template: "PASSWORD_RESET" } }), signal: AbortSignal.timeout(10_000) });
    const result = await response.json().catch(() => ({})) as { id?: string; message_id?: string; error?: string };
    if (!response.ok) throw new Error(result.error ?? `HTTP_${response.status}`);
    const updated = await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", providerMessageId: result.id ?? result.message_id ?? null, sentAt: new Date(), lastError: null } });
    return { delivery: updated, resetUrl, automatic: true };
  } catch (error) {
    const messageText = error instanceof Error ? error.message.slice(0, 1000) : "ERRO_DESCONHECIDO";
    const updated = await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", lastError: messageText } });
    await recordOperationalIncident({ source: "email", severity: "WARNING", title: "Falha na entrega de redefinição de senha", detail: messageText, metadata: { deliveryId: delivery.id, provider: "relay" }, fingerprintKey: `email:password-reset:${messageText}` }).catch(() => undefined);
    return { delivery: updated, resetUrl, automatic: false };
  }
}
