export type Channel = {
  id: number,
  name: string,
  secret: Buffer
}

export type LogRxData = {
  lastSnr: number,
  lastRssi: number,
  raw: Buffer
}

export enum PacketType {
  Advert = "ADVERT",
  GroupText = "GRP_TXT"
}

export type AdvertPayload = {
  public_key: Uint8Array,
  timestamp: number,
  app_data: {
    type: string | null,
    lat: number | null,
    lon: number | null,
    name: string | null,
  }
}
