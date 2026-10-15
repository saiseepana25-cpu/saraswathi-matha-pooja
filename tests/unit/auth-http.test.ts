import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/server/env", () => ({
  getServerEnvironment: () => ({
    APP_ENV: "production",
    APP_ORIGIN: "https://puja.example",
  }),
}));
import {
  assertCsrf,
  assertOrigin,
  failure,
  loginBody,
  reply,
  setCookies,
} from "@/server/auth/http";

beforeEach(() => {
  vi.stubEnv("APP_ENV", "production");
});
describe("authentication HTTP boundary", () => {
  it("requires same-origin login and a matching CSRF header for logout", () => {
    expect(() =>
      assertOrigin(new NextRequest("https://puja.example", { method: "POST" })),
    ).toThrow();
    expect(() =>
      assertOrigin(
        new NextRequest("https://puja.example", {
          method: "POST",
          headers: { origin: "https://puja.example" },
        }),
      ),
    ).not.toThrow();
    const csrf = "a".repeat(64);
    const req = new NextRequest("https://puja.example", {
      headers: { cookie: "__Host-saraswathi_csrf=" + csrf, "x-csrf-token": csrf },
    });
    expect(() => assertCsrf(req)).not.toThrow();
    expect(() => assertCsrf(new NextRequest("https://puja.example"))).toThrow();
  });
  it("sets secure session cookies and prevents caching", () => {
    const response = reply({ user: null });
    setCookies(
      response,
      "a".repeat(64),
      "b".repeat(64),
      new Date(Date.now() + 10_800_000),
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.cookies.get("__Host-saraswathi_session")).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
    });
    expect(response.cookies.get("__Host-saraswathi_csrf")).toMatchObject({
      httpOnly: false,
      secure: true,
    });
  });
  it("bounds and validates JSON requests", async () => {
    const req = (body: string) =>
      new NextRequest("https://puja.example", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    expect(
      await loginBody(req(JSON.stringify({ username: "test", password: "Test@123" }))),
    ).toEqual({ username: "test", password: "Test@123" });
    await expect(loginBody(req("x".repeat(4097)))).rejects.toMatchObject({ status: 413 });
    await expect(
      loginBody(
        req(JSON.stringify({ username: "test", password: "Test@123", role: "admin" })),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("never returns raw driver errors to the browser", async () => {
    const response = failure(new Error("private credentials"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private credentials");
  });
});
