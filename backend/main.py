import io
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, File, Query, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from model import SIPETANIModel, CUSTOM_MODEL_PATH, DEFAULT_CONF, DEFAULT_IOU, validate_leaf_image
from schemas import DetectResponse

# ─── Global model instance ────────────────────────────────────────────────────
detector: Optional[SIPETANIModel] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup, release on shutdown."""
    global detector
    detector = SIPETANIModel()
    detector.load()
    yield
    detector = None


# ─── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="SIPETANI — AI Plant Disease Detection API",
    description="YOLOv8-powered backend for detecting plant diseases and pests from leaf images.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",  # fallback jika port 3001 juga sudah terpakai
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Endpoints ────────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health_check():
    model_type = "Custom Plant Disease" if CUSTOM_MODEL_PATH.exists() else "Default (yolov8n)"
    return {
        "status": "ok",
        "model": model_type,
        "service": "SIPETANI",
        "version": "2.0.0",
        "conf_default": DEFAULT_CONF,
        "iou_default": DEFAULT_IOU,
    }


@app.post("/api/detect", response_model=DetectResponse, tags=["Detection"])
async def detect_disease(
    file: UploadFile = File(...),
    conf: float = Query(
        default=DEFAULT_CONF,
        ge=0.1,
        le=0.95,
        description="Confidence threshold (0.1–0.95). Nilai lebih tinggi = lebih presisi, lebih sedikit deteksi.",
    ),
    iou: float = Query(
        default=DEFAULT_IOU,
        ge=0.1,
        le=0.95,
        description="IoU threshold untuk Non-Max Suppression (0.1–0.95).",
    ),
):
    """
    Receive a leaf image via Multipart Form Data,
    run YOLOv8 inference, and return structured JSON results.

    Query params:
    - **conf**: Confidence threshold (default 0.45). Turunkan untuk lebih sensitif, naikkan untuk lebih presisi.
    - **iou**: IoU threshold NMS (default 0.55). Turunkan untuk lebih banyak box, naikkan untuk lebih sedikit.
    """
    # Validate file type
    content_type = file.content_type or ""
    if content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type: '{content_type}'. Use JPEG, PNG, or WebP.",
        )

    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {str(e)}")

    if detector is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet. Try again shortly.")

    # ── Validasi gambar daun ──
    # Jika gambar bukan daun, langsung kosongkan deteksi agar tidak ada false positive.
    # Model tetap dijalankan, namun hasilnya diabaikan jika gambar tidak valid.
    is_valid, validation_reason = validate_leaf_image(image)
    validation_warning: str | None = None
    if not is_valid:
        validation_warning = validation_reason

    try:
        response = detector.predict(image, conf_threshold=conf, iou_threshold=iou)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

    # ── Jika gambar bukan daun, hapus semua deteksi (cegah false positive) ──
    if not is_valid:
        response.detections = []

    msg = (
        f"{len(response.detections)} penyakit/kondisi terdeteksi."
        if response.detections
        else "Tidak ada penyakit atau hama terdeteksi. Tanaman tampak sehat."
    )
    response.message = msg
    response.validation_warning = validation_warning
    return response
