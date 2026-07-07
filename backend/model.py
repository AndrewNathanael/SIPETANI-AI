"""
SIPETANI — YOLOv8 Inference Module
Mendukung model custom plant disease (38 kelas) dan fallback ke yolov8n.pt
v2.0 — Perbaikan: threshold lebih ketat, pre-processing gambar, filter bbox
v2.1 — Tambahan: validasi gambar daun menggunakan analisis warna HSV
v4.0 — Tambahan: deteksi logo/gambar grafis untuk mencegah false positive pada gambar non-foto
"""

import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from PIL import Image, ImageEnhance
from ultralytics import YOLO

from schemas import BoundingBox, DetectionResult, DetectResponse

logger = logging.getLogger(__name__)

# ─── Label Map — 38 Kelas (Model Aktual) ─────────────────────────────────────
# Dataset gabungan: Padi (3 kelas) + Singkong/Cassava (5 kelas) + PlantDoc (30 kelas)
# Urutan kelas HARUS sama dengan merged_data.yaml yang dipakai saat training
PLANT_DISEASE_LABELS = {
    # ── PADI (Rice) — dari dataset padi_disease ──────────────────────────────
    0:  "Padi - Bacterial Blight (Hawar Daun Bakteri)",
    1:  "Padi - Rice Blast (Blas Padi)",
    2:  "Padi - Sheath Blight (Busuk Pelepah)",
    # ── SINGKONG (Cassava) — dari dataset singkong_disease ───────────────────
    3:  "Singkong - CBB (Bacterial Blight)",
    4:  "Singkong - CBSD (Brown Streak Disease)",
    5:  "Singkong - CGM (Green Mottle)",
    6:  "Singkong - CMD (Mosaic Disease)",
    7:  "Singkong - Sehat",
    # ── PlantDoc — campuran berbagai tanaman ─────────────────────────────────
    8:  "Apel - Apple Scab",
    9:  "Apel - Sehat",
    10: "Apel - Cedar Apple Rust",
    11: "Cabai - Bercak Bakteri",
    12: "Cabai - Sehat",
    13: "Blueberry - Sehat",
    14: "Ceri - Sehat",
    15: "Jagung - Cercospora / Gray Leaf Spot",
    16: "Jagung - Northern Leaf Blight",
    17: "Jagung - Karat Daun",
    18: "Persik - Sehat",
    19: "Kentang - Early Blight",
    20: "Kentang - Late Blight",
    21: "Kentang - Sehat",
    22: "Raspberry - Sehat",
    23: "Kedelai - Sehat (1)",
    24: "Kedelai - Sehat (2)",
    25: "Labu - Embun Tepung",
    26: "Stroberi - Sehat",
    27: "Tomat - Early Blight",
    28: "Tomat - Septoria Leaf Spot",
    29: "Tomat - Bercak Bakteri",
    30: "Tomat - Late Blight",
    31: "Tomat - Mosaic Virus",
    32: "Tomat - Yellow Leaf Curl Virus",
    33: "Tomat - Sehat",
    34: "Tomat - Jamur Daun",
    35: "Tomat - Tungau Laba-laba",
    36: "Anggur - Black Rot",
    37: "Anggur - Sehat",
}

# Severity mapping berdasarkan kata kunci dalam label
SEVERITY_MAP = {
    "Sehat"         : "none",
    "HEALTHY"       : "none",
    "Blight"        : "high",
    "Blast"         : "high",
    "Rot"           : "high",
    "Virus"         : "high",
    "Mosaic"        : "high",
    "CMD"           : "high",   # Cassava Mosaic Disease
    "CBSD"          : "high",   # Cassava Brown Streak Disease
    "CBB"           : "high",   # Cassava Bacterial Blight
    "Scab"          : "medium",
    "Rust"          : "medium",
    "Spot"          : "medium",
    "Mold"          : "medium",
    "Mildew"        : "low",
    "Hawar"         : "high",
    "Bercak"        : "medium",
    "Tungau"        : "medium",
    "Busuk"         : "high",
    "CGM"           : "low",    # Cassava Green Mottle (ringan)
    "Karat"         : "medium",
    "Bacterial"     : "medium",
}

# Treatment spesifik per class_id (lebih detail dari generic)
SPECIFIC_TREATMENT = {
    # Padi
    0: "Gunakan varietas tahan (IR64, Ciherang). Semprot bakterisida berbasis tembaga. Atur jarak tanam agar sirkulasi udara baik. Buang tanaman terinfeksi parah.",
    1: "Fungisida berbahan aktif Trisiklazol atau Isoprothiolane saat fase anakan-malai. Keringkan lahan secara berkala. Gunakan benih bersertifikat bebas Blast.",
    2: "Kurangi pemupukan nitrogen berlebih. Fungisida validamycin atau hexaconazole. Perbaiki drainase sawah. Rotasi tanaman.",
    # Singkong
    3: "Gunakan stek sehat bebas penyakit. Semprot bakterisida tembaga. Cabut dan musnahkan tanaman terinfeksi berat. Kendalikan serangga vektor.",
    4: "Tidak ada obat kimia efektif. Gunakan varietas toleran (TMS 60444). Kendalikan kutu putih (whitefly) sebagai vektor. Cabut tanaman sakit.",
    5: "Umumnya ringan, tidak perlu penanganan khusus. Pastikan benih/stek bebas penyakit. Kendalikan tungau merah sebagai vektor.",
    6: "Gunakan varietas tahan CMD. Kendalikan kutu kebul (Bemisia tabaci) dengan insektisida imidacloprid. Gunakan stek dari tanaman sehat.",
    7: "Tanaman singkong sehat. Lanjutkan perawatan: pupuk NPK berimbang, penyiangan rutin, dan pastikan drainase baik.",
    # Apel
    8: "Semprot fungisida (captan/mancozeb) saat daun muda tumbuh. Pangkas cabang terinfeksi. Buang daun gugur agar spora tidak menyebar.",
    9: "Apel dalam kondisi sehat. Lakukan pemangkasan rutin dan pemupukan berimbang.",
    10: "Fungisida myclobutanil saat daun mulai tumbuh. Hindari menanam apel dekat pohon cedar/juniper sebagai inang alternatif.",
    # Cabai
    11: "Bakterisida tembaga (copper hydroxide). Gunakan benih bersertifikat. Hindari penyiraman dari atas. Rotasi tanaman.",
    12: "Cabai sehat. Jaga irigasi konsisten dan pupuk berimbang.",
    # dst untuk tanaman lain
    13: "Blueberry sehat. Jaga pH tanah 4.5-5.5 dengan pupuk asam.",
    14: "Ceri sehat. Pemangkasan setelah panen dan pupuk rutin.",
    15: "Rotasi tanaman, varietas tahan, fungisida strobilurin jika infeksi parah.",
    16: "Fungisida propiconazole atau tebuconazole. Varietas jagung tahan. Rotasi tanaman setiap musim.",
    17: "Fungisida triazole saat awal infeksi. Tanam varietas tahan karat.",
    18: "Persik sehat. Pemangkasan rutin dan pupuk N-P-K berimbang.",
    19: "Fungisida chlorothalonil/mancozeb. Pangkas daun bawah yang terinfeksi. Rotasi tanaman.",
    20: "Fungisida metalaxyl + mancozeb SEGERA. Hancurkan dan bakar tanaman terinfeksi berat.",
    21: "Kentang sehat. Tanam benih bersertifikat dan rotasi tanaman tiap musim.",
    22: "Raspberry sehat. Pangkas cane setelah panen.",
    23: "Kedelai sehat. Inokulasi rhizobium untuk bintil akar optimal.",
    24: "Kedelai sehat. Pupuk fosfor dan kalium cukup.",
    25: "Fungisida sulfur atau potassium bicarbonate. Pastikan sirkulasi udara baik di sekitar tanaman.",
    26: "Stroberi sehat. Renovasi runner dan pupuk setelah panen.",
    27: "Fungisida chlorothalonil. Pangkas daun bawah. Rotasi tanaman.",
    28: "Fungisida mancozeb/chlorothalonil. Pangkas daun terinfeksi. Hindari menyiram dari atas.",
    29: "Fungisida metalaxyl SEGERA. Buang seluruh tanaman yang terinfeksi berat.",
    30: "Tidak ada obat. Benih tahan virus, desinfeksi alat. Cuci tangan sebelum menyentuh tanaman.",
    31: "Kendalikan kutu kebul (whitefly) dengan insektisida imidacloprid. Cabut tanaman terinfeksi.",
    32: "Tomat sehat. Pupuk N-P-K berimbang dan irigasi konsisten.",
    33: "Kurangi kelembaban, ventilasi greenhouse. Fungisida chlorothalonil.",
    34: "Mitisida abamectin atau spiromesifen. Semprot air bertekanan. Neem oil sebagai alternatif organik.",
    35: "Fungisida azoxystrobin. Buang daun terinfeksi. Rotasi tanaman.",
    36: "Fungisida captan/mancozeb. Pangkas bagian terinfeksi. Buang mumi buah.",
    37: "Anggur sehat. Pemangkasan tahunan dan pemupukan rutin.",
}

# Fallback treatment berdasarkan severity
TREATMENT_MAP = {
    "none"  : "Tanaman dalam kondisi sehat. Lanjutkan perawatan rutin: pupuk, penyiraman, dan pemangkasan.",
    "low"   : "Semprot fungisida ringan (sulfur/tembaga). Perbaiki sirkulasi udara dan kurangi kelembaban.",
    "medium": "Pangkas bagian terinfeksi. Semprot fungisida/insektisida sistemik setiap 7-10 hari. Rotasi tanaman.",
    "high"  : "⚠️ Tangani SEGERA! Isolasi tanaman, semprot fungisida/bakterisida konsentrasi penuh. Pertimbangkan cabut & musnahkan tanaman terinfeksi berat.",
}

# Model paths — prioritas: custom model > default
CUSTOM_MODEL_PATH = Path(__file__).parent / "model_sipetani.pt"
DEFAULT_MODEL_PATH = Path(__file__).parent / "yolov8n.pt"

# ─── Inference Defaults ───────────────────────────────────────────────────────
DEFAULT_CONF      = 0.25   # Diturunkan 0.45→0.25 agar deteksi lebih sensitif (model mAP50~0.62)
DEFAULT_IOU       = 0.45   # Diturunkan 0.55→0.45 untuk kurangi false negative
MAX_DETECTIONS    = 10     # Batas maksimum deteksi per gambar
MIN_BBOX_AREA_PCT = 0.003  # Abaikan bbox < 0.3% area gambar (noise)
MAX_BBOX_AREA_PCT = 0.97   # Abaikan bbox > 97% area gambar (background)

# ─── Fallback label untuk yolov8n.pt (COCO) ──────────────────────────────────
COCO_PLANT_CONTEXT = {
    "apple"       : "Buah Apel (Periksa kondisi)",
    "orange"      : "Jeruk (Periksa kondisi)",
    "banana"      : "Pisang (Periksa kondisi)",
    "broccoli"    : "Brokoli (Periksa kondisi)",
    "carrot"      : "Wortel (Periksa kondisi)",
    "potted plant": "Tanaman Pot",
}


def preprocess_image(image: Image.Image) -> Image.Image:
    """
    Pre-process gambar sebelum inferensi untuk meningkatkan deteksi daun:
    1. Tingkatkan kontras agar tekstur daun lebih jelas
    2. Tingkatkan ketajaman agar tepi daun dan lesi terdeteksi lebih baik
    3. Resize ke 640×640 (ukuran optimal YOLOv8) dengan letterbox
    """
    # 1. Enhance contrast (faktor 1.3 = 30% lebih kontras)
    image = ImageEnhance.Contrast(image).enhance(1.3)

    # 2. Enhance sharpness (faktor 1.5 = 50% lebih tajam)
    image = ImageEnhance.Sharpness(image).enhance(1.5)

    # 3. Slight color enhancement untuk menonjolkan warna penyakit (kuning, coklat)
    image = ImageEnhance.Color(image).enhance(1.2)

    return image


# ─── Leaf Validation ─────────────────────────────────────────────────────────
# Sistem multi-kriteria HSV + analisis distribusi spasial + deteksi kulit manusia
# + deteksi logo/gambar grafis.
# v4.0 — Tambahan: mencegah false positive pada logo/ikon bergambar hijau
LEAF_MIN_GREEN_PCT    = 0.08   # Minimal 8% warna hijau/kuning pada gambar
LEAF_MIN_GREEN_RATIO  = 0.15   # Warna daun harus minimal 15% dari area terang
LEAF_MAX_DARK_PCT     = 0.80   # Batas maksimum area gelap
LEAF_MAX_NONLEAF_PCT  = 0.60   # Batas warna non-daun
LEAF_MIN_CENTER_GREEN = 0.05   # Minimal 5% warna daun di area tengah
LEAF_MIN_CENTER_SHARE = 0.08   # 8% warna daun harus ada di tengah gambar
LEAF_MAX_SKIN_PCT     = 0.25   # Batas maksimum warna kulit manusia (skin tone)

# ── Threshold deteksi logo/gambar grafis (v4.0) ──────────────────────────────
LOGO_MAX_WHITE_PCT    = 0.50   # Logo sering punya latar putih/transparan ≥50%
LOGO_MIN_COLOR_STD    = 0.055  # Foto alami punya std dev warna channel ≥0.055
LOGO_MAX_UNIFORM_GREEN = 0.80  # Jika >80% piksel hijau punya hue nyaris sama = blok solid


def _detect_graphic_image(arr: np.ndarray, h: np.ndarray, s: np.ndarray,
                          v: np.ndarray, green_mask: np.ndarray,
                          N: int, SIZE: int) -> Tuple[bool, str]:
    """
    Deteksi apakah gambar merupakan logo/gambar grafis buatan (bukan foto alami).
    v4.0 — Menggabungkan tiga sinyal:
      1. Latar belakang putih/terang dominan
      2. Variasi warna rendah (warna solid, bukan gradien alami)
      3. Hijau seragam — blok hijau tanpa variasi tekstur alami

    Returns: (is_graphic: bool, reason: str)
    """
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    # ── [A] Deteksi latar PUTIH/TERANG (latar polos logo) ───────────────────
    # Putih: semua channel tinggi (r,g,b > 0.88) dan saturasi rendah (s < 0.12)
    white_mask = (r > 0.88) & (g > 0.88) & (b > 0.88) & (s < 0.12)
    white_pct  = float(np.sum(white_mask)) / N

    # ── [B] Analisis variasi warna (std dev) ─────────────────────────────────
    # Foto daun asli punya gradien warna alami; logo punya blok warna solid
    # Hitung per-channel std di area NON-putih untuk mengukur keragaman warna
    non_white = ~white_mask
    if np.sum(non_white) > 100:
        r_std = float(np.std(r[non_white]))
        g_std = float(np.std(g[non_white]))
        b_std = float(np.std(b[non_white]))
        color_std = (r_std + g_std + b_std) / 3.0
    else:
        color_std = 0.0  # Hampir semua putih = pasti logo/blank

    # ── [C] Keseragaman hue pada area hijau ──────────────────────────────────
    # Daun asli: hue hijau bervariasi alami (35°–155° tapi tidak semua sama)
    # Logo: blok hijau solid → hue sangat seragam (std dev rendah)
    green_pixels_h = h[green_mask]
    if len(green_pixels_h) > 50:
        green_hue_std = float(np.std(green_pixels_h))
        # Normalkan ke 0-1 (range hue 0-360)
        green_hue_std_norm = green_hue_std / 180.0
    else:
        green_hue_std = 0.0
        green_hue_std_norm = 0.0

    # ── [D] Deteksi kontur tajam — logo punya transisi warna sangat mendadak ─
    # Hitung perbedaan piksel bertetangga horizontal & vertikal
    gray = 0.299 * r + 0.587 * g + 0.114 * b
    diff_h = np.abs(np.diff(gray, axis=1))  # perbedaan horizontal
    diff_v = np.abs(np.diff(gray, axis=0))  # perbedaan vertikal
    # Rasio piksel dengan transisi SANGAT tajam (>0.35) vs total
    sharp_edge_pct = float(
        (np.sum(diff_h > 0.35) + np.sum(diff_v > 0.35)) / (2 * N)
    )
    # Rasio piksel dengan transisi SANGAT halus (<0.01) — logo punya area solid luas
    flat_area_pct = float(
        (np.sum(diff_h < 0.01) + np.sum(diff_v < 0.01)) / (2 * N)
    )

    logger.info(
        f"GraphicDetect v4.0 | white={white_pct:.1%} color_std={color_std:.3f} "
        f"green_hue_std={green_hue_std:.1f}° flat_area={flat_area_pct:.1%} "
        f"sharp_edge={sharp_edge_pct:.1%}"
    )

    # ── Keputusan: kombinasi sinyal untuk klasifikasi grafis ─────────────────
    graphic_score = 0  # Akumulasi skor indikator grafis

    # Sinyal 1: Latar putih sangat dominan (>50%)
    if white_pct > LOGO_MAX_WHITE_PCT:
        graphic_score += 2  # Sinyal kuat
        logger.info(f"   [LOGO] Latar putih dominan: {white_pct:.1%}")

    # Sinyal 2: Variasi warna sangat rendah (warna solid)
    if color_std < LOGO_MIN_COLOR_STD:
        graphic_score += 2  # Sinyal kuat
        logger.info(f"   [LOGO] Variasi warna sangat rendah: std={color_std:.3f}")

    # Sinyal 3: Hijau seragam (hue std rendah = blok solid bukan gradien daun)
    if len(green_pixels_h) > 50 and green_hue_std < 12.0:
        graphic_score += 2  # Sinyal kuat
        logger.info(f"   [LOGO] Hijau seragam: hue_std={green_hue_std:.1f}°")

    # Sinyal 4: Area datar sangat besar (>75% piksel nyaris tidak berubah)
    if flat_area_pct > 0.75:
        graphic_score += 1  # Sinyal pendukung
        logger.info(f"   [LOGO] Area datar besar: {flat_area_pct:.1%}")

    # Sinyal 5: Transisi tajam ada tapi sedikit (logo punya outline saja)
    if sharp_edge_pct < 0.03 and flat_area_pct > 0.70:
        graphic_score += 1  # Sinyal pendukung
        logger.info(f"   [LOGO] Outline sedikit + area datar besar")

    # Sinyal 6: Latar putih + hijau seragam (kombinasi sangat kuat)
    if white_pct > 0.35 and len(green_pixels_h) > 50 and green_hue_std < 20.0:
        graphic_score += 2  # Bonus kombinasi kuat
        logger.info(f"   [LOGO] Kombinasi: white={white_pct:.1%} + green_hue_std={green_hue_std:.1f}°")

    logger.info(f"   [LOGO] Skor grafis total: {graphic_score}/10")

    # Klasifikasikan sebagai gambar grafis jika skor ≥ 4
    if graphic_score >= 4:
        return True, (
            f"Gambar terdeteksi sebagai logo, ikon, atau gambar grafis bukan foto daun "
            f"(latar putih {white_pct:.0%}, variasi warna std={color_std:.3f}, "
            f"hijau seragam {green_hue_std:.0f}°). "
            "Silakan foto daun tanaman secara langsung menggunakan kamera."
        )

    return False, "OK"


def validate_leaf_image(image: Image.Image) -> Tuple[bool, str]:
    """
    Validasi gambar menggunakan HSV multi-kriteria + deteksi kulit manusia
    + deteksi logo/gambar grafis.
    v4.0 — Ditambah:
      - Mendeteksi logo/ikon bergambar hijau yang salah terdeteksi sebagai tanaman
      - Mendeteksi dan menolak foto selfie/wajah/kulit manusia
      - Threshold lebih ketat untuk mencegah false positive pada benda non-tanaman
      - Tetap mendukung daun sakit (kuning/coklat) dan foto lapangan

    Returns: (is_valid: bool, reason: str)
    """
    SIZE = 224
    small = image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    arr   = np.array(small, dtype=np.float32) / 255.0
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    # Konversi RGB → HSV
    cmax  = np.maximum(np.maximum(r, g), b)
    delta = cmax - np.minimum(np.minimum(r, g), b)
    v     = cmax
    s     = np.where(cmax > 0, delta / cmax, 0.0)
    h     = np.zeros_like(r)
    mr    = (cmax == r) & (delta > 0)
    mg    = (cmax == g) & (delta > 0)
    mb    = (cmax == b) & (delta > 0)
    h[mr] = (60 * ((g[mr] - b[mr]) / delta[mr])) % 360
    h[mg] = 60 * ((b[mg] - r[mg]) / delta[mg]) + 120
    h[mb] = 60 * ((r[mb] - g[mb]) / delta[mb]) + 240

    N = SIZE * SIZE

    # [1] Cek terlalu gelap
    dark_pct   = float(np.sum(v < 0.08)) / N
    bright_pct = 1.0 - dark_pct
    if dark_pct > LEAF_MAX_DARK_PCT:
        return False, "Gambar terlalu gelap. Pastikan pencahayaan cukup saat memotret daun."

    # [2] Mask HIJAU (H=35-155° — warna klorofil daun)
    green_mask = (h >= 35) & (h <= 155) & (s > 0.20) & (v > 0.12)
    green_pct  = float(np.sum(green_mask)) / N

    # [3] Mask KUNING-COKLAT: warna daun sakit/tua (H=20-50°, saturasi lebih ketat)
    yellow_mask = (h >= 20) & (h <= 55) & (s > 0.30) & (v > 0.25)
    leaf_color_pct = float(np.sum(green_mask | yellow_mask)) / N

    # [4] Rasio warna daun vs area terang
    leaf_ratio = leaf_color_pct / bright_pct if bright_pct > 0 else 0.0

    # [5] Deteksi KULIT MANUSIA (skin tone detection)
    skin_mask_light = (h >= 0) & (h <= 25) & (s > 0.15) & (s < 0.65) & (v > 0.35)
    skin_mask_dark  = (h >= 0) & (h <= 30) & (s > 0.20) & (s < 0.75) & (v > 0.20)
    skin_mask_wrap  = (h >= 330) & (h <= 360) & (s > 0.15) & (s < 0.65) & (v > 0.30)
    skin_mask = skin_mask_light | skin_mask_dark | skin_mask_wrap
    skin_pct  = float(np.sum(skin_mask)) / N

    # [6] Warna non-daun: merah jenuh & biru jenuh
    red_mask    = ((h < 10) | (h > 345)) & (s > 0.45) & (v > 0.20)
    blue_mask   = (h >= 195) & (h <= 260) & (s > 0.35) & (v > 0.20)
    nonleaf_pct = float(np.sum(red_mask) + np.sum(blue_mask)) / N

    # [7] Analisis spasial — cek area tengah gambar
    c0, c1 = SIZE // 4, SIZE * 3 // 4
    CSIZE  = (c1 - c0) ** 2
    center_leaf_n     = int(np.sum((green_mask | yellow_mask)[c0:c1, c0:c1]))
    center_skin_n     = int(np.sum(skin_mask[c0:c1, c0:c1]))
    center_leaf_pct   = center_leaf_n / CSIZE
    center_skin_pct   = center_skin_n / CSIZE
    center_leaf_share = center_leaf_n / max(int(np.sum(green_mask | yellow_mask)), 1)

    logger.info(
        f"LeafVal v4.0 | green={green_pct:.1%} leaf_color={leaf_color_pct:.1%} "
        f"leaf_ratio={leaf_ratio:.1%} skin={skin_pct:.1%} nonleaf={nonleaf_pct:.1%} "
        f"| center: leaf={center_leaf_pct:.1%} skin={center_skin_pct:.1%} share={center_leaf_share:.1%}"
    )

    # ── KEPUTUSAN ───────────────────────────────────────────────────

    # Syarat -1 (PRIORITAS TERTINGGI): Deteksi logo/gambar grafis
    # Dilakukan SEBELUM cek warna hijau agar logo hijau tidak lolos
    is_graphic, graphic_reason = _detect_graphic_image(
        arr, h, s, v, green_mask, N, SIZE
    )
    if is_graphic:
        return False, graphic_reason

    # Syarat 0 (PRIORITAS): Deteksi kulit manusia — tolak jika terlalu banyak skin tone
    if skin_pct > LEAF_MAX_SKIN_PCT and leaf_color_pct < 0.15:
        return False, (
            f"Gambar terdeteksi mengandung kulit manusia atau objek non-tanaman "
            f"({skin_pct:.0%} area skin tone). "
            "Pastikan kamera diarahkan ke daun tanaman, bukan wajah atau bagian tubuh."
        )

    # Syarat 0b: Kulit dominan di tengah dan tidak ada hijau di tengah = selfie
    if center_skin_pct > 0.20 and center_leaf_pct < 0.05:
        return False, (
            "Gambar terdeteksi sebagai foto wajah atau bagian tubuh, bukan daun tanaman. "
            "Arahkan kamera ke daun tanaman secara langsung."
        )

    # Syarat 1: Minimal ada warna daun (hijau ATAU kuning) secara global
    if leaf_color_pct < LEAF_MIN_GREEN_PCT:
        return False, (
            f"Gambar tidak terdeteksi sebagai daun tanaman "
            f"(hanya {leaf_color_pct:.0%} warna hijau/kuning, minimal {LEAF_MIN_GREEN_PCT:.0%}). "
            "Pastikan foto fokus pada daun tanaman."
        )

    # Syarat 2: Warna daun cukup dominan di area terang
    if leaf_ratio < LEAF_MIN_GREEN_RATIO:
        return False, (
            f"Warna daun tidak cukup mendominasi gambar ({leaf_ratio:.0%} dari area terlihat). "
            "Pastikan daun mengisi sebagian besar frame kamera."
        )

    # Syarat 3: Warna non-daun tidak mendominasi
    if nonleaf_pct > LEAF_MAX_NONLEAF_PCT:
        return False, (
            f"Gambar kemungkinan bukan daun tanaman ({nonleaf_pct:.0%} area merah/biru jenuh). "
            "Pastikan foto menampilkan daun tanaman."
        )

    # Syarat 4: Minimal ada warna daun di tengah gambar
    if center_leaf_pct < LEAF_MIN_CENTER_GREEN:
        return False, (
            f"Warna daun tidak terdeteksi di area tengah gambar ({center_leaf_pct:.0%}). "
            "Pastikan daun mengisi bagian TENGAH kamera."
        )

    # Syarat 5: Warna daun tidak hanya di pinggir saja
    if center_leaf_share < LEAF_MIN_CENTER_SHARE:
        return False, (
            f"Warna daun hanya ada di pinggir gambar ({center_leaf_share:.0%} di tengah). "
            "Kemungkinan ini latar belakang, bukan daun. "
            "Pastikan daun mengisi seluruh frame."
        )

    return True, "OK"


def filter_detections(
    detections: List[DetectionResult],
    img_w: int,
    img_h: int,
) -> List[DetectionResult]:
    """
    Post-processing filter untuk membuang deteksi yang tidak relevan:
    1. Filter berdasarkan ukuran bbox (terlalu kecil atau terlalu besar)
    2. Batasi jumlah maksimum deteksi (ambil confidence tertinggi)
    3. De-duplicate: buang deteksi overlap tinggi dengan confidence lebih rendah
    """
    total_area = img_w * img_h
    filtered = []

    for det in detections:
        # Hitung area bbox dalam piksel
        bbox_w_px = det.bbox.w * img_w
        bbox_h_px = det.bbox.h * img_h
        bbox_area = bbox_w_px * bbox_h_px
        bbox_area_pct = bbox_area / total_area

        # Filter 1: Abaikan bbox yang terlalu kecil (noise/artefak)
        if bbox_area_pct < MIN_BBOX_AREA_PCT:
            logger.debug(f"   Filtered (terlalu kecil, {bbox_area_pct:.3f}): {det.label}")
            continue

        # Filter 2: Abaikan bbox yang terlalu besar (kemungkinan background)
        if bbox_area_pct > MAX_BBOX_AREA_PCT:
            logger.debug(f"   Filtered (terlalu besar, {bbox_area_pct:.3f}): {det.label}")
            continue

        filtered.append(det)

    # Urutkan berdasarkan confidence tertinggi
    filtered.sort(key=lambda d: d.confidence, reverse=True)

    # De-duplicate: hapus deteksi yang sangat overlap dengan label yang sama
    deduped: List[DetectionResult] = []
    for det in filtered:
        is_duplicate = False
        for kept in deduped:
            if kept.label == det.label and _iou_overlap(det.bbox, kept.bbox) > 0.4:
                is_duplicate = True
                break
        if not is_duplicate:
            deduped.append(det)

    # Batasi maksimum deteksi
    return deduped[:MAX_DETECTIONS]


def _iou_overlap(a: BoundingBox, b: BoundingBox) -> float:
    """Hitung IoU (Intersection over Union) antara dua bounding box."""
    ax1, ay1 = a.x, a.y
    ax2, ay2 = a.x + a.w, a.y + a.h
    bx1, by1 = b.x, b.y
    bx2, by2 = b.x + b.w, b.y + b.h

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    area_a = a.w * a.h
    area_b = b.w * b.h
    union_area = area_a + area_b - inter_area

    return inter_area / union_area if union_area > 0 else 0.0


class SIPETANIModel:
    """YOLOv8 inference wrapper untuk SIPETANI."""

    def __init__(self):
        self.model: Optional[YOLO] = None
        self.model_path: Optional[Path] = None
        self.is_custom: bool = False
        self.class_names: Dict[int, str] = {}

    def load(self):
        """Load model — prioritaskan custom model jika ada."""
        if CUSTOM_MODEL_PATH.exists():
            logger.info(f"✅ Load custom model: {CUSTOM_MODEL_PATH}")
            self.model = YOLO(str(CUSTOM_MODEL_PATH))
            self.model_path = CUSTOM_MODEL_PATH
            self.is_custom = True
            self.class_names = {i: name for i, name in enumerate(self.model.names.values())}
            logger.info(f"   {len(self.class_names)} kelas dimuat")
        elif DEFAULT_MODEL_PATH.exists():
            logger.info(f"⚠️  Custom model belum tersedia, gunakan: {DEFAULT_MODEL_PATH}")
            self.model = YOLO(str(DEFAULT_MODEL_PATH))
            self.model_path = DEFAULT_MODEL_PATH
            self.is_custom = False
            self.class_names = PLANT_DISEASE_LABELS
        else:
            logger.info("📥 Download yolov8n.pt (model default)...")
            self.model = YOLO("yolov8n.pt")
            self.model_path = Path("yolov8n.pt")
            self.is_custom = False
            self.class_names = PLANT_DISEASE_LABELS

        logger.info(f"   Model siap: {'CUSTOM (Plant Disease)' if self.is_custom else 'DEFAULT (General)'}")
        logger.info(f"   Conf default: {DEFAULT_CONF} | IoU default: {DEFAULT_IOU} | Max det: {MAX_DETECTIONS}")

    def get_label(self, class_id: int, raw_label: str) -> str:
        """Dapatkan label dalam Bahasa Indonesia."""
        if self.is_custom:
            label = self.class_names.get(class_id, raw_label)
            if "___" in label:
                plant, disease = label.split("___", 1)
                disease = disease.replace("_", " ")
                plant = plant.replace("_", " ")
                label = f"{plant} - {disease}"
            elif "_" in label:
                label = label.replace("_", " ")
            return label
        else:
            coco_name = raw_label.lower()
            return COCO_PLANT_CONTEXT.get(coco_name, f"Objek: {raw_label}")

    def get_severity(self, label: str) -> str:
        """Tentukan tingkat keparahan berdasarkan nama penyakit."""
        if "Sehat" in label or "healthy" in label.lower():
            return "none"

        for keyword, severity in SEVERITY_MAP.items():
            if keyword.lower() in label.lower():
                return severity

        return "medium"

    def get_treatment(self, severity: str, class_id: int = -1) -> str:
        """Dapatkan rekomendasi penanganan — spesifik per penyakit jika tersedia."""
        if class_id >= 0 and class_id in SPECIFIC_TREATMENT:
            return SPECIFIC_TREATMENT[class_id]
        return TREATMENT_MAP.get(severity, TREATMENT_MAP["medium"])

    def predict(
        self,
        image: Image.Image,
        conf_threshold: float = DEFAULT_CONF,
        iou_threshold: float = DEFAULT_IOU,
    ) -> DetectResponse:
        """
        Jalankan inferensi pada gambar.

        Args:
            image: PIL Image (gambar daun asli)
            conf_threshold: minimum confidence score (default 0.45)
            iou_threshold: IoU threshold untuk NMS (default 0.55)

        Returns:
            DetectResponse dengan hasil deteksi yang sudah difilter
        """
        if self.model is None:
            raise RuntimeError("Model belum di-load. Panggil load() terlebih dahulu.")

        img_w, img_h = image.size
        logger.info(f"🔍 Inferensi gambar {img_w}×{img_h} | conf={conf_threshold} | iou={iou_threshold}")

        # ── Pre-processing: tingkatkan kualitas gambar ──
        processed_image = preprocess_image(image)

        # ── Inferensi YOLOv8 ──
        results = self.model.predict(
            source=processed_image,
            conf=conf_threshold,
            iou=iou_threshold,
            imgsz=640,          # Ukuran optimal YOLOv8
            max_det=MAX_DETECTIONS * 2,  # Sedikit lebih besar, akan di-filter lagi
            verbose=False,
        )

        raw_detections: List[DetectionResult] = []

        for result in results:
            if result.boxes is None:
                continue

            boxes = result.boxes

            for i in range(len(boxes)):
                x1, y1, x2, y2 = boxes.xyxy[i].cpu().numpy()
                det_conf = float(boxes.conf[i].cpu().numpy())
                cls_id   = int(boxes.cls[i].cpu().numpy())

                raw_label = result.names.get(cls_id, f"class_{cls_id}")
                label     = self.get_label(cls_id, raw_label)
                severity  = self.get_severity(label)
                treatment = self.get_treatment(severity, cls_id)

                # Normalize bbox ke 0-1 range (relatif terhadap ukuran gambar asli)
                bbox = BoundingBox(
                    x=float(x1) / img_w,
                    y=float(y1) / img_h,
                    w=float(x2 - x1) / img_w,
                    h=float(y2 - y1) / img_h,
                )

                raw_detections.append(DetectionResult(
                    class_id   = cls_id,
                    label      = label,
                    confidence = round(det_conf, 4),
                    bbox       = bbox,
                    severity   = severity,
                    treatment  = treatment,
                ))

        logger.info(f"   Raw detections: {len(raw_detections)}")

        # ── Post-processing: filter & deduplicate ──
        detections = filter_detections(raw_detections, img_w, img_h)

        logger.info(f"   After filter: {len(detections)} deteksi final")

        model_info = "Custom Plant Disease Model (v2)" if self.is_custom else "General Object Detection (yolov8n)"

        return DetectResponse(
            detections   = detections,
            image_width  = img_w,
            image_height = img_h,
            model_info   = model_info,
            class_count  = len(self.class_names) if self.is_custom else 80,
        )


# ─── Singleton instance ───────────────────────────────────────────────────────
_model_instance: Optional[SIPETANIModel] = None


def get_model() -> SIPETANIModel:
    """Dapatkan singleton model instance."""
    global _model_instance
    if _model_instance is None:
        _model_instance = SIPETANIModel()
    return _model_instance
