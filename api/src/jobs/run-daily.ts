import { prisma } from "../infra/prisma.js";
import { runDailyBusinessAutomation } from "./daily-business-automation.js";
import { runPrivacyRetention } from "./privacy-retention.js";

try {
  const results = [];
  for (const [name, execute] of [
    ["business", runDailyBusinessAutomation],
    ["privacy-retention", runPrivacyRetention],
  ] as const) {
    try {
      const result = await execute();
      results.push({ name, ok: true, duplicate: result.duplicate, counters: "counters" in result ? result.counters : undefined });
    } catch (error) {
      results.push({ name, ok: false, error: error instanceof Error ? error.message : "ERRO_DESCONHECIDO" });
      process.exitCode = 1;
    }
  }
  console.log(JSON.stringify({ ok: results.every((result) => result.ok), results }));
} finally {
  await prisma.$disconnect();
}
