// Cowila — camadas de verificação da arquitetura MCR (Consciente → Subconsciente → Cortex → Cerebelo),
// portadas do Cowila Python v10 (Cerebelo) e do mcr_mente.py (Cortex/decisão). Roda no navegador:
// sem servidor, sem rede e sem rede neural (no teste do mcr_mente a ativação MCR empatou com a ReLU;
// o ganho vinha do Cerebelo). Aritmética exata com BigInt; nada de eval.

type Frac = { n: bigint; d: bigint };
const pow10 = (e: number): bigint => { let r = BigInt(1); for (let i = 0; i < e; i++) r = r * BigInt(10); return r; };
const gcd = (a: bigint, b: bigint): bigint => { a = a < BigInt(0) ? -a : a; b = b < BigInt(0) ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; };
const mk = (n: bigint, d: bigint = BigInt(1)): Frac => { if (d < BigInt(0)) { n = -n; d = -d; } const g = gcd(n, d) || BigInt(1); return { n: n / g, d: d / g }; };
const add = (a: Frac, b: Frac) => mk(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Frac, b: Frac) => mk(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Frac, b: Frac) => mk(a.n * b.n, a.d * b.d);
const div = (a: Frac, b: Frac) => mk(a.n * b.d, a.d * b.n);

export type Parsed = { value: Frac; decimals: number } | "ambiguous" | null;
/** Número no formato brasileiro (1.234,50). "3.141" sem vírgula é ambíguo (milhar ou decimal?) e nunca é refutado. */
export function parseNumber(token: string): Parsed {
  let t = token.trim().replace(/\s/g, "").replace(/[−–]/g, "-");
  const neg = t.startsWith("-");
  if (neg) t = t.slice(1);
  if (!/^\d[\d.,]*$/.test(t)) return null;
  let intPart = t;
  let frac = "";
  if (t.indexOf(",") !== -1) {
    const parts = t.split(",");
    if (parts.length !== 2 || !/^\d+$/.test(parts[1])) return null;
    intPart = parts[0].replace(/\./g, "");
    frac = parts[1];
    if (!/^\d+$/.test(intPart) || (parts[0].indexOf(".") !== -1 && !/^\d{1,3}(\.\d{3})+$/.test(parts[0]))) return null;
  } else if (t.indexOf(".") !== -1) {
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
      if (t.split(".").length === 2) return "ambiguous";
      intPart = t.replace(/\./g, "");
    } else if (/^\d+\.\d+$/.test(t)) { [intPart, frac] = t.split("."); }
    else return null;
  }
  const digits = BigInt(intPart + frac);
  const d = pow10(frac.length);
  return { value: mk(neg ? -digits : digits, d), decimals: frac.length };
}

export function formatNumber(f: Frac, maxDecimals = 6): string {
  const scale = pow10(maxDecimals);
  let scaled = (f.n * scale * BigInt(2) + (f.n < BigInt(0) ? -f.d : f.d)) / (f.d * BigInt(2)); // arredonda ao mais próximo
  const neg = scaled < BigInt(0);
  if (neg) scaled = -scaled;
  const whole = scaled / scale;
  let rest = (scaled % scale).toString().padStart(maxDecimals, "0").replace(/0+$/, "");
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg && (whole !== BigInt(0) || rest) ? "-" : "") + w + (rest ? "," + rest : "");
}

const OPS: Record<string, (a: Frac, b: Frac) => Frac | null> = {
  "+": add, "-": sub, "*": mul, "×": mul, x: mul, X: mul,
  "/": (a, b) => (b.n === BigInt(0) ? null : div(a, b)), "÷": (a, b) => (b.n === BigInt(0) ? null : div(a, b)),
};
const NUM = String.raw`-?\d[\d.,]*\d|-?\d`;
const OP = String.raw`[+\-−*×xX÷/]`;

export type Finding = { status: "verified" | "refuted" | "unverifiable"; text: string; expected?: string; found?: string };

function same(expected: Frac, stated: Frac, decimals: number, isDivision: boolean): boolean {
  const diff = sub(expected, stated);
  if (!isDivision) return diff.n === BigInt(0);
  // divisão: o resultado informado está arredondado na própria precisão
  const half = mk(BigInt(1), BigInt(2) * pow10(decimals));
  const abs = mk(diff.n < BigInt(0) ? -diff.n : diff.n, diff.d);
  return sub(abs, half).n <= BigInt(0);
}

/** Procura contas "a op b = c" e "X% de Y é Z" na resposta e recalcula. */
export function checkArithmetic(answer: string): Finding[] {
  const out: Finding[] = [];
  const eq = new RegExp(`(${NUM})\\s*(${OP})\\s*(${NUM})\\s*(?:=|é igual a|é|resulta em|dá|fica)\\s*(${NUM})`, "g");
  let m: RegExpExecArray | null;
  while ((m = eq.exec(answer))) {
    const [whole, a, op, b, c] = m;
    const [pa, pb, pc] = [parseNumber(a), parseNumber(b), parseNumber(c)];
    if (!pa || !pb || !pc) continue;
    if (pa === "ambiguous" || pb === "ambiguous" || pc === "ambiguous") { out.push({ status: "unverifiable", text: whole }); continue; }
    const result = OPS[op]?.(pa.value, pb.value);
    if (!result) { out.push({ status: "unverifiable", text: whole }); continue; }
    const ok = same(result, pc.value, pc.decimals, op === "/" || op === "÷");
    out.push(ok ? { status: "verified", text: whole } : { status: "refuted", text: whole, expected: formatNumber(result), found: c });
  }
  const pct = new RegExp(`(${NUM})\\s*%\\s*de\\s*(${NUM})\\s*(?:=|é|são|dá|fica)\\s*(${NUM})`, "g");
  while ((m = pct.exec(answer))) {
    const [whole, p, y, z] = m;
    const [pp, py, pz] = [parseNumber(p), parseNumber(y), parseNumber(z)];
    if (!pp || !py || !pz) continue;
    if (pp === "ambiguous" || py === "ambiguous" || pz === "ambiguous") { out.push({ status: "unverifiable", text: whole }); continue; }
    const result = div(mul(pp.value, py.value), mk(BigInt(100)));
    out.push(same(result, pz.value, pz.decimals, true) ? { status: "verified", text: whole } : { status: "refuted", text: whole, expected: formatNumber(result), found: z });
  }
  return out;
}

/** Pergunta que é só uma conta ("Quanto é 17*23?"): o Cerebelo responde sem chamar a IA. */
export function localArithmetic(question: string): string | null {
  const m = new RegExp(`^\\s*(?:quanto\\s+(?:é|e|vale|dá|da)\\s+|calcule\\s+|qual\\s+(?:é|e)\\s+o\\s+resultado\\s+de\\s+)?(${NUM})\\s*(${OP})\\s*(${NUM})\\s*\\??\\s*$`, "i").exec(question);
  if (!m) return null;
  const [pa, pb] = [parseNumber(m[1]), parseNumber(m[3])];
  if (!pa || !pb || pa === "ambiguous" || pb === "ambiguous") return null;
  const result = OPS[m[2]]?.(pa.value, pb.value);
  if (!result) return "Divisão por zero não existe.";
  return `${m[1]} ${m[2] === "*" || m[2].toLowerCase() === "x" ? "×" : m[2]} ${m[3]} = ${formatNumber(result)}`;
}

/** Cortex: nomes que a resposta cita e que não existem no livro (só quando a pergunta é sobre o livro). */
export function unknownNames(question: string, answer: string, knownNames: string[], bookTitle = ""): string[] {
  const about = /\b(meu|minha|nosso|nossa)\s+(livro|hist[óo]ria|manuscrito|cap[íi]tulo|personagem|romance)|\bno (livro|manuscrito|cap[íi]tulo)\b|\bpersonagens?\b/i.test(question)
    || knownNames.some(n => question.toLowerCase().indexOf(n.toLowerCase()) !== -1);
  if (!about) return [];
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const known = new Set(knownNames.concat(bookTitle.split(/\s+/)).map(fold));
  const q = new Set((question.match(/[A-Za-zÀ-ÿ]+/g) ?? []).map(fold));
  const found: string[] = [];
  const re = new RegExp("(?<![A-Za-zÀ-ÿ])[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]{2,}", "gu");
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer))) {
    const start = m.index;
    const before = answer.slice(Math.max(0, start - 3), start);
    if (start === 0 || /(^|\n)\s*$|[.!?:]\s+$|["“*•-]\s*$/.test(before)) continue; // começo de frase: maiúscula comum
    const key = fold(m[0]);
    if (known.has(key) || q.has(key) || found.indexOf(m[0]) !== -1) continue;
    found.push(m[0]);
  }
  return found.slice(0, 4);
}

export type Verdict = { arithmetic: Finding[]; unknown: string[]; refuted: Finding[]; status: "verificado" | "refutado" | "nao-verificavel" | "sem-checagem" };
export function verifyAnswer(question: string, answer: string, knownNames: string[], bookTitle = ""): Verdict {
  const arithmetic = checkArithmetic(answer);
  const refuted = arithmetic.filter(f => f.status === "refuted");
  const unknown = unknownNames(question, answer, knownNames, bookTitle);
  const status = refuted.length ? "refutado" : arithmetic.some(f => f.status === "verified") ? "verificado" : arithmetic.length ? "nao-verificavel" : "sem-checagem";
  return { arithmetic, unknown, refuted, status };
}

/** Achados como dado (nunca como instrução de sistema) para a IA tentar de novo. */
export function feedbackFor(v: Verdict): string {
  return v.refuted.map(f => `A conta "${f.text}" está errada: o valor exato é ${f.expected}, não ${f.found}.`).join(" ");
}
