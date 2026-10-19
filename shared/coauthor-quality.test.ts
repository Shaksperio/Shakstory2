import { describe, expect, it } from "vitest";
import { assessCoauthorQuality } from "./coauthor-quality";

const door = "Eu me levantei e fui até a porta. A mulher estava ali, olhando para mim com curiosidade.";
const question = "Perguntei quem ela era. Ela sorriu e respondeu que estava ali para ajudar, sem explicar mais nada.";
const next = "O relógio na parede começou a marcar treze horas, e a visitante deixou cair uma chave dourada.";
const beat = "Atrás dela havia um corredor comprido. A porta do elevador abriu e dois estranhos entraram apressados.";

describe("Cowila quality gate", () => {
  it("flags repeated first-person filler in the three initial samples", () => {
    const filler = "Eu me senti um pouco mais inseguro e comecei a olhar pela janela, como se a manhã tivesse mudado de repente.";
    const result = assessCoauthorQuality(Array.from({ length: 6 }, (_, i) => filler + " O relógio marcou " + i + " horas.").join(" "));
    expect(result.accepted).toBe(false);
    expect(result.formulaicPhraseCount).toBeGreaterThanOrEqual(5);
  });

  it("permits an isolated first-person emotion inside varied narration", () => {
    const scene = "Eu me senti aliviado quando o trem parou. A mulher abriu a caixa que trazia sob o casaco e colocou a chave sobre a mesa. O bilhete tinha o nome da minha irmã. Ao longe, o maquinista anunciou a última estação. A escolha agora era minha: descer ou seguir para a fronteira.";
    expect(assessCoauthorQuality(scene).accepted).toBe(true);
  });

  it("rejects the repeated door-dialogue cycle", () => {
    const output = [door, question, next, beat, door, question, next, beat, door, question, next, beat].join("\n\n");
    const result = assessCoauthorQuality(output);
    expect(result.accepted).toBe(false);
    expect(result.repeatedBlockCount).toBeGreaterThanOrEqual(2);
  });

  it("allows an intentional refrain without blocking a complete progression", () => {
    const output = [door, question, "Nunca mais, pensei.",
      "Eu contei a ela o que havia visto ao acordar; ela abriu um mapa e apontou para a minha rua.",
      next, "Nunca mais, pensei.", beat].join("\n\n");
    expect(assessCoauthorQuality(output).accepted).toBe(true);
  });

  it("warns when most sentence openings are identical", () => {
    const lines = Array.from({ length: 16 }, (_, i) =>
      "Eu me senti confuso quando o sino tocou número " + i + " e a sala parecia se estreitar.");
    expect(assessCoauthorQuality(lines.join(" ")).accepted).toBe(false);
  });

  it("does not mistake a short scene for a repetition loop", () => {
    expect(assessCoauthorQuality([door, question, next].join("\n\n")).accepted).toBe(true);
  });
});
