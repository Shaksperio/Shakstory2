import type { SemanticBlock, SemanticBook, SemanticChapter, SemanticScene } from "./book-model";

export function chaptersOf(book: SemanticBook): SemanticChapter[] {
  return book.parts.flatMap(part => part.chapters).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function scenesOf(book: SemanticBook, chapterId: string): SemanticScene[] {
  return chaptersOf(book).find(chapter => chapter.id === chapterId)?.scenes.slice().sort((a, b) => a.sortOrder - b.sortOrder) ?? [];
}

export function replaceSceneBlocks(book: SemanticBook, sceneId: string, blocks: SemanticBlock[], richContent?: string): SemanticBook {
  return {
    ...book,
    parts: book.parts.map(part => ({ ...part, chapters: part.chapters.map(chapter => ({ ...chapter, scenes: chapter.scenes.map(scene => scene.id === sceneId ? { ...scene, blocks, ...(richContent !== undefined ? { richContent } : {}) } : scene) })) })),
  };
}

export function sceneText(scene: SemanticScene): string {
  return scene.blocks.slice().sort((a, b) => a.sortOrder - b.sortOrder).map(block => block.text).join("\n\n");
}
