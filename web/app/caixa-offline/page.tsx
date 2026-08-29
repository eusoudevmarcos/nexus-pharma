import type { Metadata } from "next";
import { OfflineCashApp } from "./offline-cash-app";

export const metadata: Metadata = { title: "Caixa offline", description: "Frente de caixa local protegida do Nexus Pharma." };
export default function OfflineCashPage() { return <OfflineCashApp/>; }
