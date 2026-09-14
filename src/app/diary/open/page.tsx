import { Suspense } from "react";

import { OpenDiaryPage } from "./open-diary-page";

export default function Page() {
  return (
    <Suspense>
      <OpenDiaryPage />
    </Suspense>
  );
}