import { afterEach, describe, expect, it, vi } from "vitest";
import { signSession, verifySession } from "./auth";

const payload = { email:"supervisor@extract.demo", name:"Raúl Supervisor", role:"operations_supervisor" as const, tenantId:"extract" as const };

describe("sesión demo firmada", () => {
  afterEach(()=>vi.unstubAllEnvs());
  it("acepta una sesión válida", () => {
    vi.stubEnv("DEMO_MODE","true");
    expect(verifySession(signSession(payload))).toMatchObject(payload);
  });
  it("rechaza sesiones demo en modo privado o no configurado",()=>{
    vi.stubEnv("DEMO_MODE","false");expect(verifySession(signSession(payload))).toBeNull();
  });

  it("rechaza firmas alteradas y estructuras inválidas", () => {
    const token=signSession(payload);
    expect(verifySession(`${token}x`)).toBeNull();
    expect(verifySession("no-es-un-token")).toBeNull();
    expect(verifySession()).toBeNull();
  });
});
