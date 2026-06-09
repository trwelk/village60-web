import { getDb } from "@/db/client";
import { homesErrorResponse } from "@/lib/homes/http";
import { readPublicResidentPortraitBytes } from "@/lib/residentPublicProfile/service";
type RouteParams = {
  params: Promise<{ token: string }>;
};

export async function GET(_req: Request, { params }: RouteParams) {
  const { token } = await params;
  try {
    const { buffer, contentType } = readPublicResidentPortraitBytes(
      getDb(),
      token,
    );
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}
