import type { NodeType } from "@r0ute/database";

/** how each advertised node role is drawn; `null` covers adverts with no role flag */
export type NodeStyle = {
  label: string;
  /** marker fill; also used by the legend swatch */
  color: string;
  /** CircleMarker radius in px — repeaters are the mesh's backbone, so they read largest */
  radius: number;
  /** css hook for the per-role glow (map.css) */
  className: string;
};

export const NODE_STYLES: Record<NodeType, NodeStyle> = {
  CHAT: { label: "Node", color: "#22d3ee", radius: 6, className: "node-chat" },
  REPEATER: { label: "Repeater", color: "#f59e0b", radius: 9, className: "node-repeater" },
  ROOM: { label: "Room server", color: "#34d399", radius: 8, className: "node-room" },
  SENSOR: { label: "Sensor", color: "#f472b6", radius: 6, className: "node-sensor" },
};

export const UNKNOWN_NODE_STYLE: NodeStyle = {
  label: "Unknown",
  color: "#a3a3a3",
  radius: 5,
  className: "node-unknown",
};

export function nodeStyle(nodeType: NodeType | null): NodeStyle {
  return nodeType ? NODE_STYLES[nodeType] : UNKNOWN_NODE_STYLE;
}

/** legend order: backbone first, then the rest */
export const LEGEND: NodeStyle[] = [
  NODE_STYLES.REPEATER,
  NODE_STYLES.ROOM,
  NODE_STYLES.CHAT,
  NODE_STYLES.SENSOR,
  UNKNOWN_NODE_STYLE,
];
