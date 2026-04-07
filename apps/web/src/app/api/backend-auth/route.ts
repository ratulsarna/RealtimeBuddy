import { NextResponse } from "next/server";

import { createBackendAccessToken } from "@realtimebuddy/shared/backend-auth";

export const dynamic = "force-dynamic";

export async function GET() {
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
