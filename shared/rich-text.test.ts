import { describe, expect, it } from "vitest";
import { sanitizeRichContent } from "./rich-text";

describe("rich text sanitization", () => {
  it("preserves editorial marks, links and images through a round trip", () => {
    const html = '<p><strong>Coragem</strong> <em>serena</em> <a href="https://example.com">link</a><img src="/cover.png" alt="Capa"></p>';
    const reopened = sanitizeRichContent(JSON.parse(JSON.stringify(html)));
    expect(reopened).toContain("<strong>Coragem</strong>");
    expect(reopened).toContain("<em>serena</em>");
    expect(reopened).toContain('href="https://example.com"');
    expect(reopened).toContain('src="/cover.png"');
  });

  it("removes executable tags, event handlers and javascript URLs", () => {
    const sanitized = sanitizeRichContent('<p onclick="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">x</a></p>');
    expect(sanitized).not.toContain("script");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("javascript:");
  });
});
