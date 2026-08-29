"use client";

export type OfflineSnapshotProduct = { ean: string; name: string; available: number; listPrice: number; commercialPrice: number; fiscalFingerprint: string; allowedOffline: boolean; blockReason: string | null };
export type OfflineSnapshotPayload = { schema: "NEXUS_POS_OFFLINE_V1"; generatedAt: string; expiresAt: string; companyId: string; pointOfSaleId: string; cashSessionId: string; operatorId: string; products: OfflineSnapshotProduct[] };
export type OfflineDevice = { id: string; installationId: string; pointOfSaleId: string; name: string };
export type OfflineSaleCommand = { id: string; deviceId: string; snapshotId: string; occurredAt: string; type: "SALE"; payload: unknown };

type Cipher = { iv: string; data: string };
type StoredCommand = Omit<OfflineSaleCommand, "payload"> & { cipher: Cipher };
const DB_NAME = "nexus-pos-offline";
const DB_VERSION = 2;
const META = "meta";
const COMMANDS = "commands";

function request<T>(value: IDBRequest<T>) { return new Promise<T>((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); }); }
function openDatabase() { return new Promise<IDBDatabase>((resolve, reject) => { const opening = indexedDB.open(DB_NAME, DB_VERSION); opening.onupgradeneeded = () => { const db = opening.result; if (!db.objectStoreNames.contains(META)) db.createObjectStore(META); if (!db.objectStoreNames.contains(COMMANDS)) db.createObjectStore(COMMANDS, { keyPath: "id" }); }; opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error); }); }
async function metaGet<T>(key: string) { const db = await openDatabase(); try { return await request(db.transaction(META).objectStore(META).get(key)) as T | undefined; } finally { db.close(); } }
async function metaSet(key: string, value: unknown) { const db = await openDatabase(); try { await request(db.transaction(META, "readwrite").objectStore(META).put(value, key)); } finally { db.close(); } }
function bytesToBase64(bytes: Uint8Array) { let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary); }
function base64ToBytes(value: string) { const binary = atob(value); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
let unlockedKey: CryptoKey | null = null;
async function deriveKey(pin: string, salt: Uint8Array) { const encodedPin = new TextEncoder().encode(pin); const material = await crypto.subtle.importKey("raw", encodedPin.buffer as ArrayBuffer, "PBKDF2", false, ["deriveKey"]); return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt.buffer as ArrayBuffer, iterations: 210_000 }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); }
async function encryptionKey() { if (!unlockedKey) throw new Error("Desbloqueie o caixa offline com o PIN deste dispositivo."); return unlockedKey; }
async function encryptWithKey(value: unknown, key: CryptoKey): Promise<Cipher> { const iv = crypto.getRandomValues(new Uint8Array(12)); const encoded = new TextEncoder().encode(JSON.stringify(value)); const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, encoded.buffer as ArrayBuffer); return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(data)) }; }
async function decryptWithKey<T>(cipher: Cipher, key: CryptoKey): Promise<T> { const iv = base64ToBytes(cipher.iv); const data = base64ToBytes(cipher.data); const decoded = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, data.buffer as ArrayBuffer); return JSON.parse(new TextDecoder().decode(decoded)) as T; }
async function encrypt(value: unknown) { return encryptWithKey(value, await encryptionKey()); }
async function decrypt<T>(cipher: Cipher) { return decryptWithKey<T>(cipher, await encryptionKey()); }

export async function configureOfflinePin(pin: string) { if (!/^\d{6}$/.test(pin)) throw new Error("Defina um PIN local de exatamente 6 números."); const salt = crypto.getRandomValues(new Uint8Array(16)); const key = await deriveKey(pin, salt); const verifier = await encryptWithKey("NEXUS_OFFLINE_UNLOCK_V1", key); await metaSet("pin-config", { salt: bytesToBase64(salt), verifier }); unlockedKey = key; }
export async function unlockOffline(pin: string) { const config = await metaGet<{ salt: string; verifier: Cipher }>("pin-config"); if (!config) throw new Error("O modo offline ainda não foi preparado neste dispositivo."); try { const key = await deriveKey(pin, base64ToBytes(config.salt)); const value = await decryptWithKey<string>(config.verifier, key); if (value !== "NEXUS_OFFLINE_UNLOCK_V1") throw new Error(); unlockedKey = key; return true; } catch { throw new Error("PIN offline incorreto."); } }
export function lockOffline() { unlockedKey = null; }
export async function hasOfflinePin() { return Boolean(await metaGet("pin-config")); }

export async function installationId() { const saved = await metaGet<string>("installation-id"); if (saved) return saved; const created = crypto.randomUUID(); await metaSet("installation-id", created); return created; }
export async function saveOfflineDevice(device: OfflineDevice) { await metaSet("device", device); }
export async function getOfflineDevice() { return metaGet<OfflineDevice>("device"); }
export async function saveOfflineSnapshot(snapshot: { id: string; payload: OfflineSnapshotPayload }) { await metaSet("snapshot", { id: snapshot.id, cipher: await encrypt(snapshot.payload) }); }
export async function getOfflineSnapshot() { const stored = await metaGet<{ id: string; cipher: Cipher }>("snapshot"); return stored ? { id: stored.id, payload: await decrypt<OfflineSnapshotPayload>(stored.cipher) } : undefined; }

export async function queueOfflineSale(payload: { sessao_caixa_id: string; itens: Array<{ ean: string; quantidade: number; prescricao?: unknown }>; pagamentos: Array<{ metodo: string; valor?: number; referencia_externa?: string | null }>; farmaceutico_credencial_id?: string | null; [key: string]: unknown }) {
  const device = await getOfflineDevice(); const snapshot = await getOfflineSnapshot();
  if (!device || !snapshot) throw new Error("Prepare este caixa para operação offline enquanto houver conexão.");
  if (new Date(snapshot.payload.expiresAt) <= new Date()) throw new Error("O catálogo offline venceu. Reconecte e gere um novo snapshot.");
  if (payload.sessao_caixa_id !== snapshot.payload.cashSessionId) throw new Error("A sessão atual não corresponde ao snapshot offline.");
  if (payload.farmaceutico_credencial_id || payload.pagamentos.some((payment) => payment.metodo !== "CASH")) throw new Error("Offline aceita somente venda comum com recebimento em dinheiro.");
  const queued = await listOfflineCommands();
  for (const item of payload.itens) { const product = snapshot.payload.products.find((entry) => entry.ean === item.ean); const alreadyQueued = queued.filter((command) => command.snapshotId === snapshot.id).reduce((sum, command) => { const saved = command.payload as { itens?: Array<{ ean: string; quantidade: number }> }; return sum + (saved.itens ?? []).filter((entry) => entry.ean === item.ean).reduce((subtotal, entry) => subtotal + entry.quantidade, 0); }, 0); if (!product?.allowedOffline) throw new Error(`${product?.name ?? item.ean} exige validação online.`); if (alreadyQueued + item.quantidade > product.available) throw new Error(`Saldo offline insuficiente para ${product.name}; ${alreadyQueued} unidade(s) já estão na fila.`); }
  const command: OfflineSaleCommand = { id: crypto.randomUUID(), deviceId: device.id, snapshotId: snapshot.id, occurredAt: new Date().toISOString(), type: "SALE", payload: { ...payload, idempotency_key: undefined } };
  const db = await openDatabase(); try { await request(db.transaction(COMMANDS, "readwrite").objectStore(COMMANDS).add({ id: command.id, deviceId: command.deviceId, snapshotId: command.snapshotId, occurredAt: command.occurredAt, type: command.type, cipher: await encrypt(command.payload) } satisfies StoredCommand)); } finally { db.close(); }
  window.dispatchEvent(new Event("nexus-offline-change"));
  return command.id;
}

export async function listOfflineCommands(): Promise<OfflineSaleCommand[]> { const db = await openDatabase(); try { const stored = await request(db.transaction(COMMANDS).objectStore(COMMANDS).getAll()) as StoredCommand[]; return Promise.all(stored.map(async (entry) => ({ id: entry.id, deviceId: entry.deviceId, snapshotId: entry.snapshotId, occurredAt: entry.occurredAt, type: entry.type, payload: await decrypt(entry.cipher) }))); } finally { db.close(); } }
export async function removeOfflineCommands(ids: string[]) { const db = await openDatabase(); try { const transaction = db.transaction(COMMANDS, "readwrite"); ids.forEach((id) => transaction.objectStore(COMMANDS).delete(id)); await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); }); } finally { db.close(); } window.dispatchEvent(new Event("nexus-offline-change")); }
export async function pendingOfflineCount() { const db = await openDatabase(); try { return await request(db.transaction(COMMANDS).objectStore(COMMANDS).count()); } finally { db.close(); } }

export async function warmOfflineShell() { if (!("serviceWorker" in navigator)) return false; const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" }); await navigator.serviceWorker.ready; const html = await fetch("/caixa-offline", { cache: "reload" }).then((response) => response.text()); const document = new DOMParser().parseFromString(html, "text/html"); const assets = [...document.querySelectorAll<HTMLScriptElement>("script[src]")].map((entry) => entry.src).concat([...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')].map((entry) => entry.href)); registration.active?.postMessage({ type: "CACHE_OFFLINE_SHELL", urls: ["/caixa-offline", "/manifest.webmanifest", ...assets] }); return true; }
