import { describe, expect, it } from "vitest";
import { MIRROR_ROOT, mirrorRoot } from "./firebase";
import { isOwnerEmail } from "../contingency";

describe("pasta do espelho por pessoa", () => {
  it("administradores usam a pasta compartilhada; os demais, uma pasta própria pelo e-mail em minúsculas", () => {
    expect(mirrorRoot("antonyopintor@gmail.com")).toBe(MIRROR_ROOT);
    expect(mirrorRoot("AcpConsultorias@gmail.com")).toBe(MIRROR_ROOT);
    expect(mirrorRoot("Ana@Example.com")).toBe("mirrors/ana@example.com");
    expect(mirrorRoot("ana@example.com")).not.toBe(mirrorRoot("bia@example.com"));
    expect(isOwnerEmail("ana@example.com")).toBe(false);
  });
});
