import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "./auth";

const payload = { email:"supervisor@extract.demo", name:"Raúl Supervisor", role:"operations_supervisor" as const, tenantId:"extract" as const };

describe("sesión demo firmada", () => {
  it("acepta una sesión válida", () => {
    expect(verifySession(signSession(payload))).toMatchObject(payload);
  });

  it("rechaza firmas alteradas y estructuras inválidas", () => {
    const token=signSession(payload);
    expect(verifySession(`${token}x`)).toBeNull();
    expect(verifySession("no-es-un-token")).toBeNull();
    expect(verifySession()).toBeNull();
  });
});
