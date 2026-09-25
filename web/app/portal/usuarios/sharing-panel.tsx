export type SharingConnection = {
  id: string;
  status: "ACTIVE" | "SUSPENDED" | "TERMINATED";
  startsAt: string;
  endsAt: string | null;
  organization: { tradeName: string; kind: string; status: string };
};

const kindLabels: Record<string, string> = { LABORATORY: "Laboratório", DISTRIBUTOR: "Distribuidora", WHOLESALER: "Atacadista" };
const date = (value: string) => new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

function statusText(item: SharingConnection) {
  if (item.status === "ACTIVE") return item.organization.status === "ACTIVE" ? "Acompanhando" : "Organização inativa";
  if (item.status === "TERMINATED") return `Encerrado${item.endsAt ? ` em ${date(item.endsAt)}` : ""}`;
  return "Suspenso pela Nexus";
}

/**
 * Transparência para a farmácia: quais indústrias e distribuidoras acompanham os
 * dados dela. O compartilhamento faz parte do contrato com a Nexus, por isso é
 * só consulta — suspender ou encerrar é feito pela Nexus.
 */
export function SharingPanel({ connections }: { connections: SharingConnection[] }) {
  return (
    <article className="report-panel full sharing-panel">
      <div className="panel-title">
        <div>
          <span>INDÚSTRIA E DISTRIBUIÇÃO</span>
          <h2>Quem acompanha seu estoque e suas vendas</h2>
        </div>
        <strong>{connections.filter((item) => item.status === "ACTIVE").length}</strong>
      </div>
      <p className="team-hint">
        Previsto no seu contrato com a Nexus: estas organizações acompanham, em tempo real, as <b>quantidades</b> de estoque,
        vendas e validade na sua farmácia para planejar o abastecimento. Nunca veem preço, margem, financeiro ou dados de clientes.
      </p>
      {connections.length ? (
        <div className="team-list">
          {connections.map((item) => (
            <div className="internal-row sharing-row" key={item.id}>
              <div>
                <strong>{item.organization.tradeName}</strong>
                <small>{kindLabels[item.organization.kind] ?? item.organization.kind} · desde {date(item.startsAt)}</small>
              </div>
              <span className={`status-pill ${item.status === "ACTIVE" ? "" : item.status === "SUSPENDED" ? "pending" : "disabled"}`}>{statusText(item)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="sharing-empty">Nenhuma indústria ou distribuidora acompanha esta farmácia no momento.</p>
      )}
    </article>
  );
}
