"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return <button className="button button-outline" disabled={loading} onClick={async () => { setLoading(true); await fetch("/api/session/logout", { method: "POST" }); router.push("/entrar"); router.refresh(); }} type="button">{loading ? "Saindo..." : "Sair"}</button>;
}
