import { createServer, type IncomingMessage } from "node:http";

import { verifyBackendAccessToken } from "@realtimebuddy/shared/backend-auth";
import { BACKEND_TOKEN_QUERY_PARAM } from "@realtimebuddy/shared/backend-connection";
import { WebSocketServer } from "ws";

import { MeetingBroker } from "./meeting-broker";
import { readPersistentConfig, writePersistentConfig } from "./persistent-config";

const hostname = process.env.HOST ?? process.env.HOSTNAME ?? "0.0.0.0";
const port = Number(process.env.PORT ?? "3001");
const expectedAuthToken = process.env.BACKEND_AUTH_TOKEN?.trim();

if (!expectedAuthToken) {
  throw new Error("BACKEND_AUTH_TOKEN is required before starting the standalone backend.");
}

const broker = new MeetingBroker();
const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");

    if (requestUrl.pathname === "/health" && request.method === "GET") {
      response.writeHead(200, {
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          ok: true,
          authEnabled: Boolean(expectedAuthToken),
        })
      );
      return;
    }

    if (requestUrl.pathname === "/config") {
      const token = requestUrl.searchParams.get(BACKEND_TOKEN_QUERY_PARAM) ?? undefined;
      if (!verifyBackendAccessToken(token, expectedAuthToken)) {
        response.writeHead(401, {
          "content-type": "application/json",
        });
        response.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      if (request.method === "GET") {
        const config = await readPersistentConfig();
        response.writeHead(200, {
          "cache-control": "no-store",
          "content-type": "application/json",
        });
        response.end(JSON.stringify(config));
        return;
      }

      if (request.method === "PUT") {
        const body = await readJsonBody(request);
        const config = await writePersistentConfig({
          staticUserSeed:
            typeof body.staticUserSeed === "string" ? body.staticUserSeed : undefined,
        });

        response.writeHead(200, {
          "cache-control": "no-store",
          "content-type": "application/json",
        });
        response.end(JSON.stringify(config));
        return;
      }

      response.writeHead(405, {
        "content-type": "application/json",
      });
      response.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    response.writeHead(404, {
      "content-type": "application/json",
    });
    response.end(JSON.stringify({ error: "Not found" }));
  } catch (error) {
    response.writeHead(500, {
      "content-type": "application/json",
    });
    response.end(
      JSON.stringify({
        error: String(error),
      })
    );
  }
});

const wsServer = new WebSocketServer({
  noServer: true,
});

server.on("upgrade", (request, socket, head) => {
  if (!(request.url ?? "").startsWith("/ws")) {
    socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  const token = new URL(request.url ?? "/", "http://localhost").searchParams.get(BACKEND_TOKEN_QUERY_PARAM) ?? undefined;
  if (!verifyBackendAccessToken(token, expectedAuthToken)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  wsServer.handleUpgrade(request, socket, head, (client) => {
    broker.attach(client);
  });
});

server.listen(port, hostname, () => {
  console.log(`RealtimeBuddy backend listening on http://${hostname}:${port}`);
});

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return {} as { staticUserSeed?: unknown };
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
    staticUserSeed?: unknown;
  };
}
