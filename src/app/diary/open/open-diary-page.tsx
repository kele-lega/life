"use client";

import { useSearchParams } from "next/navigation";

import { PageEntrance } from "@/components/ui/page-entrance";
import { DiaryDetail } from "@/features/diary/components/diary-detail";

export function OpenDiaryPage() {
  const id = useSearchParams().get("id")?.trim() ?? "";
  return <PageEntrance><DiaryDetail id={id} /></PageEntrance>;
}