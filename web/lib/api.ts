import { fallbackPlans, type CommercialPlan } from "./content";

export const apiUrl = () => process.env.NEXUS_API_URL?.replace(/\/$/, "") ?? "";

export async function getPlans(): Promise<CommercialPlan[]> {
  const base = apiUrl();
  if (!base) return fallbackPlans;
  try {
    const response = await fetch(`${base}/api/v1/planos`, { next: { revalidate: 1800 } });
    if (!response.ok) return fallbackPlans;
    const plans = (await response.json()) as Array<{
      code: string;
      name: string;
      description: string;
      monthlyPrice: string | number;
      yearlyPrice: string | number;
      setupPrice: string | number;
      successFeeRate: string | number;
      hasFineTuning: boolean;
      features: unknown;
    }>;
    return plans.map((plan, index) => ({
      code: plan.code,
      name: plan.name,
      description: plan.description,
      monthlyPrice: Number(plan.monthlyPrice),
      yearlyPrice: Number(plan.yearlyPrice),
      setupPrice: Number(plan.setupPrice),
      successFeeRate: Number(plan.successFeeRate),
      hasFineTuning: plan.hasFineTuning,
      features: Array.isArray(plan.features) ? plan.features.map(String) : [],
      featured: plan.code === "FISCAL_INTELIGENTE" || index === 2,
    }));
  } catch {
    return fallbackPlans;
  }
}
