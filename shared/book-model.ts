export type CanonScope = "book" | "series" | "universe";
export type StoryCanonFact = {
  id: string;
  text: string;
  scope: CanonScope;
  status: "active" | "superseded" | "disputed";
  createdAt?: string;
  updatedAt?: string;
};
export type StoryUniverse = {
  id: string;
  name: string;
  description?: string;
  canonFacts?: StoryCanonFact[];
};
export type StorySeries = {
  id: string;
  universeId: string;
  name: string;
  description?: string;
  canonFacts?: StoryCanonFact[];
};
export type BookHierarchy = {
  bookId: string;
  universeId?: string;
  universeName?: string;
  seriesId?: string;
  seriesName?: string;
};

export type SemanticBlock = { id: string; kind: "paragraph" | "quote" | "scene_break" | "heading"; text: string; sortOrder: number };
export type SemanticScene = { id: string; title: string; blocks: SemanticBlock[]; richContent?: string; characterIds: string[]; locationIds: string[]; sortOrder: number };
export type SemanticChapter = { id: string; title: string; scenes: SemanticScene[]; sortOrder: number };
export type SemanticPart = { id: string; title: string; chapters: SemanticChapter[]; sortOrder: number };
export type SemanticPlannedScene = { id: string; title: string; objective: string; conflict: string; notes: string };
export type SemanticBook = { schemaVersion: "1.1"; id: string; title: string; parts: SemanticPart[]; migratedFromLegacy: boolean; plannedScenes?: SemanticPlannedScene[] };
export type LegacyNode = { id: string; title: string; kind: "part" | "chapter" | "scene" | "front_matter" | "back_matter"; content: string; sortOrder?: number };

const splitBlocks = (content: string): SemanticBlock[] => content.split(/\n{2,}/).map(text => text.trim()).filter(Boolean).map((text, index) => ({ id: `block_${index + 1}`, kind: "paragraph", text, sortOrder: index }));

export function migrateLegacyNodes(input: { id: string; title: string; nodes: LegacyNode[] }): SemanticBook {
  const ordered = [...input.nodes].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const parts: SemanticPart[] = [];
  let currentPart: SemanticPart = { id: `${input.id}_part_1`, title: "Parte 1", chapters: [], sortOrder: 0 };
  let explicitPart = false;
  for (const node of ordered) {
    if (node.kind === "part") {
      if (currentPart.chapters.length > 0 || explicitPart) parts.push(currentPart);
      explicitPart = true;
      currentPart = { id: node.id, title: node.title, chapters: [], sortOrder: parts.length };
      continue;
    }
    if (node.kind !== "chapter" && node.kind !== "scene") continue;
    const chapter: SemanticChapter = { id: node.kind === "chapter" ? node.id : `${node.id}_chapter`, title: node.kind === "chapter" ? node.title : "Capítulo", scenes: [{ id: node.kind === "scene" ? node.id : `${node.id}_scene_1`, title: node.kind === "scene" ? node.title : node.title, blocks: splitBlocks(node.content), characterIds: [], locationIds: [], sortOrder: 0 }], sortOrder: currentPart.chapters.length };
    currentPart.chapters.push(chapter);
  }
  if (currentPart.chapters.length > 0 || explicitPart || parts.length === 0) parts.push(currentPart);
  return { schemaVersion: "1.1", id: input.id, title: input.title, parts, migratedFromLegacy: true, plannedScenes: [] };
}

export function semanticWordCount(book: SemanticBook): number {
  return book.parts.flatMap(part => part.chapters).flatMap(chapter => chapter.scenes).flatMap(scene => scene.blocks).reduce((sum, block) => sum + block.text.trim().split(/\s+/).filter(Boolean).length, 0);
}
