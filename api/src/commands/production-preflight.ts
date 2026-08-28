import { prisma } from "../infra/prisma.js";
import { getProductionReadiness } from "../services/production-readiness.js";

try {
  const report = await getProductionReadiness();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ ready: false, error: error instanceof Error ? error.message : "ERRO_DESCONHECIDO" }));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
