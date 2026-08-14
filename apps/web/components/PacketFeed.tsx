"use client";

export type PacketRow = {
  id: number;
  kind: "advert" | "group-message";
  receivedAt: string;
  /** node name for adverts, sender for group messages */
  title: string;
  /** coords for adverts; channel and route summary for group messages */
  detail: string;
};

const KIND_LABEL: Record<PacketRow["kind"], { text: string; color: string }> = {
  advert: { text: "ADVERT", color: "#4338ca" }, // matches the node markers
  "group-message": { text: "MESSAGE", color: "#f97316" }, // matches the route lines
};

function timeOf(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString();
}

/** Live feed of received packets, newest first. Purely presentational. */
export function PacketFeed({ rows }: { rows: PacketRow[] }) {
  return (
    <aside
      style={{
        width: "20rem",
        borderLeft: "1px solid #e5e7eb",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "#ffffff",
      }}
    >
      <h2
        style={{
          margin: 0,
          padding: "0.5rem 0.75rem",
          fontSize: "0.8rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#6b7280",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        Packets
      </h2>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {rows.length === 0 ? (
          <p style={{ padding: "0.75rem", color: "#9ca3af", fontSize: "0.85rem" }}>
            Waiting for packets…
          </p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.8rem",
            }}
          >
            <tbody>
              {rows.map((row) => {
                const kind = KIND_LABEL[row.kind];
                return (
                  <tr key={row.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td
                      style={{
                        padding: "0.4rem 0.5rem 0.4rem 0.75rem",
                        whiteSpace: "nowrap",
                        verticalAlign: "top",
                        color: "#6b7280",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {timeOf(row.receivedAt)}
                    </td>
                    <td style={{ padding: "0.4rem 0.5rem", verticalAlign: "top" }}>
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: "0.65rem",
                          fontWeight: 600,
                          color: "#ffffff",
                          background: kind.color,
                          borderRadius: "3px",
                          padding: "0.05rem 0.3rem",
                          marginRight: "0.4rem",
                          verticalAlign: "text-bottom",
                        }}
                      >
                        {kind.text}
                      </span>
                      <strong>{row.title}</strong>
                      <div style={{ color: "#6b7280", marginTop: "0.1rem" }}>{row.detail}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </aside>
  );
}
