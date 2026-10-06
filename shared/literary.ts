export function applySuggestionAtOffsets(
  draft: string,
  start: number,
  end: number,
  original: string,
  suggestion: string,
): string {
  if (!original || !suggestion || start < 0 || end <= start || draft.slice(start, end) !== original) return draft;
  return `${draft.slice(0, start)}${suggestion}${draft.slice(end)}`;
}
