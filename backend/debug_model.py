"""
Debug script: cek apa yang model BENAR-BENAR prediksi untuk gambar singkong
Jalankan: python debug_model.py <path_ke_gambar>
"""
import sys
import json
from pathlib import Path
from ultralytics import YOLO

MODEL_PATH = Path(__file__).parent / "model_sipetani.pt"

def debug_predict(image_path: str):
    print(f"\n{'='*60}")
    print(f"  DEBUG MODEL SIPETANI")
    print(f"{'='*60}")
    print(f"  Model : {MODEL_PATH}")
    print(f"  Gambar: {image_path}")
    print()

    model = YOLO(str(MODEL_PATH))
    
    # Tampilkan semua nama kelas yang dikenali model
    print(f"[INFO] Kelas yang dikenali model ({len(model.names)} kelas):")
    for idx, name in model.names.items():
        print(f"       [{idx:2d}] {name}")
    print()

    # Coba berbagai threshold confidence
    for conf in [0.01, 0.05, 0.10, 0.20, 0.30, 0.45]:
        results = model.predict(
            source=image_path,
            conf=conf,
            iou=0.45,
            imgsz=640,
            verbose=False,
        )
        
        detections = []
        for result in results:
            if result.boxes is None:
                continue
            boxes = result.boxes
            for i in range(len(boxes)):
                cls_id = int(boxes.cls[i].cpu().numpy())
                det_conf = float(boxes.conf[i].cpu().numpy())
                name = result.names.get(cls_id, f"class_{cls_id}")
                x1, y1, x2, y2 = boxes.xyxy[i].cpu().numpy()
                detections.append({
                    "class_id": cls_id,
                    "name": name,
                    "confidence": round(det_conf, 4),
                    "bbox": [round(x1,1), round(y1,1), round(x2,1), round(y2,1)]
                })
        
        print(f"  conf={conf:.2f} → {len(detections)} deteksi")
        for d in detections[:5]:  # tampilkan max 5
            print(f"           [{d['class_id']:2d}] {d['name']:<40} conf={d['confidence']:.4f}")
        if not detections:
            print(f"           (tidak ada deteksi)")

    print()
    print("="*60)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        # Coba pakai gambar dari dataset singkong
        sample_dirs = [
            Path(__file__).parent.parent / "training" / "dataset" / "singkong_disease" / "valid" / "images",
            Path(__file__).parent.parent / "training" / "dataset" / "singkong_disease" / "test" / "images",
            Path(__file__).parent.parent / "training" / "dataset" / "singkong_disease" / "train" / "images",
        ]
        img_path = None
        for d in sample_dirs:
            imgs = list(d.glob("*.jpg")) + list(d.glob("*.png"))
            if imgs:
                img_path = str(imgs[0])
                break
        if img_path is None:
            print("[ERROR] Tidak ada gambar ditemukan. Berikan path gambar sebagai argumen.")
            sys.exit(1)
        print(f"[INFO] Menggunakan gambar sampel: {img_path}")
    else:
        img_path = sys.argv[1]

    debug_predict(img_path)
