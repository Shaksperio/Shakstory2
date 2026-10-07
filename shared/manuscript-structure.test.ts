import { expect, it } from "vitest";
import { reconcileManuscriptStructure } from "./manuscript-structure";

it("reconciles chapters and empty parts while retaining scene identity and planning", () => {
  const nodes = [
    {
      id: "a",
      title: "A",
      kind: "chapter" as const,
      content: "Original",
      updatedAt: 1,
    },
  ];
  const previous = reconcileManuscriptStructure({
    id: "book",
    title: "Book",
    nodes,
  });
  const scene = previous.parts[0].chapters[0].scenes[0];
  scene.characterIds = ["character"];
  scene.locationIds = ["location"];
  previous.plannedScenes = [
    {
      id: "planned",
      title: "Next",
      objective: "Goal",
      conflict: "Obstacle",
      notes: "Note",
    },
  ];
  const next = reconcileManuscriptStructure(
    {
      id: "book",
      title: "Book",
      nodes: [
        { ...nodes[0], title: "Renamed", content: "Updated" },
        {
          id: "empty",
          title: "Empty part",
          kind: "part",
          content: "",
          updatedAt: 2,
        },
      ],
    },
    previous
  );
  const updated = next.parts[0].chapters[0].scenes[0];
  expect(updated.id).toBe(scene.id);
  expect(updated.blocks[0].id).toBe(scene.blocks[0].id);
  expect(updated.blocks[0].text).toBe("Updated");
  expect(updated.characterIds).toEqual(["character"]);
  expect(updated.locationIds).toEqual(["location"]);
  expect(next.parts[0].chapters[0].title).toBe("Renamed");
  expect(next.parts[1].id).toBe("empty");
  expect(next.parts[1].chapters).toEqual([]);
  expect(next.plannedScenes).toEqual(previous.plannedScenes);
});
