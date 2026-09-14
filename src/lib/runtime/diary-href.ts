import { isNativeWebBuild } from "./platform";

export function diaryHref(id: string, native = isNativeWebBuild()): string {
  return native ? `/diary/open/?id=${encodeURIComponent(id)}` : `/diary/${id}`;
}

export function diaryListHref(): string {
  return "/diary";
}