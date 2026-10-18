"use client";

import { useEffect, useRef, useState } from "react";

/** The same empty/error state in the menu, dish detail and cart. */
export function DishImage({
  src,
  alt,
  className = "",
  imageClassName = "",
  loading = "lazy",
}: {
  src: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  loading?: "eager" | "lazy";
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  // A server-rendered image may fail before React attaches the error listener.
  useEffect(() => {
    if (image.current?.complete && image.current.naturalWidth === 0) setFailedSource(src);
  }, [src]);
  if (src.trim() && failedSource !== src) {
    return <img ref={image} src={src} alt={alt} loading={loading} decoding="async" className={`${className} ${imageClassName}`} onError={() => setFailedSource(src)} />;
  }

  return (
    <span role="img" aria-label="Фото отсутствует" className={`${className} flex flex-col items-center justify-center gap-1 text-muted`}>
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m3 17 5-5 4 4 3-3 6 6" />
      </svg>
      <span aria-hidden="true" className="text-[10px] leading-tight">Без фото</span>
    </span>
  );
}
