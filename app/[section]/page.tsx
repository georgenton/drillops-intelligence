import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function SectionPage({ params }: { params: Promise<{section:string}> }) {
  const {section} = await params;
  const jar = await cookies();
  const session = verifySession(jar.get("drillops_session")?.value);
  if (!session) redirect("/login");
  return <AppShell section={section} session={session}/>;
}
