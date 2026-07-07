"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { RotateCcw, X, Camera, RefreshCw, Lock, MonitorOff, Zap } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (file: File) => void;
}

function isSecureContext(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState("");
  const [errorType, setErrorType] = useState<"permission" | "notfound" | "https" | "generic">("generic");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [isCapturing, setIsCapturing] = useState(false);
  const [flash, setFlash] = useState(false);

  const startCamera = useCallback(async (mode: "user" | "environment") => {
    if (!isSecureContext()) {
      setError("Kamera memerlukan HTTPS atau localhost.");
      setErrorType("https"); setIsActive(false); return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Browser tidak mendukung kamera.\nGunakan Chrome atau Safari.");
      setErrorType("generic"); setIsActive(false); return;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setError(""); setIsActive(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setIsActive(true);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      const msg = err instanceof Error ? err.message : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError("Akses kamera ditolak.\nBuka Pengaturan Browser → Izin → Kamera → Izinkan.");
        setErrorType("permission");
      } else if (name === "NotFoundError") {
        setError("Kamera tidak ditemukan di perangkat ini.");
        setErrorType("notfound");
      } else if (name === "OverconstrainedError") {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          streamRef.current = stream;
          if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
          setIsActive(true); return;
        } catch { setError("Tidak bisa akses kamera."); setErrorType("generic"); }
      } else {
        setError(`Gagal akses kamera: ${msg || name || "Unknown"}`);
        setErrorType("generic");
      }
      setIsActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setIsActive(false);
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flipCamera = () => {
    const m = facingMode === "environment" ? "user" : "environment";
    setFacingMode(m);
    startCamera(m);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !isActive) return;
    setIsCapturing(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 300);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setIsCapturing(false); return; }
    if (facingMode === "user") { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (blob) { onCapture(new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" })); stopCamera(); }
      setIsCapturing(false);
    }, "image/jpeg", 0.92);
  };

  // Error state
  if (error) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 12, padding: "24px 16px", textAlign: "center",
        background: "rgba(0,0,0,0.4)", borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.06)", minHeight: 200,
      }}>
        {errorType === "permission" ? <Lock size={28} style={{ color: "var(--col-amber)" }} /> :
         errorType === "notfound"   ? <MonitorOff size={28} style={{ color: "var(--col-text-3)" }} /> :
                                       <Camera size={28} style={{ color: "var(--col-text-3)" }} />}
        <p style={{
          fontSize: 12, color: "var(--col-text-2)", whiteSpace: "pre-line",
          lineHeight: 1.6, maxWidth: 220
        }}>{error}</p>
        {errorType !== "https" && (
          <button
            onClick={() => startCamera(facingMode)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
              background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.18)",
              borderRadius: 8, color: "var(--col-accent)", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "var(--font-body)",
            }}
          >
            <RefreshCw size={12} /> Coba Lagi
          </button>
        )}
        {errorType === "https" && (
          <p style={{ fontSize: 11, color: "var(--col-text-4)", maxWidth: 200 }}>
            Gunakan fitur Upload File sebagai alternatif.
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Camera viewport */}
      <div style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16/9",
        background: "#000",
        borderRadius: 12,
        overflow: "hidden",
        border: `1px solid ${isActive ? "rgba(74,222,128,0.25)" : "rgba(255,255,255,0.06)"}`,
        boxShadow: isActive ? "0 0 30px rgba(74,222,128,0.08)" : "none",
        transition: "border-color 0.3s, box-shadow 0.3s",
      }}>
        {/* Video element */}
        <video
          ref={videoRef}
          playsInline muted autoPlay
          style={{
            width: "100%", height: "100%",
            objectFit: "cover", display: "block",
            transform: facingMode === "user" ? "scaleX(-1)" : "none",
          }}
        />

        {/* Loading overlay */}
        {!isActive && !error && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 10, background: "rgba(3,11,6,0.8)",
          }}>
            <div className="spin" style={{ width: 24, height: 24, borderWidth: 2 }} />
            <span style={{ fontSize: 12, color: "var(--col-text-3)", fontFamily: "var(--font-mono)" }}>
              Memulai kamera...
            </span>
          </div>
        )}

        {/* Flash effect */}
        {flash && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(255,255,255,0.85)",
            pointerEvents: "none",
            animation: "flashFade 0.3s ease-out forwards",
          }} />
        )}

        {/* HUD corners when active */}
        {isActive && (
          <>
            {/* Top-left */}
            <div style={{ position: "absolute", top: 10, left: 10, width: 18, height: 18,
              borderTop: "2px solid rgba(74,222,128,0.7)", borderLeft: "2px solid rgba(74,222,128,0.7)",
              borderRadius: "3px 0 0 0" }} />
            {/* Top-right */}
            <div style={{ position: "absolute", top: 10, right: 10, width: 18, height: 18,
              borderTop: "2px solid rgba(74,222,128,0.7)", borderRight: "2px solid rgba(74,222,128,0.7)",
              borderRadius: "0 3px 0 0" }} />
            {/* Bottom-left */}
            <div style={{ position: "absolute", bottom: 10, left: 10, width: 18, height: 18,
              borderBottom: "2px solid rgba(74,222,128,0.7)", borderLeft: "2px solid rgba(74,222,128,0.7)",
              borderRadius: "0 0 0 3px" }} />
            {/* Bottom-right */}
            <div style={{ position: "absolute", bottom: 10, right: 10, width: 18, height: 18,
              borderBottom: "2px solid rgba(74,222,128,0.7)", borderRight: "2px solid rgba(74,222,128,0.7)",
              borderRadius: "0 0 3px 0" }} />
            {/* Center crosshair */}
            <div style={{
              position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              width: 28, height: 28,
              border: "1px solid rgba(74,222,128,0.35)",
              borderRadius: "50%",
            }} />
            {/* LIVE badge */}
            <div style={{
              position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
              background: "rgba(239,68,68,0.85)", color: "#fff",
              padding: "2px 8px", borderRadius: 4,
              fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
              fontFamily: "var(--font-mono)",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <div style={{ width: 5, height: 5, background: "#fff", borderRadius: "50%",
                animation: "flashFade 1s ease-in-out infinite alternate" }} />
              LIVE
            </div>
          </>
        )}
      </div>

      {/* Controls */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      }}>
        {/* Flip button */}
        <button
          onClick={flipCamera}
          title="Ganti kamera"
          style={{
            width: 38, height: 38, borderRadius: "50%",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "var(--col-text-3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "all 0.2s",
            flexShrink: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(74,222,128,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--col-accent)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(74,222,128,0.2)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--col-text-3)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)"; }}
        >
          <RotateCcw size={15} />
        </button>

        {/* Capture button */}
        <button
          id="btn-capture"
          onClick={capturePhoto}
          disabled={!isActive || isCapturing}
          title="Ambil foto"
          style={{
            width: 56, height: 56, borderRadius: "50%",
            background: isActive ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.03)",
            border: `2.5px solid ${isActive ? "rgba(74,222,128,0.50)" : "rgba(255,255,255,0.08)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: isActive ? "pointer" : "not-allowed",
            transition: "all 0.2s",
            boxShadow: isActive ? "0 0 20px rgba(74,222,128,0.15)" : "none",
            flexShrink: 0,
          }}
        >
          {isCapturing ? (
            <div className="spin" style={{ width: 18, height: 18, borderWidth: 2 }} />
          ) : (
            <div style={{
              width: 22, height: 22, borderRadius: "50%",
              background: isActive ? "var(--col-accent)" : "rgba(255,255,255,0.15)",
              transition: "all 0.2s",
            }} />
          )}
        </button>

        {/* Stop button */}
        <button
          onClick={stopCamera}
          title="Matikan kamera"
          style={{
            width: 38, height: 38, borderRadius: "50%",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "var(--col-text-3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "all 0.2s",
            flexShrink: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,113,113,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--col-red)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(248,113,113,0.2)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--col-text-3)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)"; }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Hint */}
      <p style={{
        textAlign: "center", fontSize: 10.5,
        color: "var(--col-text-4)", fontFamily: "var(--font-mono)",
        letterSpacing: "0.04em",
      }}>
        Arahkan ke daun · tekan tombol untuk foto
      </p>

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}
