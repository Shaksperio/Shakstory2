import { describe, expect, it } from "vitest";
import { parseJsonResponseBody } from "./llm";

describe("LLM response parsing", () => {
  it("parses valid JSON bodies", () => {
    expect(parseJsonResponseBody<{ ok: boolean }>("{\"ok\":true}", "application/json", "Gateway")).toEqual({ ok: true });
  });

  it("reports HTML bodies without leaking the native JSON parser error", () => {
    expect(() => parseJsonResponseBody("<!DOCTYPE html><html>login</html>", "text/html", "Gateway LLM")).toThrow("Gateway LLM retornou HTML em vez de JSON");
  });

  it("reports malformed non-HTML bodies clearly", () => {
    expect(() => parseJsonResponseBody("not-json", "text/plain", "Gateway LLM")).toThrow("Gateway LLM retornou um corpo que não é JSON válido");
  });
});
