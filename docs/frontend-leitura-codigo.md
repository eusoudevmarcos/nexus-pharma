# Frontend — leitura de código (leitor USB, câmera e DataMatrix)

Como o PDV/conferência/app consomem o endpoint `POST /api/v1/estoque/codigo/resolver`
(backend já pronto) para preencher **produto + lote + validade** sem digitar. Três
formas de entrada: **leitor USB (HID)**, **câmera (ZXing)** e o **app**. Código pronto
para colar no `web/` (Next.js), seguindo o padrão de proxy que já existe.

---

## 1. Rota de proxy (server-side)

Não há proxy de `estoque` ainda. Crie
`web/app/api/portal/estoque/[...path]/route.ts` — cópia fiel do padrão de `dfe`:

```ts
import { proxyPortal } from "@/lib/portal-proxy";

const safeSegment = /^[a-zA-Z0-9_-]+$/;

async function forward(request: Request, context: { params: Promise<{ path: string[] }> }, method: string) {
  const { path } = await context.params;
  if (!path?.length || path.some((segment) => !safeSegment.test(segment))) {
    return Response.json({ message: "Caminho de estoque inválido." }, { status: 400 });
  }
  const body = ["POST", "PUT", "PATCH"].includes(method)
    ? JSON.stringify(await request.json().catch(() => null))
    : undefined;
  return proxyPortal(`/api/v1/estoque/${path.map(encodeURIComponent).join("/")}`, { method, body });
}

export const GET = (request: Request, context: { params: Promise<{ path: string[] }> }) => forward(request, context, "GET");
export const POST = (request: Request, context: { params: Promise<{ path: string[] }> }) => forward(request, context, "POST");
```

O client passa a chamar `POST /api/portal/estoque/codigo/resolver` (o proxy injeta
`Bearer` + `x-company-id` do cookie de sessão). **Nunca** chame a API Nexus direto do
browser — o token fica no server, como no resto do portal.

---

## 2. Cliente comum de resolução

```ts
// web/lib/scan.ts
export type ScanResolved = {
  gs1: boolean;
  produto: { id: string; ean: string; name: string; active: boolean } | null;
  lote: string | null;
  validade: string | null;    // ISO
  fabricacao: string | null;  // ISO
  serial: string | null;
  lote_existente: { id: string; code: string; expiresAt: string; quantity: string } | null;
};

export async function resolverCodigo(codigo: string): Promise<ScanResolved> {
  const res = await fetch("/api/portal/estoque/codigo/resolver", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ codigo }),
  });
  if (!res.ok) throw new Error("Falha ao resolver o código");
  return res.json();
}
```

---

## 3. Leitor USB (HID keyboard-wedge) — zero dependência

A maioria dos leitores "digita" o código + Enter. Basta um input com foco:

```tsx
"use client";
import { useState } from "react";
import { resolverCodigo, type ScanResolved } from "@/lib/scan";

export function ScannerTeclado({ onResolved }: { onResolved: (r: ScanResolved) => void }) {
  const [buffer, setBuffer] = useState("");
  return (
    <input
      autoFocus
      value={buffer}
      onChange={(e) => setBuffer(e.target.value)}
      onKeyDown={async (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const codigo = buffer.trim();
        setBuffer("");
        if (codigo) onResolved(await resolverCodigo(codigo));
      }}
      placeholder="Bipe o produto…"
      inputMode="none"
      aria-label="Leitor de código"
    />
  );
}
```

> Para **DataMatrix 2D** é preciso um leitor **imager 2D** (o laser 1D comum não lê).
> O endpoint já entende tanto o GS1 do 2D quanto o EAN do 1D.

---

## 4. Câmera (ZXing) — celular e webcam

Instale no `web/`: `npm i @zxing/browser` (traz `@zxing/library`, que lê 1D **e**
DataMatrix). Componente:

```tsx
"use client";
import { useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { resolverCodigo, type ScanResolved } from "@/lib/scan";

export function ScannerCamera({ onResolved }: { onResolved: (r: ScanResolved) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, async (result, _err, controls) => {
        if (!result || cancelled) return;
        controls.stop();
        try { onResolved(await resolverCodigo(result.getText())); } catch { controls.stop(); }
      });
      stop = () => controls.stop();
    })().catch(() => undefined);
    return () => { cancelled = true; stop?.(); };
  }, [onResolved]);

  return <video ref={videoRef} style={{ width: "100%", borderRadius: 12 }} muted playsInline />;
}
```

Notas:
- Câmera exige **HTTPS** e permissão do usuário (o portal já é HTTPS em produção).
- No celular, prefira a câmera traseira: passe o `deviceId` da traseira ao `decodeFromVideoDevice` (liste com `BrowserMultiFormatReader.listVideoInputDevices()`).
- Sempre **pare o stream** ao desmontar (o `return` do `useEffect` já faz).

---

## 5. Uso nas telas

- **Recebimento/conferência:** ao bipar, chame `resolverCodigo`; se `lote`/`validade`
  vierem, confirme o item; senão, caia no que a NF-e já pré-preencheu (automação #1).
- **Balcão/caixa:** bipe 1D para achar o produto (`produto.id`) e seguir a venda.
- **App (futuro):** o mesmo `resolverCodigo` + a câmera; é uma casca sobre o endpoint.

Fluxo mental do operador: **bipou → apareceu produto + validade → confere → pronto.**
Sem digitar validade.

---

## 6. Também pendente no frontend (backoffice)

Expor o campo **`tipo_cobranca`** (PAGANTE/BRINDE/FREE) e o `brinde_ate` na tela de
configuração de assinatura, que chama
`PUT /api/portal/internal/companies/:id/... → /interno/comercial/empresas/:id/assinatura`
(backend já aceita — ver `docs/roadmap-integracoes-e-automacao.md` §1).
