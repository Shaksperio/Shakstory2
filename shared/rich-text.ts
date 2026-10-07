const tags = new Set([
  "p",
  "div",
  "span",
  "br",
  "img",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "ins",
  "a",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "sup",
  "sub",
  "hr",
]);
const escapeAttribute = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const decodeAttribute = (value: string) =>
  value
    .replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi, (_, hex, num) => {
      const code = parseInt(hex ?? num, hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(
      /&(?:amp|quot|apos|lt|gt|colon|Tab|NewLine);/g,
      entity =>
        ({
          "&amp;": "&",
          "&quot;": '"',
          "&apos;": "'",
          "&lt;": "<",
          "&gt;": ">",
          "&colon;": ":",
          "&Tab;": "\t",
          "&NewLine;": "\n",
        })[entity] ?? entity
    );
export function sanitizeRichContent(html: string): string {
  const clean = html
    .replace(
      /<(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      ""
    )
    .replace(/<!--[\s\S]*?-->/g, "");
  return clean.replace(
    /<\/?([a-z][a-z0-9-]*)\b([^>]*)>/gi,
    (tag, name, attributes) => {
      name = name.toLowerCase();
      if (!tags.has(name)) return "";
      if (tag.startsWith("</"))
        return ["br", "img", "hr"].includes(name) ? "" : `</${name}>`;
      const safe: string[] = [];
      const pattern = /([a-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
      let match;
      while ((match = pattern.exec(attributes))) {
        const key = match[1].toLowerCase();
        let value = decodeAttribute(match[2] ?? match[3] ?? match[4]);
        if (
          (key === "src" && name === "img") ||
          (key === "href" && name === "a")
        ) {
          value = value.replace(/[\u0000-\u0020\u007f]/g, "");
          if (
            !/^(https?:|mailto:|\/|#)/i.test(value) &&
            !(
              key === "src" &&
              /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(
                value
              )
            )
          )
            value = "#";
          safe.push(`${key}="${escapeAttribute(value)}"`);
        } else if (["alt", "title"].includes(key))
          safe.push(`${key}="${escapeAttribute(value)}"`);
        else if (key === "style") {
          const style = value
            .split(";")
            .filter(
              rule =>
                /^\s*(text-align|font-weight|font-style|text-decoration|color|background-color|font-size|line-height|white-space)\s*:\s*[a-z0-9#.,% ()-]+$/i.test(
                  rule
                ) && !/(url|expression|import)/i.test(rule)
            )
            .join(";");
          if (style) safe.push(`style="${escapeAttribute(style)}"`);
        }
      }
      return `<${name}${safe.length ? " " + safe.join(" ") : ""}${["br", "img", "hr"].includes(name) ? " /" : ""}>`;
    }
  );
}
