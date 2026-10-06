const allowedUrl = (value: string) => /^(https?:|mailto:|\/|#)/i.test(value.trim());

export function sanitizeRichContent(html: string): string {
  return html
    .replace(/<\/?(?:script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/?(?:script|style|iframe|object|embed)>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(?:href|src)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, match => {
      const separator = match.indexOf("=");
      const attribute = match.slice(0, separator);
      const rawValue = match.slice(separator + 1).trim();
      const quote = rawValue[0] === "\"" || rawValue[0] === "'" ? rawValue[0] : "";
      const value = quote ? rawValue.slice(1, -1) : rawValue;
      return allowedUrl(value) ? match : `${attribute}="#"`;
    })
    .replace(/javascript:/gi, "");
}
