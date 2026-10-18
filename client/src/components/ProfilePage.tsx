import React, { useRef, useState } from "react";
import { ArrowLeft, BookOpen, Camera, ExternalLink, LogOut, MapPin, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, resizePhoto, type AccountBook, type Profile } from "./AccountMenu";

const countWords = (value: string) => (value.trim() ? value.trim().split(/\s+/).length : 0);
const wordsOf = (book: AccountBook) => book.nodes.reduce((sum, node) => sum + countWords(node.content), 0);
const number = (value: number) => new Intl.NumberFormat("pt-BR").format(value);
const dateOf = (value: number) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(value);
const hue = (title: string) => Array.from(title).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
const percent = (book: AccountBook) => Math.min(100, Math.round((wordsOf(book) / Math.max(1, book.targetWordCount)) * 100));

/** Só aceita endereços http(s); evita links "javascript:" digitados no perfil. */
export function safeUrl(value?: string): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : "https://" + raw;
  try {
    const url = new URL(withScheme);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

const IN_PROGRESS = ["draft", "planning", "editing", "revision"];

function Cover({ book, className = "" }: { book: AccountBook; className?: string }) {
  const base = hue(book.title);
  return (
    <div className={`grid shrink-0 place-items-center overflow-hidden rounded-md text-white shadow-md ${className}`} style={{ background: `linear-gradient(150deg, hsl(${base} 42% 42%), hsl(${(base + 40) % 360} 45% 24%))` }} aria-hidden="true">
      {book.publication?.coverImageUrl ? <img src={book.publication.coverImageUrl} alt="" className="h-full w-full object-cover" /> : <span className="font-serif text-3xl italic">{book.title.charAt(0).toUpperCase() || "?"}</span>}
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const radius = 52;
  const length = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32 shrink-0" role="img" aria-label={`${value}% da meta concluída`}>
      <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--border)" strokeWidth="10" />
      <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--primary)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(length * value) / 100} ${length}`} transform="rotate(-90 60 60)" />
      <text x="60" y="66" textAnchor="middle" className="fill-foreground font-serif" style={{ fontSize: 26 }}>{value}%</text>
    </svg>
  );
}

function DailyBars({ book }: { book: AccountBook }) {
  const days: Array<{ key: string; label: string; added: number }> = [];
  const today = new Date();
  for (let back = 13; back >= 0; back--) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const entry = (book.writingProgress ?? []).find(item => item.date === key);
    days.push({ key, label: String(day.getDate()), added: Math.max(0, entry?.added ?? 0) });
  }
  const max = Math.max(1, ...days.map(day => day.added));
  const total = days.reduce((sum, day) => sum + day.added, 0);
  return (
    <figure className="min-w-0 flex-1">
      <svg viewBox="0 0 280 100" className="h-28 w-full" role="img" aria-label={`Palavras escritas por dia nos últimos 14 dias: ${number(total)} no total`}>
        {days.map((day, index) => {
          const height = day.added ? Math.max(3, (day.added / max) * 78) : 1;
          return (
            <g key={day.key}>
              <rect x={index * 20 + 3} y={84 - height} width="14" height={height} rx="3" fill={day.added ? "var(--primary)" : "var(--border)"}><title>{`${day.label}: ${number(day.added)} palavras`}</title></rect>
              <text x={index * 20 + 10} y="97" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 7 }}>{day.label}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-xs text-muted-foreground">{total ? `${number(total)} palavras escritas nos últimos 14 dias` : "Nenhuma palavra registrada nos últimos 14 dias."}</figcaption>
    </figure>
  );
}

export type ProfilePageProps = {
  books: AccountBook[];
  profile: Profile;
  email: string;
  online: boolean;
  displayName: string;
  syncLabel: string;
  statusLabel: (status?: string) => string;
  onProfile: (patch: Partial<Profile>) => void;
  onOpen: (book: AccountBook) => void;
  onClose: () => void;
  onSignOut: () => void;
  onDeleteBook?: (book: AccountBook) => void;
  onResetBook?: (book: AccountBook) => void;
  dataSafety?: React.ReactNode;
};

const LINK_HINTS = ["https://instagram.com/seu-perfil", "https://x.com/seu-perfil", "https://tiktok.com/@seu-perfil"];

export function ProfilePage({ books, profile, email, online, displayName, syncLabel, statusLabel, onProfile, onOpen, onClose, onSignOut, onDeleteBook, onResetBook, dataSafety }: ProfilePageProps) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ book: AccountBook; mode: "delete" | "reset" } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const active = books.filter(book => !book.archived);
  const finished = active.filter(book => book.status === "completed");
  const drafts = active.filter(book => book.status === "draft" || book.status === "planning");
  const working = active.filter(book => IN_PROGRESS.includes(book.status ?? "draft"));
  const ongoing = [...working].sort((a, b) => (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt));
  const [chosen, setChosen] = useState("");
  const current = ongoing.find(book => book.id === chosen) ?? ongoing[0];
  const totalWords = active.reduce((sum, book) => sum + wordsOf(book), 0);
  const byCreation = [...active].sort((a, b) => (b.startedAt ?? b.updatedAt) - (a.startedAt ?? a.updatedAt));
  const links = [...(profile.links ?? []), "", "", ""].slice(0, 3);
  const setLink = (index: number, value: string) => onProfile({ links: links.map((item, at) => (at === index ? value : item)) });
  const store = safeUrl(profile.store);
  const stats: Array<[string, number]> = [["Histórias", active.length], ["Livros prontos", finished.length], ["Rascunhos", drafts.length], ["Em andamento", ongoing.filter(book => book.status === "editing" || book.status === "revision").length], ["Palavras escritas", totalWords]];

  return (
    <section className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:pb-14" aria-label="Minha conta">
      <button type="button" onClick={onClose} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar à biblioteca
      </button>

      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="relative mx-auto h-28 w-28 shrink-0 sm:mx-0">
            <Avatar name={displayName} photo={profile.photo} size={112} />
            <button type="button" aria-label="Alterar foto de perfil" onClick={() => fileInput.current?.click()} className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full border border-border bg-card shadow">
              <Camera className="h-4 w-4" aria-hidden="true" />
            </button>
            <input ref={fileInput} className="hidden" type="file" accept="image/*" aria-label="Foto de perfil" onChange={async event => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.size > 8 * 1024 * 1024) return setError("Escolha uma imagem de até 8 MB.");
              try { setError(""); onProfile({ photo: await resizePhoto(file) }); } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao carregar a foto."); }
            }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Minha conta</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-muted-foreground">Nome de autor
                <Input className="mt-1.5" value={profile.name} placeholder={displayName} maxLength={120} onChange={event => onProfile({ name: event.target.value })} />
              </label>
              <label className="block text-xs font-medium text-muted-foreground">Onde você mora
                <span className="relative mt-1.5 block">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input className="pl-9" value={profile.location ?? ""} placeholder="Cidade, estado ou país" maxLength={120} onChange={event => onProfile({ location: event.target.value })} />
                </span>
              </label>
            </div>
            <label className="mt-3 block text-xs font-medium text-muted-foreground">Mini bio
              <Textarea className="mt-1.5 min-h-24" value={profile.bio ?? ""} maxLength={600} placeholder="Conte em poucas linhas quem é você como autor." onChange={event => onProfile({ bio: event.target.value })} />
              <span className="mt-1 block text-right text-[11px]">{(profile.bio ?? "").length}/600</span>
            </label>
            <p className="mt-1 text-sm text-muted-foreground">{email || "E-mail disponível após entrar com o código de acesso."}</p>
            <p className="mt-1 inline-flex items-center gap-2 text-xs">
              <span className={`sk-presence ${online ? "is-online" : "is-offline"}`} aria-hidden="true" />
              {online ? "Online" : "Offline"} · {syncLabel}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {profile.photo && <Button size="sm" variant="ghost" onClick={() => onProfile({ photo: "" })}>Remover foto</Button>}
              <span className="text-[11px] text-muted-foreground">Perfil salvo neste dispositivo.</span>
            </div>
            {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
          </div>
        </div>

        <div className="mt-6 border-t border-border/60 pt-5">
          <h2 className="font-serif text-xl">Links</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {links.map((value, index) => {
              const valid = safeUrl(value);
              return (
                <label key={index} className="block text-xs font-medium text-muted-foreground">Rede social {index + 1}
                  <Input className="mt-1.5" inputMode="url" value={value} placeholder={LINK_HINTS[index]} maxLength={300} onChange={event => setLink(index, event.target.value)} />
                  {value.trim() && !valid && <span className="mt-1 block text-[11px] text-destructive">Endereço inválido.</span>}
                  {valid && <a className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline" href={valid} target="_blank" rel="noopener noreferrer nofollow">Abrir link <ExternalLink className="h-3 w-3" aria-hidden="true" /></a>}
                </label>
              );
            })}
          </div>
          <label className="mt-3 block text-xs font-medium text-muted-foreground">Site externo (ex.: página dos seus livros na Amazon)
            <Input className="mt-1.5" inputMode="url" value={profile.store ?? ""} placeholder="https://www.amazon.com.br/..." maxLength={300} onChange={event => onProfile({ store: event.target.value })} />
            {(profile.store ?? "").trim() && !store && <span className="mt-1 block text-[11px] text-destructive">Endereço inválido.</span>}
            {store && <a className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline" href={store} target="_blank" rel="noopener noreferrer nofollow">Abrir site <ExternalLink className="h-3 w-3" aria-hidden="true" /></a>}
          </label>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border/70 bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 font-serif text-2xl">{number(value)}</p>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-2xl border border-border/70 bg-card p-5 sm:p-6" aria-label="Livro em andamento">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-xl">Livro em andamento</h2>
          {ongoing.length > 1 && (
            <select aria-label="Escolher livro em andamento" className="h-9 max-w-full rounded-md border border-input bg-transparent px-2 text-sm" value={current?.id} onChange={event => setChosen(event.target.value)}>
              {ongoing.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}
            </select>
          )}
        </div>
        {!current ? (
          <p className="mt-3 text-sm text-muted-foreground">Nenhum livro em andamento. Crie ou retome um projeto na biblioteca.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-center">
            <Cover book={current} className="h-40 w-28 self-center sm:self-start" />
            <div className="flex min-w-0 flex-1 flex-col gap-5 md:flex-row md:items-center">
              <Ring value={percent(current)} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-serif text-lg">{current.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{statusLabel(current.status)} · {number(wordsOf(current))} de {number(current.targetWordCount)} palavras · iniciado em {dateOf(current.startedAt ?? current.updatedAt)}</p>
                <Progress value={percent(current)} className="mt-3 h-2" />
                <div className="mt-4"><DailyBars book={current} /></div>
                <Button className="mt-3" size="sm" onClick={() => onOpen(current)}>Continuar escrevendo</Button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="mt-6" aria-label="Projetos finalizados">
        <h2 className="font-serif text-xl">Projetos finalizados</h2>
        {finished.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Quando você marcar um livro como concluído, ele aparece aqui.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {finished.map(book => (
              <li key={book.id}>
                <button type="button" onClick={() => onOpen(book)} className="group block w-full text-left" aria-label={`Abrir ${book.title}`}>
                  <Cover book={book} className="aspect-[2/3] w-full transition group-hover:-translate-y-0.5" />
                  <p className="mt-2 truncate font-serif text-sm">{book.title}</p>
                  <p className="text-[11px] text-muted-foreground">{number(wordsOf(book))} palavras</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-label="Todos os livros">
        <h2 className="font-serif text-xl">Meus livros</h2>
        {byCreation.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nenhum livro ainda. Crie o primeiro na biblioteca.</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {byCreation.map(book => {
              const chapters = book.nodes.filter(node => node.kind === "chapter").length;
              return (
                <li key={book.id} className="flex gap-4 rounded-xl border border-border/70 bg-card p-3">
                  <Cover book={book} className="h-28 w-20" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <h3 className="truncate font-serif text-base">{book.title}</h3>
                    <p className="mt-0.5 text-xs text-primary">{statusLabel(book.status)}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Criado em {dateOf(book.startedAt ?? book.updatedAt)} · atualizado em {dateOf(book.lastOpenedAt ?? book.updatedAt)}</p>
                    <p className="text-[11px] text-muted-foreground">{number(wordsOf(book))} palavras · {chapters} {chapters === 1 ? "capítulo" : "capítulos"}</p>
                    <Progress value={percent(book)} className="mt-2 h-1.5" />
                    <div className="mt-auto flex flex-wrap gap-2 pt-2">
                      <Button size="sm" variant="outline" onClick={() => onOpen(book)}><BookOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Abrir</Button>
                      {onResetBook && <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:text-destructive" aria-label={`Zerar manuscrito de ${book.title}`} onClick={() => setPending({ book, mode: "reset" })}><RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Zerar manuscrito</Button>}
                      {onDeleteBook && <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:text-destructive" aria-label={`Excluir projeto ${book.title}`} onClick={() => setPending({ book, mode: "delete" })}><Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Excluir projeto</Button>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {dataSafety}

      <section className="mt-6 rounded-xl border border-border/70 bg-card p-4" aria-label="Sessão">
        <h2 className="font-serif text-xl">Sessão</h2>
        <p className="mt-1 text-xs text-muted-foreground">Encerra o acesso neste navegador; na próxima abertura será pedido o login de novo. Os textos salvos neste aparelho não são apagados.</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={onSignOut}><LogOut className="mr-1.5 h-4 w-4" aria-hidden="true" />Sair da conta</Button>
      </section>

      {pending && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-5 backdrop-blur-sm" onClick={() => setPending(null)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl" onClick={event => event.stopPropagation()}>
            <h2 id="confirm-title" className="font-serif text-2xl">{pending.mode === "delete" ? "Excluir projeto?" : "Zerar manuscrito?"}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {pending.mode === "delete"
                ? `“${pending.book.title}” será removido da biblioteca e dos endereços sincronizados (principal, cópia na nuvem e contingência). Uma cópia de segurança fica guardada neste aparelho.`
                : `Todo o texto, os capítulos, o planejamento e as notas de “${pending.book.title}” serão substituídos por um manuscrito vazio. O livro, a capa e os dados de publicação continuam. Uma cópia de segurança fica guardada neste aparelho.`}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPending(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => { const { book, mode } = pending; setPending(null); if (mode === "delete") onDeleteBook?.(book); else onResetBook?.(book); }}>{pending.mode === "delete" ? "Excluir projeto" : "Zerar manuscrito"}</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
