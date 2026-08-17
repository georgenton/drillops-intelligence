import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { isBillingTabEnabled } from "@/lib/feature-flags";
import { AppShell } from "@/components/app-shell";
import { canAccessSection, defaultSection, isAppSection, tenantPlan } from "@/lib/access-control";

export default async function SectionPage({ params }: { params: Promise<{section:string}> }) {
  const {section} = await params;
  const jar = await cookies();
  const session = verifySession(jar.get("drillops_session")?.value);
  if (!session) redirect("/login");
  const billingEnabled = isBillingTabEnabled();
  const plan = tenantPlan(session.tenantId);
  if (!isAppSection(section) || !canAccessSection({ role: session.role, plan, section, billingEnabled })) redirect(`/${defaultSection(session.role, plan)}`);
  return <AppShell section={section} session={session} billingEnabled={billingEnabled}/>;
}
