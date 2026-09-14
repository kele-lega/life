import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("id=diary-open"),
}));

vi.mock("@/features/diary/components/diary-detail", () => ({
  DiaryDetail: ({ id }: { id: string }) => <div>open-diary:{id}</div>,
}));

vi.mock("@/components/ui/page-entrance", () => ({
  PageEntrance: ({ children }: { children: import("react").ReactNode }) => children,
}));

import { OpenDiaryPage } from "./open-diary-page";

describe("OpenDiaryPage", () => {
  it("reads the native query id without changing DiaryDetail", () => {
    render(<OpenDiaryPage />);
    expect(screen.getByText("open-diary:diary-open")).toBeInTheDocument();
  });
});