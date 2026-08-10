import "@liamcottle/meshcore.js";

declare module "@liamcottle/meshcore.js" {
  type RouteTypeString =
    | "TRANSPORT_FLOOD"
    | "FLOOD"
    | "DIRECT"
    | "TRANSPORT_DIRECT";

  type PayloadTypeString =
    | "REQ"
    | "RESPONSE"
    | "TXT_MSG"
    | "ACK"
    | "ADVERT"
    | "GRP_TXT"
    | "GRP_DATA"
    | "ANON_REQ"
    | "PATH"
    | "TRACE"
    | "RAW_CUSTOM";

  interface AdvertAppData {
    type: string | null;
    lat: number | null;
    lon: number | null;
    name: string | null;
    feat1: number | null;
    feat2: number | null;
  }

  interface ParsedAdvert {
    public_key: Uint8Array;
    timestamp: number;
    app_data: AdvertAppData;
  }

  interface ParsedSrcDest {
    src: number;
    dest: number;
  }

  interface ParsedReq extends ParsedSrcDest {
    encrypted: Uint8Array;
  }

  interface ParsedAck {
    ack_code: Uint8Array;
  }

  interface ParsedAnonReq {
    src: Uint8Array;
    dest: number;
  }

  type ParsedPayload =
    | ParsedAdvert
    | ParsedSrcDest
    | ParsedReq
    | ParsedAck
    | ParsedAnonReq;

  interface Packet {
    header: number;
    pathLen: number;
    path: Uint8Array;
    payload: Uint8Array;
    transportCode1: number | null;
    transportCode2: number | null;

    route_type: number;
    route_type_string: RouteTypeString | null;
    payload_type: number;
    payload_type_string: PayloadTypeString | null;
    payload_version: number;
    is_marked_do_not_retransmit: boolean;

    getPathHashSize(): number;
    getPathHashCount(): number;
    getPathHashes(): Uint8Array[];
    getRouteType(): number;
    getRouteTypeString(): RouteTypeString | null;
    isRouteFlood(): boolean;
    isRouteDirect(): boolean;
    getPayloadType(): number;
    getPayloadTypeString(): PayloadTypeString | null;
    getPayloadVer(): number;
    markDoNotRetransmit(): void;
    isMarkedDoNotRetransmit(): boolean;

    /** Dispatches on payload type; returns null for types without a parser (e.g. GRP_TXT). */
    parsePayload(): ParsedPayload | null;
    parsePayloadTypeAdvert(): ParsedAdvert;
  }

  namespace Packet {
    function fromBytes(bytes: Uint8Array): Packet;
    function extractPathHashSize(pathLen: number): number;
    function extractPathHashCount(pathLen: number): number;

    const ROUTE_TYPE_TRANSPORT_FLOOD: number;
    const ROUTE_TYPE_FLOOD: number;
    const ROUTE_TYPE_DIRECT: number;
    const ROUTE_TYPE_TRANSPORT_DIRECT: number;

    const PAYLOAD_TYPE_REQ: number;
    const PAYLOAD_TYPE_RESPONSE: number;
    const PAYLOAD_TYPE_TXT_MSG: number;
    const PAYLOAD_TYPE_ACK: number;
    const PAYLOAD_TYPE_ADVERT: number;
    const PAYLOAD_TYPE_GRP_TXT: number;
    const PAYLOAD_TYPE_GRP_DATA: number;
    const PAYLOAD_TYPE_ANON_REQ: number;
    const PAYLOAD_TYPE_PATH: number;
    const PAYLOAD_TYPE_TRACE: number;
    const PAYLOAD_TYPE_RAW_CUSTOM: number;
  }
}
