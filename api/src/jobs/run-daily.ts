import { prisma } from "../infra/prisma.js";
import { runDailyBusinessAutomation } from "./daily-business-automation.js";

try {
  const result = await runDailyBusinessAutomation();
  console.log(JSON.stringify({ ok: true, duplicate: result.duplicate, counters: "counters" in result ? result.counters : undefined }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "ERRO_DESCONHECIDO" }));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
