import { describe, expect, it } from "vitest";
import { scanAndSanitizeText, isEducationalMemorySafe } from "../../backend/src/services/safety/safetyFilter";

describe("safetyFilter", () => {
  it("keeps normal language learning sentences untouched", () => {
    const res = scanAndSanitizeText("I went to college yesterday with my friend.");
    expect(res.containsSensitiveData).toBe(false);
    expect(res.sanitizedText).toBe("I went to college yesterday with my friend.");
  });

  it("redacts API keys, passwords, PAN, and Aadhaar numbers", () => {
    const res = scanAndSanitizeText(
      "My password is secret123 and keys are AIzaSyDummyKeyValue1234567890123 AQ.DummyKeyValue1234567890123456 vach_DummyTestKeyValue1234567890 and PAN ABCDE1234F",
    );
    expect(res.containsSensitiveData).toBe(true);
    expect(res.sanitizedText).not.toContain("secret123");
    expect(res.sanitizedText).not.toContain("AIzaSyDummyKeyValue1234567890123");
    expect(res.sanitizedText).not.toContain("AQ.DummyKeyValue1234567890123456");
    expect(res.sanitizedText).not.toContain("vach_DummyTestKeyValue1234567890");
    expect(res.sanitizedText).not.toContain("ABCDE1234F");
    expect(isEducationalMemorySafe("My PAN is ABCDE1234F")).toBe(false);
  });
});

