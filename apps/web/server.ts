import { createServer } from "node:http";
import path from "node:path";
import { parse } from "node:url";
import { fileURLToPath } from "node:url";

import next from "next";
import { WebSocketServer } from "ws";

import { MeetingBroker } from "./src/server/meeting-broker";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = Number(process.env.PORT ?? "3000");
const projectDir = path.dirname(fileURLToPath(import.meta.url));

const app = next({
  dev,
  dir: projectDir,
  hostname,
  port,
  webpack: dev,
});

const broker = new MeetingBroker();
const handle = app.getRequestHandler();

void app.prepare().then(() => {
  const upgradeHandler = app.getUpgradeHandler();
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    void handle(req, res, parsedUrl);
  });

  const wsServer = new WebSocketServer({
    noServer: true,
  });

  server.on("upgrade", (request, socket, head) => {
    if ((request.url ?? "").startsWith("/ws")) {
      wsServer.handleUpgrade(request, socket, head, (client) => {
        broker.attach(client);
      });
      return;
    }

    void upgradeHandler(request, socket, head);
  });

  server.listen(port, hostname, () => {
    console.log(`RealtimeBuddy listening on http://${hostname}:${port}`);
  });
});
