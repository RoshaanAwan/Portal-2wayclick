"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ZoomIn, RotateCcw, Move } from "lucide-react";
import { Button } from "@/components/ui/Button";

// ── Image adjust modal ──────────────────────────────────────────────────────
// Lightweight, dependency-free crop/zoom/reposition step shown after the user
// picks an image and before it's uploaded. The user drags to reposition and
// uses the slider to zoom; we render the visible region to an off-screen canvas
// and hand back a File so the rest of the upload flow is unchanged.
//
//   • `aspect` is width / height of the crop frame (1 = square avatar, 4 = banner).
//   • `round`  draws a circular preview mask (for avatars) — purely cosmetic;
//              the produced file is still a rectangle the same shape as `aspect`.
//   • `output` caps the longest exported edge so we don't ship a 4000px upload.

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export function ImageAdjustModal({
  open,
  file,
  aspect,
  round = false,
  output = 1024,
  title = "Adjust image",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  file: File | null;
  aspect: number;
  round?: boolean;
  output?: number;
  title?: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  // The loaded source image, plus the live transform (zoom + pan offset in px
  // relative to the centered, cover-fitted base image).
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // Load the picked file into an HTMLImageElement when the modal opens.
  useEffect(() => {
    if (!open || !file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setImg(image);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [open, file]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  // The "cover" base scale: the smallest scale that fills the frame at zoom 1.
  // Everything (pan clamping, export) is derived from this.
  const baseScale = useCallback(
    (frameW: number, frameH: number) => {
      if (!img) return 1;
      return Math.max(frameW / img.width, frameH / img.height);
    },
    [img],
  );

  // Keep the pan within bounds so the frame can never show empty edges.
  const clamp = useCallback(
    (next: { x: number; y: number }, z: number) => {
      const frame = frameRef.current;
      if (!frame || !img) return next;
      const fw = frame.clientWidth;
      const fh = frame.clientHeight;
      const scale = baseScale(fw, fh) * z;
      const maxX = Math.max(0, (img.width * scale - fw) / 2);
      const maxY = Math.max(0, (img.height * scale - fh) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, next.x)),
        y: Math.min(maxY, Math.max(-maxY, next.y)),
      };
    },
    [img, baseScale],
  );

  // Re-clamp the offset whenever zoom changes (zooming out can push it out of bounds).
  useEffect(() => {
    setOffset((o) => clamp(o, zoom));
  }, [zoom, clamp]);

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    setOffset(clamp({ x: drag.current.ox + dx, y: drag.current.oy + dy }, zoom));
  }
  function onPointerUp() {
    drag.current = null;
  }

  // Render the visible crop region to a canvas and export as a File.
  function exportFile(): Promise<File | null> {
    return new Promise((resolve) => {
      const frame = frameRef.current;
      if (!frame || !img || !file) return resolve(null);
      const fw = frame.clientWidth;
      const fh = frame.clientHeight;
      const scale = baseScale(fw, fh) * zoom;

      // Map the frame's top-left corner back into source-image pixel space.
      const sx = (img.width * scale - fw) / 2 - offset.x;
      const sy = (img.height * scale - fh) / 2 - offset.y;

      // Export dimensions: cap the longest edge at `output`, preserving aspect.
      const outW = aspect >= 1 ? output : Math.round(output * aspect);
      const outH = aspect >= 1 ? Math.round(output / aspect) : output;

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        img,
        sx / scale,
        sy / scale,
        fw / scale,
        fh / scale,
        0,
        0,
        outW,
        outH,
      );

      // PNG keeps transparency (e.g. logos); everything else exports as JPEG.
      const isPng = file.type === "image/png";
      const mime = isPng ? "image/png" : "image/jpeg";
      const ext = isPng ? "png" : "jpg";
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(null);
          const base = file.name.replace(/\.[^.]+$/, "") || "image";
          resolve(new File([blob], `${base}.${ext}`, { type: mime }));
        },
        mime,
        0.92,
      );
    });
  }

  async function handleConfirm() {
    const out = await exportFile();
    if (out) onConfirm(out);
  }

  // Live image transform for the preview.
  const previewStyle = (() => {
    const frame = frameRef.current;
    if (!frame || !img) return undefined;
    const scale = baseScale(frame.clientWidth, frame.clientHeight) * zoom;
    return {
      width: img.width * scale,
      height: img.height * scale,
      transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
    } as React.CSSProperties;
  })();

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onCancel}
          />

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="glass-strong relative z-10 w-full max-w-lg rounded-2xl p-5 sm:p-6"
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-ink">{title}</h2>
              <button
                type="button"
                onClick={onCancel}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition hover:bg-surface-2 hover:text-ink"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Crop frame — drag to reposition. */}
            <div
              ref={frameRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="relative mx-auto w-full max-w-md cursor-grab touch-none select-none overflow-hidden rounded-xl bg-black/40 active:cursor-grabbing"
              style={{ aspectRatio: String(aspect) }}
            >
              {img && previewStyle && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                  style={previewStyle}
                />
              )}
              {/* Circular mask + grid overlay to guide the crop. */}
              {round ? (
                <div className="pointer-events-none absolute inset-0 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)_inset]">
                  <div className="absolute inset-2 rounded-full ring-2 ring-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                </div>
              ) : (
                <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/20" />
              )}
              {!img && (
                <div className="absolute inset-0 grid place-items-center text-sm text-white/70">
                  Loading…
                </div>
              )}
            </div>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-400">
              <Move className="h-3.5 w-3.5" />
              Drag to reposition · use the slider to zoom
            </p>

            {/* Zoom slider. */}
            <div className="mt-3 flex items-center gap-3">
              <ZoomIn className="h-4 w-4 shrink-0 text-ink-400" />
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-[var(--accent)]"
                aria-label="Zoom"
              />
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setOffset({ x: 0, y: 0 });
                }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-400 transition hover:bg-surface-2 hover:text-ink"
                aria-label="Reset"
                title="Reset"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={!img}>
                Apply
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
