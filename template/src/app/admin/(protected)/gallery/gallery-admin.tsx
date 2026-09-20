"use client";

import { useRef, useState, useTransition } from "react";
import { addGalleryImage, deleteGalleryImage } from "../content-actions";
import { dishImageUrl } from "@/lib/assets";
import type { GalleryImage } from "@/generated/prisma/client";

export function GalleryAdmin({ images }: { images: GalleryImage[] }) {
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {images.map((img) => (
          <div key={img.id} className="relative group">
            <div className="relative aspect-square rounded-[var(--radius)] overflow-hidden bg-foreground/5">
              <img src={dishImageUrl(img.image, "sm")} alt={img.alt} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
            </div>
            <button
              disabled={pending}
              onClick={() => startTransition(() => deleteGalleryImage(img.id))}
              className="absolute top-2 right-2 min-w-11 min-h-11 rounded-full bg-black/60 text-white"
              aria-label="Удалить"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setUploading(true);
          try {
            const name = `gal-${Date.now().toString(36)}`;
            const fd = new FormData();
            fd.append("file", file);
            fd.append("section", "gallery");
            fd.append("name", name);
            const response = await fetch("/api/admin/upload", { method: "POST", body: fd });
            const data = await response.json();
            if (response.ok) {
              startTransition(() => addGalleryImage(data.path, file.name));
            }
          } finally {
            setUploading(false);
          }
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="mt-4 min-h-11 px-5 rounded-full bg-accent text-white text-sm font-medium disabled:opacity-50"
      >
        {uploading ? "Загружаю…" : "+ Фото"}
      </button>
    </div>
  );
}
