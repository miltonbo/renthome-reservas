import { describe, expect, it } from "vitest";
import { isStagingHost } from "./seo-host";

describe("isStagingHost", () => {
  it("treats custom domains as production", () => {
    expect(isStagingHost("reservas.example.com")).toBe(false);
    expect(isStagingHost("www.example.com")).toBe(false);
  });

  it("ignores port suffix on production hosts", () => {
    expect(isStagingHost("reservas.example.com:443")).toBe(false);
    expect(isStagingHost("www.example.com:80")).toBe(false);
  });

  it("blocks staging and preview hosts", () => {
    expect(isStagingHost("staging.example.com")).toBe(true);
    expect(isStagingHost("dev.example.com")).toBe(true);
    expect(isStagingHost("renthome.vercel.app")).toBe(true);
    expect(isStagingHost("renthome.ondigitalocean.app")).toBe(true);
  });

  it("blocks local development", () => {
    expect(isStagingHost("localhost")).toBe(true);
    expect(isStagingHost("localhost:3000")).toBe(true);
    expect(isStagingHost("127.0.0.1")).toBe(true);
    expect(isStagingHost("127.0.0.1:3000")).toBe(true);
  });

  it("normalizes case", () => {
    expect(isStagingHost("STAGING.EXAMPLE.COM")).toBe(true);
    expect(isStagingHost("RESERVAS.EXAMPLE.COM")).toBe(false);
  });

  it("returns false for a missing host", () => {
    expect(isStagingHost(null)).toBe(false);
    expect(isStagingHost(undefined)).toBe(false);
    expect(isStagingHost("")).toBe(false);
  });
});
