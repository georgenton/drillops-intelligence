import { redirect } from "next/navigation";
import { canAccessSection, defaultSection, isAppSection } from "@/lib/access-control";
import { isCommerciallyClosed } from "@/lib/runtime-mode";
import { privateSession } from "@/lib/private-auth";
import { AppShell } from "@/components/app-shell";

export default async function SectionPage({ params }: { params: Promise<{section:string}> }) {
  const {section} = await params;
    if(isCommerciallyClosed()) return <main className="login-page"><h1>Producción preparada · acceso comercial cerrado</h1></main>;
    let privateUser;
    try{privateUser=await privateSession();}catch{return <main className="login-page"><div role="alert"><h1>Servicio temporalmente no disponible</h1><p>No se sustituyen registros por datos de demostración. Intenta nuevamente cuando se restablezca la base de datos.</p></div></main>;}
    if(!privateUser) redirect("/login");
    if(!isAppSection(section)||!canAccessSection({...privateUser,section,billingEnabled:false})) redirect(`/${defaultSection(privateUser.role,privateUser.plan)}`);
    return <AppShell section={section} session={privateUser}/>;
}
