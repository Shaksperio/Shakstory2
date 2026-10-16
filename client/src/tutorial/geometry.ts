export type Box = { top: number; left: number; width: number; height: number };
export type Placement = { mode: "dock" | "center" | "float"; top: number; left: number; side?: "below" | "above" | "right" | "left" };

/** Posiciona o balão perto do alvo sem cobri-lo; em telas estreitas vira uma folha fixa na base. */
export function placeBalloon(target: Box | null, viewport: { width: number; height: number }, balloon: { width: number; height: number }, gap = 14, margin = 12): Placement {
  const clampX = (x: number) => Math.max(margin, Math.min(x, viewport.width - balloon.width - margin));
  const clampY = (y: number) => Math.max(margin, Math.min(y, viewport.height - balloon.height - margin));
  if (viewport.width < 640) return { mode: "dock", top: 0, left: 0 };
  if (!target) return { mode: "center", top: clampY((viewport.height - balloon.height) / 2), left: clampX((viewport.width - balloon.width) / 2) };
  const spaceBelow = viewport.height - (target.top + target.height) - gap - margin;
  const spaceAbove = target.top - gap - margin;
  const spaceRight = viewport.width - (target.left + target.width) - gap - margin;
  const spaceLeft = target.left - gap - margin;
  const centerX = clampX(target.left + target.width / 2 - balloon.width / 2);
  const centerY = clampY(target.top + target.height / 2 - balloon.height / 2);
  if (spaceBelow >= balloon.height) return { mode: "float", side: "below", top: target.top + target.height + gap, left: centerX };
  if (spaceAbove >= balloon.height) return { mode: "float", side: "above", top: target.top - gap - balloon.height, left: centerX };
  if (spaceRight >= balloon.width) return { mode: "float", side: "right", top: centerY, left: target.left + target.width + gap };
  if (spaceLeft >= balloon.width) return { mode: "float", side: "left", top: centerY, left: target.left - gap - balloon.width };
  // alvo muito grande: balão no maior espaço vertical, ainda dentro da tela
  const below = spaceBelow >= spaceAbove;
  return { mode: "float", side: below ? "below" : "above", top: clampY(below ? target.top + target.height + gap : target.top - gap - balloon.height), left: centerX };
}
