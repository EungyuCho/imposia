export type SrcsetCandidate = {
  readonly url: string;
  readonly start: number;
  readonly end: number;
  readonly segmentEnd: number;
};

const DESCRIPTOR = /^(?:\d+(?:\.\d+)?[xw])$/i;

export function srcsetCandidates(value: string): readonly SrcsetCandidate[] {
  const candidates: SrcsetCandidate[] = [];
  let index = 0;
  while (index < value.length) {
    while (/\s|,/.test(value[index] ?? "")) index += 1;
    if (index >= value.length) break;
    const start = index;
    while (!/\s/.test(value[index] ?? "")) index += 1;
    const url = value.slice(start, index);
    while (/\s/.test(value[index] ?? "")) index += 1;
    const descriptorStart = index;
    const comma = value.indexOf(",", descriptorStart);
    const descriptorText = value.slice(descriptorStart, comma < 0 ? value.length : comma).trim();
    const descriptors = descriptorText === "" ? [] : descriptorText.split(/\s+/);
    if (url !== "" && descriptors.length === 1 && DESCRIPTOR.test(descriptors[0] ?? "")) {
      candidates.push({
        url,
        start,
        end: start + url.length,
        segmentEnd: comma < 0 ? value.length : comma,
      });
    }
    index = comma < 0 ? value.length : comma + 1;
  }
  return candidates;
}

export function rewriteSrcset(
  value: string,
  candidates: readonly SrcsetCandidate[],
  replacements: ReadonlyMap<number, string | undefined>,
): string {
  const parts: string[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const replacement = replacements.has(index) ? replacements.get(index) : candidate.url;
    if (replacement === undefined) continue;
    const descriptor = value.slice(candidate.end, candidate.segmentEnd).trim();
    if (descriptor === "") continue;
    parts.push(`${replacement} ${descriptor}`);
  }
  return parts.join(", ");
}

export function sameDocumentFragment(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("#") && trimmed.length > 1 && !trimmed.startsWith("%23");
}
