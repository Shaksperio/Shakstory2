import { describe, expect, it } from "vitest";
import { buildContinuityPrompt, CONTINUITY_DIMENSIONS } from "./continuity-radar";

describe("Continuity Radar", () => {
  it("covers the core continuity dimensions by default", () => {
    const prompt = buildContinuityPrompt({ sceneTitle: "A carta" });
    expect(prompt).toContain("A carta");
    expect(prompt).toContain(CONTINUITY_DIMENSIONS.canon);
    expect(prompt).toContain(CONTINUITY_DIMENSIONS.chronology);
    expect(prompt).toContain(CONTINUITY_DIMENSIONS.character_knowledge);
    expect(prompt).toContain(CONTINUITY_DIMENSIONS.world_rules);
    expect(prompt).toContain("CONTRADIÇÃO");
    expect(prompt).toContain("não aplique nenhuma alteração");
  });

  it("supports a focused continuity audit", () => {
    const prompt = buildContinuityPrompt({ dimensions: ["chronology", "locations"] });
    expect(prompt).toContain(CONTINUITY_DIMENSIONS.chronology);
    expect(prompt).toContain(CONTINUITY_DIMENSIONS.locations);
    expect(prompt).not.toContain(CONTINUITY_DIMENSIONS.relationships);
  });
});
