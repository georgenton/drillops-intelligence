import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSameOrigin } from "./private-auth";
describe("runtime canonical origin",()=>{
 afterEach(()=>vi.unstubAllEnvs());
 it("uses runtime origin behind reverse proxy, not frozen public build URL",()=>{
  vi.stubEnv("APP_ORIGIN","https://staging.example.invalid");vi.stubEnv("NEXT_PUBLIC_APP_URL","https://legacy.example.invalid");
  expect(()=>assertSameOrigin(new Request("http://internal:3000/api",{headers:{origin:"https://staging.example.invalid"}}))).not.toThrow();
  expect(()=>assertSameOrigin(new Request("http://internal:3000/api",{headers:{origin:"https://legacy.example.invalid"}}))).toThrow("ORIGIN_DENIED");
 });
 it("rejects absent and hostile origins",()=>{
  vi.stubEnv("APP_ORIGIN","https://staging.example.invalid");
  expect(()=>assertSameOrigin(new Request("http://internal/api"))).toThrow();
  expect(()=>assertSameOrigin(new Request("http://internal/api",{headers:{origin:"https://attacker.invalid"}}))).toThrow();
 });
});
