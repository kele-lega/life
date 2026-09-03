"use client";

import { useState, type ComponentProps } from "react";

export function RecordImage(props: ComponentProps<"img">) {
  return <ImageContent key={typeof props.src === "string" ? props.src : undefined} {...props} />;
}

function ImageContent({ alt, className = "", onLoad, onError, ...props }: ComponentProps<"img">) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  if (state === "error") return <span className="ui-photo-error" role="img" aria-label={`${alt ?? "图片"}，暂时无法显示`}>图片暂时无法显示</span>;
  // IndexedDB Blob URLs must not go through server image optimization.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={alt} className={`ui-photo ${className}`} data-loaded={state === "loaded"} decoding="async" onLoad={(event) => { setState("loaded"); onLoad?.(event); }} onError={(event) => { setState("error"); onError?.(event); }} />;
}
