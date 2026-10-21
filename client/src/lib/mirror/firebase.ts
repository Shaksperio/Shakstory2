// Cliente do espelho no Firebase (Auth com Google + Firestore). O SDK é carregado sob demanda do CDN oficial
// do Firebase, para não adicionar dependência ao projeto nem peso ao carregamento normal do editor.
import type { KV } from "../sync/kv";
import type { LibraryLike } from "../sync/merge";
import { assembleMirror, changedDocs, planMirror, removedPaths, type RawDocs } from "./plan";
import type { MirrorIO } from "./mirrorSync";
import { isOwnerEmail } from "../contingency";

/** Valores públicos do app Web (não dão acesso aos dados; quem protege é firestore.rules). */
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBjMvRIgKSVakvRNRT8GTSHjJxCdxQ9zFk",
  authDomain: "shakstory-93bb1.firebaseapp.com",
  projectId: "shakstory-93bb1",
  storageBucket: "shakstory-93bb1.firebasestorage.app",
  messagingSenderId: "588602461570",
  appId: "1:588602461570:web:ce4353109367497450d39b",
};

const SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
/** Pasta compartilhada dos administradores. */
export const MIRROR_ROOT = "workspaces/main";
/** Pasta do espelho de cada pessoa: administradores em workspaces/main; os demais em mirrors/<e-mail> (firestore.rules confere o e-mail). */
export const mirrorRoot = (email: string) => (isOwnerEmail(email) ? MIRROR_ROOT : "mirrors/" + email.toLowerCase());
export const MIRROR_MIN_INTERVAL_MS = 2 * 60 * 1000;
const HASHES_KEY = "mirror-hashes";
// Hashes must never be shared across different Firebase workspaces/accounts.
const hashesKeyFor = (root: string) => HASHES_KEY + ":" + encodeURIComponent(root);
const STATE_KEY = "mirror-state";

export type MirrorUser = { uid: string; email: string };
export type MirrorState = { at: number; writes: number } | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sdk = { app: any; auth: any; fs: any; appInstance: any; authInstance: any; db: any };
let sdkPromise: Promise<Sdk> | null = null;

function loadSdk(): Promise<Sdk> {
  if (!sdkPromise) {
    sdkPromise = (async () => {
      const [app, auth, fs] = await Promise.all([
        import(/* @vite-ignore */ SDK + "firebase-app.js"),
        import(/* @vite-ignore */ SDK + "firebase-auth.js"),
        import(/* @vite-ignore */ SDK + "firebase-firestore.js"),
      ]);
      const appInstance = app.getApps().length ? app.getApp() : app.initializeApp(FIREBASE_CONFIG);
      return { app, auth, fs, appInstance, authInstance: auth.getAuth(appInstance), db: fs.getFirestore(appInstance) };
    })();
    sdkPromise.catch(() => { sdkPromise = null; });
  }
  return sdkPromise;
}

export async function currentMirrorUser(): Promise<MirrorUser | null> {
  const sdk = await loadSdk();
  await sdk.authInstance.authStateReady();
  const user = sdk.authInstance.currentUser;
  if (!user) return null;
  const email = user.email || String((await user.getIdTokenResult()).claims.mirrorEmail ?? "");
  return email ? { uid: user.uid, email } : null;
}

/** Entrada automática no endereço principal: o Worker confere o e-mail do Cloudflare Access e devolve a credencial do Firebase. null se não estiver configurado. */
export async function signInMirrorWithAccess(): Promise<MirrorUser | null> {
  const response = await fetch("/api/mirror-token", { credentials: "same-origin", headers: { accept: "application/json" } });
  if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return null;
  const data = (await response.json()) as { token?: string; email?: string };
  if (!data.token || !data.email) return null;
  const sdk = await loadSdk();
  const result = await sdk.auth.signInWithCustomToken(sdk.authInstance, data.token);
  return { uid: result.user.uid, email: data.email };
}

export async function signInMirror(): Promise<MirrorUser> {
  const sdk = await loadSdk();
  const provider = new sdk.auth.GoogleAuthProvider();
  const result = await sdk.auth.signInWithPopup(sdk.authInstance, provider);
  return { uid: result.user.uid, email: result.user.email };
}

/** Registra apenas um pedido de revisão no Firestore, sem apagar a conta.
 * Requer Firebase Auth; as regras verificam o UID do token, nunca o e-mail.
 * A operação falha sem conexão e não deve ser apresentada como concluída offline.
 */
export async function requestContingencyAccountDeletion(): Promise<void> {
  const sdk = await loadSdk();
  await sdk.authInstance.authStateReady();
  const user = sdk.authInstance.currentUser;
  if (!user) throw new Error("Entre com sua conta Google para solicitar a exclusão.");
  const token = await user.getIdTokenResult();
  if (token.signInProvider !== "google.com" || user.emailVerified !== true) {
    throw new Error("Confirme sua identidade com o Google antes de solicitar a exclusão.");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Sem conexão. A solicitação ainda não foi enviada ao Firebase.");
  }
  await sdk.fs.setDoc(sdk.fs.doc(sdk.db, "accountDeletionRequests/" + user.uid), {
    uid: user.uid,
    status: "pending_review",
    requestedAt: sdk.fs.serverTimestamp(),
    confirmation: "SOLICITAR EXCLUSÃO",
  });
}

/** Token de identidade do Firebase do usuário atual (para autenticar chamadas ao Worker de IA). */
export async function mirrorIdToken(): Promise<string> {
  const sdk = await loadSdk();
  await sdk.authInstance.authStateReady();
  const user = sdk.authInstance.currentUser;
  if (!user) throw new Error("sem login");
  return user.getIdToken();
}

export async function signOutMirror() {
  const sdk = await loadSdk();
  await sdk.auth.signOut(sdk.authInstance);
}

export async function readMirrorState(kv: KV): Promise<MirrorState> {
  return (await kv.get<MirrorState>("meta", STATE_KEY)) ?? undefined;
}

/** Envia ao Firestore só o que mudou. Devolve o novo carimbo do espelho, ou null se nada mudou. */
export async function pushMirror(kv: KV, library: LibraryLike, user: MirrorUser): Promise<number | null> {
  const root = mirrorRoot(user.email);
  const sdk = await loadSdk();
  const docs = await planMirror(root, library);
  const scopedHashesKey = hashesKeyFor(root);
  const previous = (await kv.get<Record<string, string>>("meta", scopedHashesKey)) ?? {};
  const toWrite = changedDocs(docs, previous);
  const toDelete = removedPaths(docs, previous);
  if (toWrite.length === 0 && toDelete.length === 0) return null;
  const stamp = Date.now();
  const metaPath = root + "/library/meta";
  const metaDoc = docs.find(item => item.path === metaPath);
  if (metaDoc && !toWrite.some(item => item.path === metaPath)) toWrite.push(metaDoc);
  const { doc, writeBatch } = sdk.fs;
  const next: Record<string, string> = { ...previous };
  const operations: Array<{ kind: "set" | "delete"; path: string; data?: Record<string, unknown>; hash?: string }> = [
    ...toWrite.map(item => ({ kind: "set" as const, path: item.path, data: item.path === metaPath ? { ...item.data, mirroredAt: stamp } : item.data, hash: item.hash })),
    ...toDelete.map(path => ({ kind: "delete" as const, path })),
  ];
  for (let at = 0; at < operations.length; at += 400) {
    const batch = writeBatch(sdk.db);
    const slice = operations.slice(at, at + 400);
    slice.forEach(operation => {
      const ref = doc(sdk.db, operation.path);
      if (operation.kind === "set") batch.set(ref, operation.data);
      else batch.delete(ref);
    });
    await batch.commit();
    slice.forEach(operation => { if (operation.kind === "set") next[operation.path] = operation.hash as string; else delete next[operation.path]; });
    await kv.put("meta", scopedHashesKey, next);
  }
  await kv.put("meta", STATE_KEY, { at: stamp, writes: operations.length });
  return stamp;
}

/** Carimbo do último envio ao espelho (uma leitura). null se o espelho ainda está vazio. */
export async function readMirrorStamp(user: MirrorUser): Promise<number | null> {
  const sdk = await loadSdk();
  const snap = await sdk.fs.getDoc(sdk.fs.doc(sdk.db, mirrorRoot(user.email) + "/library/meta"));
  if (!snap.exists()) return null;
  const value = Number(snap.data().mirroredAt);
  return Number.isFinite(value) ? value : null;
}

export function mirrorIO(kv: KV, user: MirrorUser): MirrorIO {
  return { scope: mirrorRoot(user.email) + ":" + user.uid, stamp: () => readMirrorStamp(user), pull: () => pullMirror(user), push: library => pushMirror(kv, library, user) };
}

/** Lê o espelho inteiro. Retorna null se vazio ou incompleto. */
export async function pullMirror(user: MirrorUser): Promise<LibraryLike | null> {
  const sdk = await loadSdk();
  const { collection, getDocs } = sdk.fs;
  const root = mirrorRoot(user.email);
  const raw: RawDocs = [];
  const metaSnap = await getDocs(collection(sdk.db, root + "/library"));
  metaSnap.forEach((item: { ref: { path: string }; data: () => Record<string, unknown> }) => raw.push({ path: item.ref.path, data: item.data() }));
  const booksSnap = await getDocs(collection(sdk.db, root + "/books"));
  const bookIds: string[] = [];
  booksSnap.forEach((item: { id: string; ref: { path: string }; data: () => Record<string, unknown> }) => { bookIds.push(item.id); raw.push({ path: item.ref.path, data: item.data() }); });
  for (const bookId of bookIds) {
    const nodesSnap = await getDocs(collection(sdk.db, root + "/books/" + bookId + "/nodes"));
    nodesSnap.forEach((item: { ref: { path: string }; data: () => Record<string, unknown> }) => raw.push({ path: item.ref.path, data: item.data() }));
  }
  return assembleMirror(root, raw);
}

/** Catálogo público de ofertas Ton, independente do D1. Nunca concede assinatura. */
export type PublicPlanOffer = { plan: "economico" | "premium" | "vip"; priceCents: number; checkoutUrl: string };
export async function readPublicPlanOffers(): Promise<PublicPlanOffer[]> {
  const sdk = await loadSdk();
  const snapshot = await sdk.fs.getDoc(sdk.fs.doc(sdk.db, "publicCatalog", "plans"));
  if (!snapshot.exists()) return [];
  const offers = snapshot.data()?.offers;
  if (!Array.isArray(offers)) return [];
  return offers.filter((offer: unknown): offer is PublicPlanOffer => {
    if (!offer || typeof offer !== "object") return false;
    const o = offer as Partial<PublicPlanOffer>;
    return ["economico", "premium", "vip"].includes(o.plan ?? "") && Number.isSafeInteger(o.priceCents) && (o.priceCents ?? 0) > 0 && typeof o.checkoutUrl === "string" && /^https:\/\/payment-link-v3\.ton\.com\.br\//.test(o.checkoutUrl);
  });
}
export async function savePublicPlanOffer(offer: PublicPlanOffer): Promise<void> {
  const sdk = await loadSdk();
  await sdk.authInstance.authStateReady();
  const user = sdk.authInstance.currentUser;
  if (!user || !isOwnerEmail(user.email || String((await user.getIdTokenResult()).claims.mirrorEmail ?? ""))) throw new Error("Entre como administrador verificado no Firebase.");
  if (!["economico", "premium", "vip"].includes(offer.plan) || !Number.isSafeInteger(offer.priceCents) || offer.priceCents <= 0 || !/^https:\/\/payment-link-v3\.ton\.com\.br\//.test(offer.checkoutUrl)) throw new Error("Confira o plano, o valor e o link oficial da Ton.");
  const ref = sdk.fs.doc(sdk.db, "publicCatalog", "plans");
  await sdk.fs.runTransaction(sdk.db, async (transaction: { get: (ref: unknown) => Promise<{ data: () => { offers?: PublicPlanOffer[] } | undefined }>; set: (ref: unknown, data: unknown) => void }) => {
    const previous = await transaction.get(ref);
    const existing = previous.data()?.offers ?? [];
    const offers = [...existing.filter(item => item.plan !== offer.plan), offer];
    transaction.set(ref, { offers, updatedAt: sdk.fs.serverTimestamp() });
  });
}
