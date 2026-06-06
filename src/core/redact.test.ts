import { describe, it, expect } from "vitest";
import { redactSecrets } from "./redact.js";

describe("redactSecrets", () => {
  it("leaves ordinary prose untouched and reports zero redactions", () => {
    const { text, redactions } = redactSecrets("remember the alamo battle plan");
    expect(text).toBe("remember the alamo battle plan");
    expect(redactions).toBe(0);
  });

  it("redacts an OpenAI-style sk- key", () => {
    const { text, redactions } = redactSecrets("key is sk-abcdEFGH1234abcdEFGH5678abcdEFGH90 ok");
    expect(text).not.toContain("sk-abcdEFGH1234abcdEFGH5678abcdEFGH90");
    expect(text).toContain("[REDACTED]");
    expect(redactions).toBeGreaterThan(0);
  });

  it("redacts an AWS access key id", () => {
    const { text } = redactSecrets("creds AKIAIOSFODNN7EXAMPLE here");
    expect(text).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(text).toContain("[REDACTED]");
  });

  it("redacts a GitHub personal access token", () => {
    const { text } = redactSecrets("token ghp_1234567890abcdefABCDEF1234567890abcd done");
    expect(text).not.toContain("ghp_1234567890abcdefABCDEF1234567890abcd");
  });

  it("redacts a Bearer authorization token", () => {
    const { text } = redactSecrets("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(text).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
  });

  it("redacts a private key block", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIabc123\n-----END RSA PRIVATE KEY-----";
    const { text } = redactSecrets(`here it is ${pem} end`);
    expect(text).not.toContain("MIIabc123");
    expect(text).toContain("[REDACTED]");
  });
});
