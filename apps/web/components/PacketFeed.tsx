"use client";

export type PacketRow = {
  id: number;
  kind: "advert" | "group-message" | "route-packet";
  receivedAt: string;
  /** node name for adverts, sender for messages, packet type for route packets */
  title: string;
  /** coords for adverts; channel/route summaries for the routed kinds */
  detail: string;
};

// badge colors match the map: cyan markers, orange message routes, violet packets
const KIND_BADGE: Record<PacketRow["kind"], { text: string; className: string }> = {
  advert: { text: "ADVERT", className: "bg-cyan-400 text-neutral-950" },
  "group-message": { text: "MESSAGE", className: "bg-orange-500 text-neutral-950" },
  "route-packet": { text: "PKT", className: "bg-violet-400 text-neutral-950" },
};

function timeOf(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString();
}

/**
 * Live feed of received packets, newest first. Clicking (or Enter/Space on) a
 * row replays that packet on the map.
 */
export function PacketFeed({
  rows,
  onSelect,
}: {
  rows: PacketRow[];
  onSelect: (id: number) => void;
}) {
  return (
    <aside className="flex w-80 min-h-0 flex-col border-l border-neutral-800 bg-neutral-950">
      <h2 className="m-0 border-b border-neutral-800 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-500">
        Packets
      </h2>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="p-3 text-sm text-neutral-600">Waiting for packets…</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <tbody>
              {rows.map((row) => {
                const badge = KIND_BADGE[row.kind];
                const replay = () => onSelect(row.id);
                return (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    onClick={replay}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        replay();
                      }
                    }}
                    className="cursor-pointer border-b border-neutral-800/60 outline-none transition-colors hover:bg-neutral-900 focus-visible:bg-neutral-900"
                    title="Replay this packet on the map"
                  >
                    <td className="whitespace-nowrap py-1.5 pr-2 pl-3 align-top tabular-nums text-neutral-500">
                      {timeOf(row.receivedAt)}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <span
                        className={`mr-1.5 inline-block rounded-sm px-1 py-px align-text-bottom text-[0.65rem] font-bold ${badge.className}`}
                      >
                        {badge.text}
                      </span>
                      <strong className="text-neutral-100">{row.title}</strong>
                      <div className="mt-0.5 text-neutral-400">{row.detail}</div>
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
