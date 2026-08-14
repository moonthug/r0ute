import { PUSH_CHANNELS } from "@r0ute/database";
import { pushEventStream } from "../../../../lib/push-stream";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return pushEventStream(request, PUSH_CHANNELS.adverts, "advert");
}
