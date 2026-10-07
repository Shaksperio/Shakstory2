import { sanitizeRichContent } from "./rich-text";

const nonWhitespace = (text: string) => text.replace(/\s/g, "");
export function textAsRichContent(text: string): string {
  const escape = (value: string) =>
    value.replace(
      /[&<>]/g,
      c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!
    );
  return text
    .split(/\n{2,}/)
    .map(p => `<p>${escape(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

/** Map a DOM selection's text prefix to the authoritative manuscript offsets. */
export function selectionTextOffset(
  text: string,
  prefix: string
): number | undefined {
  const wanted = nonWhitespace(prefix);
  if (!nonWhitespace(text).startsWith(wanted)) return undefined;
  if (!wanted.length) return 0;
  let count = 0;
  for (let offset = 0; offset < text.length; offset++) {
    if (!/\s/.test(text[offset]) && ++count === wanted.length)
      return offset + 1;
  }
  return undefined;
}

/** Range fragments retain balanced marks, lists, links and each image exactly once. */
export function splitRichContent(
  html: string,
  text: string,
  offset: number
): [string, string] | null {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(
    sanitizeRichContent(html),
    "text/html"
  );
  if (nonWhitespace(doc.body.textContent ?? "") !== nonWhitespace(text))
    return null;
  const target = nonWhitespace(text.slice(0, offset)).length;
  const walker = doc.createTreeWalker(doc.body, 4 /* SHOW_TEXT */);
  let count = 0;
  let boundary: { node: globalThis.Node; offset: number } | undefined;
  while (!boundary) {
    const node = walker.nextNode();
    if (!node) break;
    const value = node.textContent ?? "";
    for (let index = 0; index < value.length; index++) {
      if (/\s/.test(value[index])) continue;
      if (count === target) {
        boundary = { node, offset: index };
        break;
      }
      count++;
    }
  }
  if (!boundary) return null;
  const left = doc.createRange();
  left.setStart(doc.body, 0);
  left.setEnd(boundary.node, boundary.offset);
  const right = doc.createRange();
  right.setStart(boundary.node, boundary.offset);
  right.setEnd(doc.body, doc.body.childNodes.length);
  const serialize = (range: Range) => {
    const element = doc.createElement("div");
    element.appendChild(range.cloneContents());
    return sanitizeRichContent(element.innerHTML);
  };
  return [serialize(left), serialize(right)];
}
