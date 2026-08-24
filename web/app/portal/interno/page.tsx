import { redirect } from "next/navigation";
import { defaultInternalArea, requireInternal } from "@/lib/portal";

export default async function InternalPage() {
  const session = await requireInternal();
  redirect(defaultInternalArea(session.profile.systemRole));
}
