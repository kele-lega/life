import type { Attachment } from "@/features/attachment/model/types";
import type { Diary } from "@/features/diary/model/types";
import type { Moment, MomentAppend } from "@/features/moment/model/types";

export interface TimelineImage extends Attachment {
  url?: string;
}

export interface TimelineChildErrors {
  appends: boolean;
  attachments: boolean;
}

export type TimelineItem =
  | {
      type: "moment";
      id: string;
      createdAt: string;
      moment: Moment;
      appends: MomentAppend[];
      attachments: TimelineImage[];
      errors: TimelineChildErrors;
    }
  | {
      type: "diary";
      id: string;
      createdAt: string;
      diary: Diary;
    };

export interface TimelineSourceCursor {
  createdAt: string;
  id: string;
}

export interface TimelineCursor {
  moments: TimelineSourceCursor | null;
  diaries: TimelineSourceCursor | null;
}

export interface TimelinePage {
  items: TimelineItem[];
  nextCursor: TimelineCursor | null;
  hasMore: boolean;
}
