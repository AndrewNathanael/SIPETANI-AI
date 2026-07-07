"use client";

import { useRef, useEffect } from "react";

interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Detection {
  class_id: number;
  label: string;
  confidence: number;
  bbox: BBox;
  severity: string;
  treatment: string;
}

interface ResultOverlayProps {
  imageUrl: string;
  detections: Detection[];
  imageWidth: number;
  imageHeight: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  none:   "#22c55e",
  low:    "#86efac",
  medium: "#eab308",
  high:   "#ef4444",
};

export default function ResultOverlay({
  imageUrl,
  detections,
  imageWidth,
  imageHeight,
}: ResultOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef    = useRef<HTMLImageElement>(null);

  const drawBoxes = () => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img) return;

    const displayW = img.clientWidth;
    const displayH = img.clientHeight;
    canvas.width   = displayW;
    canvas.height  = displayH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, displayW, displayH);

    // ── Letterbox fix: hitung area gambar nyata di dalam container ──
    // objectFit: "contain" akan menambahkan padding (letterbox) di kiri/kanan ATAU atas/bawah
    // tergantung aspect ratio gambar vs container
    const containerAspect = displayW / displayH;
    const imageAspect     = imageWidth / imageHeight;

    let renderedW: number;
    let renderedH: number;
    let offsetX: number;
    let offsetY: number;

    if (imageAspect > containerAspect) {
      // Gambar lebih lebar → fit width, ada padding di atas/bawah (pillarbox vertikal)
      renderedW = displayW;
      renderedH = displayW / imageAspect;
      offsetX   = 0;
      offsetY   = (displayH - renderedH) / 2;
    } else {
      // Gambar lebih tinggi → fit height, ada padding di kiri/kanan (pillarbox horizontal)
      renderedH = displayH;
      renderedW = displayH * imageAspect;
      offsetX   = (displayW - renderedW) / 2;
      offsetY   = 0;
    }

    const scaleX = renderedW / imageWidth;
    const scaleY = renderedH / imageHeight;

    detections.forEach((det) => {
      const { x, y, w, h } = det.bbox;
      // bbox dari backend adalah normalized (0–1) relatif ke ukuran gambar asli
      const rx = offsetX + x * imageWidth  * scaleX;
      const ry = offsetY + y * imageHeight * scaleY;
      const rw = w * imageWidth  * scaleX;
      const rh = h * imageHeight * scaleY;

      const color = SEVERITY_COLORS[det.severity] ?? "#ef4444";

      // Glow effect
      ctx.shadowColor   = color;
      ctx.shadowBlur    = 12;
      ctx.strokeStyle   = color;
      ctx.lineWidth     = 2.5;
      ctx.strokeRect(rx, ry, rw, rh);

      // Corner accent lines
      ctx.shadowBlur = 0;
      const corner = 12;
      ctx.lineWidth = 4;
      const corners = [
        [rx, ry,            rx + corner, ry,          rx, ry + corner],
        [rx + rw - corner, ry,          rx + rw, ry,  rx + rw, ry + corner],
        [rx, ry + rh - corner, rx, ry + rh,           rx + corner, ry + rh],
        [rx + rw - corner, ry + rh, rx + rw, ry + rh, rx + rw, ry + rh - corner],
      ] as const;

      corners.forEach(([x1, y1, x2, y2, x3, y3]) => {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.stroke();
      });

      // Label background
      const label = `${det.label}  ${(det.confidence * 100).toFixed(1)}%`;
      ctx.font = "bold 13px Inter, sans-serif";
      const textW = ctx.measureText(label).width;
      const labelH = 26;
      const labelY = ry > labelH + 4 ? ry - labelH - 4 : ry + 4;

      // Semi-transparent colored background
      ctx.fillStyle = color + "cc"; // cc = 80% opacity
      ctx.beginPath();
      const lx = rx;
      const ly = labelY;
      const lr = 5;
      ctx.moveTo(lx + lr, ly);
      ctx.lineTo(lx + textW + 14, ly);
      ctx.lineTo(lx + textW + 14, ly + labelH);
      ctx.lineTo(lx, ly + labelH);
      ctx.lineTo(lx, ly + lr);
      ctx.arcTo(lx, ly, lx + lr, ly, lr);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 3;
      ctx.fillText(label, lx + 7, ly + 17);
      ctx.shadowBlur = 0;
    });
  };

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete) {
      drawBoxes();
    } else {
      img.onload = drawBoxes;
    }
    window.addEventListener("resize", drawBoxes);
    return () => window.removeEventListener("resize", drawBoxes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detections, imageUrl]);

  return (
    <div className="preview-wrapper">
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Analyzed leaf"
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      />
      <canvas ref={canvasRef} className="preview-canvas" />
    </div>
  );
}
