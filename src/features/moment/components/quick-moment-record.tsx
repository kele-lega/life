"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImageIcon, Pencil2Icon, PlusIcon } from "@radix-ui/react-icons";
import { StatefulButton, type StatefulButtonResult } from "@/components/ui/stateful-button";
import { Reveal } from "@/components/ui/reveal";
import { WritingTextarea } from "@/components/ui/writing-textarea";
import { RecordImage } from "@/components/ui/record-image";

import type { LocationMetadata, Moment } from "@/features/moment/model/types";
import { createMomentWithAttachments } from "@/features/moment/repository/moment-repository";

import { resolveLocation } from "../location/location-provider";

interface QuickMomentRecordProps {
  onSaved?: (moment: Moment) => void;
}

interface PendingImage {
  file: File;
  previewUrl: string;
}

export function QuickMomentRecord({ onSaved }: QuickMomentRecordProps) {
  const inputId = useId();
  const [isRecording, setIsRecording] = useState(false);
  const [text, setText] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationMetadata>({
    city: null,
    placeName: null,
    latitude: null,
    longitude: null,
  });
  const [isLocating, setIsLocating] = useState(false);
  const [isEditingPlace, setIsEditingPlace] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImagesRef = useRef<PendingImage[]>([]);
  const locationAttemptedRef = useRef(false);
  const locationRequestRef = useRef(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (isRecording) textareaRef.current?.focus({ preventScroll: true });
    if (!isRecording && restoreFocusRef.current) {
      triggerRef.current?.focus({ preventScroll: true });
      restoreFocusRef.current = false;
    }
  }, [isRecording]);

  useEffect(() => {
    pendingImagesRef.current = pendingImages;
  }, [pendingImages]);

  useEffect(() => () => {
    pendingImagesRef.current.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
  }, []);

  function clearPendingImages(): void {
    pendingImagesRef.current.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
    pendingImagesRef.current = [];
    setPendingImages([]);
  }

  function beginRecording(): void {
    setError(null);
    setIsRecording(true);
    if (locationAttemptedRef.current) return;
    locationAttemptedRef.current = true;
    const requestId = ++locationRequestRef.current;
    setIsLocating(true);
    void resolveLocation().then((resolved) => {
      if (requestId !== locationRequestRef.current) return;
      setLocation((current) => ({ ...resolved, placeName: current.placeName }));
    }).finally(() => {
      if (requestId === locationRequestRef.current) setIsLocating(false);
    });
  }

  function cancelRecording(): void {
    if (isSaving) return;
    const hasUnsavedContent = text.trim().length > 0 || pendingImages.length > 0;
    if (hasUnsavedContent && !window.confirm("放弃这条尚未保存的记录？")) return;
    setText("");
    clearPendingImages();
    setLocation({ city: null, placeName: null, latitude: null, longitude: null });
    setIsEditingPlace(false);
    setError(null);
    restoreFocusRef.current = true;
    setIsRecording(false);
    locationAttemptedRef.current = false;
    locationRequestRef.current += 1;
  }

  function chooseImages(): void {
    fileInputRef.current?.click();
  }

  function handleImagesSelected(event: React.ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const images = files.filter((file) => file.type.startsWith("image/"));
    const rejectedCount = files.length - images.length;
    if (rejectedCount > 0) setError("只有图片文件可以添加。");
    if (images.length === 0) return;
    const next = images.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    setPendingImages((current) => [...current, ...next]);
  }

  function removeImage(previewUrl: string): void {
    URL.revokeObjectURL(previewUrl);
    setPendingImages((current) => current.filter((image) => image.previewUrl !== previewUrl));
  }

  async function saveRecording(): Promise<StatefulButtonResult> {
    if (isSaving) return false;
    if (text.trim().length === 0) {
      setError("请输入文字后再保存。");
      return false;
    }
    setError(null);
    setIsSaving(true);
    try {
      const moment = await createMomentWithAttachments({
        originalText: text,
        location: {
          ...location,
          placeName: location.placeName?.length ? location.placeName : null,
        },
        attachments: pendingImages.map(({ file }) => ({
          blob: file,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
        })),
      });
      locationRequestRef.current += 1;
      setIsLocating(false);
      onSaved?.(moment);
      return () => {
        clearPendingImages();
        setText("");
        setLocation({ city: null, placeName: null, latitude: null, longitude: null });
        setIsEditingPlace(false);
        restoreFocusRef.current = true;
        setIsRecording(false);
        locationAttemptedRef.current = false;
        setIsSaving(false);
      };
    } catch {
      setError("保存失败，请重试。文字和已选图片仍然保留。");
      setIsSaving(false);
      return false;
    }
  }

  return (
    <section className="quick-record" data-recording={isRecording}>
      {isRecording ? (
        <h2 className="record-heading"><label htmlFor={inputId}>写点什么</label><Pencil2Icon className="invite-icon" aria-hidden="true" /></h2>
      ) : (
        <button ref={triggerRef} className="write-button" type="button" onClick={beginRecording} aria-expanded={false}>
          <span className="write-label">写点什么</span><PlusIcon className="invite-icon" aria-hidden="true" />
        </button>
      )}
      <Reveal open={isRecording}>
      <div className="record-panel" aria-label="快速记录" aria-busy={isSaving}>
        <WritingTextarea ref={textareaRef} id={inputId} aria-label="记录内容" aria-invalid={!!error} aria-describedby={error ? `${inputId}-error` : undefined} autoFocus disabled={isSaving} onChange={(event) => setText(event.target.value)} placeholder="今天突然想到……" value={text} />
        <div className="record-tools">
          <div className="location-field">
          <span aria-live="polite">{isLocating ? "正在获取位置" : location.city ?? ""}</span>
          {isEditingPlace ? (
            <label>
              具体地点
              <input aria-label="具体地点" disabled={isSaving} onChange={(event) => setLocation((current) => ({ ...current, placeName: event.target.value }))} placeholder="例如：公司、咖啡馆" value={location.placeName ?? ""} />
            </label>
          ) : (
            <button disabled={isSaving} type="button" onClick={() => setIsEditingPlace(true)}>添加具体地点</button>
          )}
          </div>
          <input ref={fileInputRef} accept="image/*" aria-label="选择图片" hidden multiple type="file" onChange={handleImagesSelected} />
          <button className="image-trigger" disabled={isSaving} type="button" onClick={chooseImages}><ImageIcon className="ui-icon" aria-hidden="true" />添加图片</button>
        </div>
        {pendingImages.length > 0 ? (
          <div className="image-previews" aria-label="待保存图片">
            {pendingImages.map(({ file, previewUrl }) => (
              <div className="image-preview" key={previewUrl}>
                <RecordImage alt={file.name} src={previewUrl} width={96} height={96} />
                <button aria-label={`移除 ${file.name}`} disabled={isSaving} type="button" onClick={() => removeImage(previewUrl)}>移除</button>
              </div>
            ))}
          </div>
        ) : null}
        {error ? <p id={`${inputId}-error`} role="alert">{error}</p> : null}
        <div className="record-actions">
          <button disabled={isSaving} type="button" onClick={cancelRecording}>取消</button>
          <StatefulButton disabled={isSaving} label="保存" onAction={saveRecording} />
        </div>
      </div>
      </Reveal>
    </section>
  );
}
