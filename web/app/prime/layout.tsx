import type { Metadata } from "next";
import { requirePrime } from "@/lib/portal";
import { PrimeShell } from "./prime-shell";

export const metadata: Metadata = { title: "Painel Prime", robots: { index: false, follow: false } };

export default async function PrimeLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePrime();
  return <PrimeShell governance={session.governance} profile={session.profile}>{children}</PrimeShell>;
}
