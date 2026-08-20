import { startServer } from "../backend/server.mjs";

const discoveryPort = Number.parseInt(process.env.SCA_TEST_DISCOVERY_PORT || "35556", 10);
const logger = label => ({
  log: (...values) => console.log(`[${label}]`, ...values),
  info: (...values) => console.log(`[${label}]`, ...values),
  warn: (...values) => console.warn(`[${label}]`, ...values),
  error: (...values) => console.error(`[${label}]`, ...values)
});

const serverA = await startServer({ host: "0.0.0.0", port: 25555, discoveryPort, logger: logger("A") });
const serverB = await startServer({ host: "0.0.0.0", port: 25557, discoveryPort, logger: logger("B") });

console.log(`DUAL_LAN_READY A=${serverA.url} B=${serverB.url} UDP=${discoveryPort}`);

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await Promise.allSettled([serverA.close(), serverB.close()]);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await close();
    process.exit(0);
  });
}
