import { NextRequest, NextResponse } from "next/server";

import { saveBuddyConfig } from "@/lib/backend-config-server";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      staticUserSeed?: unknown;
    };

    const config = await saveBuddyConfig({
      staticUserSeed:
        typeof body.staticUserSeed === "string" ? body.staticUserSeed : undefined,
    });

    return NextResponse.json(config, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: String(error),
      },
      {
        status: 500,
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  }
}
