import { describe, expect, it } from "vitest";
import { mutationOrigin } from "./request-origin";

const api = "https://api.example.com/api/axis/swarm/upload";
const frontend = "https://axis.example.com";
describe("hosted API mutation origins", () => {
  it("preserves the production browser origin used by wallet snapshot signatures", () => {
    expect(mutationOrigin(new Request(api, { headers: { origin: frontend } }), frontend + "/")).toBe(frontend);
  });
  it("retains same-origin and server-to-server requests", () => {
    expect(mutationOrigin(new Request(api), frontend)).toBe("https://api.example.com");
    expect(mutationOrigin(new Request(api, { headers: { origin: "https://api.example.com" } }), frontend)).toBe("https://api.example.com");
  });
  it.each(["https://axis.example.com.attacker.test", "http://axis.example.com", "https://preview.vercel.app", "null"])("rejects an untrusted browser origin: %s", origin => {
    expect(mutationOrigin(new Request(api, { headers: { origin, "x-forwarded-host": "axis.example.com", "x-forwarded-proto": "https" } }), frontend)).toBeNull();
  });
  it.each(["", "*", "https://axis.example.com/path", "https://user:password@axis.example.com", "https://axis.example.com?query=1"])("fails closed for invalid frontend configuration: %s", allowed => {
    expect(mutationOrigin(new Request(api, { headers: { origin: frontend } }), allowed)).toBeNull();
  });
});
