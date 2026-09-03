import type { ReactNode } from "react";

/** Map normalized matches back onto the exact original graphemes. UI only. */
function ranges(text: string, keyword: string): Array<[number, number]> {
  const query = keyword.trim().normalize("NFC").toLowerCase();
  if (!query) return [];
  let normalized = "";
  const starts: number[] = [];
  const ends: number[] = [];
  for (const { segment, index } of new Intl.Segmenter("zh-CN", { granularity: "grapheme" }).segment(text)) {
    const part = segment.normalize("NFC").toLowerCase();
    normalized += part;
    for (let offset = 0; offset < part.length; offset++) { starts.push(index); ends.push(index + segment.length); }
  }
  const found: Array<[number, number]> = [];
  let position = normalized.indexOf(query);
  while (position >= 0) {
    const start = starts[position];
    const end = ends[position + query.length - 1];
    const previous = found.at(-1);
    if (previous && start <= previous[1]) previous[1] = end;
    else found.push([start, end]);
    position = normalized.indexOf(query, position + query.length);
  }
  return found;
}

export function HighlightedText({ text, keyword = "" }: { text: string; keyword?: string }) {
  const matches = ranges(text, keyword);
  if (!matches.length) return text;
  const pieces: ReactNode[] = [];
  let offset = 0;
  for (const [start, end] of matches) {
    pieces.push(text.slice(offset, start), <mark key={start}>{text.slice(start, end)}</mark>);
    offset = end;
  }
  pieces.push(text.slice(offset));
  return <>{pieces}</>;
}

export function searchExcerpt(text: string, keyword: string): string {
  const match = ranges(text, keyword)[0];
  if (!match) return text.length > 180 ? `${text.slice(0, 180)}…` : text;
  const characters = Array.from(text);
  const index = Array.from(text.slice(0, match[0])).length;
  const start = Math.max(0, index - 40);
  const end = Math.min(characters.length, Math.max(start + 180, index + Array.from(text.slice(match[0], match[1])).length));
  return `${start ? "…" : ""}${characters.slice(start, end).join("")}${end < characters.length ? "…" : ""}`;
}
