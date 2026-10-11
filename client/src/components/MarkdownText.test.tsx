// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MarkdownText } from "./MarkdownText";
afterEach(cleanup);
it("renders bold, bullets and numbered titles without showing markers", () => {
  const { container } = render(<MarkdownText text={"**1. Fatos canônicos**\n\n* Primeiro fato\n* Segundo *fato*\n\n## Ordem\n1. Passo"} />);
  expect(container.textContent).not.toContain("**");
  expect(container.textContent).not.toContain("* ");
  expect(container.querySelectorAll("li").length).toBe(3);
  expect(container.querySelector("strong")?.textContent).toBe("1. Fatos canônicos");
  expect(container.querySelector("em")?.textContent).toBe("fato");
});
it("never injects raw HTML", () => {
  const { container } = render(<MarkdownText text={"<img src=x onerror=alert(1)> **ok**"} />);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("strong")?.textContent).toBe("ok");
});
