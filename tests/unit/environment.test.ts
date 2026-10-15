import { describe, expect, it } from "vitest";
import { parseServerEnvironment } from "@/config/env";

const local = {
  APP_ENV: "development",
  APP_ORIGIN: "http://localhost:3000",
  MONGODB_URI: "mongodb://localhost:27017",
  MONGODB_DB: "saraswathi_puja_test",
};

describe("database environment isolation", () => {
  it("allows local development against the dedicated test database", () => {
    expect(parseServerEnvironment(local).MONGODB_DB).toBe("saraswathi_puja_test");
  });

  it("rejects the production database during development", () => {
    expect(() =>
      parseServerEnvironment({ ...local, MONGODB_DB: "saraswathi_puja" }),
    ).toThrow();
  });

  it("rejects an unrelated project database", () => {
    expect(() =>
      parseServerEnvironment({ ...local, MONGODB_DB: "make_my_marriage" }),
    ).toThrow();
  });

  it("rejects production credentials selected for a Vercel preview", () => {
    expect(() =>
      parseServerEnvironment({
        ...local,
        APP_ENV: "production",
        APP_ORIGIN: "https://puja.example.com",
        MONGODB_DB: "saraswathi_puja",
        VERCEL_ENV: "preview",
      }),
    ).toThrow();
  });

  it("requires HTTPS for production", () => {
    expect(() =>
      parseServerEnvironment({
        ...local,
        APP_ENV: "production",
        MONGODB_DB: "saraswathi_puja",
      }),
    ).toThrow();
  });

  it("rejects an invalid origin without exposing its value", () => {
    const privateOrigin = "invalid origin containing private details";
    expect(() => parseServerEnvironment({ ...local, APP_ORIGIN: privateOrigin })).toThrow(
      "Configure valid server environment fields: APP_ORIGIN.",
    );
  });

  it("accepts an isolated production environment", () => {
    expect(
      parseServerEnvironment({
        ...local,
        APP_ENV: "production",
        APP_ORIGIN: "https://puja.example.com",
        MONGODB_DB: "saraswathi_puja",
        VERCEL_ENV: "production",
      }).APP_ENV,
    ).toBe("production");
  });

  it("keeps rejected credentials out of validation errors", () => {
    const secret = "not-a-connection-with-private-password";
    try {
      parseServerEnvironment({ ...local, MONGODB_URI: secret });
      expect.fail("Expected invalid credentials to be rejected");
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(String(error)).toContain("MONGODB_URI");
    }
  });
});
