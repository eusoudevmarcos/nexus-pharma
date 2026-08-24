export function MetricCard({ label, value, note, tone = "default" }: { label: string; value: string; note?: string; tone?: "default" | "warning" | "success" }) {
  return <article className={`report-metric ${tone}`}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</article>;
}

export function EmptyReport({ text = "Ainda não há dados suficientes para este relatório." }: { text?: string }) {
  return <div className="report-empty"><span>◇</span><strong>Relatório aguardando dados</strong><p>{text}</p></div>;
}

export const currency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
export const number = (value: number, digits = 0) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(value);
export const percent = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(value);
export const date = (value: string) => new Intl.DateTimeFormat("pt-BR").format(new Date(value));
