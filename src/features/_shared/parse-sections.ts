/**
 * Discharge narratives arrive as a single markdown blob with `**Label**`
 * section headers (always on their own line) and inline `**bold**` emphasis
 * inside section bodies. Only line-start markers are treated as section
 * boundaries — inline bold inside a section body is preserved.
 */
export function extractSections(text: string | null | undefined, labels: string[]): string[] {
  if (!text) return [];
  // Allow optional list-item prefix (`- ` / `* `) before the marker so that
  // `- **Diet:** ...` is recognized as a section header too.
  const headerRe = /(?:^|\n)[ \t]*(?:[-*][ \t]+)?\*\*([^*\n]+?)\*\*[ \t]*:?[ \t]*/g;
  const matches: { label: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(text)) !== null) {
    matches.push({
      label: m[1].replace(/:$/, "").trim().toLowerCase(),
      // start = position of the `**` itself (skip the leading newline)
      start: m.index + (text[m.index] === "\n" ? 1 : 0),
      end: m.index + m[0].length,
    });
  }
  const wanted = labels.map((l) => l.toLowerCase());
  const out: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    if (!wanted.some((w) => cur.label === w || cur.label.startsWith(w))) continue;
    const next = matches[i + 1]?.start ?? text.length;
    const body = text.slice(cur.end, next).replace(/^[\s:-]+/, "").trimEnd();
    if (body) out.push(body);
  }
  return out;
}
