import type { ResolvedHop } from "@r0ute/ui/resolve-route";

/**
 * Hop-by-hop breakdown floating over the map's top-left corner. Pointer events
 * pass through and the text cannot be selected, so it reads as part of the map
 * rather than a control.
 */
export function RouteTable({ hops }: { hops: ResolvedHop[] }) {
  return (
    <div className="pointer-events-none absolute top-3 left-3 z-[1000] rounded-md border border-neutral-800 bg-neutral-950/85 font-mono text-xs backdrop-blur-sm select-none">
      {hops.length === 0 ? (
        <p className="m-0 px-3 py-2 text-neutral-400">Direct — no repeaters</p>
      ) : (
        <table className="border-collapse">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="px-3 py-1.5 font-normal">#</th>
              <th className="px-3 py-1.5 font-normal">hop</th>
              <th className="px-3 py-1.5 font-normal">node</th>
            </tr>
          </thead>
          <tbody>
            {hops.map((hop, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a hop's position is its identity — prefixes can repeat within a route
              <tr key={`${index}:${hop.prefix}`} className="border-t border-neutral-800/60">
                <td className="px-3 py-1.5 text-neutral-500">{index + 1}</td>
                <td className="px-3 py-1.5 text-cyan-400">{hop.prefix}</td>
                <td className="px-3 py-1.5 text-neutral-200">
                  {hop.chosen
                    ? (hop.chosen.name ?? `${hop.chosen.publicKey.slice(0, 12)}…`)
                    : "unknown"}
                  {hop.alternatives > 0 && (
                    <span className="text-neutral-500"> ±{hop.alternatives}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
