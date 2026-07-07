from pydantic import BaseModel
from typing import List, Optional


class BoundingBox(BaseModel):
    x: float
    y: float
    w: float
    h: float


class DetectionResult(BaseModel):
    class_id: int
    label: str
    confidence: float
    bbox: BoundingBox
    severity: str        # "none" | "low" | "medium" | "high"
    treatment: str       # rekomendasi penanganan


class DetectResponse(BaseModel):
    success: bool = True
    image_width: int
    image_height: int
    detections: List[DetectionResult]
    message: Optional[str] = None
    model_info: Optional[str] = None    # info model yang digunakan
    class_count: Optional[int] = None  # jumlah kelas yang dikenali
    validation_error: Optional[str] = None   # pesan error jika gambar ditolak sepenuhnya
    validation_warning: Optional[str] = None # peringatan lunak (gambar tetap diproses)
