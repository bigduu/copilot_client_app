import { beforeEach, describe, expect, it } from "vitest";
import {
  buildBackendUrl,
  clearBackendBaseUrlOverride,
  getBackendBaseUrl,
  getDefaultBackendBaseUrl,
  hasBackendBaseUrlOverride,
  normalizeBackendBaseUrl,
  setBackendBaseUrl,
} from "../backendBaseUrl";

describe("backendBaseUrl", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizes by trimming and removing trailing slashes", () => {
    expect(normalizeBackendBaseUrl(" http://localhost:8080/v1/ ")).toBe(
      "http://localhost:8080/v1",
    );
  });

  it("uses fallback default when no env and no override exists", () => {
    clearBackendBaseUrlOverride();
    expect(getDefaultBackendBaseUrl()).toBe("http://127.0.0.1:8080/v1");
    expect(getBackendBaseUrl()).toBe("http://127.0.0.1:8080/v1");
  });

  it("uses env default when set (and normalizes it)", () => {
    const processRef = (globalThis as any).process ?? { env: {} };
    const original = processRef.env.VITE_BACKEND_BASE_URL;
    processRef.env.VITE_BACKEND_BASE_URL = "http://example.com/v1/";
    (globalThis as any).process = processRef;

    try {
      expect(getDefaultBackendBaseUrl()).toBe("http://example.com/v1");
    } finally {
      processRef.env.VITE_BACKEND_BASE_URL = original;
    }
  });

  it("persists an override and uses it in preference to defaults", () => {
    expect(hasBackendBaseUrlOverride()).toBe(false);

    setBackendBaseUrl("http://localhost:8080/v1/");
    expect(hasBackendBaseUrlOverride()).toBe(true);
    expect(getBackendBaseUrl()).toBe("http://localhost:8080/v1");

    clearBackendBaseUrlOverride();
    expect(hasBackendBaseUrlOverride()).toBe(false);
  });

  it("builds backend URLs with a single slash separator", () => {
    setBackendBaseUrl("http://localhost:8080/v1/");
    expect(buildBackendUrl("/models")).toBe("http://localhost:8080/v1/models");
    expect(buildBackendUrl("workspace/validate")).toBe(
      "http://localhost:8080/v1/workspace/validate",
    );
  });
});
