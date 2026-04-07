import { createServer } from "node:http";

import { verifyBackendAccessToken } from "@realtimebuddy/shared/backend-auth";
import { BACKEND_TOKEN_QUERY_PARAM } from "@realtimebuddy/shared/backend-connection";
import { WebSocketServer } from "ws";

import { MeetingBroker } from "./meeting-broker";

const hostname = process.env.HOST ?? process.env.HOSTNAME ?? "0.0.0.0";
const port = Number(process.env.PORT ?? "3001");
const expectedAuthToken = process.env.BACKEND_AUTH_TOKEN?.trim();

if (!expectedAuthToken) {
  throw new Error("BACKEND_AUTH_TOKEN is required before starting the standalone backend.");
}

const broker = new MeetingBroker();
const server = createServer((request, response) => {
  if (request.url === "/health") {
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

  response.writeHead(404, {
    "content-type": "application/json",
  });
  response.end(JSON.stringify({ error: "Not found" }));
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
