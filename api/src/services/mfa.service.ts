import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { compare } from "bcryptjs";
import { config } from "../config.js";
import { prisma } from "../infra/prisma.js";
import { decryptSensitivePayload, encryptSensitivePayload } from "./dfe-certificate.service.js";
import { authTokenHash } from "./auth-session.service.js";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const challengeTtlMs = 5 * 60 * 1000;
const stepUpTtlMs = 10 * 60 * 1000;

function mfaKey() {
  const value = config.MFA_ENCRYPTION_KEY?.trim();
  if (!value || value.length < 32) throw new Error("MFA_CHAVE_DE_CRIPTOGRAFIA_NAO_CONFIGURADA");
  return /^[a-fA-F0-9]{64}$/.test(value) ? Buffer.from(value, "hex") : createHash("sha256").update(value).digest();
}

function base32Encode(bytes: Buffer) {
  let bits = ""; let output = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  for (let index = 0; index < bits.length; index += 5) output += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  return output;
}

function base32Decode(value: string) {
  let bits = "";
  for (const character of value.toUpperCase().replace(/=+$/g, "")) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("MFA_SEGREDO_INVALIDO");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: bigint) {
  const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24) | ((digest[offset + 1]! & 0xff) << 16) | ((digest[offset + 2]! & 0xff) << 8) | (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function matchingCounter(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = BigInt(Math.floor(now / 30_000));
  for (const offset of [-1n, 0n, 1n]) {
    const candidate = current + offset;
    if (hotp(secret, candidate) === code) return candidate;
  }
  return null;
}

const recoveryHash = (userId: string, code: string) => createHash("sha256").update(`${userId}:${code.replaceAll("-", "").toUpperCase()}`).digest("hex");
const recoveryCodes = () => Array.from({ length: 10 }, () => {
  const raw = base32Encode(randomBytes(8)).slice(0, 12);
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
});

function decryptSecret(encrypted: string) {
  try { return decryptSensitivePayload<{ secret: string }>(encrypted, mfaKey()).secret; }
  catch (cause) { if (cause instanceof Error && cause.message.startsWith("MFA_")) throw cause; throw new Error("MFA_SEGREDO_CRIPTOGRAFADO_INVALIDO"); }
}

export async function mfaRequirement(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { systemRole: true, memberships: { where: { active: true }, select: { role: true } }, primeMemberships: { where: { active: true }, select: { id: true } }, mfaMethod: { select: { status: true, verifiedAt: true, recoveryCodeHashes: true } } } });
  if (!user) throw new Error("USUARIO_NAO_ENCONTRADO");
  const required = user.systemRole !== "CUSTOMER" || user.primeMemberships.length > 0 || user.memberships.some((membership) => ["OWNER", "ADMIN"].includes(membership.role));
  const hashes = Array.isArray(user.mfaMethod?.recoveryCodeHashes) ? user.mfaMethod.recoveryCodeHashes : [];
  return { required, configured: Boolean(config.MFA_ENCRYPTION_KEY?.trim() && config.MFA_ENCRYPTION_KEY.trim().length >= 32), enabled: user.mfaMethod?.status === "ACTIVE", status: user.mfaMethod?.status ?? "NOT_CONFIGURED", verifiedAt: user.mfaMethod?.verifiedAt ?? null, recoveryCodesRemaining: hashes.length };
}

export async function beginMfaEnrollment(userId: string, email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true, mfaMethod: { select: { status: true } } } });
  if (!user?.passwordHash || !(await compare(password, user.passwordHash))) throw new Error("CREDENCIAIS_INVALIDAS");
  const current = user.mfaMethod;
  if (current?.status === "ACTIVE") throw new Error("MFA_JA_ATIVO");
  const secret = base32Encode(randomBytes(20));
  const codes = recoveryCodes();
  await prisma.userMfaMethod.upsert({
    where: { userId },
    create: { userId, status: "PENDING", encryptedSecret: encryptSensitivePayload({ secret }, mfaKey()), recoveryCodeHashes: codes.map((code) => recoveryHash(userId, code)) },
    update: { status: "PENDING", encryptedSecret: encryptSensitivePayload({ secret }, mfaKey()), recoveryCodeHashes: codes.map((code) => recoveryHash(userId, code)), lastUsedCounter: null, verifiedAt: null, disabledAt: null },
  });
  const issuer = "Nexus Pharma";
  const uri = `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return { secret, otpauthUri: uri, recoveryCodes: codes };
}

async function validateCode(userId: string, codeValue: string, allowedStatuses: Array<"PENDING" | "ACTIVE">) {
  const method = await prisma.userMfaMethod.findUnique({ where: { userId } });
  if (!method || !allowedStatuses.includes(method.status as "PENDING" | "ACTIVE")) throw new Error("MFA_NAO_CONFIGURADO");
  const code = codeValue.trim().toUpperCase();
  const counter = matchingCounter(decryptSecret(method.encryptedSecret), code);
  if (counter !== null) {
    if (method.status === "ACTIVE" && method.lastUsedCounter !== null && counter <= method.lastUsedCounter) throw new Error("MFA_CODIGO_JA_UTILIZADO");
    return { method, counter, recoveryHash: null as string | null };
  }
  if (method.status !== "ACTIVE") throw new Error("MFA_CODIGO_INVALIDO");
  const candidate = recoveryHash(userId, code);
  const hashes = Array.isArray(method.recoveryCodeHashes) ? method.recoveryCodeHashes.filter((item): item is string => typeof item === "string") : [];
  const match = hashes.find((hash) => {
    const left = Buffer.from(hash, "hex"); const right = Buffer.from(candidate, "hex");
    return left.length === right.length && timingSafeEqual(left, right);
  });
  if (!match) throw new Error("MFA_CODIGO_INVALIDO");
  return { method, counter: null, recoveryHash: match };
}

async function consumeValidation(validation: Awaited<ReturnType<typeof validateCode>>) {
  if (validation.counter !== null) {
    const consumed = await prisma.userMfaMethod.updateMany({
      where: { id: validation.method.id, OR: [{ lastUsedCounter: null }, { lastUsedCounter: { lt: validation.counter } }] },
      data: { lastUsedCounter: validation.counter },
    });
    if (consumed.count !== 1) throw new Error("MFA_CODIGO_JA_UTILIZADO");
  }
  if (validation.recoveryHash) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.userMfaMethod.findUniqueOrThrow({ where: { id: validation.method.id }, select: { recoveryCodeHashes: true } });
      const hashes = Array.isArray(current.recoveryCodeHashes) ? current.recoveryCodeHashes.filter((item): item is string => typeof item === "string") : [];
      if (!hashes.includes(validation.recoveryHash!)) throw new Error("MFA_CODIGO_JA_UTILIZADO");
      await tx.userMfaMethod.update({ where: { id: validation.method.id }, data: { recoveryCodeHashes: hashes.filter((hash) => hash !== validation.recoveryHash) } });
    }, { isolationLevel: "Serializable" });
  }
  return { recoveryCodeUsed: Boolean(validation.recoveryHash) };
}

export async function activateMfa(userId: string, sessionId: string, code: string) {
  const validation = await validateCode(userId, code, ["PENDING"]);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const updated = await tx.authSession.updateMany({ where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: now } }, data: { mfaVerifiedAt: now, assuranceLevel: 2 } });
    if (updated.count !== 1) throw new Error("SESSAO_INVALIDA");
    await tx.userMfaMethod.update({ where: { id: validation.method.id }, data: { status: "ACTIVE", verifiedAt: now, lastUsedCounter: validation.counter, disabledAt: null } });
  });
  return { enabled: true, verifiedAt: now, stepUpExpiresAt: new Date(now.getTime() + stepUpTtlMs) };
}

export async function createMfaLoginChallenge(userId: string, ipAddress?: string, userAgent?: string) {
  const token = randomBytes(40).toString("base64url"); const now = new Date();
  await prisma.$transaction([
    prisma.authMfaChallenge.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } }),
    prisma.authMfaChallenge.create({ data: { userId, tokenHash: authTokenHash(token), expiresAt: new Date(now.getTime() + challengeTtlMs), ipAddress, userAgent: userAgent?.slice(0, 500) } }),
  ]);
  return { token, expiresIn: Math.floor(challengeTtlMs / 1000) };
}

export async function verifyMfaLoginChallenge(token: string, code: string) {
  const challenge = await prisma.authMfaChallenge.findUnique({ where: { tokenHash: authTokenHash(token) }, include: { user: { include: { memberships: { where: { active: true }, include: { company: { select: { id: true, tradeName: true, status: true } } } } } } } });
  if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date() || challenge.attempts >= 5 || challenge.user.status !== "ACTIVE") throw new Error("MFA_DESAFIO_INVALIDO_OU_EXPIRADO");
  try {
    const validation = await validateCode(challenge.userId, code, ["ACTIVE"]);
    const result = await consumeValidation(validation);
    await prisma.authMfaChallenge.update({ where: { id: challenge.id }, data: { usedAt: new Date() } });
    return { user: challenge.user, ...result };
  } catch (cause) {
    await prisma.authMfaChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 }, ...(challenge.attempts >= 4 && { usedAt: new Date() }) } });
    throw cause;
  }
}

export async function stepUpMfa(userId: string, sessionId: string, code: string) {
  const validation = await validateCode(userId, code, ["ACTIVE"]);
  const consumed = await consumeValidation(validation); const now = new Date();
  const updated = await prisma.authSession.updateMany({ where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: now } }, data: { mfaVerifiedAt: now, assuranceLevel: 2 } });
  if (updated.count !== 1) throw new Error("SESSAO_INVALIDA");
  return { verifiedAt: now, expiresAt: new Date(now.getTime() + stepUpTtlMs), ...consumed };
}

export async function disableMfa(userId: string, sessionId: string, password: string, code: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await compare(password, user.passwordHash))) throw new Error("CREDENCIAIS_INVALIDAS");
  const validation = await validateCode(userId, code, ["ACTIVE"]); await consumeValidation(validation);
  const now = new Date();
  await prisma.$transaction([
    prisma.userMfaMethod.update({ where: { userId }, data: { status: "DISABLED", encryptedSecret: encryptSensitivePayload({ secret: base32Encode(randomBytes(20)) }, mfaKey()), recoveryCodeHashes: [], lastUsedCounter: null, disabledAt: now } }),
    prisma.authSession.updateMany({ where: { userId, id: { not: sessionId }, revokedAt: null }, data: { revokedAt: now, revokedReason: "MFA_DISABLED" } }),
    prisma.authSession.update({ where: { id: sessionId }, data: { assuranceLevel: 1, mfaVerifiedAt: null } }),
  ]);
  return { enabled: false };
}

export const mfaStepUpWindowMs = stepUpTtlMs;
