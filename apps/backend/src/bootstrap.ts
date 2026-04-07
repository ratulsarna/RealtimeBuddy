import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

const bootstrapDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(bootstrapDir, "..");

config({ path: path.join(appDir, ".env") });
config({ path: path.join(appDir, ".env.local"), override: true });

await import("./server");
