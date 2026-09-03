import { DiaryDetail } from "@/features/diary/components/diary-detail";
import { PageEntrance } from "@/components/ui/page-entrance";

export default async function DiaryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PageEntrance><DiaryDetail id={id} /></PageEntrance>;
}
