import { DiaryDetail } from "@/features/diary/components/diary-detail";

export default async function DiaryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DiaryDetail id={id} />;
}
