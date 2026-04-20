import { type NextRequest, NextResponse } from "next/server";

import { createBackendAccessToken } from "@realtimebuddy/shared/backend-auth";
import { isBackendAuthHostAllowed } from "@/lib/backend-auth-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.BACKEND_AUTH_TOKEN?.trim();
  if (!secret) {
    return NextResponse.json(
      {
        message: "BACKEND_AUTH_TOKEN is not configured for the web app.",
      },
      {
        status: 503,
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  }

  if (!isBackendAuthHostAllowed(request.headers.get("host"))) {
    return NextResponse.json(
      {
        message:
          "Backend token issuance is only available from localhost or Tailscale hosts.",
      },
      {
        status: 403,
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  }

  return NextResponse.json(
    {
      token: createBackendAccessToken(secret),
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}
