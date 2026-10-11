import React from "react";

/** Markdown mínimo e seguro (sem HTML bruto): títulos, listas, negrito, itálico e código. */
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

export function InlineMarkdown({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let index = 0;
  const pattern = new RegExp(INLINE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index;
    if (start > last) nodes.push(text.slice(last, start));
    const token = match[0];
    const key = `m${index++}`;
    if (token.startsWith("**") || token.startsWith("__")) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) nodes.push(<code key={key} className="rounded bg-secondary px-1">{token.slice(1, -1)}</code>);
    else nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = start + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

type Block =
  | { type: "p"; lines: string[] }
  | { type: "h"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "hr" };

const parse = (source: string): Block[] => {
  const blocks: Block[] = [];
  let current = null as Block | null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };
  for (const raw of source.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    if (heading) { flush(); blocks.push({ type: "h", text: heading[1] }); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); blocks.push({ type: "hr" }); continue; }
    const bullet = /^\s*[*\-•]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!current || current.type !== "ul") { flush(); current = { type: "ul", items: [] }; }
      current.items.push(bullet[1]);
      continue;
    }
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      if (!current || current.type !== "ol") { flush(); current = { type: "ol", items: [] }; }
      current.items.push(numbered[1]);
      continue;
    }
    if (!current || current.type !== "p") { flush(); current = { type: "p", lines: [] }; }
    current.lines.push(line.trim());
  }
  flush();
  return blocks;
};

export function MarkdownText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`md-text ${className}`}>
      {parse(text).map((block, index) => {
        if (block.type === "h") return <p key={index} className="md-heading"><InlineMarkdown text={block.text} /></p>;
        if (block.type === "hr") return <hr key={index} />;
        if (block.type === "ul") return <ul key={index}>{block.items.map((item, i) => <li key={i}><InlineMarkdown text={item} /></li>)}</ul>;
        if (block.type === "ol") return <ol key={index}>{block.items.map((item, i) => <li key={i}><InlineMarkdown text={item} /></li>)}</ol>;
        if (block.type !== "p") return null;
        return <p key={index}>{block.lines.map((line: string, i: number) => <React.Fragment key={i}>{i > 0 && <br />}<InlineMarkdown text={line} /></React.Fragment>)}</p>;
      })}
    </div>
  );
}
