import { migrateLegacyNodes, type SemanticBook } from "./book-model";
import type { LifecycleNode } from "./project-lifecycle";

/** Reconcile the legacy navigation without replacing scene metadata or established IDs. */
export function reconcileManuscriptStructure(
  input: { id: string; title: string; nodes: LifecycleNode[] },
  existing?: SemanticBook
): SemanticBook {
  const generated = migrateLegacyNodes(input);
  const oldChapters = new Map(
    existing?.parts.flatMap(p => p.chapters).map(c => [c.id, c])
  );
  const oldParts = new Map(existing?.parts.map(p => [p.id, p]));
  const nodes = new Map(input.nodes.map(n => [n.id, n]));
  return {
    ...existing,
    ...generated,
    migratedFromLegacy:
      existing?.migratedFromLegacy ?? generated.migratedFromLegacy,
    plannedScenes: existing?.plannedScenes ?? [],
    parts: generated.parts.map(part => ({
      ...oldParts.get(part.id),
      ...part,
      chapters: part.chapters.map(chapter => {
        const previous = oldChapters.get(chapter.id);
        const node = nodes.get(chapter.id) ?? nodes.get(chapter.scenes[0].id);
        if (!node) return chapter;
        const originalScene = previous?.scenes[0];
        const sceneId = originalScene?.id ?? chapter.scenes[0].id;
        const blocks = node.content
          .split(/\n{2,}/)
          .map(text => text.trim())
          .filter(Boolean)
          .map((text, index) => ({
            id:
              originalScene?.blocks[index]?.id ??
              `${sceneId}_block_${index + 1}`,
            kind: originalScene?.blocks[index]?.kind ?? ("paragraph" as const),
            text,
            sortOrder: index,
          }));
        const scene = {
          ...chapter.scenes[0],
          ...originalScene,
          id: sceneId,
          title: node.title,
          blocks,
          richContent: node.richContent,
        };
        return {
          ...previous,
          ...chapter,
          scenes: [scene, ...(previous?.scenes.slice(1) ?? [])],
        };
      }),
    })),
  };
}
