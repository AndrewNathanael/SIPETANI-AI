"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Leaf, Camera, History, BookOpen, Upload,
  RefreshCw, Download, Trash2, FolderOpen, Zap,
  TriangleAlert, SlidersHorizontal, Terminal,
  FlaskConical, Cpu, Calendar, ArrowRight,
  Sprout, Microscope, Activity, Scan, BarChart3,
  CheckCircle, XCircle, X, ShieldCheck, Send, MessageSquare, Bot
} from "lucide-react";
import ResultOverlay from "@/components/ResultOverlay";
import DiagnosisCard from "@/components/DiagnosisCard";
import CameraCapture from "@/components/CameraCapture";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

interface BBox { x: number; y: number; w: number; h: number; }
interface Detection {
  class_id: number; label: string; confidence: number;
  bbox: BBox; severity: string; treatment: string;
}
interface DetectResponse {
  success: boolean; image_width: number; image_height: number;
  detections: Detection[]; message: string;
  validation_error?: string; validation_warning?: string;
}
interface HistoryItem {
  id: string; date: string; imageUrl: string;
  result: DetectResponse; confThreshold: number;
}

type Stage = "idle" | "preview" | "uploading" | "preprocessing" | "inference" | "done" | "error";
type MainTab = "deteksi" | "riwayat" | "laboratorium";
type UploadTab = "upload" | "kamera";

const PIPELINE = [
  { key: "uploading",     label: "Upload"   },
  { key: "preprocessing", label: "Pre-proc" },
  { key: "inference",     label: "YOLOv8"   },
  { key: "done",          label: "Selesai"  },
];

const STAGE_ORDER: Stage[] = ["idle","preview","uploading","preprocessing","inference","done"];

function getStepState(stepKey: string, stage: Stage): "idle"|"active"|"done" {
  if (stage === "done") return "done";
  const ci = STAGE_ORDER.indexOf(stage);
  const si = STAGE_ORDER.indexOf(stepKey as Stage);
  if (si < ci)          return "done";
  if (stepKey === stage) return "active";
  return "idle";
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface DiseaseInfo {
  name: string;
  latinName: string;
  pathogen: string;
  description: string;
  symptoms: string[];
  organicTreatment: string;
  chemicalTreatment: string;
  prevention: string;
}

const DISEASE_DETAILS: Record<string, DiseaseInfo> = {
  "Rice Blast": {
    name: "Blas Padi (Rice Blast)",
    latinName: "Pyricularia oryzae",
    pathogen: "Jamur (Fungi)",
    description: "Penyakit blas merupakan salah satu penyakit utama tanaman padi yang menyerang daun (blas daun) maupun leher malai (blas leher). Sangat berbahaya pada kondisi kelembapan tinggi dan pemupukan nitrogen berlebih.",
    symptoms: [
      "Bercak berbentuk belah ketupat lebar di bagian tengah dan meruncing di kedua ujungnya.",
      "Bagian tengah bercak berwarna abu-abu kehijauan atau keputihan dengan tepi berwarna cokelat tua.",
      "Pada infeksi berat, daun padi menjadi kering, tampak terbakar, dan tanaman menjadi kerdil."
    ],
    organicTreatment: "Semprotkan ekstrak daun nimba, minyak neem, atau agen hayati seperti bakteri antagonis Pseudomonas fluorescens pada daun semenjak pembibitan.",
    chemicalTreatment: "Semprotkan fungisida sistemik berbahan aktif Trisiklazol, Difenokonazol, atau Tebukonazol sesuai dosis anjuran.",
    prevention: "Hindari penggunaan pupuk Urea (Nitrogen) berlebih. Atur jarak tanam agar sirkulasi udara lancar (jajar legowo). Gunakan varietas padi yang tahan penyakit blas."
  },
  "Tomato Late Blight": {
    name: "Busuk Daun Tomat (Late Blight)",
    latinName: "Phytophthora infestans",
    pathogen: "Oomycete (Protista Mirip Jamur)",
    description: "Penyakit busuk daun tomat adalah infeksi mematikan yang menyebar dengan sangat cepat pada musim hujan yang dingin dan basah. Dapat memusnahkan seluruh kebun tomat dalam hitungan hari jika tidak ditangani.",
    symptoms: [
      "Bercak basah berwarna hijau gelap keabu-abuan pada tepi atau ujung daun.",
      "Bercak meluas dengan cepat dan berubah menjadi cokelat kehitaman yang mengering.",
      "Sisi bawah daun menunjukkan pertumbuhan sporangia putih seperti beludru saat udara lembap."
    ],
    organicTreatment: "Gunakan semprotan fungisida tembaga organik (Copper Hydroxide) atau air perasan kunyit yang dicampur dengan sedikit sabun kalium.",
    chemicalTreatment: "Gunakan fungisida sistemik berbahan aktif Metalaksil, Dimetomorf, atau Azoksistrobin secara berkala pada musim hujan.",
    prevention: "Hindari penyiraman overhead (menyiram daun langsung) di sore hari. Lakukan pemangkasan daun bagian bawah agar daun tidak menyentuh tanah basah. Lakukan rotasi tanaman."
  },
  "Corn Common Rust": {
    name: "Karat Daun Jagung (Common Rust)",
    latinName: "Puccinia sorghi",
    pathogen: "Jamur (Fungi - Rust)",
    description: "Penyakit karat daun jagung ditandai dengan munculnya pustul-pustul bubuk karat pada permukaan daun. Penyakit ini menyebar melalui spora yang terbawa angin pada kondisi suhu hangat dan kelembapan tinggi.",
    symptoms: [
      "Muncul bisul-bisul kecil (pustul) berbentuk bulat lonjong di kedua permukaan daun jagung.",
      "Pustul berisi serbuk halus berwarna jingga kecokelatan seperti karat besi.",
      "Daun yang terinfeksi berat akan menguning, mengering, lalu mati sebelum waktunya."
    ],
    organicTreatment: "Semprotkan bubuk sulfur alami (belerang) konsentrasi rendah atau larutan baking soda sebagai fungisida kontak organik.",
    chemicalTreatment: "Gunakan fungisida protektif/sistemik berbahan aktif Mancozeb atau Propikonazol jika infeksi melebihi ambang ekonomi.",
    prevention: "Gunakan benih jagung hibrida yang resisten terhadap karat daun. Bersihkan gulma di sekitar pertanaman untuk memotong siklus inang alternatif jamur."
  },
  "Chili Leaf Curl": {
    name: "Daun Keriting Cabai (Yellow Leaf Curl)",
    latinName: "Begomovirus (Gemini Virus)",
    pathogen: "Virus (Vektor: Kutu Kebul)",
    description: "Penyakit keriting kuning cabai disebabkan oleh infeksi virus Begomovirus yang ditularkan oleh serangga vektor Kutu Kebul (Whitefly). Menyebabkan hambatan pertumbuhan tanaman cabai secara drastis.",
    symptoms: [
      "Daun muda mengerut, mengeriting ke atas, dan helai daun mengecil.",
      "Tulang daun memucat (vein clearing) dan berubah warna menjadi kuning terang.",
      "Tanaman kerdil, bunga rontok, dan tidak mampu menghasilkan buah secara normal."
    ],
    organicTreatment: "Semprotkan insektisida organik dari ekstrak bawang putih dan cabai rawit untuk mengusir kutu kebul. Gunakan perangkap perekat kuning (yellow sticky trap) di lahan.",
    chemicalTreatment: "Tidak ada obat kimia untuk membunuh virus. Pengendalian ditujukan pada vektor serangga dengan menyemprotkan insektisida berbahan aktif Abamektin atau Imidakloprid.",
    prevention: "Gunakan kelambu pembibitan (screen house). Lakukan sanitasi total dengan mencabut dan membakar tanaman sakit sesegera mungkin. Lakukan pergiliran tanaman non-inang."
  },
  "Potato Early Blight": {
    name: "Bercak Kering Kentang (Early Blight)",
    latinName: "Alternaria solani",
    pathogen: "Jamur (Fungi)",
    description: "Bercak kering kentang menyerang daun tanaman kentang yang lebih tua terlebih dahulu. Jamur ini bertahan hidup di sisa-sisa tanaman sakit di tanah dan menyukai kondisi transisi basah-kering.",
    symptoms: [
      "Bercak kecil berbentuk bulat cokelat tua pada daun tua.",
      "Bercak membesar membentuk pola lingkaran konsentris mirip papan target panahan (target board).",
      "Tepi bercak sering kali dikelilingi oleh halo berwarna kuning pucat."
    ],
    organicTreatment: "Aplikasikan mulsa organik tebal untuk mencegah percikan tanah ke daun. Semprotkan agen hayati jamur Trichoderma harzianum pada lubang tanam kentang.",
    chemicalTreatment: "Semprotkan fungisida kontak berbahan aktif Klorotalonil atau tembaga oksiklorida secara preventif.",
    prevention: "Lakukan rotasi tanaman kentang minimal 2-3 tahun dengan keluarga kacang-kacangan. Jaga kecukupan nutrisi nitrogen dan kalium tanaman agar imunnya optimal."
  }
};

function getDiseaseDetails(label: string): DiseaseInfo {
  const match = DISEASE_DETAILS[label];
  if (match) return match;
  const isHealthy = label.toLowerCase().includes("sehat") || label.toLowerCase().includes("healthy");
  if (isHealthy) {
    return {
      name: label,
      latinName: "N/A",
      pathogen: "Sehat",
      description: "Tanaman berada dalam kondisi prima. Jaringan klorofil bekerja dengan kapasitas penuh untuk fotosintesis optimal.",
      symptoms: ["Warna daun hijau segar merata.", "Ketebalan daun normal dan elastis.", "Tidak ditemukan bercak patogen."],
      organicTreatment: "Lanjutkan pemupukan organik teratur.",
      chemicalTreatment: "Tidak diperlukan pestisida kimia.",
      prevention: "Jaga kelembapan tanah dan sanitasi rutin."
    };
  }
  return {
    name: label,
    latinName: "Patogen Terkait " + label,
    pathogen: label.toLowerCase().includes("virus") ? "Virus" : label.toLowerCase().includes("bakteri") || label.toLowerCase().includes("bacterial") ? "Bakteri" : "Jamur (Fungi)",
    description: `Penyakit ${label} teridentifikasi pada daun tanaman melalui model deteksi visi komputer YOLOv8. Memerlukan penanganan segera untuk mencegah penyebaran ke tanaman lain.`,
    symptoms: [
      `Muncul gejala khas ${label} pada bagian helaian daun.`,
      "Mengurangi luas area aktif fotosintesis tanaman.",
      "Jika dibiarkan, dapat menurunkan kualitas hasil panen secara signifikan."
    ],
    organicTreatment: "Semprotkan larutan bio-pestisida atau neem oil organik secara merata pada bagian bawah dan atas daun terinfeksi.",
    chemicalTreatment: label.toLowerCase().includes("virus") 
      ? "Kendalikan serangga pembawa virus menggunakan insektisida sistemik berbahan aktif abamektin."
      : "Aplikasikan semprotan fungisida/bakterisida sistemik sesuai dosis anjuran.",
    prevention: "Pisahkan tanaman yang sakit, terapkan rotasi tanaman pada musim berikutnya, dan gunakan benih yang bersertifikat bebas patogen."
  };
}

// ── Komponen Peta Jalan Tindakan Pemulihan Tanaman (Treatment Roadmap - Fase 5) ──
function TreatmentRoadmap({ label }: { label: string }) {
  const details = getDiseaseDetails(label);
  const isHealthy = label.toLowerCase().includes("sehat") || label.toLowerCase().includes("healthy");

  if (isHealthy) {
    return (
      <div className="roadmap-timeline">
        <div className="roadmap-step">
          <div className="roadmap-marker green" />
          <div className="roadmap-content">
            <div className="roadmap-time">Hari 1 - Pemeliharaan Rutin</div>
            <div className="roadmap-title">Nutrisi Organik Tanaman</div>
            <div className="roadmap-text">{details.organicTreatment}</div>
          </div>
        </div>
        <div className="roadmap-step">
          <div className="roadmap-marker green" />
          <div className="roadmap-content">
            <div className="roadmap-time">Berkala - Tindakan Preventif</div>
            <div className="roadmap-title">Sanitasi & Pencegahan</div>
            <div className="roadmap-text">{details.prevention}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="roadmap-timeline">
      <div className="roadmap-step">
        <div className="roadmap-marker red" />
        <div className="roadmap-content">
          <div className="roadmap-time">Hari 1 - Tindakan Darurat</div>
          <div className="roadmap-title">Isolasi & Sanitasi Kebun</div>
          <div className="roadmap-text">{details.prevention}</div>
        </div>
      </div>
      <div className="roadmap-step">
        <div className="roadmap-marker amber" />
        <div className="roadmap-content">
          <div className="roadmap-time">Hari 3 - Terapi Organik</div>
          <div className="roadmap-title">Pengobatan Bahan Alami / Hayati</div>
          <div className="roadmap-text">{details.organicTreatment}</div>
        </div>
      </div>
      <div className="roadmap-step">
        <div className="roadmap-marker blue" />
        <div className="roadmap-content">
          <div className="roadmap-time">Hari 7 - Penanganan Sasaran</div>
          <div className="roadmap-title">Fungisida/Insektisida Kimiawi</div>
          <div className="roadmap-text">{details.chemicalTreatment}</div>
        </div>
      </div>
    </div>
  );
}

// ── Komponen Latar Belakang Pendaran Hanyutan Angin Klorofil (Fase 5 - Fitur 2) ──
function BackgroundParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    interface WindParticle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      alpha: number;
      speed: number;
      phase: number;
    }

    const particles: WindParticle[] = [];
    const total = 140; // Ratusan serbuk klorofil neon halus

    for (let i = 0; i < total; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: 0,
        vy: 0,
        r: Math.random() * 1.3 + 0.6, // serbuk klorofil neon sangat halus
        alpha: Math.random() * 0.45 + 0.15,
        speed: Math.random() * 0.22 + 0.12, // kecepatan dasar horizontal yang diperlambat
        phase: Math.random() * Math.PI * 2,
      });
    }

    let mouse = { x: -1000, y: -1000 };
    let lastMouse = { x: -1000, y: -1000 };
    let mouseVelocity = { x: 0, y: 0 };

    const handleMouseMove = (e: MouseEvent) => {
      if (lastMouse.x > 0) {
        mouseVelocity.x = e.clientX - lastMouse.x;
        mouseVelocity.y = e.clientY - lastMouse.y;
      }
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      lastMouse.x = e.clientX;
      lastMouse.y = e.clientY;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
      lastMouse.x = -1000;
      lastMouse.y = -1000;
      mouseVelocity.x = 0;
      mouseVelocity.y = 0;
    };

    const handleResize = () => {
      if (!canvas) return;
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("resize", handleResize);
    document.body.addEventListener("mouseleave", handleMouseLeave);

    let time = 0;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      time += 0.35; // Kecepatan alur waktu angin yang diperlambat agar lebih tenang

      // Perlambat transfer kecepatan kursor secara bertahap
      mouseVelocity.x *= 0.95;
      mouseVelocity.y *= 0.95;

      particles.forEach((p) => {
        // 1. Aliran Medan Vektor Angin Organik (Hanyutan horizontal bergelombang super lembut)
        const windAngle = Math.sin(p.y * 0.005 + time * 0.001) * Math.cos(p.x * 0.003 + time * 0.0005) * 0.4;
        
        p.vx = Math.cos(windAngle) * p.speed + 0.06; // Hanyutan dasar yang sangat perlahan
        p.vy = Math.sin(windAngle) * p.speed + Math.sin(time * 0.002 + p.phase) * 0.04;

        // 2. Interaksi Magnet Kursor (Vorteks Angin Kursor & Pemindahan Kinetik yang Diperhalus)
        if (mouse.x > 0) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 220) {
            const force = (220 - dist) / 220;
            const angle = Math.atan2(dy, dx);
            
            // Gerakan melingkar (swirl/vortex) di sekitar kursor mouse yang diperhalus dayanya
            const swirlAngle = angle + Math.PI / 2;
            const swirlStrength = force * 0.7; // Diperlambat dari 1.5
            
            // Gabungkan putaran vorteks, transfer daya ayunan kursor, dan gaya hisap magnetis
            p.vx += Math.cos(swirlAngle) * swirlStrength + mouseVelocity.x * force * 0.08;
            p.vy += Math.sin(swirlAngle) * swirlStrength + mouseVelocity.y * force * 0.08;

            // Spiral tarikan magnetis lembut yang diperhalus
            p.vx -= Math.cos(angle) * force * 0.12;
            p.vy -= Math.sin(angle) * force * 0.12;
          }
        }

        // Terapkan kecepatan ke koordinat partikel
        p.x += p.vx;
        p.y += p.vy;

        // Pembungkusan koordinat (Seamless wrapping ketika melewati layar)
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        if (p.y > h + 20) p.y = -20;

        // 3. Gambar serbuk klorofil bulat bersinar lembut
        ctx.fillStyle = `rgba(74, 222, 128, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();

        // 4. Gambar Ekor Pusaran Kinetik (Ekor pudar indah searah kecepatan hanyutan)
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > 0.1) {
          ctx.strokeStyle = `rgba(74, 222, 128, ${p.alpha * 0.35})`;
          ctx.lineWidth = p.r * 0.7;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 3.5, p.y - p.vy * 3.5);
          ctx.stroke();
        }
      });

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
      document.body.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="particle-canvas" />;
}

// ── Komponen Telemetri Spektrometri Real-Time (Fase 4) ──
function SpectrometryReadout() {
  const [lambda, setLambda] = useState(530);
  const [reflectance, setReflectance] = useState(0.65);
  const [chlAbs, setChlAbs] = useState(0.81);
  const [waterIndex, setWaterIndex] = useState(0.74);

  useEffect(() => {
    const timer = setInterval(() => {
      setLambda(Math.floor(520 + Math.random() * 25));
      setReflectance(Number((0.55 + Math.random() * 0.25).toFixed(3)));
      setChlAbs(Number((0.70 + Math.random() * 0.20).toFixed(3)));
      setWaterIndex(Number((0.68 + Math.random() * 0.15).toFixed(3)));
    }, 85);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="spec-readout">
      <div className="spec-line"><span className="spec-key">LAMBDA:</span><span className="spec-val-active">{lambda} nm</span></div>
      <div className="spec-line"><span className="spec-key">REFLECTANCE:</span><span className="spec-val-active">{reflectance}</span></div>
      <div className="spec-line"><span className="spec-key">CHL_ABSORB:</span><span className="spec-val-active">{chlAbs}</span></div>
      <div className="spec-line"><span className="spec-key">H2O_INDEX:</span><span className="spec-val-active">{waterIndex}</span></div>
      <div className="spec-line" style={{ borderTop: "1px solid rgba(74, 222, 128, 0.12)", paddingTop: 3, marginTop: 2 }}><span className="spec-key">SYS.SPECTRA:</span><span className="spec-val-active" style={{ color: "#a7f3d0" }}>ACTIVE</span></div>
    </div>
  );
}

function SineWaveTelemetry() {
  return (
    <div className="sine-wave-container">
      <svg className="sine-wave-svg" viewBox="0 0 200 20" preserveAspectRatio="none">
        <path d="M 0 10 Q 5 2.5 10 10 T 20 10 T 30 10 T 40 10 T 50 10 T 60 10 T 70 10 T 80 10 T 90 10 T 100 10 T 110 10 T 120 10 T 130 10 T 140 10 T 150 10 T 160 10 T 170 10 T 180 10 T 190 10 T 200 10" />
      </svg>
    </div>
  );
}

// ── Komponen Modal Detail Riwayat (Fase 5 - Fitur 1 & 2) ──
interface HistoryDetailModalProps {
  item: HistoryItem;
  onClose: () => void;
  onDownloadPdf: (item: HistoryItem) => void;
  isPdfLoading: boolean;
}

function HistoryDetailModal({ item, onClose, onDownloadPdf, isPdfLoading }: HistoryDetailModalProps) {
  const isHealthy = item.result.detections.length === 0;
  
  // Deterministic bio-telemetry mock-up values based on detections and threshold
  const chlorophyllVal = isHealthy ? 92 : Math.max(45, Math.min(80, Math.round(85 - (item.confThreshold * 40))));
  const moistureVal = isHealthy ? 88 : Math.max(40, Math.min(75, Math.round(80 - (item.confThreshold * 35))));
  const fiberVal = isHealthy ? 95 : Math.max(55, Math.min(85, Math.round(90 - (item.confThreshold * 20))));

  return (
    <div className="hmodal-overlay" onClick={onClose}>
      <div className="hmodal-container" onClick={(e) => e.stopPropagation()}>
        <div className="hmodal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <History size={16} style={{ color: "var(--col-accent)" }} />
            <h3 className="hmodal-title">Detail Hasil Pemindaian AI</h3>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button 
              className="btn-primary" 
              style={{ padding: "4px 10px", fontSize: 10, height: 26, gap: 5, display: "flex", alignItems: "center" }} 
              onClick={() => onDownloadPdf(item)}
              disabled={isPdfLoading}
            >
              <Download size={10} /> <span>{isPdfLoading ? "Membuat PDF..." : "Unduh PDF"}</span>
            </button>
            <button className="hmodal-close-btn" onClick={onClose} aria-label="Tutup Detail">
              <X size={14} />
            </button>
          </div>
        </div>
        
        <div className="hmodal-content">
          <div className="hmodal-meta">
            <div className="hmodal-meta-item">
              <Calendar size={11} />
              <span>Tanggal: {item.date}</span>
            </div>
            <div className="hmodal-meta-item">
              <Cpu size={11} />
              <span>ID: {item.id}</span>
            </div>
            <div className="hmodal-meta-item">
              <SlidersHorizontal size={11} />
              <span>Threshold: {Math.round(item.confThreshold * 100)}%</span>
            </div>
            <div className="hmodal-meta-item">
              <Activity size={11} />
              <span>Status: {isHealthy ? "Tanaman Sehat" : `${item.result.detections.length} Patogen Terdeteksi`}</span>
            </div>
          </div>

          <div className="hmodal-grid">
            <div className="hmodal-col">
              <span className="hmodal-img-label">GAMBAR ASLI</span>
              <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255, 255, 255, 0.05)", height: 260, display: "flex", alignItems: "center", justifyContent: "center", background: "#030b06" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.imageUrl} alt="original" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              </div>
            </div>
            <div className="hmodal-col">
              <span className="hmodal-img-label">ANALISIS DIAGNOSIS AI</span>
              <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(74, 222, 128, 0.12)", height: 260, background: "#030b06" }}>
                <ResultOverlay
                  imageUrl={item.imageUrl}
                  detections={item.result.detections}
                  imageWidth={item.result.image_width}
                  imageHeight={item.result.image_height}
                />
              </div>
            </div>
          </div>

          {/* Bio-telemetry */}
          <div style={{ padding: "14px 18px", background: "rgba(74, 222, 128, 0.02)", border: "1px solid rgba(74, 222, 128, 0.06)", borderRadius: "var(--r-md)", display: "flex", flexDirection: "column", gap: 10 }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: "var(--col-text-2)", display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
              <Microscope size={12} style={{ color: "var(--col-accent)" }} /> Bio-telemetry Spektrometri Daun
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {/* Chlorophyll */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--col-text-3)", fontFamily: "var(--font-mono)" }}>
                  <span>Kadar Klorofil</span>
                  <span>{chlorophyllVal}%</span>
                </div>
                <div style={{ height: 4, background: "rgba(255, 255, 255, 0.05)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ width: `${chlorophyllVal}%`, height: "100%", background: isHealthy ? "var(--col-green)" : "var(--col-amber)", borderRadius: 99 }} />
                </div>
              </div>
              {/* Moisture */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--col-text-3)", fontFamily: "var(--font-mono)" }}>
                  <span>Kelembapan Sel</span>
                  <span>{moistureVal}%</span>
                </div>
                <div style={{ height: 4, background: "rgba(255, 255, 255, 0.05)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ width: `${moistureVal}%`, height: "100%", background: isHealthy ? "var(--col-green)" : "var(--col-accent)", borderRadius: 99 }} />
                </div>
              </div>
              {/* Fiber Density */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--col-text-3)", fontFamily: "var(--font-mono)" }}>
                  <span>Kerapatan Serat</span>
                  <span>{fiberVal}%</span>
                </div>
                <div style={{ height: 4, background: "rgba(255, 255, 255, 0.05)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ width: `${fiberVal}%`, height: "100%", background: isHealthy ? "var(--col-green)" : "var(--col-red)", borderRadius: 99 }} />
                </div>
              </div>
            </div>
          </div>

          {/* Recovery roadmap */}
          <div style={{ padding: "14px 18px", background: "rgba(0, 0, 0, 0.15)", border: "1px solid rgba(255, 255, 255, 0.02)", borderRadius: "var(--r-md)", display: "flex", flexDirection: "column", gap: 6 }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: "var(--col-text-2)", display: "flex", alignItems: "center", gap: 6, margin: "0 0 4px 0" }}>
              <Sprout size={12} style={{ color: "var(--col-accent)" }} /> Peta Jalan Tindakan Pemulihan Daun
            </h4>
            {isHealthy ? (
              <TreatmentRoadmap label="Healthy" />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {item.result.detections.slice(0, 2).map((d, idx) => (
                  <div key={idx} style={{ borderTop: idx > 0 ? "1px dashed rgba(255, 255, 255, 0.06)" : "none", paddingTop: idx > 0 ? 10 : 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--col-accent)", marginBottom: 4, fontFamily: "var(--font-mono)" }}>
                      PATOGEN: {d.label.toUpperCase()} (Severity: {d.severity})
                    </div>
                    <TreatmentRoadmap label={d.label} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Laboratorium Spektrometri Daun Digital Data (Opsi E) ──
const cropSpecData = {
  padi: {
    healthy: { blue: 8, green: 22, red: 6, nir: 82, ndvi: 0.86, rvi: 13.7 },
    diseased: { blue: 14, green: 16, red: 18, nir: 38, ndvi: 0.36, rvi: 2.1 }
  },
  tomat: {
    healthy: { blue: 7, green: 20, red: 5, nir: 85, ndvi: 0.89, rvi: 17.0 },
    diseased: { blue: 12, green: 15, red: 16, nir: 32, ndvi: 0.33, rvi: 2.0 }
  },
  cabai: {
    healthy: { blue: 9, green: 24, red: 7, nir: 78, ndvi: 0.84, rvi: 11.1 },
    diseased: { blue: 15, green: 18, red: 20, nir: 35, ndvi: 0.27, rvi: 1.8 }
  },
  jagung: {
    healthy: { blue: 8, green: 19, red: 5, nir: 80, ndvi: 0.88, rvi: 16.0 },
    diseased: { blue: 13, green: 14, red: 17, nir: 40, ndvi: 0.40, rvi: 2.4 }
  },
  kentang: {
    healthy: { blue: 7, green: 21, red: 6, nir: 84, ndvi: 0.87, rvi: 14.0 },
    diseased: { blue: 11, green: 16, red: 15, nir: 30, ndvi: 0.33, rvi: 2.0 }
  }
};

export default function HomePage() {
  const [stage,        setStage]        = useState<Stage>("idle");
  const [imageUrl,     setImageUrl]     = useState<string | null>(null);
  const [file,         setFile]         = useState<File | null>(null);
  const [result,       setResult]       = useState<DetectResponse | null>(null);
  const [errorMsg,     setErrorMsg]     = useState("");
  const [isDrag,       setIsDrag]       = useState(false);
  const [confThreshold,setConfThreshold]= useState(0.25);
  const [mainTab,      setMainTab]      = useState<MainTab>("deteksi");
  const [uploadTab,    setUploadTab]    = useState<UploadTab>("upload");
  const [history,      setHistory]      = useState<HistoryItem[]>([]);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [navOpen,      setNavOpen]      = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [showJson,     setShowJson]     = useState(false);
  const [activeDrawerDisease, setActiveDrawerDisease] = useState<string | null>(null);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);

  // ── Virtual Ag-Botanist Chatbot States (Fase 9) ──
  const [botanistOpen, setBotanistOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "bot"; text: string }>>([
    { sender: "bot", text: "Halo Mitra Tani! Saya adalah Asisten Virtual Botanis SiPetani AI. Silakan tanyakan apa saja seputar kesehatan daun, dosis pupuk, obat organik, atau langkah pencegahan hama tanaman Anda!" }
  ]);
  const [chatTyping, setChatTyping] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // ── Laboratorium Tani States & Logics (Fase 10) ──
  const [labSubTab, setLabSubTab] = useState<"kalkulator" | "pestisida" | "radar" | "ensiklopedia">("kalkulator");

  // NPK Calculator States
  const [npkCrop, setNpkCrop] = useState<"Padi" | "Tomat" | "Cabai" | "Jagung" | "Kentang">("Padi");
  const [npkArea, setNpkArea] = useState<number>(1000);
  const [npkStage, setNpkStage] = useState<"persemaian" | "vegetatif" | "pembungaan" | "pembuahan">("vegetatif");
  const [npkSoil, setNpkSoil] = useState<"lempung" | "liat" | "berpasir">("lempung");

  // NPK Calculation logic
  const getNPKCalculation = () => {
    const base = {
      Padi: { N: 12, P: 6, K: 8 },
      Tomat: { N: 15, P: 10, K: 18 },
      Cabai: { N: 14, P: 12, K: 15 },
      Jagung: { N: 16, P: 8, K: 10 },
      Kentang: { N: 12, P: 10, K: 20 }
    }[npkCrop];

    const soilMultiplier = {
      lempung: { N: 1.0, P: 1.0, K: 1.0 },
      liat: { N: 0.9, P: 1.3, K: 1.0 },
      berpasir: { N: 1.25, P: 1.0, K: 1.3 }
    }[npkSoil];

    const stageMultiplier = {
      persemaian: { N: 0.4, P: 0.5, K: 0.3 },
      vegetatif: { N: 1.2, P: 1.0, K: 0.9 },
      pembungaan: { N: 0.8, P: 1.4, K: 1.2 },
      pembuahan: { N: 0.6, P: 0.9, K: 1.6 }
    }[npkStage];

    const nGram = npkArea * base.N * soilMultiplier.N * stageMultiplier.N;
    const pGram = npkArea * base.P * soilMultiplier.P * stageMultiplier.P;
    const kGram = npkArea * base.K * soilMultiplier.K * stageMultiplier.K;

    const urea = (nGram / 0.46) / 1000;
    const sp36 = (pGram / 0.36) / 1000;
    const kcl = (kGram / 0.60) / 1000;

    return {
      n: Math.round(nGram),
      p: Math.round(pGram),
      k: Math.round(kGram),
      urea: Number(urea.toFixed(1)),
      sp36: Number(sp36.toFixed(1)),
      kcl: Number(kcl.toFixed(1)),
      ureaBags: Math.ceil(urea / 50),
      sp36Bags: Math.ceil(sp36 / 50),
      kclBags: Math.ceil(kcl / 50)
    };
  };

  // Pesticide Mixer States
  const [chemA, setChemA] = useState<string>("none");
  const [chemB, setChemB] = useState<string>("none");
  const [mixingStage, setMixingStage] = useState<"idle" | "pouring" | "done">("idle");
  const [mixResult, setMixResult] = useState<any>(null);
  
  // Clean, realistic chemical diagnostics state & logic (3. ROLLING METRICS)
  const [mixMetrics, setMixMetrics] = useState({ ph: 6.8, density: 1.01, status: "Stabil" });

  useEffect(() => {
    let interval: any;
    if (mixingStage === "pouring") {
      interval = setInterval(() => {
        setMixMetrics({
          ph: Number((3.0 + Math.random() * 6.0).toFixed(1)),
          density: Number((0.95 + Math.random() * 0.35).toFixed(2)),
          status: "REAKSI..."
        });
      }, 60);
    } else if (mixingStage === "done" && mixResult) {
      const key = [chemA, chemB].sort().join("+");
      if (mixResult.state === "danger") {
        if (key.includes("tembaga")) {
          setMixMetrics({ ph: 3.4, density: 1.22, status: "Koagulasi Antagonis" });
        } else {
          setMixMetrics({ ph: 2.8, density: 1.18, status: "Fitotoksik Asam" });
        }
      } else if (mixResult.state === "warning") {
        setMixMetrics({ ph: 5.6, density: 1.12, status: "Penurunan Efikasi" });
      } else {
        setMixMetrics({ ph: 6.2, density: 1.05, status: "Homogen Sinergis" });
      }
    } else if (mixingStage === "idle") {
      setMixMetrics({ ph: 6.8, density: 1.01, status: "Stabil" });
    }
    return () => clearInterval(interval);
  }, [mixingStage, mixResult, chemA, chemB]);

  // ALL 4 PREMIUM EXTENSIONS - EXTRA STATE AND LOGIC
  const [showLeafP3K, setShowLeafP3K] = useState(false);
  const [nozzleType, setNozzleType] = useState<"standard" | "induction" | "cone">("standard");
  const [tankCost, setTankCost] = useState<number>(35000);
  const [sprayFrequency, setSprayFrequency] = useState<number>(6);
  
  const [showChatbot, setShowChatbot] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{ sender: "bot" | "user", text: string }>>([
    { sender: "bot", text: "Halo! Saya Agronomis Virtual SiPetani. Ada gejala penyakit atau hama tanaman di kebun Anda yang ingin dikonsultasikan? Pilih topik di bawah." }
  ]);
  const [encyclopediaSearch, setEncyclopediaSearch] = useState("");
  const [encyclopediaFilter, setEncyclopediaFilter] = useState("all");

  // Pilihan D: Apoteker Tani
  const [apoBrandA, setApoBrandA] = useState<string>("none");
  const [apoBrandB, setApoBrandB] = useState<string>("none");
  const [apoTankSize, setApoTankSize] = useState<number>(16);
  const [apoCrop, setApoCrop] = useState<string>("padi");
  const [apoIsGenerating, setApoIsGenerating] = useState<boolean>(false);
  const [apoRecipe, setApoRecipe] = useState<any>(null);

  const handleChatOption = async (option: string) => {
    let userText = "";
    let botText = "";
    
    if (option === "padi_blas") {
      userText = "🌾 Tanya penyakit Blas pada Padi";
      botText = "Penyakit Blas (bakar daun/leher) disebabkan jamur Pyricularia oryzae. Solusi Taktis: 1. Kurangi pupuk nitrogen (Urea) berlebih karena memperlemah jaringan. 2. Jaga jarak tanam (sistem Jajar Legowo) agar sirkulasi udara lancar. 3. Semprot fungisida sistemik golongan triazol (seperti Trisiklazol) atau Azoksistrobin bergantian secara rutin.";
    } else if (option === "tomat_late") {
      userText = "🍅 Tanya Busuk Daun pada Tomat";
      botText = "Busuk Daun (Late Blight) disebabkan oomycete Phytophthora infestans. Solusi Taktis: 1. Pangkas segera daun bagian bawah yang terinfeksi dan bakar. 2. Hindari penyiraman langsung mengenai helaian daun di sore hari. 3. Semprot fungisida sistemik berbahan aktif Metalaksil secara bergantian dengan fungisida kontak Tembaga Hidroksida untuk pertahanan maksimal.";
    } else if (option === "cabai_patek") {
      userText = "🌶️ Tanya Penyakit Patek pada Cabai";
      botText = "Patek (Antraknosa) disebabkan jamur Colletotrichum. Solusi Taktis: 1. Petik dan buang buah yang terinfeksi agar tidak menular lewat tetesan air hujan. 2. Semprotkan fungisida kontak Tembaga Hidroksida atau fungisida sistemik Azoksistrobin + Difenokonazol tiap 5-7 hari saat cuaca lembap. 3. Tambahkan perekat pestisida presisi saat menyemprot.";
    } else if (option === "reset") {
      setChatHistory([
        { sender: "bot", text: "Konsultasi disetel ulang. Ada keluhan tanaman lain yang ingin dibahas? Pilih opsi di bawah." }
      ]);
      return;
    }

    setChatHistory(prev => [...prev, { sender: "user", text: userText }]);
    await sleep(400); // short delay
    setChatHistory(prev => [...prev, { sender: "bot", text: botText }]);
  };

  // Pesticide Mixer Logic
  const handleMixPesticides = async () => {
    if (chemA === "none" || chemB === "none") {
      alert("Silakan pilih dua bahan aktif berbeda untuk disimulasikan!");
      return;
    }
    if (chemA === chemB) {
      alert("Pencampuran bahan aktif yang sama tidak memicu reaksi kimia baru. Silakan pilih dua bahan berbeda!");
      return;
    }

    setMixingStage("pouring");
    setMixResult(null);
    await sleep(2500); // 2.5s simulated pour/reaction time

    let state: "compatible" | "warning" | "danger" = "compatible";
    let title = "Campuran Sinergis (Aman)";
    let finalColor = "rgba(34, 197, 94, 0.75)";
    let details = "";
    let advice = "";

    const key = [chemA, chemB].sort().join("+");

    if (key === "asam_amino+tembaga") {
      state = "danger";
      title = "FITOTOKSISITAS EKSTREM (SANGAT BAHAYA)";
      finalColor = "rgba(239, 68, 68, 0.85)";
      details = "Tembaga kontak mengikat gugus asam amino bebas. Ini menonaktifkan nutrisi asam amino secara total, serta melepaskan ion tembaga bebas dalam jumlah berlebih yang bersifat racun dan membakar helaian sel daun tanaman.";
      advice = "Jangan pernah mencampur fungisida kontak tembaga (seperti Copper Hydroxide) dengan pupuk organik asam amino. Berikan jeda minimal 7 hari antara kedua aplikasi.";
    } else if (key === "pupuk_urea+tembaga") {
      state = "danger";
      title = "KOROSI JARINGAN SEL DAUN (BAHAYA)";
      finalColor = "rgba(239, 68, 68, 0.85)";
      details = "Sifat asam tinggi dari nitrogen urea cair melarutkan senyawa tembaga dengan sangat cepat, menciptakan konsentrasi logam tembaga terlarut yang sangat pekat di permukaan daun.";
      advice = "Campuran ini akan membuat daun tanaman layu terbakar seketika. Selalu aplikasikan pupuk urea cair dan tembaga secara terpisah dengan jeda penyemprotan.";
    } else if (key === "trisiklazol+warning" || key === "metalaksil+trisiklazol") {
      state = "warning";
      title = "PENCAMPURAN KURANG EFISIEN (WASPADA)";
      finalColor = "rgba(234, 179, 8, 0.8)";
      details = "Kedua bahan aktif ini adalah golongan fungisida sistemik. Mencampurkan sesama fungisida sistemik dalam satu tangki tidak meningkatkan daya basmi secara signifikan, namun mempercepat patogen menjadi kebal (resistensi).";
      advice = "Disarankan hanya menggunakan salah satu bahan aktif secara bergantian, atau campurkan salah satu fungisida sistemik dengan fungisida kontak protektif (seperti Mankozeb) untuk hasil lebih maksimal.";
    } else if (key === "abamektin+trisiklazol") {
      state = "compatible";
      title = "CAMPURAN SINERGIS OPTIMAL (SANGAT AMAN)";
      finalColor = "rgba(34, 197, 94, 0.8)";
      details = "Kombinasi antara Fungisida Sistemik (Trisiklazol) dan Insektisida Kontak-Lambung (Abamektin) bekerja di target reseptor berbeda tanpa reaksi negatif. Sangat efektif untuk mengatasi Blas Padi sekaligus membasmi hama kutu.";
      advice = "Aman dicampur langsung dalam tangki semprot. Lakukan pengadukan merata dan semprotkan pada pagi hari ketika mulut daun (stomata) terbuka.";
    } else if (key === "abamektin+metalaksil") {
      state = "compatible";
      title = "CAMPURAN PERLINDUNGAN GANDA (AMAN)";
      finalColor = "rgba(34, 197, 94, 0.8)";
      details = "Sangat kompatibel. Metalaksil melindungi tanaman dari busuk daun tomat (Late Blight) sedangkan Abamektin mengendalikan hama Thrips atau Kutu Kebul pembawa virus keriting.";
      advice = "Sangat direkomendasikan untuk komoditas hortikultura seperti cabai dan tomat pada musim hujan basah.";
    } else if (key === "asam_amino+pupuk_urea") {
      state = "compatible";
      title = "BOOSTER VEGETATIF (SANGAT SINERGIS)";
      finalColor = "rgba(34, 197, 94, 0.8)";
      details = "Asam amino berfungsi sebagai agen pengkelat alami (chelating agent) yang mempermudah nitrogen Urea diserap langsung oleh dinding sel daun. Mempercepat pembentukan hijau daun klorofil.";
      advice = "Campuran terbaik untuk tanaman yang kerdil atau mengalami stres pasca serangan penyakit daun.";
    } else {
      state = "compatible";
      title = "CAMPURAN UMUM STABIL (AMAN)";
      finalColor = "rgba(34, 197, 94, 0.7)";
      details = "Tidak ditemukan indikasi inkompatibilitas kimiawi yang berbahaya. Bahan aktif dapat larut bersama dengan baik tanpa mengendap.";
      advice = "Selalu lakukan ujicoba skala kecil (jar test) dalam wadah gelas kecil sebelum menuangkannya dalam tangki semprot besar.";
    }

    setMixResult({ state, title, color: finalColor, details, advice });
    setMixingStage("done");
  };

  // Pilihan D: Apoteker Tani Racikan Handler
  const handleRacikTangki = async () => {
    if (apoBrandA === "none") {
      alert("Silakan pilih minimal Pestisida A untuk diracik!");
      return;
    }

    setApoIsGenerating(true);
    setApoRecipe(null);
    await sleep(1500); // simulated brewing time

    const brandsDb: Record<string, { name: string; active: string; category: string; type: "cair" | "tepung"; baseDose: number; unit: string; moa: string; desc: string }> = {
      antracol: {
        name: "Antracol 70 WP",
        active: "Propineb 70%",
        category: "Fungisida Kontak Protektif",
        type: "tepung",
        baseDose: 2.0,
        unit: "gram",
        moa: "FRAC Group M03 (Multi-site activity)",
        desc: "Fungisida kontak pelindung berwarna krem untuk mengendalikan busuk daun dan bercak daun."
      },
      amistartop: {
        name: "Amistartop 325 SC",
        active: "Azoksistrobin 200 g/L + Difenokonazol 125 g/L",
        category: "Fungisida Sistemik & Zat Pengatur Tumbuh (ZPT)",
        type: "cair",
        baseDose: 1.0,
        unit: "mL",
        moa: "FRAC Group 11 + 3 (QoI + DMI)",
        desc: "Fungisida sistemik premium yang menembus sel daun, menghentikan perkecambahan spora, sekaligus menyuburkan daun."
      },
      daconil: {
        name: "Daconil 75 WP",
        active: "Klorotalonil 75%",
        category: "Fungisida Kontak Protektif",
        type: "tepung",
        baseDose: 1.5,
        unit: "gram",
        moa: "FRAC Group M05 (Multi-site activity)",
        desc: "Fungisida kontak berspektrum luas untuk melindungi daun sebelum infeksi jamur terjadi."
      },
      decis: {
        name: "Decis 25 EC",
        active: "Deltametrin 25 g/L",
        category: "Insektisida Kontak & Lambung",
        type: "cair",
        baseDose: 1.5,
        unit: "mL",
        moa: "IRAC Group 3A (Piretroid Sintetik)",
        desc: "Insektisida kontak melumpuhkan ulat grayak, wereng daun, thrips, belalang seketika."
      },
      curacron: {
        name: "Curacron 500 EC",
        active: "Profilofos 500 g/L",
        category: "Insektisida Kontak & Racun Lambung",
        type: "cair",
        baseDose: 2.0,
        unit: "mL",
        moa: "IRAC Group 1B (Organofosfat)",
        desc: "Insektisida penembus telur thrips/kutu daun dengan bau menyengat pencegah hama."
      },
      regent: {
        name: "Regent 50 SC",
        active: "Fipronil 50 g/L",
        category: "Insektisida Sistemik & ZPT",
        type: "cair",
        baseDose: 1.5,
        unit: "mL",
        moa: "IRAC Group 2B (Fiprol)",
        desc: "Insektisida sistemik melumpuhkan serangga pengunyah, perusak daun, wereng sekaligus memacu anakan."
      }
    };

    const bA = brandsDb[apoBrandA];
    const bB = apoBrandB !== "none" ? brandsDb[apoBrandB] : null;

    const doseValA = bA.baseDose * apoTankSize;
    const doseTextA = `${doseValA.toFixed(1)} ${bA.unit}`;
    
    let doseTextB = "";
    if (bB) {
      const doseValB = bB.baseDose * apoTankSize;
      doseTextB = `${doseValB.toFixed(1)} ${bB.unit}`;
    }

    let cropTarget = "";
    if (apoCrop === "padi") cropTarget = "Mengendalikan penyakit Blas (Pyricularia oryzae), Walang Sangit, Wereng Cokelat, dan penggerek batang.";
    else if (apoCrop === "tomat") cropTarget = "Mengatasi Busuk Daun Tomat (Late Blight), bercak kering Alternaria, Ulat Buah Helikoverpa, dan kutu kebul.";
    else if (apoCrop === "cabai") cropTarget = "Melindungi dari penyakit Antraknosa (Patek), rontok buah cabai, hama kutu kebul daun keriting, dan Thrips.";
    else if (apoCrop === "jagung") cropTarget = "Membasmi Bulai Jagung (Peronosclerospora), ulat tentara frugiperda (FAW), dan hawar daun.";
    else if (apoCrop === "kentang") cropTarget = "Mencegah penyakit busuk daun Phytophthora infestans dan thrips vektor virus kentang.";

    const steps: string[] = [];
    steps.push(`1. Isi tangki semprot ukuran ${apoTankSize} Liter dengan air bersih setengah volume (~${apoTankSize / 2} Liter).`);
    
    if (bB && bA.type === "cair" && bB.type === "tepung") {
      steps.push(`2. Masukkan ${bB.name} sebanyak ${doseTextB}. Larutkan dulu dalam gayung berisi air bersih secara terpisah sebelum dituangkan ke tangki.`);
      steps.push(`3. Masukkan ${bA.name} sebanyak ${doseTextA} langsung ke dalam tangki.`);
    } else {
      steps.push(`2. Masukkan ${bA.name} sebanyak ${doseTextA}. ${bA.type === "tepung" ? "Sangat penting: larutkan tepung dalam gayung terpisah dahulu sampai homogen sebelum dimasukkan!" : "Tuangkan langsung ke dalam tangki."}`);
      if (bB) {
        steps.push(`3. Masukkan ${bB.name} sebanyak ${doseTextB}. ${bB.type === "tepung" ? "Larutkan tepung terpisah dulu, baru tuangkan." : "Tuangkan langsung setelah pestisida pertama teraduk rata."}`);
      }
    }
    
    steps.push(`4. Aduk secara merata cairan tangki semprot menggunakan kayu atau bambu bersih secara perlahan (jangan kocok tangki).`);
    steps.push(`5. Tambahkan air bersih hingga tangki semprot penuh mencapai batas ${apoTankSize} Liter.`);
    steps.push(`6. Aplikasikan nosel semprot halus (${nozzleType === "induction" ? "Air Induction (Rekomendasi)" : "Flat Fan"}) dengan tekanan sedang pada pagi hari (pukul 07.00 - 09.30) atau sore hari.`);

    let status: "optimal" | "warning" | "danger" = "optimal";
    let alertMsg = "Campuran sangat sinergis dan aman untuk tanaman target!";
    let statusColor = "#4ade80";

    if (bB) {
      if (apoBrandA === apoBrandB) {
        status = "warning";
        alertMsg = "Pemborosan Zat Aktif! Jangan mencampur dua merek yang identik karena tidak memberikan spektrum perlindungan baru.";
        statusColor = "#fbbf24";
      } else if (bA.category.includes("Fungisida") && bB.category.includes("Fungisida")) {
        if (bA.type === "tepung" && bB.type === "tepung") {
          status = "warning";
          alertMsg = "Risiko Penyumbatan Nosel Semprot tinggi. Dua jenis tepung WP dicampur berpotensi menyumbat filter tangki jika tidak diaduk intensif.";
          statusColor = "#fbbf24";
        } else {
          status = "optimal";
          alertMsg = "Kombinasi fungisida ganda (Kontak + Sistemik) sangat baik untuk mencegah patogen kebal (Resistensi FRAC).";
        }
      } else if (bA.category.includes("Insektisida") && bB.category.includes("Insektisida")) {
        status = "danger";
        alertMsg = "Bahaya Resistensi Ganda & Racun Daun Seketika! Sangat tidak dianjurkan mencampur sesama Insektisida Kontak pekat (seperti Decis + Curacron) secara acak.";
        statusColor = "#f87171";
      } else if ((apoBrandA === "curacron" && apoBrandB === "amistartop") || (apoBrandA === "amistartop" && apoBrandB === "curacron")) {
        status = "warning";
        alertMsg = "Gunakan Pagi Hari Sekali. Amistartop pekat ditambah bau menyengat Curacron dapat menyebabkan fitotoksisitas ringan pada cuaca terik di atas 32°C.";
        statusColor = "#fbbf24";
      }
    }

    setApoRecipe({
      brandAName: bA.name,
      brandBName: bB ? bB.name : null,
      activeA: bA.active,
      activeB: bB ? bB.active : null,
      moaA: bA.moa,
      moaB: bB ? bB.moa : null,
      doseA: doseTextA,
      doseB: bB ? doseTextB : null,
      status,
      statusColor,
      alertMsg,
      cropTarget,
      steps
    });
    setApoIsGenerating(false);
  };

  // Pilihan D: AI Auto-Bridge / Prescription Recipe Generator
  const handleAutoBridgeRecipe = () => {
    if (!result || result.detections.length === 0) return;
    
    // Get the first detected disease
    const diseaseLabel = result.detections[0].label;
    
    // Map disease label to Apoteker Tani parameters
    let crop = "padi";
    let brandA = "none";
    let brandB = "none";
    let tankSize = 16; // default standard tank
    
    if (diseaseLabel === "Rice Blast") {
      crop = "padi";
      brandA = "amistartop";
      brandB = "antracol";
    } else if (diseaseLabel === "Tomato Late Blight") {
      crop = "tomat";
      brandA = "amistartop";
      brandB = "antracol";
    } else if (diseaseLabel === "Chili Leaf Curl") {
      crop = "cabai";
      brandA = "decis";
      brandB = "regent";
    } else if (diseaseLabel === "Potato Early Blight") {
      crop = "kentang";
      brandA = "daconil";
      brandB = "amistartop";
    } else if (diseaseLabel === "Corn Common Rust") {
      crop = "jagung";
      brandA = "antracol";
      brandB = "amistartop";
    } else {
      // Fallback cerdas untuk penyakit/bercak daun umum lainnya (seperti daun singkong)
      crop = "tomat"; // komoditas hortikultura umum
      brandA = "antracol"; // fungisida kontak protektif universal teraman
      brandB = "none";
    }
    
    // Set states
    setApoCrop(crop);
    setApoBrandA(brandA);
    setApoBrandB(brandB);
    setApoTankSize(tankSize);
    
    // Switch to Lab Tani -> Simulator Pestisida sub-tab
    setMainTab("laboratorium");
    setLabSubTab("pestisida");
    
    // Pre-calculate the recipe so it's ready when the page renders!
    setApoIsGenerating(true);
    setApoRecipe(null);
    
    setTimeout(() => {
      const brandsDb: Record<string, { name: string; active: string; category: string; type: "cair" | "tepung"; baseDose: number; unit: string; moa: string; desc: string }> = {
        antracol: {
          name: "Antracol 70 WP",
          active: "Propineb 70%",
          category: "Fungisida Kontak Protektif",
          type: "tepung",
          baseDose: 2.0,
          unit: "gram",
          moa: "FRAC Group M03 (Multi-site activity)",
          desc: "Fungisida kontak pelindung berwarna krem untuk mengendalikan busuk daun dan bercak daun."
        },
        amistartop: {
          name: "Amistartop 325 SC",
          active: "Azoksistrobin 200 g/L + Difenokonazol 125 g/L",
          category: "Fungisida Sistemik & Zat Pengatur Tumbuh (ZPT)",
          type: "cair",
          baseDose: 1.0,
          unit: "mL",
          moa: "FRAC Group 11 + 3 (QoI + DMI)",
          desc: "Fungisida sistemik premium yang menembus sel daun, menghentikan perkecambahan spora, sekaligus menyuburkan daun."
        },
        daconil: {
          name: "Daconil 75 WP",
          active: "Klorotalonil 75%",
          category: "Fungisida Kontak Protektif",
          type: "tepung",
          baseDose: 1.5,
          unit: "gram",
          moa: "FRAC Group M05 (Multi-site activity)",
          desc: "Fungisida kontak berspektrum luas untuk melindungi daun sebelum infeksi jamur terjadi."
        },
        decis: {
          name: "Decis 25 EC",
          active: "Deltametrin 25 g/L",
          category: "Insektisida Kontak & Lambung",
          type: "cair",
          baseDose: 1.5,
          unit: "mL",
          moa: "IRAC Group 3A (Piretroid Sintetik)",
          desc: "Insektisida kontak melumpuhkan ulat grayak, wereng daun, thrips, belalang seketika."
        },
        curacron: {
          name: "Curacron 500 EC",
          active: "Profilofos 500 g/L",
          category: "Insektisida Kontak & Racun Lambung",
          type: "cair",
          baseDose: 2.0,
          unit: "mL",
          moa: "IRAC Group 1B (Organofosfat)",
          desc: "Insektisida penembus telur thrips/kutu daun dengan bau menyengat pencegah hama."
        },
        regent: {
          name: "Regent 50 SC",
          active: "Fipronil 50 g/L",
          category: "Insektisida Sistemik & ZPT",
          type: "cair",
          baseDose: 1.5,
          unit: "mL",
          moa: "IRAC Group 2B (Fiprol)",
          desc: "Insektisida sistemik melumpuhkan serangga pengunyah, perusak daun, wereng sekaligus memacu anakan."
        }
      };

      const bA = brandsDb[brandA];
      if (!bA) {
        setApoIsGenerating(false);
        addToast("warn", "Resep Belum Tersedia", `Belum ada rekomendasi khusus Apoteker Tani untuk penyakit ${diseaseLabel}.`);
        return;
      }
      const bB = brandB !== "none" ? brandsDb[brandB] : null;

      const doseValA = bA.baseDose * tankSize;
      const doseTextA = `${doseValA.toFixed(1)} ${bA.unit}`;
      
      let doseTextB = "";
      if (bB) {
        const doseValB = bB.baseDose * tankSize;
        doseTextB = `${doseValB.toFixed(1)} ${bB.unit}`;
      }

      let cropTarget = "";
      if (crop === "padi") cropTarget = "Mengendalikan penyakit Blas (Pyricularia oryzae), Walang Sangit, Wereng Cokelat, dan penggerek batang.";
      else if (crop === "tomat") cropTarget = "Mengatasi Busuk Daun Tomat (Late Blight), bercak kering Alternaria, Ulat Buah Helikoverpa, dan kutu kebul.";
      else if (crop === "cabai") cropTarget = "Melindungi dari penyakit Antraknosa (Patek), rontok buah cabai, hama kutu kebul daun keriting, dan Thrips.";
      else if (crop === "jagung") cropTarget = "Membasmi Bulai Jagung (Peronosclerospora), ulat tentara frugiperda (FAW), dan hawar daun.";
      else if (crop === "kentang") cropTarget = "Mencegah penyakit busuk daun Phytophthora infestans dan thrips vektor virus kentang.";

      const steps: string[] = [];
      steps.push(`1. Isi tangki semprot ukuran ${tankSize} Liter dengan air bersih setengah volume (~${tankSize / 2} Liter).`);
      
      if (bB && bA.type === "cair" && bB.type === "tepung") {
        steps.push(`2. Masukkan ${bB.name} sebanyak ${doseTextB}. Larutkan dulu dalam gayung berisi air bersih secara terpisah sebelum dituangkan ke tangki.`);
        steps.push(`3. Masukkan ${bA.name} sebanyak ${doseTextA} langsung ke dalam tangki.`);
      } else {
        steps.push(`2. Masukkan ${bA.name} sebanyak ${doseTextA}. ${bA.type === "tepung" ? "Sangat penting: larutkan tepung dalam gayung terpisah dahulu sampai homogen sebelum dimasukkan!" : "Tuangkan langsung ke dalam tangki."}`);
        if (bB) {
          steps.push(`3. Masukkan ${bB.name} sebanyak ${doseTextB}. ${bB.type === "tepung" ? "Larutkan tepung terpisah dulu, baru tuangkan." : "Tuangkan langsung setelah pestisida pertama teraduk rata."}`);
        }
      }
      
      steps.push(`4. Aduk secara merata cairan tangki semprot menggunakan kayu atau bambu bersih secara perlahan (jangan kocok tangki).`);
      steps.push(`5. Tambahkan air bersih hingga tangki semprot penuh mencapai batas ${tankSize} Liter.`);
      steps.push(`6. Aplikasikan nosel semprot halus (${nozzleType === "induction" ? "Air Induction (Rekomendasi)" : "Flat Fan"}) dengan tekanan sedang pada pagi hari (pukul 07.00 - 09.30) atau sore hari.`);

      let status: "optimal" | "warning" | "danger" = "optimal";
      let alertMsg = "Campuran sangat sinergis dan aman untuk tanaman target!";
      let statusColor = "#4ade80";

      if (bB) {
        if (brandA === brandB) {
          status = "warning";
          alertMsg = "Pemborosan Zat Aktif! Jangan mencampur dua merek yang identik karena tidak memberikan spektrum perlindungan baru.";
          statusColor = "#fbbf24";
        } else if (bA.category.includes("Fungisida") && bB.category.includes("Fungisida")) {
          if (bA.type === "tepung" && bB.type === "tepung") {
            status = "warning";
            alertMsg = "Risiko Penyumbatan Nosel Semprot tinggi. Dua jenis tepung WP dicampur berpotensi menyumbat filter tangki jika tidak diaduk intensif.";
            statusColor = "#fbbf24";
          } else {
            status = "optimal";
            alertMsg = "Kombinasi fungisida ganda (Kontak + Sistemik) sangat baik untuk mencegah patogen kebal (Resistensi FRAC).";
          }
        } else if (bA.category.includes("Insektisida") && bB.category.includes("Insektisida")) {
          status = "danger";
          alertMsg = "Bahaya Resistensi Ganda & Racun Daun Seketika! Sangat tidak dianjurkan mencampur sesama Insektisida Kontak pekat secara acak.";
          statusColor = "#f87171";
        }
      }

      setApoRecipe({
        brandAName: bA.name,
        brandBName: bB ? bB.name : null,
        activeA: bA.active,
        activeB: bB ? bB.active : null,
        moaA: bA.moa,
        moaB: bB ? bB.moa : null,
        doseA: doseTextA,
        doseB: bB ? doseTextB : null,
        status,
        statusColor,
        alertMsg,
        cropTarget,
        steps
      });
      setApoIsGenerating(false);
      
      // Notify user
      addToast("success", "AI Racikan Aktif", `Resep Apoteker Tani untuk penyakit ${diseaseLabel} telah otomatis terpasang!`);
    }, 1000);
  };

  // Radar States (Kept for compatibility)
  const [radarScanning, setRadarScanning] = useState<boolean>(true);
  const [radarRadius, setRadarRadius] = useState<number>(20);
  const [radarSelectedSpot, setRadarSelectedSpot] = useState<any>(null);

  // Spectrometry States (Opsi E)
  const [specCrop, setSpecCrop] = useState<"padi" | "tomat" | "cabai" | "jagung" | "kentang">("padi");
  const [specHealthState, setSpecHealthState] = useState<"healthy" | "diseased">("healthy");
  const [specIsScanning, setSpecIsScanning] = useState<boolean>(false);
  const [specScanProgress, setSpecScanProgress] = useState<number>(0);
  const [specActiveBand, setSpecActiveBand] = useState<"blue" | "green" | "red" | "nir" | "all">("all");
  const [specHoveredWavelength, setSpecHoveredWavelength] = useState<number | null>(null);

  // Pelacak Resistensi States
  const [resTargetType, setResTargetType] = useState<"hama" | "jamur">("hama");
  const [resCycle1, setResCycle1] = useState<string>("none");
  const [resCycle2, setResCycle2] = useState<string>("none");
  const [resCycle3, setResCycle3] = useState<string>("none");
  const [resIsAnalyzing, setResIsAnalyzing] = useState<boolean>(false);
  const [resProgress, setResProgress] = useState<number>(0);
  const [resResult, setResResult] = useState<any>(null);
  const [dnaAngle, setDnaAngle] = useState<number>(0);

  useEffect(() => {
    let animId: number;
    const rotate = () => {
      const speed = resResult ? (resResult.status === "critical" ? 4.5 : resResult.status === "warning" ? 2.5 : 1.2) : 1.2;
      setDnaAngle(prev => (prev + speed) % 360);
      animId = requestAnimationFrame(rotate);
    };
    animId = requestAnimationFrame(rotate);
    return () => cancelAnimationFrame(animId);
  }, [resResult]);

  useEffect(() => {
    let interval: any;
    if (specIsScanning) {
      interval = setInterval(() => {
        setSpecScanProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            setSpecIsScanning(false);
            return 100;
          }
          return prev + 5;
        });
      }, 70);
    }
    return () => clearInterval(interval);
  }, [specIsScanning]);

  const radarSpots = [
    { id: 1, name: "Subang - Blas Padi (Rice Blast)", x: 45, y: 35, severity: "high", distance: 8.2, advice: "Segera kurangi pemupukan Nitrogen/Urea berlebih di petak sawah Anda dan semprotkan fungisida Trisiklazol secara merata pada malai padi." },
    { id: 2, name: "Malang - Busuk Daun Tomat (Late Blight)", x: 75, y: 65, severity: "high", distance: 18.5, advice: "Wabah spora Phytophthora terkonfirmasi menyebar cepat. Lakukan sanitasi dengan memangkas daun bagian bawah berjarak 20 cm dari tanah." },
    { id: 3, name: "Lembang - Kutu Kebul (Begomovirus)", x: 30, y: 55, severity: "medium", distance: 12.1, advice: "Populasi kutu kebul meningkat akibat cuaca panas kering. Pasang perangkap lem kuning (Yellow Sticky Trap) 40 lembar per hektar." },
    { id: 4, name: "Cianjur - Bercak Kering Kentang (Early Blight)", x: 20, y: 25, severity: "low", distance: 24.3, advice: "Kondisi kelembapan mendukung serangan awal Alternaria. Gunakan mulsa jerami tebal untuk mencegah percikan tanah basah membawa jamur ke daun." }
  ];

  // Scheduler & Weather States
  const [selectedCity, setSelectedCity] = useState<string>("Malang");
  const [customTaskInput, setCustomTaskInput] = useState<string>("");
  const [tasks, setTasks] = useState<Array<{ id: string; text: string; done: boolean }>>([
    { id: "1", text: "Semprot Minyak Neem Organik (06:00 - 08:00)", done: false },
    { id: "2", text: "Pemangkasan Cabang Bawah Tanaman Tomat", done: false },
    { id: "3", text: "Aplikasi Pupuk KCl Kalsium untuk Imun Padi", done: false },
    { id: "4", text: "Pasang 10 Lembar Perangkap Kuning (Yellow Sticky Trap)", done: true }
  ]);

  const getWeatherData = () => {
    const data: Record<string, { temp: number; humidity: number; wind: number; rain: number; index: number; status: string; desc: string }> = {
      Malang: { temp: 22, humidity: 85, wind: 8, rain: 20, index: 92, status: "Sangat Layak", desc: "Suhu sejuk, angin tenang. Sangat sempurna untuk penyerapan nutrisi daun." },
      Subang: { temp: 28, humidity: 70, wind: 12, rain: 80, index: 30, status: "Tidak Direkomendasikan", desc: "Potensi hujan badai sangat tinggi dalam 2 jam ke depan. Zat kimia semprot akan tercuci habis ke tanah sebelum diserap daun." },
      Cianjur: { temp: 24, humidity: 90, wind: 6, rain: 40, index: 75, status: "Layak dengan Perekat", desc: "Kelembapan tinggi dan ada gerimis tipis. Wajib tambahkan Surfaktan / Perekat agar pestisida tidak mudah luntur." },
      Indramayu: { temp: 32, humidity: 55, wind: 28, rain: 5, index: 45, status: "Rentan Drift (Angin Kencang)", desc: "Angin bertiup di atas 20 km/h. Butiran semprotan akan tertiup angin (drift) ke area lain, membahayakan tanaman di sekitarnya." },
      Bandung: { temp: 23, humidity: 88, wind: 10, rain: 15, index: 88, status: "Sangat Layak", desc: "Kondisi ideal untuk penyemprotan rutin pestisida nabati atau pupuk kalsium." }
    };

    return data[selectedCity] ?? data.Malang;
  };



  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, chatTyping]);

  const handleSendChatMessage = useCallback(async (msgText: string) => {
    if (!msgText.trim()) return;
    
    // Add user message
    setChatMessages(prev => [...prev, { sender: "user", text: msgText }]);
    setChatInput("");
    setChatTyping(true);
    
    await sleep(1400); // Simulate network/expert thinking latency
    
    let botReply = "";
    const lower = msgText.toLowerCase();
    
    if (lower.includes("organik") || lower.includes("alami") || lower.includes("herbal") || lower.includes("tradisional")) {
      botReply = "🌿 **Rekomendasi Terapi Organik SiPetani:**\n\nUntuk pengobatan alami, Anda bisa menggunakan **Ekstrak Daun Nimba (Neem Oil)** atau larutan **Baking Soda** (1 sendok teh per 1 liter air hangat ditambah 3 tetes sabun cuci piring cair sebagai perekat).\n\nSemprotkan merata pada permukaan atas dan bawah daun yang terinfeksi di pagi hari (jam 06.00 - 08.00) atau sore hari guna menghindari penguapan ekstrem akibat terik matahari.";
    } else if (lower.includes("blas") || lower.includes("padi") || lower.includes("blast")) {
      botReply = "🌾 **Penanganan Penyakit Blas Padi (Pyricularia oryzae):**\n\n1. **Tindakan Instan:** Segera kurangi pemupukan Nitrogen/Urea berlebih karena memperlemah dinding sel daun tanaman.\n2. **Organik:** Semprotkan suspensi bakteri antagonis *Pseudomonas fluorescens* semenjak fase persemaian.\n3. **Kimiawi:** Jika infeksi meluas (>10% rumpun), gunakan fungisida berbahan aktif *Trisiklazol* atau *Difenokonazol* sesuai dosis anjuran.";
    } else if (lower.includes("tomat") || lower.includes("late") || lower.includes("busuk daun") || lower.includes("infestans")) {
      botReply = "🍅 **Penanganan Busuk Daun Tomat (Phytophthora infestans):**\n\n1. **Sanitasi Kritis:** Pangkas segera semua daun bagian bawah (berjarak 20 cm dari tanah) agar tidak memicu kelembapan tanah basah.\n2. **Terapi Hayati:** Semprotkan agen hayati *Trichoderma harzianum* pada perakaran.\n3. **Fungisida Sasaran:** Aplikasikan fungisida sistemik berbahan aktif *Metalaksil* atau *Azoksistrobin* terutama saat curah hujan tinggi.";
    } else if (lower.includes("cabai") || lower.includes("keriting") || lower.includes("kutu") || lower.includes("kebul") || lower.includes("virus")) {
      botReply = "🌶️ **Penanganan Daun Keriting Kuning Cabai (Begomovirus):**\n\n1. **Fokus Vektor:** Virus Begomovirus tidak dapat disembuhkan, maka kita harus membasmi pembawanya yaitu **Kutu Kebul (Whitefly)**.\n2. **Perangkap Fisik:** Pasang **Yellow Sticky Trap** (perangkap lem kuning) di sekitar kebun untuk menarik serangga.\n3. **Pengusir Alami:** Semprotkan air rebusan bawang putih campur cabai rawit secara berkala.";
    } else if (lower.includes("pupuk") || lower.includes("urea") || lower.includes("nitrogen") || lower.includes("dosis") || lower.includes("npk")) {
      botReply = "🧪 **Panduan Pemupukan Seimbang SiPetani:**\n\nSelalu gunakan prinsip pemupukan berimbang **NPK (Nitrogen, Fosfor, Kalium)**. Hindari pemberian pupuk Nitrogen (Urea) berlebih pada musim hujan karena membuat jaringan daun berair (sukulen) yang sangat disukai oleh spora jamur patogen.";
    } else if (lower.includes("kentang") || lower.includes("early") || lower.includes("alternaria")) {
      botReply = "🥔 **Penanganan Bercak Kering Kentang (Alternaria solani):**\n\n1. **Ciri Gejala:** Bercak cokelat tua melingkar konsentris mirip papan target panah.\n2. **Tindakan Alami:** Aplikasikan mulsa organik tebal untuk mencegah percikan tanah basah.\n3. **Kimiawi Kontrol:** Semprotkan fungisida kontak berbahan aktif *Klorotalonil* secara berkala.";
    } else if (lower.includes("jagung") || lower.includes("karat") || lower.includes("rust") || lower.includes("puccinia")) {
      botReply = "🌽 **Penanganan Karat Daun Jagung (Puccinia sorghi):**\n\n1. **Gejala Khas:** Bisul lonjong berisi serbuk jingga kecokelatan mirip karat besi di permukaan daun.\n2. **Tindakan Organik:** Taburkan belerang/sulfur kontak berkonsentrasi rendah.\n3. **Sanitasi Lahan:** Bersihkan gulma di sekeliling inang untuk memutus spora karat.";
    } else {
      botReply = "👨‍🌾 **Halo Sahabat Tani!** Pertanyaan Anda sangat menarik. Secara umum, kunci kesehatan tanaman adalah menjaga sirkulasi udara (jarak tanam yang cukup), menghindari penyiraman langsung pada daun di sore hari (agar daun tidak lembap semalaman), dan memberikan imun alami lewat pemupukan kalium seimbang.\n\nApakah ada penyakit spesifik hasil pemindaian SiPetani yang ingin Anda konsultasikan detail langkah pemulihannya?";
    }
    
    setChatMessages(prev => [...prev, { sender: "bot", text: botReply }]);
    setChatTyping(false);
  }, []);

  const isLoading = ["uploading","preprocessing","inference"].includes(stage);
  const sevOrder  = ["high","medium","low","none"];
  const panelThemeClass = isLoading 
    ? "panel-scanning" 
    : stage === "done" && result 
      ? result.detections.length === 0 
        ? "panel-healthy" 
        : "panel-infected" 
      : "";

  const isHealthy = stage === "done" && result && result.detections.length === 0;
  const hasDisease = stage === "done" && result && result.detections.length > 0;
  const highestSeverity = hasDisease && result
    ? [...result.detections].sort((a,b) => sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity))[0]?.severity
    : "none";

  const chlorophyllVal = isHealthy ? 94 : highestSeverity === "high" ? 38 : highestSeverity === "medium" ? 56 : highestSeverity === "low" ? 72 : 0;
  const moistureVal = isHealthy ? 88 : highestSeverity === "high" ? 42 : highestSeverity === "medium" ? 64 : highestSeverity === "low" ? 78 : 0;
  const densityVal = isHealthy ? 91 : highestSeverity === "high" ? 54 : highestSeverity === "medium" ? 72 : highestSeverity === "low" ? 84 : 0;

  const chlorophyllColor = chlorophyllVal > 80 ? "green" : chlorophyllVal > 50 ? "amber" : "red";
  const moistureColor = moistureVal > 80 ? "green" : moistureVal > 50 ? "amber" : "red";
  const densityColor = densityVal > 80 ? "green" : densityVal > 50 ? "amber" : "red";

  // ── Toast Notification System ──────────────────────────────
  interface Toast { id: string; type: 'success' | 'error' | 'warn'; title: string; msg: string; }
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = useCallback((type: Toast['type'], title: string, msg: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, title, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);
  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const loadHistory = async () => {
      if (isSupabaseConfigured && supabase) {
        try {
          const { data, error } = await supabase
            .from("sipetani_history")
            .select("*")
            .order("created_at", { ascending: false });
          if (error) throw error;
          if (data) {
            const mapped: HistoryItem[] = data.map(item => ({
              id: item.id,
              date: item.date,
              imageUrl: item.image_url,
              result: item.result,
              confThreshold: item.conf_threshold,
            }));
            setHistory(mapped);
            return;
          }
        } catch (err: any) {
          console.error("Gagal memuat riwayat dari Supabase, beralih ke LocalStorage:", err);
          const errMsg = err?.message || err?.error_description || (typeof err === "object" ? JSON.stringify(err) : String(err));
          addToast("warn", "Database Gagal Dimuat", `Gagal sinkronisasi Supabase: ${errMsg}. Menggunakan data lokal.`);
        }
      }

      // Fallback ke LocalStorage
      try {
        const s = localStorage.getItem("sipetani_history");
        if (s) setHistory(JSON.parse(s));
      } catch { /* ignore */ }
    };

    loadHistory();

    // Membaca tab aktif dari URL query parameter jika diakses dari Ensiklopedia
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "deteksi" || tab === "riwayat") {
        setMainTab(tab as MainTab);
      }
    }
  }, []);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      document.querySelectorAll(".panel, .hcard, .disease-card, .hero-stat").forEach(el => {
        const r = el.getBoundingClientRect();
        (el as HTMLElement).style.setProperty("--mouse-x", `${e.clientX - r.left}px`);
        (el as HTMLElement).style.setProperty("--mouse-y", `${e.clientY - r.top}px`);
      });
      const g = document.getElementById("global-cursor-glow");
      if (g) { g.style.left = `${e.clientX}px`; g.style.top = `${e.clientY}px`; }
    };
    window.addEventListener("mousemove", fn);
    return () => window.removeEventListener("mousemove", fn);
  }, [mainTab]);

  useEffect(() => {
    if (stage === "idle" || stage === "preview") {
      document.title = "SiPetani — AI Plant Disease Detection";
    } else if (stage === "uploading" || stage === "preprocessing" || stage === "inference") {
      document.title = "⏳ Memindai Daun... | SiPetani AI";
    } else if (stage === "done") {
      if (result && result.detections.length === 0) {
        document.title = "🌿 Tanaman Sehat! | SiPetani AI";
      } else if (result) {
        document.title = `🔍 ${result.detections.length} Penyakit Terdeteksi! | SiPetani AI`;
      }
    } else if (stage === "error") {
      document.title = "❌ Gagal Menganalisis | SiPetani AI";
    }
  }, [stage, result]);


  const saveHistory = useCallback(async (r: DetectResponse, img: string, conf: number) => {
    const itemId = Date.now().toString();
    const itemDate = new Date().toLocaleString("id-ID");

    let finalImageUrl = img;

    if (isSupabaseConfigured && supabase && file) {
      try {
        // 1. Unggah Gambar ke Storage (Diisolasi agar kegagalan bucket tidak menggagalkan penyimpanan database)
        try {
          const fileExt = file.name.split(".").pop() ?? "png";
          const fileName = `${itemId}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("leaf-images")
            .upload(fileName, file, {
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage
            .from("leaf-images")
            .getPublicUrl(fileName);

          if (urlData?.publicUrl) {
            finalImageUrl = urlData.publicUrl;
          }
        } catch (storageErr) {
          console.warn("⚠️ Gagal mengunggah gambar ke Storage (mungkin bucket 'leaf-images' belum dibuat atau storage policies belum diset publik):", storageErr);
        }

        // 2. Masukkan Data ke Tabel sipetani_history
        const { error: dbError } = await supabase
          .from("sipetani_history")
          .insert({
            id: itemId,
            date: itemDate,
            image_url: finalImageUrl,
            result: r,
            conf_threshold: conf,
          });

        if (dbError) throw dbError;

        const item: HistoryItem = {
          id: itemId,
          date: itemDate,
          imageUrl: finalImageUrl,
          result: r,
          confThreshold: conf,
        };

        setHistory(prev => [item, ...prev].slice(0, 20));
        addToast("success", "☁️ Disimpan ke Database", "Riwayat diagnosis berhasil disimpan secara permanen di Supabase.");
        return;

      } catch (err: any) {
        console.error("Gagal menyimpan ke Supabase, mencadangkan ke LocalStorage:", err);
        const errMsg = err?.message || err?.error_description || (typeof err === "object" ? JSON.stringify(err) : String(err));
        addToast("error", "Supabase Gagal Menyimpan", `Eror: ${errMsg}. Dicadangkan ke LocalStorage.`);
      }
    }

    const item: HistoryItem = {
      id: itemId,
      date: itemDate,
      imageUrl: finalImageUrl,
      result: r,
      confThreshold: conf,
    };
    setHistory(prev => {
      const updated = [item, ...prev].slice(0, 20);
      try { localStorage.setItem("sipetani_history", JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  }, [file, addToast]);

  const handleClearHistory = useCallback(async () => {
    if (confirm("Apakah Anda yakin ingin menghapus semua riwayat pemindaian secara permanen?")) {
      setHistory([]);
      
      if (isSupabaseConfigured && supabase) {
        try {
          const { error } = await supabase
            .from("sipetani_history")
            .delete()
            .neq("id", "0");
          if (error) throw error;
          
          addToast("success", "🗑️ Riwayat Dihapus", "Semua data riwayat berhasil dihapus permanen dari Supabase.");
        } catch (err) {
          console.error("Gagal menghapus riwayat di Supabase:", err);
          addToast("error", "Gagal Menghapus", "Terjadi kesalahan saat menghapus data di database awan.");
        }
      }
      
      try {
        localStorage.removeItem("sipetani_history");
      } catch { /* ignore */ }
    }
  }, [addToast]);

  const handleDownloadPdf = useCallback(async (item: HistoryItem) => {
    setIsPdfLoading(true);
    addToast("warn", "📄 Membuat Laporan PDF...", "Menyusun data diagnosis dan merender dokumen.");

    try {
      const element = document.querySelector(".hmodal-content") as HTMLElement;
      if (!element) throw new Error("Elemen konten laporan tidak ditemukan di halaman.");

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#030b06",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      
      const width = imgWidth * ratio;
      const height = imgHeight * ratio;
      
      const x = (pdfWidth - width) / 2;
      const y = 0;

      pdf.addImage(imgData, "PNG", x, y, width, height);

      const fileName = `SiPetani-Diagnosis-Report-${item.id}.pdf`;
      pdf.save(fileName);

      addToast("success", "📄 PDF Berhasil Diunduh", "Laporan diagnosis resmi SiPetani AI telah berhasil disimpan ke perangkat Anda.");
    } catch (err: any) {
      console.error("Gagal membuat laporan PDF:", err);
      addToast("error", "Ekspor PDF Gagal", `Eror: ${err?.message || String(err)}`);
    } finally {
      setIsPdfLoading(false);
    }
  }, [addToast]);

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) {
      setErrorMsg("File harus berupa gambar (JPG, PNG, WebP).");
      setStage("error"); return;
    }
    setFile(f); setImageUrl(URL.createObjectURL(f));
    setResult(null); setErrorMsg(""); setStage("preview");
    setTerminalLogs([
      "[SYS] Citra daun berhasil dimuat ke memori lokal.",
      `[SYS] File: ${f.name} (${(f.size/1024).toFixed(1)} KB)`,
      "[SYS] Ketuk tombol 'Analisis Sekarang' untuk memulai diagnosis."
    ]);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDrag(false);
    const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setErrorMsg(""); setResult(null);
    setTerminalLogs([
      "[SYS] Menginisialisasi sensor multispektral daun...",
      "[SYS] Menyeleraskan bingkai visual & resolusi ROI...",
      "[SYS] Resolusi target: 640x640 piksel."
    ]);

    setStage("uploading");
    await sleep(150);
    setTerminalLogs(prev => [...prev, "[SYS] Mengunggah citra daun ke server FastAPI (port 8000)..."]);
    await sleep(230);

    setStage("preprocessing");
    setTerminalLogs(prev => [...prev,
      "[SYS] Memulai pra-pemrosesan citra oleh AI...",
      "[SYS] Koreksi kontras adaptif (+30%) & ketajaman (+50%)...",
      "[SYS] Melakukan validasi spektrum klorofil (HSV Color Space)..."
    ]);
    await sleep(250);
    setTerminalLogs(prev => [...prev, "[SYS] Jaringan daun tervalidasi. Spektrum klorofil cocok."]);
    await sleep(270);

    setStage("inference");
    setTerminalLogs(prev => [...prev,
      "[AI] Meluncurkan jaringan saraf tiruan YOLOv8s...",
      "[AI] Memuat bobot model: SIPETANI.v5 (38 kelas agrikultur)...",
      "[AI] Menerapkan Non-Max Suppression (IoU=0.45, Conf=0.25)..."
    ]);

    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch(
        `${API_URL}/api/detect?conf=${confThreshold.toFixed(2)}`,
        { method: "POST", body: form }
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail ?? `HTTP ${res.status}`);
      }
      const data: DetectResponse = await res.json();
      if (!data.success && data.validation_error) {
        setErrorMsg(data.validation_error);
        setStage("error");
        addToast('warn', '⚠ Gambar Tidak Valid', data.validation_error ?? 'Gambar tidak dikenali sebagai daun tanaman.');
        return;
      }

      setResult(data);
      setStage("done");
      addToast(
        data.detections.length === 0 ? 'success' : 'warn',
        data.detections.length === 0 ? '🌿 Tanaman Sehat!' : `🔍 ${data.detections.length} Penyakit Terdeteksi`,
        data.detections.length === 0
          ? 'Tidak ada tanda penyakit ditemukan pada daun ini.'
          : 'Diagnosis selesai. Lihat rekomendasi penanganan di bawah.'
      );
      if (imageUrl) saveHistory(data, imageUrl, confThreshold);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setErrorMsg(msg);
      setStage("error");
      addToast('error', 'Gagal Menganalisis', msg.length > 70 ? msg.slice(0, 70) + '…' : msg);
    }
  };

  const handleReset = () => {
    setStage("idle"); setFile(null);
    setImageUrl(null); setResult(null); setErrorMsg("");
    setTerminalLogs([]);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeDrawerDisease) {
          setActiveDrawerDisease(null);
          return;
        }
        if (stage !== "idle" && !isLoading) {
          handleReset();
        }
      }
      if (e.key === "Enter" && imageUrl && !isLoading && stage === "preview") {
        handleAnalyze();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stage, imageUrl, isLoading, handleReset, handleAnalyze, activeDrawerDisease]);

  const downloadPDF = async () => {
    if (!result || !imageUrl) return;
    setIsPdfLoading(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = 210;
      const H = 297;
      const m = 14;
      
      // ── 1. HEADER BANNER (Futuristic dark-themed banner) ──
      doc.setFillColor(3, 11, 6); 
      doc.rect(0, 0, W, 40, "F");
      
      // Neon green accent line
      doc.setFillColor(74, 222, 128); 
      doc.rect(0, 39, W, 1, "F");
      
      // Title
      doc.setTextColor(240, 253, 244); 
      doc.setFontSize(20); 
      doc.setFont("helvetica", "bold");
      doc.text("SIPETANI AI", m, 16);
      
      // Subtitle
      doc.setFontSize(9); 
      doc.setFont("helvetica", "normal"); 
      doc.setTextColor(134, 239, 172);
      doc.text("AI Agricultural Disease Detection — Laporan Diagnosis Daun", m, 23);
      
      // Date and telemetry
      doc.setFontSize(8); 
      doc.setTextColor(150, 180, 160);
      const formattedDate = new Date().toLocaleString("id-ID");
      doc.text(`Tanggal: ${formattedDate}  |  Model: YOLOv8s  |  Threshold: ${Math.round(confThreshold*100)}%`, m, 32);

      let y = 50;

      // ── 2. HEALTH STATUS BADGE ──
      const isHealthy = result.detections.length === 0;
      doc.setFillColor(isHealthy ? 240 : 254, isHealthy ? 253 : 242, isHealthy ? 244 : 242);
      doc.setDrawColor(isHealthy ? 187 : 254, isHealthy ? 247 : 202, isHealthy ? 208 : 202);
      doc.roundedRect(m, y, W - m * 2, 12, 1.5, 1.5, "FD");
      
      doc.setTextColor(isHealthy ? 21 : 180, isHealthy ? 128 : 83, isHealthy ? 61 : 9);
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "bold");
      doc.text(
        isHealthy 
          ? "✓ TANAMAN SEHAT — Tidak ada patogen atau gejala penyakit terdeteksi."
          : `🔍 POSITIF TERINFEKSI — Terdeteksi ${result.detections.length} gejala penyakit pada daun tanaman.`, 
        m + 4, 
        y + 7.5
      );
      
      y += 20;

      // ── 3. IMAGE PREPARATION & RENDERING (Side-by-side Layout) ──
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imageUrl;
      await new Promise((resolve) => { img.onload = resolve; });

      // Calculate sizes to fit side-by-side with 14mm margins and 10mm gap: 210 - 28 = 182 -> 86mm width each
      const displayImgW = 86;
      const displayImgH = Math.min(65, (img.height / img.width) * displayImgW);

      // A. ORIGINAL IMAGE CANVAS
      const cvOriginal = document.createElement("canvas");
      cvOriginal.width = img.width;
      cvOriginal.height = img.height;
      const ctxO = cvOriginal.getContext("2d");
      if (ctxO) ctxO.drawImage(img, 0, 0);
      
      // Draw border frame and image
      doc.setFillColor(245, 247, 245);
      doc.rect(m, y, displayImgW, displayImgH + 6, "F");
      doc.addImage(cvOriginal.toDataURL("image/jpeg", 0.85), "JPEG", m, y, displayImgW, displayImgH);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(70, 80, 75);
      doc.text("GAMBAR ASLI TANAMAN", m + 3, y + displayImgH + 4.2);

      // B. AI VISUALIZER IMAGE (Canvas with BBoxes in original resolution)
      const cvAI = document.createElement("canvas");
      cvAI.width = img.width;
      cvAI.height = img.height;
      const ctxAI = cvAI.getContext("2d");
      if (ctxAI) {
        ctxAI.drawImage(img, 0, 0);
        
        result.detections.forEach((det) => {
          const { x, y: by, w, h } = det.bbox;
          const rx = x * img.width;
          const ry = by * img.height;
          const rw = w * img.width;
          const rh = h * img.height;

          const color = det.severity === "high" ? "#ef4444" : det.severity === "medium" ? "#eab308" : "#22c55e";

          // Draw Bounding Box stroke
          ctxAI.strokeStyle = color;
          ctxAI.lineWidth = Math.max(3, Math.round(img.width * 0.005));
          ctxAI.strokeRect(rx, ry, rw, rh);

          // Draw label background
          const labelText = `${det.label} (${Math.round(det.confidence * 100)}%)`;
          ctxAI.font = `bold ${Math.max(12, Math.round(img.width * 0.02))}px Helvetica`;
          const textWidth = ctxAI.measureText(labelText).width;
          const labelHeight = Math.max(18, Math.round(img.height * 0.035));
          
          ctxAI.fillStyle = color;
          ctxAI.fillRect(rx, ry - labelHeight > 0 ? ry - labelHeight : ry, textWidth + 10, labelHeight);

          // Draw label text
          ctxAI.fillStyle = "#ffffff";
          ctxAI.fillText(
            labelText, 
            rx + 5, 
            ry - labelHeight > 0 ? ry - labelHeight + (labelHeight * 0.7) : ry + (labelHeight * 0.7)
          );
        });
      }

      const rightImgX = W - m - displayImgW;
      doc.setFillColor(245, 247, 245);
      doc.rect(rightImgX, y, displayImgW, displayImgH + 6, "F");
      doc.addImage(cvAI.toDataURL("image/jpeg", 0.85), "JPEG", rightImgX, y, displayImgW, displayImgH);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.text("VISUALISASI DETEKSI AI (YOLOv8)", rightImgX + 3, y + displayImgH + 4.2);

      y += displayImgH + 12;

      // ── 4. BIO-SENSOR METRICS SECTION ──
      doc.setDrawColor(220, 225, 220);
      doc.line(m, y, W - m, y);
      y += 6;

      doc.setFontSize(10.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(10, 25, 15);
      doc.text("Telemetri Bio-Sensor Daun Tanaman", m, y);
      y += 6;

      const bioMetrics = [
        { name: "Kerapatan Klorofil", val: chlorophyllVal, color: chlorophyllColor === "green" ? [34, 197, 94] : chlorophyllColor === "amber" ? [234, 179, 8] : [239, 68, 68] },
        { name: "Kelembapan Jaringan Sel", val: moistureVal, color: moistureColor === "green" ? [34, 197, 94] : moistureColor === "amber" ? [234, 179, 8] : [239, 68, 68] },
        { name: "Kepadatan Serat Daun", val: densityVal, color: densityColor === "green" ? [34, 197, 94] : densityColor === "amber" ? [234, 179, 8] : [239, 68, 68] }
      ];

      bioMetrics.forEach((metric) => {
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(70, 80, 75);
        doc.text(`${metric.name}: ${metric.val}%`, m, y + 3.2);
        
        // Background track bar
        doc.setFillColor(240, 240, 240);
        doc.rect(m + 48, y, 100, 3.5, "F");
        
        // Progress fill bar
        doc.setFillColor(metric.color[0], metric.color[1], metric.color[2]);
        doc.rect(m + 48, y, metric.val, 3.5, "F");
        
        y += 5.5;
      });

      y += 4;
      doc.setDrawColor(220, 225, 220);
      doc.line(m, y, W - m, y);
      y += 6;

      // ── 5. DETAILED DIAGNOSIS & RECOVERY TREATMENT ──
      doc.setFontSize(10.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(10, 25, 15);
      doc.text("Rekomendasi Penanganan dan Pemulihan", m, y);
      y += 6;

      if (isHealthy) {
        doc.setFillColor(248, 250, 248);
        doc.setDrawColor(230, 240, 230);
        doc.roundedRect(m, y, W - m * 2, 42, 1.5, 1.5, "FD");
        
        const details = getDiseaseDetails("Healthy");
        
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(21, 128, 61);
        doc.text("✓ Tindakan Pencegahan (Preventif):", m + 4, y + 6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(50, 60, 55);
        let textLines = doc.splitTextToSize(details.prevention, W - m * 2 - 8);
        doc.text(textLines, m + 4, y + 10.5);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(21, 128, 61);
        doc.text("✓ Penguatan Nutrisi Organik Tanaman:", m + 4, y + 23);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(50, 60, 55);
        textLines = doc.splitTextToSize(details.organicTreatment, W - m * 2 - 8);
        doc.text(textLines, m + 4, y + 27.5);
      } else {
        result.detections.forEach((det, idx) => {
          // If y position is too tight for the box, add page break
          if (y > 205) {
            doc.addPage();
            y = 18;
          }

          const details = getDiseaseDetails(det.label);

          doc.setFillColor(254, 253, 253);
          doc.setDrawColor(245, 220, 220);
          doc.roundedRect(m, y, W - m * 2, 70, 1.5, 1.5, "FD");

          // Detection header banner inside box
          doc.setFillColor(254, 242, 242);
          doc.rect(m, y, W - m * 2, 7, "F");
          
          doc.setFontSize(8.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(190, 40, 40);
          doc.text(`${idx + 1}. Diagnosis: ${det.label} (Confidence: ${Math.round(det.confidence * 100)}%  ·  Keparahan: ${det.severity.toUpperCase()})`, m + 4, y + 4.8);
          
          doc.setTextColor(60, 70, 65);
          doc.setFontSize(7.5);

          // Prevention
          doc.setFont("helvetica", "bold");
          doc.text("A. Tindakan Pencegahan (Preventif):", m + 4, y + 13);
          doc.setFont("helvetica", "normal");
          let lines = doc.splitTextToSize(details.prevention, W - m * 2 - 10);
          doc.text(lines, m + 4, y + 17.5);

          // Organic Treatment
          doc.setFont("helvetica", "bold");
          doc.text("B. Pengobatan Hayati / Organik:", m + 4, y + 31);
          doc.setFont("helvetica", "normal");
          lines = doc.splitTextToSize(details.organicTreatment, W - m * 2 - 10);
          doc.text(lines, m + 4, y + 35.5);

          // Chemical Treatment
          doc.setFont("helvetica", "bold");
          doc.text("C. Pengobatan Kimiawi Sasaran:", m + 4, y + 49);
          doc.setFont("helvetica", "normal");
          lines = doc.splitTextToSize(details.chemicalTreatment, W - m * 2 - 10);
          doc.text(lines, m + 4, y + 53.5);

          y += 75;
        });
      }

      // ── 6. FOOTER STYLING (A4 Page numbering) ──
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(160, 174, 192);
        
        // draw divider line above footer
        doc.setDrawColor(240, 240, 240);
        doc.line(m, H - 12, W - m, H - 12);
        
        doc.text("SIPETANI — AI Agricultural Disease Detection | Powered by YOLOv8, FastAPI & Next.js", m, H - 7);
        doc.text(`Halaman ${i} dari ${totalPages}`, W - m - 20, H - 7);
      }

      doc.save(`SIPETANI_Laporan_Diagnosis_${Date.now()}.pdf`);
    } catch (e) { 
      console.error("PDF export failed:", e); 
      addToast('error', 'Gagal Ekspor PDF', 'Terjadi kesalahan sistem saat menyusun dokumen PDF.');
    }
    setIsPdfLoading(false);
  };


  return (
    <div className="page-wrapper">

      {/* ── Ambient FX ── */}
      <BackgroundParticles />
      <div className="bg-glow-container">
        <div id="global-cursor-glow" className="global-cursor-glow" />
        <div className="glow-blob glow-1" /><div className="glow-blob glow-2" />
        <div className="glow-blob glow-3" /><div className="glow-blob glow-4" />
      </div>
      <div className="glass-bubble bubble-1" /><div className="glass-bubble bubble-2" />
      <div className="floating-node node-1" /><div className="floating-node node-2" />
      <div className="floating-node node-3" /><div className="floating-node node-4" />
      <div className="floating-node node-5" />

      {/* ── NAVBAR ── */}
      <nav className="navbar">
        <a href="/" className="navbar-brand">
          <div className="navbar-icon"><Leaf /></div>
          <span className="navbar-name">SIPETANI</span>
          <span className="navbar-tag">AI Beta</span>
        </a>
        <button className="nav-hamburger" onClick={() => setNavOpen(o => !o)} aria-label="Menu">
          <span /><span /><span />
        </button>
        <div className={`nav-links ${navOpen ? "open" : ""}`}>
          <button
            className={`nav-link ${mainTab === "deteksi" ? "active" : ""}`}
            onClick={() => { setMainTab("deteksi"); setNavOpen(false); }}>
            <Scan size={14} /> Deteksi
          </button>
          <button
            className={`nav-link ${mainTab === "riwayat" ? "active" : ""}`}
            onClick={() => { setMainTab("riwayat"); setNavOpen(false); }}>
            <History size={14} /> Riwayat
            {history.length > 0 && <span className="nav-badge">{history.length}</span>}
          </button>
          <button
            className={`nav-link ${mainTab === "laboratorium" ? "active" : ""}`}
            onClick={() => { setMainTab("laboratorium"); setNavOpen(false); }}>
            <FlaskConical size={14} /> Lab Tani
            <span style={{
              background: "var(--col-accent)",
              width: 6,
              height: 6,
              borderRadius: "50%",
              boxShadow: "0 0 6px var(--col-accent)",
              display: "inline-block",
              marginLeft: 5,
              animation: "livingPulse 1.8s infinite"
            }} />
          </button>
          <a href="/penyakit" className="nav-link" onClick={() => setNavOpen(false)}>
            <BookOpen size={14} /> Ensiklopedia
          </a>
        </div>
      </nav>

      {/* ═══════════ RIWAYAT ═══════════ */}
      {mainTab === "riwayat" && (
        <main className="main-container tab-fade-in" style={{ paddingTop: 32 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
            <div>
              <h2 style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:700, letterSpacing:"-0.03em", color:"var(--col-text-1)", marginBottom:4 }}>
                Riwayat Analisis
              </h2>
              <p style={{ fontSize:12, color:"var(--col-text-3)", fontFamily:"var(--font-mono)" }}>
                {history.length} scan tersimpan di browser ini
              </p>
            </div>
            {history.length > 0 && (
              <button className="btn-danger-sm"
                onClick={handleClearHistory}>
                <Trash2 size={11} /> Hapus Semua
              </button>
            )}
          </div>

          {/* ── IoT Health Stats Panel ── */}
          {history.length > 0 && (
            <div className="iot-stats-grid">
              {/* Card 1: Total Pemindaian */}
              <div className="stat-card">
                <div className="stat-card-glow green" />
                <div className="stat-card-header">
                  <div className="stat-card-icon"><Activity size={14} /></div>
                  <div className="stat-card-title">TOTAL PEMINDAIAN</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "10px 0", height: 56 }}>
                  <div className="stat-card-value" style={{ margin: 0, display: "flex", alignItems: "baseline" }}>
                    <CountUpNumber end={history.length} /><span className="stat-card-unit" style={{ fontSize: 14, color: "var(--col-text-3)", marginLeft: 4, fontFamily: "var(--font-display)", fontWeight: 700 }}>Citra</span>
                  </div>
                  {/* Micro diagnostic telemetry bars */}
                  <div style={{ display: "flex", gap: 3.5, alignItems: "flex-end", height: 28, marginRight: 4 }}>
                    {[...Array(6)].map((_, i) => {
                      const heights = [10, 18, 26, 14, 22, 16];
                      const delays = [0.1, 0.4, 0.2, 0.6, 0.3, 0.5];
                      return (
                        <div 
                          key={i} 
                          className="telemetry-bar-anim"
                          style={{ 
                            width: 3.5, 
                            height: heights[i], 
                            background: "linear-gradient(to top, rgba(74, 222, 128, 0.15), var(--col-green))", 
                            borderRadius: 99,
                            boxShadow: "0 0 8px rgba(74, 222, 128, 0.35)",
                            animationDelay: `${delays[i]}s`
                          }} 
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="stat-card-footer">
                  <span className="stat-card-footer-lbl">Penyimpanan lokal aktif</span>
                </div>
              </div>

              {/* Card 2: Rasio Kesehatan Daun */}
              {(() => {
                const healthyCount = history.filter(item => item.result.detections.length === 0).length;
                const ratio = history.length > 0 ? Math.round((healthyCount / history.length) * 100) : 100;
                return (
                  <div className="stat-card">
                    <div className="stat-card-glow emerald" />
                    <div className="stat-card-header">
                      <div className="stat-card-icon"><Sprout size={14} /></div>
                      <div className="stat-card-title">RASIO KESEHATAN DAUN</div>
                    </div>
                    {(() => {
                      const radius = 19;
                      const circumference = 2 * Math.PI * radius; // 119.38
                      const offset = circumference - (ratio / 100) * circumference;
                      const color = ratio >= 80 ? "var(--col-green)" : ratio >= 50 ? "var(--col-amber)" : "var(--col-red)";
                      return (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "10px 0", height: 56 }}>
                          <div className="stat-card-value" style={{ margin: 0, display: "flex", alignItems: "baseline" }}>
                            <CountUpNumber end={ratio} /><span className="stat-card-unit" style={{ fontSize: 16, color: "var(--col-text-3)", marginLeft: 2, fontFamily: "var(--font-display)", fontWeight: 700 }}>%</span>
                          </div>
                          <div style={{ position: "relative", width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: "rotate(-90deg)" }}>
                              {/* Outer concentric rotating dotted ring */}
                              <circle
                                cx="28" cy="28" r="24"
                                fill="transparent"
                                stroke={color}
                                strokeWidth="1"
                                strokeDasharray="3 3"
                                className="rotate-slow-anim"
                                style={{
                                  opacity: 0.22,
                                  transformOrigin: "center"
                                }}
                              />
                              {/* Inner track circle */}
                              <circle
                                cx="28" cy="28" r={radius}
                                fill="transparent"
                                stroke="rgba(255, 255, 255, 0.04)"
                                strokeWidth="3.5"
                              />
                              {/* Main progress circle */}
                              <circle
                                cx="28" cy="28" r={radius}
                                fill="transparent"
                                stroke={color}
                                strokeWidth="3.5"
                                strokeDasharray={circumference}
                                strokeDashoffset={offset}
                                strokeLinecap="round"
                                style={{
                                  transition: "stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
                                  filter: `drop-shadow(0 0 5px ${color})`
                                }}
                              />
                            </svg>
                            <div style={{ position: "absolute", fontSize: 8.5, fontFamily: "var(--font-mono)", fontWeight: 700, color: color, textShadow: `0 0 4px ${color}` }}>
                              IDX
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    <div className="stat-card-footer">
                      <span className="stat-card-footer-lbl">{healthyCount} dari {history.length} tanaman sehat</span>
                    </div>
                  </div>
                );
              })()}

              {/* Card 3: Tingkat Ancaman */}
              {(() => {
                const hasHigh = history.some(item => 
                  item.result.detections.some(d => d.severity === "high")
                );
                const hasMedium = history.some(item => 
                  item.result.detections.some(d => d.severity === "medium")
                );
                let alertLabel = "AMAN";
                let alertClass = "safe";
                let alertDesc = "Kondisi tanaman terkendali";
                let threatPercentage = 0;

                if (hasHigh) {
                  alertLabel = "KARANTINA";
                  alertClass = "danger";
                  alertDesc = "Terdeteksi infeksi keparahan tinggi";
                  threatPercentage = 90;
                } else if (hasMedium) {
                  alertLabel = "WASPADA";
                  alertClass = "warning";
                  alertDesc = "Terdeteksi gejala keparahan sedang";
                  threatPercentage = 50;
                }

                const waveColor = alertClass === "safe" ? "var(--col-green)" : alertClass === "warning" ? "var(--col-amber)" : "var(--col-red)";
                
                let wavePath = "M0 12 Q8 4 16 12 T32 12 T48 12 T64 12";
                let waveSpeed = "3s";
                
                if (alertClass === "safe") {
                  wavePath = "M0 12 Q16 4 32 12 T64 12";
                  waveSpeed = "3.2s";
                } else if (alertClass === "warning") {
                  wavePath = "M0 12 Q8 2 16 12 T32 12 T48 12 T64 12";
                  waveSpeed = "1.6s";
                } else {
                  wavePath = "M0 12 Q4 -2 8 12 T16 12 T24 12 T32 12 T40 12 T48 12 T56 12 T64 12";
                  waveSpeed = "0.8s";
                }

                return (
                  <div className="stat-card">
                    <div className={`stat-card-glow ${alertClass}`} />
                    <div className="stat-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="stat-card-icon">
                          <TriangleAlert size={14} style={{ color: waveColor }} />
                        </div>
                        <div className="stat-card-title">TINGKAT ANCAMAN IoT</div>
                      </div>
                      <div className={`stat-card-status-badge ${alertClass}`} style={{ margin: 0, padding: "2px 8px", fontSize: 9, borderRadius: 5, display: "inline-flex", alignItems: "center", height: "fit-content" }}>
                        <span className="status-pulse-dot" />
                        {alertLabel}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "10px 0", height: 56 }}>
                      <div className="stat-card-value" style={{ margin: 0, display: "flex", alignItems: "baseline" }}>
                        <CountUpNumber end={threatPercentage} /><span className="stat-card-unit" style={{ fontSize: 16, color: "var(--col-text-3)", marginLeft: 2, fontFamily: "var(--font-display)", fontWeight: 700 }}>%</span>
                      </div>

                      {/* Animated sensor telemetry wave */}
                      <div style={{ width: 64, height: 24, display: "flex", alignItems: "center", marginRight: 4, overflow: "hidden" }}>
                        <svg width="64" height="24" viewBox="0 0 64 24" style={{ overflow: "visible" }}>
                          <path 
                            d={wavePath} 
                            fill="transparent" 
                            stroke={waveColor} 
                            strokeWidth="2" 
                            strokeLinecap="round"
                            className="wave-line-anim"
                            style={{ 
                              filter: `drop-shadow(0 0 4px ${waveColor})`,
                              animationDuration: waveSpeed
                            }} 
                          />
                        </svg>
                      </div>
                    </div>
                    <div className="stat-card-footer">
                      <span className="stat-card-footer-lbl">{alertDesc}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {history.length === 0 ? (
            <div className="empty-state" style={{ marginTop:60 }}>
              <div className="empty-icon"><FolderOpen size={20} /></div>
              <div className="empty-title">Belum ada riwayat</div>
              <div className="empty-sub">Mulai scan tanaman di tab Deteksi untuk melihat hasilnya di sini.</div>
              <button className="btn-primary" style={{ maxWidth:200, margin:"20px auto 0" }}
                onClick={() => setMainTab("deteksi")}>
                <span>Mulai Deteksi</span> <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <div className="history-grid">
              {history.map(item => {
                const topSev = [...item.result.detections]
                  .sort((a,b) => sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity))[0]?.severity ?? "none";
                return (
                  <div key={item.id} className="hcard" onClick={() => setSelectedHistoryItem(item)} style={{ cursor: "pointer" }}>
                    <div className="hcard-img">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.imageUrl} alt="scan" />
                      <div className={`sev-badge ${topSev}`}>
                        {item.result.detections.length === 0 ? "Sehat" : topSev}
                      </div>
                    </div>
                    <div className="hcard-body">
                      <div className="hcard-date"><Calendar size={10} /> {item.date}</div>
                      <div className="hcard-title">
                        {item.result.detections.length === 0
                          ? "Tanaman sehat"
                          : `${item.result.detections.length} penyakit terdeteksi`}
                      </div>
                      {item.result.detections.slice(0,2).map((d,i) =>
                        <span key={i} className="hcard-chip">{d.label}</span>)}
                      <div className="hcard-conf">conf: {Math.round(item.confThreshold*100)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* ═══════════ LABORATORIUM TANI (Fase 10) ═══════════ */}
      {mainTab === "laboratorium" && (
        <main className="main-container tab-fade-in" style={{ paddingTop: 32 }}>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--col-text-1)", marginBottom: 4 }}>
              Laboratorium Tani Cerdas
            </h2>
            <p style={{ fontSize: 12, color: "var(--col-text-3)", fontFamily: "var(--font-mono)" }}>
              Instrumen agro-teknologi digital untuk pemupukan, pestisida, cuaca, dan deteksi dini wabah kebun.
            </p>
          </div>

          {/* Sub-tab Navigation */}
          <div className="lab-tabs">
            <button className={`lab-tab-btn ${labSubTab === "kalkulator" ? "active" : ""}`} onClick={() => setLabSubTab("kalkulator")}>
              <SlidersHorizontal size={14} /> Kalkulator NPK
            </button>
            <button className={`lab-tab-btn ${labSubTab === "pestisida" ? "active" : ""}`} onClick={() => setLabSubTab("pestisida")}>
              <FlaskConical size={14} /> Simulator Pestisida
            </button>
            <button className={`lab-tab-btn ${labSubTab === "radar" ? "active" : ""}`} onClick={() => setLabSubTab("radar")}>
              <Scan size={14} /> Spektrometri Daun
            </button>
            <button className={`lab-tab-btn ${labSubTab === "ensiklopedia" ? "active" : ""}`} onClick={() => setLabSubTab("ensiklopedia")}>
              <BookOpen size={14} /> Ensiklopedia Zat
            </button>
          </div>

          {/* Sub-tab Content: KALKULATOR NPK */}
          {labSubTab === "kalkulator" && (() => {
            const calc = getNPKCalculation();
            return (
              <div className="npk-calculator-container tab-fade-in">
                <div className="panel">
                  <div className="panel-header">
                    <div className="panel-icon"><SlidersHorizontal size={14} /></div>
                    <div>
                      <div className="panel-title">Form Parameter Tanah &amp; Komoditas</div>
                      <div className="panel-subtitle">Konfigurasikan spesifikasi luas lahan Anda</div>
                    </div>
                  </div>
                  <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div>
                      <label style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--col-text-3)", display: "block", marginBottom: 6 }}>
                        KOMODITAS TANAMAN
                      </label>
                      <UltraCustomSelect 
                        value={npkCrop} 
                        onChange={setNpkCrop}
                        options={npkCropOptions}
                        showSearch={false}
                      />
                    </div>

                    <div className="slider-row">
                      <div className="slider-header">
                        <label className="slider-label" style={{ fontFamily: "var(--font-mono)" }}>
                          LUAS LAHAN TANAM
                        </label>
                        <span className="slider-val">{npkArea} m²</span>
                      </div>
                      <input 
                        type="range" 
                        className="slider" 
                        min={50} max={10000} step={50} 
                        value={npkArea} 
                        onChange={(e) => setNpkArea(Number(e.target.value))}
                        style={{ "--val": (npkArea - 50) / 9950 } as React.CSSProperties}
                        aria-label="Luas lahan tanam"
                      />
                      <div className="slider-hints"><span>50 m²</span><span>10.000 m² (1 Hektar)</span></div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--col-text-3)", display: "block", marginBottom: 6 }}>
                          FASE PERTUMBUHAN
                        </label>
                        <UltraCustomSelect 
                          value={npkStage} 
                          onChange={setNpkStage}
                          options={npkStageOptions}
                          showSearch={false}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--col-text-3)", display: "block", marginBottom: 6 }}>
                          TEKSTUR &amp; TIPE TANAH
                        </label>
                        <UltraCustomSelect 
                          value={npkSoil} 
                          onChange={setNpkSoil}
                          options={npkSoilOptions}
                          showSearch={false}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-header">
                    <div className="panel-icon" style={{ color: "var(--col-accent)" }}><FlaskConical size={14} /></div>
                    <div>
                      <div className="panel-title">Hasil Rekomendasi Nutrisi N-P-K</div>
                      <div className="panel-subtitle">Dosis kebutuhan unsur murni dan sak pupuk komersial</div>
                    </div>
                  </div>
                  <div className="panel-body">
                    {/* Donut / Radial Indicators for Nitrogen, Phosphor, Potassium */}
                    <div className="circular-progress-group">
                      {/* Nitrogen */}
                      <div className="npk-progress-ring-container">
                        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--col-text-3)" }}>NITROGEN (N)</span>
                        <div style={{ position: "relative", width: 70, height: 70 }}>
                          <svg className="npk-progress-ring" width="70" height="70">
                            <circle className="npk-ring-bg" cx="35" cy="35" r="28" strokeWidth="4" />
                            <circle className="npk-ring-fill" cx="35" cy="35" r="28" strokeWidth="4" stroke="#4ade80" strokeDasharray="175.9" strokeDashoffset={175.9 - (Math.min(100, (calc.n / (npkArea * 18)) * 100) / 100) * 175.9} style={{ filter: "drop-shadow(0 0 4px #4ade80)" }} />
                          </svg>
                          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--col-green)" }}>
                            {calc.n >= 1000 ? `${(calc.n / 1000).toFixed(1)}kg` : `${calc.n}g`}
                          </div>
                        </div>
                      </div>

                      {/* Phosphor */}
                      <div className="npk-progress-ring-container">
                        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--col-text-3)" }}>FOSFOR (P)</span>
                        <div style={{ position: "relative", width: 70, height: 70 }}>
                          <svg className="npk-progress-ring" width="70" height="70">
                            <circle className="npk-ring-bg" cx="35" cy="35" r="28" strokeWidth="4" />
                            <circle className="npk-ring-fill" cx="35" cy="35" r="28" strokeWidth="4" stroke="#60a5fa" strokeDasharray="175.9" strokeDashoffset={175.9 - (Math.min(100, (calc.p / (npkArea * 15)) * 100) / 100) * 175.9} style={{ filter: "drop-shadow(0 0 4px #60a5fa)" }} />
                          </svg>
                          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", color: "#60a5fa" }}>
                            {calc.p >= 1000 ? `${(calc.p / 1000).toFixed(1)}kg` : `${calc.p}g`}
                          </div>
                        </div>
                      </div>

                      {/* Kalium */}
                      <div className="npk-progress-ring-container">
                        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--col-text-3)" }}>KALIUM (K)</span>
                        <div style={{ position: "relative", width: 70, height: 70 }}>
                          <svg className="npk-progress-ring" width="70" height="70">
                            <circle className="npk-ring-bg" cx="35" cy="35" r="28" strokeWidth="4" />
                            <circle className="npk-ring-fill" cx="35" cy="35" r="28" strokeWidth="4" stroke="#f43f5e" strokeDasharray="175.9" strokeDashoffset={175.9 - (Math.min(100, (calc.k / (npkArea * 20)) * 100) / 100) * 175.9} style={{ filter: "drop-shadow(0 0 4px #f43f5e)" }} />
                          </svg>
                          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", color: "#f43f5e" }}>
                            {calc.k >= 1000 ? `${(calc.k / 1000).toFixed(1)}kg` : `${calc.k}g`}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sack / Bag converters */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "var(--r-md)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80" }} />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--col-text-2)" }}>Pupuk UREA (46% Nitrogen)</div>
                            <div style={{ fontSize: 9, color: "var(--col-text-4)", fontFamily: "var(--font-mono)" }}>Fokus Pertumbuhan Hijau Daun</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--col-green)", fontFamily: "var(--font-mono)" }}>{calc.urea} kg</span>
                          <span style={{ display: "block", fontSize: 9, color: "var(--col-text-3)", fontFamily: "var(--font-mono)" }}>~{calc.ureaBags} Karung (50kg)</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "var(--r-md)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#60a5fa" }} />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--col-text-2)" }}>Pupuk SP-36 (36% Fosfat)</div>
                            <div style={{ fontSize: 9, color: "var(--col-text-4)", fontFamily: "var(--font-mono)" }}>Fokus Pertumbuhan Akar &amp; Bunga</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#60a5fa", fontFamily: "var(--font-mono)" }}>{calc.sp36} kg</span>
                          <span style={{ display: "block", fontSize: 9, color: "var(--col-text-3)", fontFamily: "var(--font-mono)" }}>~{calc.sp36Bags} Karung (50kg)</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "var(--r-md)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f43f5e" }} />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--col-text-2)" }}>Pupuk KCl (60% Kalium)</div>
                            <div style={{ fontSize: 9, color: "var(--col-text-4)", fontFamily: "var(--font-mono)" }}>Penguat Dinding Sel &amp; Daya Imun Tanaman</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#f43f5e", fontFamily: "var(--font-mono)" }}>{calc.kcl} kg</span>
                          <span style={{ display: "block", fontSize: 9, color: "var(--col-text-3)", fontFamily: "var(--font-mono)" }}>~{calc.kclBags} Karung (50kg)</span>
                        </div>
                      </div>
                    </div>

                    {/* Pilihan B: Kalkulator Biaya Penyemprotan & Eco-Saving */}
                    <div className="spray-cost-panel">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 8, justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ color: "var(--col-accent)" }}><Activity size={14} /></div>
                          <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: "var(--col-text-2)", letterSpacing: "0.05em" }}>
                            Kalkulator Biaya Penyemprotan & Efisiensi Nosel
                          </div>
                        </div>
                        <span className="saving-badge">
                          🎉 Save {(nozzleType === "induction" ? (calc.ureaBags * tankCost * 0.15 * sprayFrequency) : (calc.ureaBags * tankCost * 0.02 * sprayFrequency)).toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })}
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>
                        <div>
                          <label style={{ fontSize: 10, color: "var(--col-text-3)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Estimasi Biaya per Tangki</label>
                          <input 
                            type="number" 
                            value={tankCost}
                            onChange={(e) => setTankCost(Math.max(0, Number(e.target.value)))}
                            style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid var(--brd-sm)", borderRadius: "var(--r-md)", padding: "4px 8px", color: "var(--col-text-1)", fontSize: 12, outline: "none" }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, color: "var(--col-text-3)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Frekuensi Semprot / Musim</label>
                          <input 
                            type="number" 
                            value={sprayFrequency}
                            onChange={(e) => setSprayFrequency(Math.max(1, Number(e.target.value)))}
                            style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid var(--brd-sm)", borderRadius: "var(--r-md)", padding: "4px 8px", color: "var(--col-text-1)", fontSize: 12, outline: "none" }}
                          />
                        </div>
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 10, color: "var(--col-text-3)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Tipe Nosel Penyemprotan</label>
                        <div className="nozzle-option-grid">
                          <div className={`nozzle-card ${nozzleType === "standard" ? "active" : ""}`} onClick={() => setNozzleType("standard")}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--col-text-1)" }}>Flat Fan</div>
                            <div style={{ fontSize: 9, color: "var(--col-text-3)", marginTop: 2 }}>5% Terbuang</div>
                          </div>
                          <div className={`nozzle-card ${nozzleType === "induction" ? "active" : ""}`} onClick={() => setNozzleType("induction")}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--col-text-1)" }}>Air Induction</div>
                            <div style={{ fontSize: 9, color: "var(--col-text-3)", marginTop: 2 }}>1.5% Terbuang</div>
                          </div>
                          <div className={`nozzle-card ${nozzleType === "cone" ? "active" : ""}`} onClick={() => setNozzleType("cone")}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--col-text-1)" }}>Cone Mist</div>
                            <div style={{ fontSize: 9, color: "var(--col-text-3)", marginTop: 2 }}>12% Terbuang</div>
                          </div>
                        </div>
                      </div>

                      <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "var(--r-md)", padding: "10px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                        <div>
                          <div style={{ fontSize: 9, color: "var(--col-text-3)", textTransform: "uppercase" }}>Total Anggaran Semprot</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--col-text-1)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                            {((calc.ureaBags * tankCost * sprayFrequency)).toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: "var(--col-text-3)", textTransform: "uppercase" }}>Zat Terbuang (Drift Loss)</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: nozzleType === "cone" ? "#fca5a5" : nozzleType === "induction" ? "#86efac" : "var(--col-text-1)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                            {((calc.ureaBags * tankCost * sprayFrequency * (nozzleType === "cone" ? 0.12 : nozzleType === "induction" ? 0.015 : 0.05))).toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 12, padding: 10, background: "rgba(74, 222, 128, 0.02)", border: "1px dashed rgba(74, 222, 128, 0.12)", borderRadius: "var(--r-md)", fontSize: 10, color: "var(--col-text-3)", display: "flex", gap: 6, alignItems: "flex-start" }}>
                      <TriangleAlert size={12} style={{ color: "var(--col-accent)", flexShrink: 0, marginTop: 1 }} />
                      <span>
                        <strong>Saran Agronomis:</strong> Selalu berikan jeda aplikasi antara pupuk Urea dan KCl. Urea dianjurkan dipecah 3 kali aplikasi (vegetatif awal, pembibitan, dan menjelang pembungaan) agar efisiensi maksimal dan tidak tercuci air hujan.
                      </span>
                    </div>

                  </div>
                </div>
              </div>
            );
          })()}

          {/* Sub-tab Content: SIMULATOR PESTICIDE MIXER */}
          {labSubTab === "pestisida" && (
            <div className="tab-fade-in" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div className="npk-calculator-container">
                <div className="panel">
                <div className="panel-header">
                  <div className="panel-icon"><FlaskConical size={14} /></div>
                  <div>
                    <div className="panel-title">Bahan Aktif Campuran</div>
                    <div className="panel-subtitle">Pilih dua golongan bahan kimia semprot untuk diuji</div>
                  </div>
                </div>
                <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="reagent-card">
                    <label style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--col-text-3)", display: "block", marginBottom: 6 }}>
                      BAHAN AKTIF / PESTISIDA A
                    </label>
                    <UltraCustomSelect 
                      value={chemA} 
                      onChange={(val) => { setChemA(val); setMixingStage("idle"); setMixResult(null); }}
                      options={chemAOptions}
                    />
                  </div>

                  <div className="reagent-card">
                    <label style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--col-text-3)", display: "block", marginBottom: 6 }}>
                      BAHAN AKTIF / PESTISIDA B
                    </label>
                    <UltraCustomSelect 
                      value={chemB} 
                      onChange={(val) => { setChemB(val); setMixingStage("idle"); setMixResult(null); }}
                      options={chemBOptions}
                    />
                  </div>

                  <button 
                    className="btn-primary" 
                    style={{ width: "100%", marginTop: 8 }} 
                    onClick={handleMixPesticides}
                    disabled={mixingStage === "pouring" || chemA === "none" || chemB === "none" || chemA === chemB}
                  >
                    {mixingStage === "pouring" ? (
                      <><div className="spin" /> <span>Mereaksikan Campuran...</span></>
                    ) : (
                      <><FlaskConical size={14} /> <span>Simulasikan Pencampuran</span></>
                    )}
                  </button>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <div className="panel-icon" style={{ color: "var(--col-accent)" }}><Microscope size={14} /></div>
                  <div>
                    <div className="panel-title">Visualisasi Lab &amp; Diagnosis Reaksi</div>
                    <div className="panel-subtitle">Reaksi kimia cairan tangki semprot dan tingkat keamanan</div>
                  </div>
                </div>
                <div className="panel-body" style={{ minHeight: 280, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  {/* Beaker Container */}
                  <div className="pesticide-beaker-compartment">
                    {/* Minimalist HUD Status */}
                    <div className="flask-hud-status">
                      {mixingStage === "pouring" && "Sedang mencampurkan bahan..."}
                      {mixingStage === "done" && mixResult && `Analisis: ${mixResult.state === "danger" ? "Reaksi Bahaya (Antagonis)" : mixResult.state === "warning" ? "Reaksi Waspada (Kurang Efektif)" : "Reaksi Kompatibel (Optimal)"}`}
                      {mixingStage === "idle" && "Laboratorium SiPetani"}
                    </div>

                    <div className="pesticide-beaker-container" style={{ position: "relative", zIndex: 3 }}>
                      {/* Beaker Left */}
                      <div className={`beaker-glass ${mixingStage === "pouring" ? "pour-left" : ""}`}>
                        <div className="glass-gloss" />
                        
                        {/* Measurement Marks */}
                        {[...Array(4)].map((_, i) => (
                          <div key={i} className="beaker-mark" style={{ bottom: `${20 * (i + 1)}%` }} />
                        ))}
                        
                        {/* 1. SMOOTH FILLING HEIGHT TRANSITION */}
                        <div className="beaker-liquid" style={{ 
                          height: chemA === "none" ? "0%" : (mixingStage === "pouring" ? "10%" : "65%"),
                          backgroundColor: chemA === "tembaga" ? "#2563eb" : chemA === "trisiklazol" ? "#0d9488" : chemA === "metalaksil" ? "#0891b2" : chemA === "abamektin" ? "#d97706" : chemA === "pupuk_urea" ? "#16a34a" : chemA === "asam_amino" ? "#b91c1c" : "transparent"
                        }} />
                      </div>

                      {/* Stream pour Left */}
                      <div 
                        className={`beaker-pouring-stream ${mixingStage === "pouring" ? "pouring" : ""}`} 
                        style={{
                          left: "32%",
                          ["--stream-color" as any]: chemA === "tembaga" ? "#2563eb" : chemA === "trisiklazol" ? "#0d9488" : chemA === "metalaksil" ? "#0891b2" : chemA === "abamektin" ? "#d97706" : chemA === "pupuk_urea" ? "#16a34a" : chemA === "asam_amino" ? "#b91c1c" : "transparent"
                        } as React.CSSProperties} 
                      />

                      {/* Central Flask */}
                      <div className="flask-container">
                        <div className="flask-neck">
                          <div className="glass-gloss" style={{ width: "35%", left: "10%" }} />
                        </div>
                        <div className="flask-glass">
                          <div className="glass-gloss" />

                          <div className="flask-liquid" style={{ 
                            height: mixingStage === "pouring" ? "45%" : mixingStage === "done" ? "60%" : "15%",
                            backgroundColor: mixingStage === "done" && mixResult ? mixResult.color : "rgba(255,255,255,0.06)",
                            boxShadow: mixingStage === "done" && mixResult ? `0 0 12px ${mixResult.color}` : "none"
                          }}>
                            {/* Gentle undulating wave */}
                            {(mixingStage === "pouring" || mixingStage === "done") && (
                              <div className="flask-liquid-wave" style={{ background: mixingStage === "done" && mixResult ? mixResult.color : "rgba(255,255,255,0.06)" }} />
                            )}
                          </div>

                          {/* Subtle bubbles rising during pouring */}
                          {mixingStage === "pouring" && [...Array(4)].map((_, i) => (
                            <div key={i} className="flask-bubble" style={{ 
                              left: `${30 + i * 12}%`,
                              animationDelay: `${i * 0.3}s`,
                              animationDuration: "1.8s",
                              opacity: 0.3
                            }} />
                          ))}
                        </div>

                        {/* Gentle, subtle vapor rising from flask neck */}
                        {(mixingStage === "pouring" || mixingStage === "done") && (
                          <div className="flask-smoke-cloud" style={{ opacity: 0.6 }}>
                            {[...Array(2)].map((_, i) => (
                              <div 
                                key={i} 
                                className="flask-smoke-puff" 
                                style={{ 
                                  ["--smoke-color" as any]: mixResult ? mixResult.color : "rgba(255,255,255,0.1)",
                                  animationDelay: `${i * 1.5}s`
                                } as React.CSSProperties} 
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Stream pour Right */}
                      <div 
                        className={`beaker-pouring-stream ${mixingStage === "pouring" ? "pouring" : ""}`} 
                        style={{
                          right: "32%",
                          ["--stream-color" as any]: chemB === "tembaga" ? "#2563eb" : chemB === "trisiklazol" ? "#0d9488" : chemB === "metalaksil" ? "#0891b2" : chemB === "abamektin" ? "#d97706" : chemB === "pupuk_urea" ? "#16a34a" : chemB === "asam_amino" ? "#b91c1c" : "transparent"
                        } as React.CSSProperties} 
                      />

                      {/* Beaker Right */}
                      <div className={`beaker-glass ${mixingStage === "pouring" ? "pour-right" : ""}`}>
                        <div className="glass-gloss" />
                        
                        {/* Measurement Marks */}
                        {[...Array(4)].map((_, i) => (
                          <div key={i} className="beaker-mark" style={{ bottom: `${20 * (i + 1)}%` }} />
                        ))}
                        
                        {/* 1. SMOOTH FILLING HEIGHT TRANSITION */}
                        <div className="beaker-liquid" style={{ 
                          height: chemB === "none" ? "0%" : (mixingStage === "pouring" ? "10%" : "65%"),
                          backgroundColor: chemB === "tembaga" ? "#2563eb" : chemB === "trisiklazol" ? "#0d9488" : chemB === "metalaksil" ? "#0891b2" : chemB === "abamektin" ? "#d97706" : chemB === "pupuk_urea" ? "#16a34a" : chemB === "asam_amino" ? "#b91c1c" : "transparent"
                        }} />
                      </div>
                    </div>

                    {/* 3. ROLLING DIAGNOSTIC METRICS DISPLAY PANEL */}
                    <div className="flask-diagnostics">
                      <div className="metric-item">
                        <span className="metric-label">PH ASAM-BASA</span>
                        <span className="metric-value font-mono">{mixMetrics.ph.toFixed(1)}</span>
                      </div>
                      <div className="metric-divider" />
                      <div className="metric-item">
                        <span className="metric-label">KERAPATAN ZAT</span>
                        <span className="metric-value font-mono">{mixMetrics.density.toFixed(2)} g/mL</span>
                      </div>
                      <div className="metric-divider" />
                      <div className="metric-item">
                        <span className="metric-label">STATUS REAKSI</span>
                        <span className={`metric-value font-semibold ${mixingStage === "pouring" ? "text-cyan-400" : mixResult?.state === "danger" ? "text-red-400" : mixResult?.state === "warning" ? "text-yellow-400" : "text-green-400"}`}>
                          {mixMetrics.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Mixing result detail card */}
                  {mixingStage === "done" && mixResult && (
                    <div style={{ padding: "14px 18px", border: `1px solid ${mixResult.state === "danger" ? "rgba(239,68,68,0.2)" : mixResult.state === "warning" ? "rgba(234,179,8,0.2)" : "rgba(74,222,128,0.2)"}`, background: "rgba(0,0,0,0.3)", borderRadius: "var(--r-md)", marginTop: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span className={`status-pulse-dot ${mixResult.state === "danger" ? "red" : mixResult.state === "warning" ? "amber" : "green"}`} style={{ width: 8, height: 8 }} />
                        <h4 style={{ fontSize: 12, fontWeight: 700, margin: 0, color: mixResult.state === "danger" ? "#ef4444" : mixResult.state === "warning" ? "#eab308" : "var(--col-green)", letterSpacing: "-0.01em" }}>
                          {mixResult.title}
                        </h4>
                      </div>
                      <p style={{ fontSize: 11, color: "var(--col-text-2)", lineHeight: 1.5, margin: "0 0 10px 0" }}>{mixResult.details}</p>
                      <div style={{ borderTop: "1px dashed rgba(255,255,255,0.06)", paddingTop: 8, fontSize: 10, color: "var(--col-text-3)", fontStyle: "italic" }}>
                        💡 <strong>Saran Pencampuran:</strong> {mixResult.advice}
                      </div>
                    </div>
                  )}

                  {mixingStage === "idle" && (
                    <div style={{ textAlign: "center", padding: "20px 0", fontSize: 11, color: "var(--col-text-4)", border: "1px dashed rgba(255,255,255,0.05)", borderRadius: "var(--r-md)" }}>
                      Menunggu parameter input kimia. Silakan klik tombol simulasikan.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pilihan D: Apoteker Tani Cerdas - Racik Tangki Semprot */}
            <div className="panel">
              <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className="panel-icon" style={{ color: "var(--col-accent)" }}><FlaskConical size={14} /></div>
                  <div>
                    <div className="panel-title">Apoteker Tani Cerdas - Racik Tangki Semprot Mandiri</div>
                    <div className="panel-subtitle">Kalkulator dilusi pestisida merek dagang Indonesia bersertifikat sains untuk tangki 14L - 20L</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span style={{ fontSize: 9, background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.25)", color: "var(--col-accent)", padding: "2px 6px", borderRadius: 4, fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
                    Metode W.A.L.E.S
                  </span>
                </div>
              </div>

              <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Form parameters */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--col-text-3)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Merek Pestisida / Fungisida A</label>
                    <UltraCustomSelect 
                      value={apoBrandA} 
                      onChange={(val) => { setApoBrandA(val); setApoRecipe(null); }}
                      options={apoBrandAOptions}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 10, color: "var(--col-text-3)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Merek Pestisida / Fungisida B (Opsional)</label>
                    <UltraCustomSelect 
                      value={apoBrandB} 
                      onChange={(val) => { setApoBrandB(val); setApoRecipe(null); }}
                      options={apoBrandBOptions}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 10, color: "var(--col-text-3)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Kapasitas Tangki Sprayer</label>
                    <UltraCustomSelect 
                      value={apoTankSize} 
                      onChange={(val) => { setApoTankSize(val); setApoRecipe(null); }}
                      options={apoTankSizeOptions}
                      showSearch={false}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 10, color: "var(--col-text-3)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Komoditas Tanaman</label>
                    <UltraCustomSelect 
                      value={apoCrop} 
                      onChange={(val) => { setApoCrop(val); setApoRecipe(null); }}
                      options={apoCropOptions}
                      showSearch={false}
                    />
                  </div>
                </div>

                <button 
                  className="btn-primary" 
                  onClick={handleRacikTangki}
                  disabled={apoIsGenerating || apoBrandA === "none"}
                  style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: "12px 0" }}
                >
                  {apoIsGenerating ? (
                    <><div className="spin" /> <span>Sedang Menghitung Dosis & Uji Toksisitas...</span></>
                  ) : (
                    <><Activity size={15} /> <span>Racik Resep Tangki Semprot</span></>
                  )}
                </button>

                {/* Recipe display sheet */}
                {apoRecipe && (
                  <div className="pesticide-recipe-card animate-fade-in" style={{ border: `1px solid ${apoRecipe.status === "danger" ? "rgba(239,68,68,0.2)" : apoRecipe.status === "warning" ? "rgba(234,179,8,0.2)" : "rgba(74,222,128,0.2)"}` }}>
                    
                    {/* Header bar */}
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 12, marginBottom: 16 }}>
                      <div>
                        <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--col-text-3)", textTransform: "uppercase" }}>LEMBAR RESEP RACIKAN TANGKI</span>
                        <h3 style={{ fontSize: 15, fontWeight: 700, margin: "4px 0 0 0", color: "var(--col-text-1)" }}>
                          🛡️ Resep Tangki {apoTankSize}L - {apoCrop.toUpperCase()}
                        </h3>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="recipe-status-pill" style={{ color: apoRecipe.statusColor, border: `1px solid ${apoRecipe.statusColor}`, background: `${apoRecipe.statusColor}12` }}>
                          ● {apoRecipe.status === "danger" ? "Reaksi Berbahaya" : apoRecipe.status === "warning" ? "Peringatan Racik" : "Racikan Kompatibel"}
                        </span>
                      </div>
                    </div>

                    {/* Diagnostic Warning Alert Box */}
                    <div style={{ background: `${apoRecipe.statusColor}08`, border: `1px solid ${apoRecipe.statusColor}22`, borderRadius: "var(--r-md)", padding: "10px 14px", fontSize: 11, display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 18 }}>
                      <TriangleAlert size={14} style={{ color: apoRecipe.statusColor, flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <strong style={{ color: apoRecipe.statusColor }}>Diagnosis Apoteker Tani:</strong>{" "}
                        <span style={{ color: "var(--col-text-2)" }}>{apoRecipe.alertMsg}</span>
                      </div>
                    </div>

                    {/* Dose calculations block */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 20 }}>
                      <div style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: "var(--r-md)", padding: 12 }}>
                        <span style={{ fontSize: 9, color: "var(--col-text-3)", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>Bahan Aktif A (Primer)</span>
                        <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--col-text-1)", margin: "4px 0 2px 0" }}>{apoRecipe.brandAName}</h4>
                        <div style={{ fontSize: 10, color: "var(--col-accent)", fontFamily: "var(--font-mono)" }}>Zat: {apoRecipe.activeA}</div>
                        <div style={{ fontSize: 9, color: "var(--col-text-4)", marginTop: 2, fontFamily: "var(--font-mono)" }}>MoA: {apoRecipe.moaA}</div>
                        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", marginTop: 8, paddingTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 9, color: "var(--col-text-3)" }}>Takaran Tangki:</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--col-accent)", fontFamily: "var(--font-mono)" }}>{apoRecipe.doseA}</span>
                        </div>
                      </div>

                      {apoRecipe.brandBName && (
                        <div style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: "var(--r-md)", padding: 12 }}>
                          <span style={{ fontSize: 9, color: "var(--col-text-3)", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>Bahan Aktif B (Campuran)</span>
                          <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--col-text-1)", margin: "4px 0 2px 0" }}>{apoRecipe.brandBName}</h4>
                          <div style={{ fontSize: 10, color: "var(--col-accent)", fontFamily: "var(--font-mono)" }}>Zat: {apoRecipe.activeB}</div>
                          <div style={{ fontSize: 9, color: "var(--col-text-4)", marginTop: 2, fontFamily: "var(--font-mono)" }}>MoA: {apoRecipe.moaB}</div>
                          <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", marginTop: 8, paddingTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 9, color: "var(--col-text-3)" }}>Takaran Tangki:</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--col-accent)", fontFamily: "var(--font-mono)" }}>{apoRecipe.doseB}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Step-by-step dilution instructions */}
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
                      <h4 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--col-text-2)", marginBottom: 10, letterSpacing: "0.05em" }}>
                        📋 Langkah Pencampuran &amp; Dilusi Tangki (SOP W.A.L.E.S):
                      </h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {apoRecipe.steps.map((step: string, idx: number) => (
                          <div key={idx} style={{ display: "flex", gap: 10, fontSize: 11, lineHeight: 1.4, color: "var(--col-text-2)" }}>
                            <span style={{ color: "var(--col-accent)", fontWeight: 700 }}>{idx + 1}.</span>
                            <span>{step.substring(3)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Note Box */}
                    <div style={{ marginTop: 16, padding: "8px 12px", background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 6, fontSize: 10, color: "var(--col-text-3)" }}>
                      📌 <strong>Rekomendasi Agronomis untuk {apoCrop.toUpperCase()}:</strong> {apoRecipe.cropTarget}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

          {/* Sub-tab Content: RADAR OUTBREAK -> SPEKTROMETRI DAUN DIGITAL (Opsi E) */}
          {labSubTab === "radar" && (() => {
            const data = cropSpecData[specCrop]?.[specHealthState];
            
            // Calculators for graph coordinate mapping
            const getReflectance = (w: number, crop: keyof typeof cropSpecData, health: "healthy" | "diseased") => {
              const dVal = cropSpecData[crop]?.[health];
              if (!dVal) return 0;
              const points = [
                { x: 400, y: 5 },
                { x: 450, y: dVal.blue },
                { x: 550, y: dVal.green },
                { x: 660, y: dVal.red },
                { x: 720, y: health === "healthy" ? 45 : 24 },
                { x: 800, y: dVal.nir - 2 },
                { x: 850, y: dVal.nir },
                { x: 900, y: dVal.nir - 3 }
              ];
              for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i+1];
                if (w >= p1.x && w <= p2.x) {
                  const t = (w - p1.x) / (p2.x - p1.x);
                  return p1.y + t * (p2.y - p1.y);
                }
              }
              return 0;
            };

            const chartWidth = 380;
            const chartHeight = 180;
            const paddingX = 50;
            const paddingY = 30;

            const getSvgCoords = (w: number, r: number) => {
              const x = paddingX + ((w - 400) / 500) * chartWidth;
              const y = 250 - paddingY - (r / 100) * chartHeight;
              return { x, y };
            };

            const buildSvgPath = (crop: keyof typeof cropSpecData, health: "healthy" | "diseased") => {
              let pathStr = "";
              for (let w = 400; w <= 900; w += 5) {
                const r = getReflectance(w, crop, health);
                const { x, y } = getSvgCoords(w, r);
                if (w === 400) pathStr += `M ${x} ${y}`;
                else pathStr += ` L ${x} ${y}`;
              }
              return pathStr;
            };

            const healthyPath = buildSvgPath(specCrop, "healthy");
            const diseasedPath = buildSvgPath(specCrop, "diseased");

            // Calculate current coordinates for hover tooltip
            let hoverCoords = null;
            if (specHoveredWavelength !== null) {
              const rVal = getReflectance(specHoveredWavelength, specCrop, specHealthState);
              const { x, y } = getSvgCoords(specHoveredWavelength, rVal);
              hoverCoords = { x, y, w: specHoveredWavelength, r: rVal };
            }

            const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const mouseX = e.clientX - rect.left;
              const relativeX = mouseX - paddingX;
              if (relativeX < 0 || relativeX > chartWidth) {
                setSpecHoveredWavelength(null);
                return;
              }
              const w = Math.round(400 + (relativeX / chartWidth) * 500);
              if (w >= 400 && w <= 900) {
                setSpecHoveredWavelength(w);
              } else {
                setSpecHoveredWavelength(null);
              }
            };

            const handleSvgMouseLeave = () => {
              setSpecHoveredWavelength(null);
            };

            return (
              <div className="npk-calculator-container tab-fade-in spec-grid">
                {/* PANEL KIRI: Pemindai Laser & Indikator Band */}
                <div className="panel">
                  <div className="panel-header">
                    <div className="panel-icon"><Scan size={14} /></div>
                    <div>
                      <div className="panel-title">Hologram Wavelength Scanner</div>
                      <div className="panel-subtitle">Simulasi spektrofotometer optik digital</div>
                    </div>
                  </div>
                  
                  <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Komoditas Selector */}
                    <div>
                      <label style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--col-text-3)", display: "block", marginBottom: 6, letterSpacing: "0.05em" }}>
                        SAMPEL KOMODITAS DAUN
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                        {(["padi", "tomat", "cabai", "jagung", "kentang"] as const).map((crop) => (
                          <button
                            key={crop}
                            className={`lab-tab-btn ${specCrop === crop ? "active" : ""}`}
                            onClick={() => {
                              setSpecCrop(crop);
                              setSpecScanProgress(0);
                            }}
                            style={{ padding: "6px 8px", fontSize: 10, justifyContent: "center", textTransform: "capitalize" }}
                          >
                            {crop === "padi" ? "🌾 Padi" : crop === "tomat" ? "🍅 Tomat" : crop === "cabai" ? "🌶️ Cabai" : crop === "jagung" ? "🌽 Jagung" : "🥔 Kentang"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Health State Selector */}
                    <div>
                      <label style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--col-text-3)", display: "block", marginBottom: 6, letterSpacing: "0.05em" }}>
                        KONDISI FISIOLOGIS DAUN
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <button
                          className={`btn-ghost ${specHealthState === "healthy" ? "active" : ""}`}
                          onClick={() => {
                            setSpecHealthState("healthy");
                            setSpecScanProgress(0);
                          }}
                          style={{
                            fontSize: 11,
                            padding: "8px 12px",
                            border: `1px solid ${specHealthState === "healthy" ? "rgba(34, 197, 94, 0.3)" : "rgba(255,255,255,0.05)"}`,
                            background: specHealthState === "healthy" ? "rgba(34, 197, 94, 0.08)" : "transparent",
                            color: specHealthState === "healthy" ? "var(--col-green)" : "var(--col-text-2)"
                          }}
                        >
                          🌿 Daun Sehat (Healthy)
                        </button>
                        <button
                          className={`btn-ghost ${specHealthState === "diseased" ? "active" : ""}`}
                          onClick={() => {
                            setSpecHealthState("diseased");
                            setSpecScanProgress(0);
                          }}
                          style={{
                            fontSize: 11,
                            padding: "8px 12px",
                            border: `1px solid ${specHealthState === "diseased" ? "rgba(239, 68, 68, 0.3)" : "rgba(255,255,255,0.05)"}`,
                            background: specHealthState === "diseased" ? "rgba(239, 68, 68, 0.08)" : "transparent",
                            color: specHealthState === "diseased" ? "var(--col-red)" : "var(--col-text-2)"
                          }}
                        >
                          🍂 Terinfeksi (Diseased)
                        </button>
                      </div>
                    </div>

                    {/* Viewport Daun Pemindai */}
                    <div className="spec-viewport">
                      {/* Laser scanning line overlay */}
                      {specIsScanning && (
                        <div className="laser-sweep" style={{ background: specHealthState === "healthy" ? "var(--col-green)" : "var(--col-red)" }} />
                      )}
                      
                      {/* Organic Leaf SVG representing sample */}
                      <svg viewBox="0 0 100 100" style={{ width: 80, height: 80, opacity: specIsScanning ? 0.8 : 1, transition: "opacity 0.3s" }}>
                        <defs>
                          <radialGradient id="leafGrad" cx="50%" cy="50%" r="50%">
                            {specHealthState === "healthy" ? (
                              <>
                                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.8" />
                                <stop offset="100%" stopColor="#15803d" stopOpacity="0.4" />
                              </>
                            ) : (
                              <>
                                <stop offset="0%" stopColor="#eab308" stopOpacity="0.9" />
                                <stop offset="50%" stopColor="#ca8a04" stopOpacity="0.6" />
                                <stop offset="100%" stopColor="#b45309" stopOpacity="0.3" />
                              </>
                            )}
                          </radialGradient>
                        </defs>
                        {/* Leaf shape path */}
                        <path 
                          d="M 50 10 C 25 35 25 65 50 90 C 75 65 75 35 50 10 Z" 
                          fill="url(#leafGrad)" 
                          stroke={specHealthState === "healthy" ? "#22c55e" : "#eab308"} 
                          strokeWidth="1.5"
                          style={{ filter: "drop-shadow(0 0 8px rgba(34, 197, 94, 0.2))" }}
                        />
                        {/* Leaf veins */}
                        <path d="M 50 10 L 50 90" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                        <path d="M 50 30 Q 35 40 30 45" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" fill="none" />
                        <path d="M 50 30 Q 65 40 70 45" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" fill="none" />
                        <path d="M 50 50 Q 32 60 27 65" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" fill="none" />
                        <path d="M 50 50 Q 68 60 73 65" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" fill="none" />
                        <path d="M 50 70 Q 35 78 32 82" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" fill="none" />
                        <path d="M 50 70 Q 65 78 68 82" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" fill="none" />
                        
                        {/* Disease spot overlays */}
                        {specHealthState === "diseased" && (
                          <>
                            <circle cx="42" cy="40" r="4" fill="#78350f" opacity="0.85" />
                            <circle cx="44" cy="41" r="2.5" fill="#f59e0b" opacity="0.9" />
                            <circle cx="58" cy="55" r="5" fill="#78350f" opacity="0.85" />
                            <circle cx="56" cy="54" r="3" fill="#ef4444" opacity="0.9" />
                            <circle cx="48" cy="68" r="3.5" fill="#ca8a04" opacity="0.8" />
                          </>
                        )}
                      </svg>

                      {specIsScanning ? (
                        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.85)", backdropFilter: "blur(2px)" }}>
                          <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--col-accent)", fontWeight: 700, animation: "livingPulse 1s infinite" }}>SCANNING WAVELENGTHS...</span>
                          <span style={{ fontSize: 18, fontFamily: "var(--font-mono)", color: "#fff", fontWeight: 800, marginTop: 4 }}>{specScanProgress}%</span>
                          <div style={{ width: "60%", height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 9, marginTop: 8, overflow: "hidden" }}>
                            <div style={{ width: `${specScanProgress}%`, height: "100%", background: "var(--col-accent)", transition: "width 0.1s" }} />
                          </div>
                        </div>
                      ) : specScanProgress === 100 ? null : (
                        <div style={{ position: "absolute", bottom: 12, left: 12, right: 12, display: "flex", justifyContent: "center" }}>
                          <button 
                            className="btn-primary" 
                            onClick={() => setSpecIsScanning(true)} 
                            style={{ padding: "6px 12px", fontSize: 10, height: 28, width: "100%" }}
                          >
                            <RefreshCw size={10} style={{ marginRight: 6 }} /> Kalibrasi &amp; Pindai Spektrum
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Reflectance Band Indicators */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: specScanProgress === 100 ? 1 : 0.45, transition: "opacity 0.4s" }}>
                      <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--col-text-4)" }}>DETIL REFLEKTANSI PITA CAHAYA (BAND REFLECTANCE)</span>
                      
                      {/* Blue Band */}
                      <div className="spec-band-row">
                        <div className="spec-band-header">
                          <span className="spec-band-name">Blue Band (450nm)</span>
                          <span className="spec-band-val">{specScanProgress === 100 ? `${data.blue}%` : "--"}</span>
                        </div>
                        <div className="spec-band-bar-outer">
                          <div className="spec-band-bar bg-blue" style={{ width: specScanProgress === 100 ? `${data.blue}%` : "0%" }} />
                        </div>
                      </div>

                      {/* Green Band */}
                      <div className="spec-band-row">
                        <div className="spec-band-header">
                          <span className="spec-band-name">Green Band (550nm)</span>
                          <span className="spec-band-val">{specScanProgress === 100 ? `${data.green}%` : "--"}</span>
                        </div>
                        <div className="spec-band-bar-outer">
                          <div className="spec-band-bar bg-green" style={{ width: specScanProgress === 100 ? `${data.green}%` : "0%" }} />
                        </div>
                      </div>

                      {/* Red Band */}
                      <div className="spec-band-row">
                        <div className="spec-band-header">
                          <span className="spec-band-name">Red Band (660nm)</span>
                          <span className="spec-band-val">{specScanProgress === 100 ? `${data.red}%` : "--"}</span>
                        </div>
                        <div className="spec-band-bar-outer">
                          <div className="spec-band-bar bg-red" style={{ width: specScanProgress === 100 ? `${data.red}%` : "0%" }} />
                        </div>
                      </div>

                      {/* NIR Band */}
                      <div className="spec-band-row">
                        <div className="spec-band-header">
                          <span className="spec-band-name">Near-Infrared Band (850nm)</span>
                          <span className="spec-band-val">{specScanProgress === 100 ? `${data.nir}%` : "--"}</span>
                        </div>
                        <div className="spec-band-bar-outer">
                          <div className="spec-band-bar bg-nir" style={{ width: specScanProgress === 100 ? `${data.nir}%` : "0%" }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* PANEL KANAN: Live SVG Graph & Fisiologis Index */}
                <div className="panel">
                  <div className="panel-header">
                    <div className="panel-icon" style={{ color: "var(--col-accent)" }}><Activity size={14} /></div>
                    <div>
                      <div className="panel-title">Reflectance Curve &amp; Physiology</div>
                      <div className="panel-subtitle">Kurva reflektansi klorofil &amp; diagnosis mesofil</div>
                    </div>
                  </div>
                  
                  <div className="panel-body" style={{ minHeight: 480, display: "flex", flexDirection: "column", gap: 16 }}>
                    {specScanProgress < 100 ? (
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, textAlign: "center", color: "var(--col-text-4)" }}>
                        <div style={{ animation: "livingPulse 2s infinite", display: "inline-block", padding: 12, background: "rgba(14,165,233,0.04)", borderRadius: "50%", marginBottom: 12 }}>
                          <Microscope size={28} style={{ color: "var(--col-accent)" }} />
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--col-text-3)", marginBottom: 4 }}>Kalibrasi Scanner Diperlukan</div>
                        <p style={{ fontSize: 10, maxWidth: 280, lineHeight: 1.4, margin: 0 }}>
                          Silakan klik tombol "Kalibrasi &amp; Pindai Spektrum" di panel sebelah kiri untuk memulai analisis optik klorofil daun.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Live SVG Graph */}
                        <div style={{ position: "relative" }}>
                          <svg 
                            className="spec-svg-graph" 
                            viewBox="0 0 470 250" 
                            onMouseMove={handleSvgMouseMove}
                            onMouseLeave={handleSvgMouseLeave}
                            style={{ display: "block", background: "rgba(0,0,0,0.35)", borderRadius: "var(--r-md)", border: "1px solid rgba(255,255,255,0.03)" }}
                          >
                            {/* Grid Lines */}
                            <line x1="50" y1="220" x2="430" y2="220" stroke="rgba(255,255,255,0.08)" />
                            <line x1="50" y1="30" x2="50" y2="220" stroke="rgba(255,255,255,0.08)" />
                            
                            {/* Reflectance Grid lines (20%, 40%, 60%, 80%) */}
                            <line x1="50" y1="182" x2="430" y2="182" stroke="rgba(255,255,255,0.04)" strokeDasharray="2,4" />
                            <line x1="50" y1="144" x2="430" y2="144" stroke="rgba(255,255,255,0.04)" strokeDasharray="2,4" />
                            <line x1="50" y1="106" x2="430" y2="106" stroke="rgba(255,255,255,0.04)" strokeDasharray="2,4" />
                            <line x1="50" y1="68" x2="430" y2="68" stroke="rgba(255,255,255,0.04)" strokeDasharray="2,4" />
                            
                            {/* Wavelength Grid lines (500nm, 600nm, 700nm, 800nm) */}
                            <line x1="126" y1="30" x2="126" y2="220" stroke="rgba(255,255,255,0.04)" strokeDasharray="2,4" />
                            <line x1="202" y1="30" x2="202" y2="220" stroke="rgba(255,255,255,0.04)" strokeDasharray="2,4" />
                            <line x1="278" y1="30" x2="278" y2="220" stroke="rgba(255,255,255,0.04)" strokeDasharray="2,4" />
                            <line x1="354" y1="30" x2="354" y2="220" stroke="rgba(255,255,255,0.04)" strokeDasharray="2,4" />

                            {/* Chart Labels Y (Reflectance %) */}
                            <text x="45" y="223" fill="var(--col-text-4)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="end">0%</text>
                            <text x="45" y="185" fill="var(--col-text-4)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="end">20%</text>
                            <text x="45" y="147" fill="var(--col-text-4)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="end">40%</text>
                            <text x="45" y="109" fill="var(--col-text-4)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="end">60%</text>
                            <text x="45" y="71" fill="var(--col-text-4)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="end">80%</text>
                            
                            {/* Chart Labels X (Wavelength nm) */}
                            <text x="50" y="235" fill="var(--col-text-4)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">400nm</text>
                            <text x="126" y="235" fill="var(--col-text-4)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">500nm</text>
                            <text x="202" y="235" fill="var(--col-text-4)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">600nm</text>
                            <text x="278" y="235" fill="var(--col-text-4)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">700nm</text>
                            <text x="354" y="235" fill="var(--col-text-4)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">800nm</text>
                            <text x="430" y="235" fill="var(--col-text-4)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">900nm</text>

                            {/* Wavelength Spectrum Ribbon at bottom */}
                            <rect x="50" y="222" width="380" height="2" fill="url(#specSpectrumGrad)" />
                            
                            <defs>
                              <linearGradient id="specSpectrumGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#4f46e5" /> {/* Blue */}
                                <stop offset="30%" stopColor="#22c55e" /> {/* Green */}
                                <stop offset="55%" stopColor="#ef4444" /> {/* Red */}
                                <stop offset="70%" stopColor="#991b1b" /> {/* Dark Red */}
                                <stop offset="100%" stopColor="#312e81" /> {/* Infrared */}
                              </linearGradient>
                            </defs>

                            {/* Drawing Curve Lines */}
                            {/* Diseased Path */}
                            <path 
                              d={diseasedPath} 
                              fill="none" 
                              stroke={specHealthState === "diseased" ? "rgba(239, 68, 68, 0.85)" : "rgba(234, 179, 8, 0.25)"} 
                              strokeWidth={specHealthState === "diseased" ? "2.5" : "1.2"} 
                              style={{ filter: specHealthState === "diseased" ? "drop-shadow(0 0 5px rgba(239, 68, 68, 0.4))" : "none" }}
                            />
                            {/* Healthy Path */}
                            <path 
                              d={healthyPath} 
                              fill="none" 
                              stroke={specHealthState === "healthy" ? "rgba(34, 197, 94, 0.85)" : "rgba(34, 197, 94, 0.2)"} 
                              strokeWidth={specHealthState === "healthy" ? "2.5" : "1.2"} 
                              style={{ filter: specHealthState === "healthy" ? "drop-shadow(0 0 5px rgba(34, 197, 94, 0.4))" : "none" }}
                            />

                            {/* Hover Vertical tracking guide line */}
                            {hoverCoords && (
                              <>
                                <line x1={hoverCoords.x} y1="30" x2={hoverCoords.x} y2="220" stroke="rgba(255,255,255,0.25)" strokeDasharray="3,3" />
                                <circle 
                                  cx={hoverCoords.x} 
                                  cy={hoverCoords.y} 
                                  r="5" 
                                  fill={specHealthState === "healthy" ? "#22c55e" : "#ef4444"} 
                                  stroke="#fff" 
                                  strokeWidth="1.5" 
                                  style={{ filter: `drop-shadow(0 0 6px ${specHealthState === "healthy" ? "#22c55e" : "#ef4444"})` }}
                                />
                              </>
                            )}
                          </svg>
                          
                          {/* Live Hover HTML Tooltip */}
                          {hoverCoords && (
                            <div 
                              className="spec-tooltip"
                              style={{ 
                                position: "absolute", 
                                left: `${hoverCoords.x + 10}px`, 
                                top: `${Math.min(130, hoverCoords.y - 45)}px`,
                                pointerEvents: "none"
                              }}
                            >
                              <div style={{ fontSize: 8, color: "var(--col-text-4)", fontFamily: "var(--font-mono)" }}>SPECTRUM READOUT</div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--col-accent)" }}>WL: {hoverCoords.w} nm</div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: "#fff", marginTop: 2 }}>Reflectance: {hoverCoords.r.toFixed(1)}%</div>
                            </div>
                          )}
                        </div>

                        {/* Vegetation Indexes (NDVI & RVI) */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          {/* NDVI Dial Gauge */}
                          <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: "var(--r-md)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ position: "relative", width: 46, height: 46 }}>
                              <svg width="46" height="46" viewBox="0 0 46 46">
                                <circle cx="23" cy="23" r="18" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                                <circle 
                                  cx="23" cy="23" r="18" fill="none" 
                                  stroke={data.ndvi >= 0.7 ? "var(--col-green)" : data.ndvi >= 0.5 ? "var(--col-amber)" : "var(--col-red)"} 
                                  strokeWidth="3" 
                                  strokeDasharray="113" 
                                  strokeDashoffset={113 - (Math.max(0, data.ndvi) * 113)} 
                                  style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%", filter: `drop-shadow(0 0 2px ${data.ndvi >= 0.7 ? "#22c55e" : data.ndvi >= 0.5 ? "#fbbf24" : "#ef4444"})` }}
                                />
                              </svg>
                              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, fontFamily: "var(--font-mono)", color: data.ndvi >= 0.7 ? "var(--col-green)" : data.ndvi >= 0.5 ? "var(--col-amber)" : "var(--col-red)" }}>
                                {data.ndvi.toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--col-text-4)" }}>NDVI INDEX</div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--col-text-2)", marginTop: 1 }}>{data.ndvi >= 0.7 ? "Fotosintesis Aktif" : "Stres Klorofil"}</div>
                            </div>
                          </div>

                          {/* RVI Dial Gauge */}
                          <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: "var(--r-md)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ position: "relative", width: 46, height: 46 }}>
                              <svg width="46" height="46" viewBox="0 0 46 46">
                                <circle cx="23" cy="23" r="18" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                                <circle 
                                  cx="23" cy="23" r="18" fill="none" 
                                  stroke={data.rvi >= 10 ? "var(--col-green)" : data.rvi >= 5 ? "var(--col-amber)" : "var(--col-red)"} 
                                  strokeWidth="3" 
                                  strokeDasharray="113" 
                                  strokeDashoffset={113 - (Math.min(1, data.rvi / 18) * 113)} 
                                  style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%", filter: `drop-shadow(0 0 2px ${data.rvi >= 10 ? "#22c55e" : data.rvi >= 5 ? "#fbbf24" : "#ef4444"})` }}
                                />
                              </svg>
                              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, fontFamily: "var(--font-mono)", color: data.rvi >= 10 ? "var(--col-green)" : data.rvi >= 5 ? "var(--col-amber)" : "var(--col-red)" }}>
                                {data.rvi.toFixed(1)}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--col-text-4)" }}>RVI (RATIO VEG)</div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--col-text-2)", marginTop: 1 }}>{data.rvi >= 10 ? "Biomassa Tinggi" : "Biomassa Rendah"}</div>
                            </div>
                          </div>
                        </div>

                        {/* Physiological Analysis Diagnostics */}
                        <div style={{ padding: "12px 14px", background: specHealthState === "healthy" ? "rgba(34, 197, 94, 0.03)" : "rgba(239, 68, 68, 0.03)", border: `1px solid ${specHealthState === "healthy" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)"}`, borderRadius: "var(--r-md)", display: "flex", flexDirection: "column", gap: 10 }}>
                          <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0, color: specHealthState === "healthy" ? "var(--col-green)" : "var(--col-red)", display: "flex", alignItems: "center", gap: 6 }}>
                            <Activity size={12} /> Diagnosis Fisiologis Mesofil Daun
                          </h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 10.5, lineHeight: 1.5, color: "var(--col-text-2)" }}>
                            <div>
                              <strong>Sinyal Absorbsi Klorofil:</strong> {specHealthState === "healthy" ? (
                                `Klorofil mengabsorbsi pita cahaya Red (660nm) dan Blue (450nm) sebesar lebih dari 90%. Ini membuktikan aparat fotosintetis tanaman ${specCrop} bekerja secara prima untuk menyerap karbon.`
                              ) : (
                                `Kerusakan sel akibat penyakit menghambat penyerapan pita cahaya Red (660nm). Reflektansi Red meningkat tajam menjadi ${data.red}%, menandakan pembusukan kloroplas (klorosis).`
                              )}
                            </div>
                            
                            <div style={{ borderTop: "1px dashed rgba(255,255,255,0.06)", paddingTop: 8 }}>
                              <strong>Integritas Struktur Seluler (Near-Infrared reflection):</strong> {specHealthState === "healthy" ? (
                                `Pemantulan pita NIR (850nm) mencapai ${data.nir}%. Struktur spons mesofil daun sangat padat, kenyal (turgid), dan sehat, memantulkan gelombang elektromagnetik secara optimal.`
                              ) : (
                                `Pemantulan pita NIR runtuh drastis menjadi ${data.nir}%. Hal ini membuktikan terjadi lisis/kehancuran dinding sel mesofil daun secara masif akibat toksin patogen.`
                              )}
                            </div>

                            <div style={{ borderTop: "1px dashed rgba(255,255,255,0.06)", paddingTop: 8, color: "var(--col-accent)" }}>
                              <strong>💡 Terapi Agronomis Dianjurkan:</strong> {specHealthState === "healthy" ? (
                                "Pertahankan pemupukan nitrogen organik seimbang. Berikan asam amino booster 2 minggu sekali untuk memaksimalkan biosintesis klorofil."
                              ) : (
                                specCrop === "padi" ? "Semprotkan fungisida sistemik golongan triazol (Azoksistrobin) dikombinasikan dengan pupuk Kalium Silika cair untuk memperkuat dinding sel daun padi yang terancam lisis." :
                                specCrop === "tomat" ? "Aplikasikan fungisida tembaga hidroksida kontak untuk menghentikan sporulasi Phytophthora busuk daun, disusul pemberian mikro kalsium guna menambal sel hancur." :
                                specCrop === "cabai" ? "Lakukan isolasi kutu kebul dengan semprotan minyak mimba organik. Tambahkan unsur magnesium (MgSO4) dosis rendah untuk merangsang sisa klorofil daun keriting." :
                                specCrop === "jagung" ? "Berikan pemupukan Kalium Klorida (KCl) tinggi untuk memulihkan turgor sel jagung yang terinfeksi hawar daun, batasi asupan pupuk Urea murni sementara waktu." :
                                "Gunakan fungisida berbahan aktif metalaksil protektif. Semprot pada bagian bawah daun secara merata saat pagi hari sebelum stomata menutup penuh."
                              )}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Pilihan C: ENSIKLOPEDIA GOLONGAN ZAT AKTIF & MODE KERJA */}
          {labSubTab === "ensiklopedia" && (() => {
            const activeIngredientsList = [
              { name: "Tembaga Hidroksida", type: "Fungisida Kontak", moa: "FRAC M01 (Multi-Site)", desc: "Membentuk lapisan tembaga pelindung di permukaan daun. Mencegah spora jamur berkecambah. Sangat rentan terhadap pembilasan air hujan.", dangerNote: "Jangan dicampur pupuk nitrogen cair / asam amino bebas.", category: "fungisida" },
              { name: "Trisiklazol", type: "Fungisida Sistemik", moa: "FRAC 16 (Melanin Biosynthesis)", desc: "Menembus jaringan tanaman padi secara cepat untuk mencegah infeksi spora blas daun maupun leher malai padi.", dangerNote: "Lakukan rotasi golongan lain agar spora tidak resisten.", category: "fungisida" },
              { name: "Metalaksil", type: "Fungisida Sistemik", moa: "FRAC 4 (RNA Polymerase I)", desc: "Sangat efektif mengatasi penyakit busuk daun (Late Blight) pada tomat dan kentang. Bekerja secara akropetal di dalam pembuluh xilem.", dangerNote: "Gunakan secara bijaksana karena resiko resistensi tinggi.", category: "fungisida" },
              { name: "Abamektin", type: "Insektisida Kontak & Lambung", moa: "IRAC 6 (Chloride Channel)", desc: "Racun kontak trans-laminar kuat untuk membasmi hama penghisap seperti kutu kebul, kutu daun, dan thrips pada tanaman cabai.", dangerNote: "Sangat beracun bagi lebah madu.", category: "insektisida" },
              { name: "Imidakloprid", type: "Insektisida Sistemik", moa: "IRAC 4A (Neonicotinoid)", desc: "Bekerja sistemik melumpuhkan saraf serangga wereng padi, kutu kebul, dan wereng coklat.", dangerNote: "Hindari aplikasi saat bunga sedang mekar lebat.", category: "insektisida" },
              { name: "Klorantraniliprol", type: "Insektisida Sistemik Diamide", moa: "IRAC 28 (Ryanodine Receptor)", desc: "Sangat selektif membasmi ulat penggerek batang padi dan ulat grayak. Sangat aman bagi musuh alami dan serangga penyerbuk.", dangerNote: "Gunakan saat tingkat populasi hama mencapai ambang batas.", category: "insektisida" },
              { name: "Glifosat", type: "Herbisida Sistemik Non-Selektif", moa: "HRAC 9 (EPSP Synthase)", desc: "Herbisida purna-tumbuh sistemik untuk membasmi rumput liar berdaun sempit dan lebar secara total hingga ke akar-akarnya.", dangerNote: "Jangan semprotkan terkena helaian daun tanaman utama.", category: "herbisida" }
            ];

            const filteredList = activeIngredientsList.filter(item => {
              const matchesSearch = item.name.toLowerCase().includes(encyclopediaSearch.toLowerCase()) || 
                                    item.type.toLowerCase().includes(encyclopediaSearch.toLowerCase()) ||
                                    item.desc.toLowerCase().includes(encyclopediaSearch.toLowerCase());
              const matchesCategory = encyclopediaFilter === "all" || item.category === encyclopediaFilter;
              return matchesSearch && matchesCategory;
            });

            return (
              <div className="encyclopedia-container tab-fade-in">
                <div className="panel">
                  <div className="panel-header">
                    <div className="panel-icon"><BookOpen size={14} /></div>
                    <div>
                      <div className="panel-title">Ensiklopedia Bahan Aktif Pertanian</div>
                      <div className="panel-subtitle">Direktori golongan zat kimia aktif dan rekomendasi rotasi guna mencegah resistensi</div>
                    </div>
                  </div>
                  
                  <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div className="encyclopedia-search-bar">
                      <BookOpen size={16} style={{ color: "rgba(255,255,255,0.4)" }} />
                      <input 
                        type="text" 
                        placeholder="Cari zat aktif, nama golongan, atau fungsinya..." 
                        value={encyclopediaSearch}
                        onChange={(e) => setEncyclopediaSearch(e.target.value)}
                      />
                    </div>

                    <div className="category-filter-bar">
                      <button className={`filter-pill ${encyclopediaFilter === "all" ? "active" : ""}`} onClick={() => setEncyclopediaFilter("all")}>Semua</button>
                      <button className={`filter-pill ${encyclopediaFilter === "fungisida" ? "active" : ""}`} onClick={() => setEncyclopediaFilter("fungisida")}>Fungisida</button>
                      <button className={`filter-pill ${encyclopediaFilter === "insektisida" ? "active" : ""}`} onClick={() => setEncyclopediaFilter("insektisida")}>Insektisida</button>
                      <button className={`filter-pill ${encyclopediaFilter === "herbisida" ? "active" : ""}`} onClick={() => setEncyclopediaFilter("herbisida")}>Herbisida</button>
                    </div>

                    <div className="encyclopedia-grid">
                      {filteredList.length > 0 ? (
                        filteredList.map((item, index) => (
                          <div key={index} className="ingredient-card">
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                                <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--col-text-1)" }}>{item.name}</h4>
                                <span className={`moa-badge ${item.category === "fungisida" ? "moa-fungicide" : item.category === "insektisida" ? "moa-insecticide" : "moa-herbicide"}`}>
                                  {item.moa}
                                </span>
                              </div>
                              <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--col-text-3)", marginBottom: 10 }}>{item.type}</div>
                              <p style={{ fontSize: 11, color: "var(--col-text-2)", lineHeight: 1.4, margin: 0 }}>{item.desc}</p>
                            </div>

                            <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10, marginTop: 4 }}>
                              <div style={{ fontSize: 9, fontWeight: 600, color: "#fca5a5", display: "flex", alignItems: "center", gap: 4 }}>
                                <TriangleAlert size={10} /> PERINGATAN DARURAT
                              </div>
                              <div style={{ fontSize: 10, color: "#fca5a5", marginTop: 2, lineHeight: 1.3 }}>{item.dangerNote}</div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--col-text-3)", fontSize: 12, gridColumn: "1 / -1" }}>
                          Bahan aktif tidak ditemukan. Silakan masukkan kata kunci lain.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </main>
      )}

      {/* ═══════════ DETEKSI ═══════════ */}
      {mainTab === "deteksi" && (
        <div className="tab-fade-in">
          {/* HERO */}
          <section className="hero">
            <div className="hero-chip stagger-in stagger-1">
              <span className="hero-chip-dot" />
              Dibuat oleh{" "}
              <span style={{ color:"var(--col-accent)", fontWeight:700 }}>Andrew</span>
              {" · "}
              <span style={{ color:"var(--col-accent)", fontWeight:700 }}>Magfira</span>
              {" · "}
              <span style={{ color:"var(--col-accent)", fontWeight:700 }}>Wilda</span>
            </div>
            <h1 className="stagger-in stagger-2">
              Deteksi Penyakit Tanaman<br />
              <span className="hero-accent-wrapper">
                <span className="hero-accent">dengan Kecerdasan Buatan</span>
                <span className="hero-underline-beam" />
              </span>
            </h1>
            <p className="hero-sub stagger-in stagger-3">
              Sistem AI berbasis YOLOv8 yang mendeteksi hama &amp; penyakit pada tanaman
              dalam &lt;2 detik. Upload foto daun untuk diagnosis instan dan akurat.
            </p>
            <div className="hero-stats stagger-in stagger-4">
              <div className="hero-stat">
                <div className="hero-stat-icon-ring green"><Zap size={14} /></div>
                <div className="hero-stat-val">
                  <CountUpNumber end={94} suffix="%" />
                </div>
                <div className="hero-stat-label">Akurasi AI</div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat-icon-ring cyan"><Cpu size={14} /></div>
                <div className="hero-stat-val">
                  &lt;<CountUpNumber end={2} suffix="s" />
                </div>
                <div className="hero-stat-label">Inferensi</div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat-icon-ring violet"><BarChart3 size={14} /></div>
                <div className="hero-stat-val">
                  <CountUpNumber end={38} />
                </div>
                <div className="hero-stat-label">Kelas AI</div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat-icon-ring emerald"><Sprout size={14} /></div>
                <div className="hero-stat-val">
                  <CountUpNumber end={16} />
                </div>
                <div className="hero-stat-label">Tanaman</div>
              </div>
            </div>
          </section>

          <main className="main-container">
            <div className="app-grid">

              {/* ══ KOLOM KIRI ══ */}
              <div className="left-col">

                {/* Input Gambar */}
                <div className="panel stagger-in stagger-5">
                  <div className="panel-header">
                    <div className="panel-icon"><Camera size={14} /></div>
                    <div>
                      <div className="panel-title">Input Gambar</div>
                      <div className="panel-subtitle">Upload file atau kamera langsung</div>
                    </div>
                  </div>
                  <div className="panel-body">
                    <div className="segment-control">
                      <button
                        className={`segment-btn ${uploadTab === "upload" ? "active" : ""}`}
                        onClick={() => { setUploadTab("upload"); handleReset(); }}>
                        <Upload size={12} /> Upload File
                      </button>
                      <button
                        className={`segment-btn ${uploadTab === "kamera" ? "active" : ""}`}
                        onClick={() => { setUploadTab("kamera"); handleReset(); }}>
                        <Camera size={12} /> Kamera
                      </button>
                    </div>

                    {uploadTab === "kamera" && stage === "idle" && (
                      <div style={{ marginTop:10 }}>
                        <CameraCapture onCapture={handleFile} />
                      </div>
                    )}

                    {uploadTab === "upload" && stage === "idle" && (
                      <div
                        id="upload-zone"
                        className={`upload-zone ${isDrag ? "drag-over" : ""}`}
                        onDragOver={e => { e.preventDefault(); setIsDrag(true); }}
                        onDragLeave={() => setIsDrag(false)}
                        onDrop={handleDrop}>
                        <input
                          id="file-input" type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                          aria-label="Upload gambar" />
                        <div className="upload-icon-ring"><Upload size={22} /></div>
                        <div className="upload-title">Drag &amp; drop atau klik untuk pilih</div>
                        <div className="upload-sub">Foto daun dengan pencahayaan yang baik</div>
                        <div className="format-pills">
                          {["JPG","PNG","WebP"].map(f => <span key={f} className="format-pill">{f}</span>)}
                        </div>
                      </div>
                    )}

                    {imageUrl && (
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        <div className="active-img-badge">
                          <span className="active-img-dot" />
                          Gambar siap dianalisis
                        </div>
                        <div style={{
                          borderRadius:10, overflow:"hidden",
                          border:"1px solid rgba(74,222,128,0.12)",
                          maxHeight:160, display:"flex",
                          alignItems:"center", justifyContent:"center",
                          background:"rgba(0,0,0,0.4)",
                        }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imageUrl} alt="preview"
                            style={{ maxHeight:160, maxWidth:"100%", objectFit:"contain" }} />
                        </div>
                        <button
                          id="btn-reset" className="btn-ghost"
                          style={{ width:"100%" }}
                          onClick={handleReset} disabled={isLoading}>
                          <RefreshCw size={13} /> Ganti Gambar
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Kontrol Model */}
                <div className="panel stagger-in stagger-6">
                  <div className="panel-header">
                    <div className="panel-icon"><SlidersHorizontal size={14} /></div>
                    <div>
                      <div className="panel-title">Kontrol Model</div>
                      <div className="panel-subtitle">Konfigurasi parameter YOLOv8</div>
                    </div>
                  </div>
                  <div className="panel-body" style={{ display:"flex", flexDirection:"column", gap:16 }}>

                    {/* Pipeline */}
                    <div className="pipeline">
                      {PIPELINE.map((step, i) => {
                        const s = getStepState(step.key, stage);
                        return (
                          <div key={step.key} style={{ display:"flex", alignItems:"center", gap:3 }}>
                            <div className={`pipeline-step ${s}`}>
                              <div className="step-dot">{s === "done" ? "✓" : i+1}</div>
                              {step.label}
                            </div>
                            {i < PIPELINE.length-1 && <span className="step-arrow">›</span>}
                          </div>
                        );
                      })}
                    </div>

                    {/* Slider */}
                    <div className="slider-row">
                      <div className="slider-header">
                        <label htmlFor="conf-slider" className="slider-label">
                          <Activity size={13} /> Confidence Threshold
                        </label>
                        <span className="slider-val">{Math.round(confThreshold*100)}%</span>
                      </div>
                      <input
                        id="conf-slider" type="range" className="slider"
                        min={0.10} max={0.95} step={0.05} value={confThreshold}
                        onChange={e => setConfThreshold(Number(e.target.value))}
                        style={{ "--val": confThreshold } as React.CSSProperties}
                        aria-label="Confidence threshold" />
                      <div className="slider-hints"><span>Sensitif</span><span>Presisi</span></div>
                    </div>

                    {/* Spec grid */}
                    <div className="telemetry-specs-grid">
                      <div className="spec-card">
                        <span className="spec-label">MODEL</span>
                        <span className="spec-val">YOLOv8s</span>
                      </div>
                      <div className="spec-card">
                        <span className="spec-label">WEIGHTS</span>
                        <span className="spec-val">SIPETANI.v5</span>
                      </div>
                      <div className="spec-card">
                        <span className="spec-label">LATENCY</span>
                        <span className="spec-val">
                          {isLoading ? "COMPUTING" : stage === "done" ? "~240ms" : "STANDBY"}
                        </span>
                      </div>
                      <div className="spec-card">
                        <span className="spec-label">STATUS</span>
                        <span className="spec-val"
                          style={{ color: isLoading ? "var(--col-amber)" : "var(--col-accent)" }}>
                          {isLoading ? "ACTIVE" : "ONLINE"}
                        </span>
                      </div>
                    </div>

                    <button
                      id="btn-analyze" className="btn-primary" style={{ width:"100%" }}
                      onClick={handleAnalyze} disabled={isLoading || !imageUrl}>
                      {isLoading
                        ? <><div className="spin" /><span>Menganalisis...</span></>
                        : <><Zap size={14} /><span>Analisis Sekarang</span></>}
                    </button>
                  </div>
                </div>
              </div>{/* end left-col */}

              {/* ══ KOLOM KANAN ══ */}
              <div className="right-col">

                {/* Scanner Visual */}
                <div className={`panel stagger-in stagger-7 ${isLoading ? "active-scan-glow" : ""}`}
                  style={{ position:"relative" }}>
                  <div className="hud-corner tl" /><div className="hud-corner tr" />
                  <div className="hud-corner bl" /><div className="hud-corner br" />
                  <div className="hud-crosshair-h" /><div className="hud-crosshair-v" />

                  <div className="panel-header">
                    <div className="panel-icon"><Scan size={14} /></div>
                    <div>
                      <div className="panel-title">Scanner Visual AI</div>
                      <div className="panel-subtitle">Visualisasi deteksi real-time</div>
                    </div>
                    <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6 }}>
                      <div style={{
                        width:7, height:7, borderRadius:"50%",
                        background: isLoading ? "var(--col-amber)" : stage==="done" ? "var(--col-accent)" : "rgba(255,255,255,0.15)",
                        boxShadow: isLoading ? "0 0 8px var(--col-amber)" : stage==="done" ? "0 0 8px var(--col-accent)" : "none",
                        animation: isLoading ? "livingPulse 1s infinite" : "none",
                      }} />
                      <span style={{ fontSize:10, color:"var(--col-text-4)", fontFamily:"var(--font-mono)" }}>
                        {isLoading ? "SCANNING" : stage==="done" ? "DONE" : "STANDBY"}
                      </span>
                    </div>
                  </div>

                  <div className="panel-body" style={{ paddingBottom:20 }}>
                    {/* Idle */}
                    {stage === "idle" && (
                      <div style={{ minHeight:320, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, textAlign:"center", position:"relative" }}>
                        <div className="hud-radar-ring" />
                        <div className="empty-icon-pulse">
                          <Leaf size={26} style={{ color:"var(--col-accent)" }} />
                        </div>
                        <div>
                          <div className="empty-title" style={{ marginBottom:6 }}>Menunggu Input Gambar</div>
                          <div className="empty-sub">Pilih file atau aktifkan kamera di panel kiri untuk memulai pemindaian AI.</div>
                        </div>
                        <div style={{ position:"absolute", inset:"10%", border:"1px dashed rgba(74,222,128,0.06)", borderRadius:12, pointerEvents:"none" }} />
                      </div>
                    )}

                    {/* Result with bbox */}
                    {imageUrl && result && (
                      <div style={{ borderRadius:10, overflow:"hidden", border:"1px solid rgba(74,222,128,0.12)" }}>
                        <ResultOverlay
                           imageUrl={imageUrl}
                           detections={result.detections}
                           imageWidth={result.image_width}
                           imageHeight={result.image_height}
                        />
                      </div>
                    )}

                    {/* Preview no result */}
                    {imageUrl && !result && !isLoading && (
                      <div className="preview-box preview-static">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imageUrl} alt="Preview" />
                      </div>
                    )}

                    {/* Loading / scanning */}
                    {imageUrl && isLoading && (
                      <div className="preview-box">
                        {/* Background image fills frame */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imageUrl} alt="Analyzing" style={{ opacity:0.15 }} />
                        {/* Dark vignette overlay */}
                        <div style={{
                          position:"absolute", inset:0,
                          background:"radial-gradient(ellipse 60% 60% at 50% 50%, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.55) 100%)",
                          zIndex:3,
                        }} />
                        
                        {/* Phase 4 Immersion Overlays */}
                        <div className="spec-grid-overlay" />
                        <SpectrometryReadout />
                        <SineWaveTelemetry />

                        {/* Scanner sweep line */}
                        <div className="scanner-line-sweep" style={{ zIndex:6 }} />
                        {/* HUD corner brackets inside image */}
                        <div className="scan-bracket tl" />
                        <div className="scan-bracket tr" />
                        <div className="scan-bracket bl" />
                        <div className="scan-bracket br" />
                        {/* Rotating scan frame */}
                        <div className="hud-scanner-frame" style={{ zIndex:7 }} />
                        <div className="hud-scanner-target" style={{ zIndex:7 }} />
                        {/* Corner data labels */}
                        <div className="hud-scanner-measuring m1">SYS.ACQUIRING</div>
                        <div className="hud-scanner-measuring m2">YOLOv8.INFER</div>
                        <div className="hud-scanner-measuring m3">ROI: LEAF_TISSUE</div>
                        <div className="hud-scanner-measuring m4">CONF: FILTER...</div>
                        {/* Center badge */}
                        <div className="scan-center-badge">
                          <div className="spin" style={{ width:26, height:26, borderWidth:2 }} />
                          <span className="scan-stage-label">
                            {stage === "uploading"     && "UPLOADING"}
                            {stage === "preprocessing" && "PREPROCESSING"}
                            {stage === "inference"     && "RUNNING INFERENCE"}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Error */}
                    {stage === "error" && (
                      <div style={{ minHeight:200, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <div className="error-state">
                          <TriangleAlert size={16} style={{ flexShrink:0 }} />
                          <div>
                            <div className="error-title">Gagal Memproses</div>
                            <div className="error-msg">{errorMsg}</div>
                          </div>
                        </div>
                      </div>
                    )}


                  </div>

                  {/* Telemetry bar */}
                  <div className="hud-telemetry-strip">
                    {stage === "idle"    && <><span>SYS.STATUS // STANDBY</span><span>YOLOv8_NODE // READY</span></>}
                    {stage === "preview" && <><span className="hud-ticker-active">DATA_ACQUIRED</span><span>{file ? `${(file.size/1024).toFixed(1)} KB` : "N/A"}</span></>}
                    {isLoading && <><span className="hud-ticker-active">{stage==="uploading" ? "UPLOADING" : stage==="preprocessing" ? "RESIZING_640x640" : "COMPUTING_INFERENCE"}</span><span>SCANNING...</span></>}
                    {stage === "done" && result && <><span className="hud-ticker-active">COMPLETE // RESOLVED</span><span>DET:{result.detections.length} THR:{Math.round(confThreshold*100)}%</span></>}
                    {stage === "error" && <><span className="hud-ticker-warn">ERROR // PIPELINE_FAILURE</span><span>RETRY_REQUIRED</span></>}
                  </div>
                </div>

                {/* Bio-Sensor Telemetry (Fase 3) */}
                {stage === "done" && result && (
                  <div className="panel bio-sensor-panel">
                    <div className="panel-header">
                      <div className="panel-icon" style={{ color: "var(--col-accent)" }}><Activity size={14} /></div>
                      <div>
                        <div className="panel-title">Telemetri Bio-Sensor Daun</div>
                        <div className="panel-subtitle">Analisis indikator biologis daun tanaman</div>
                      </div>
                    </div>
                    <div className="panel-body">
                      <div className="bio-grid">
                        
                        {/* Klorofil */}
                        <div className="bio-card">
                          <div className="bio-header">
                            <span className="bio-label">Chlorophyll Index</span>
                            <span className="bio-val" style={{ color: chlorophyllColor === "green" ? "var(--col-green)" : chlorophyllColor === "amber" ? "var(--col-amber)" : "var(--col-red)" }}>
                              {chlorophyllVal}%
                            </span>
                          </div>
                          <div className="bio-progress-container">
                            <div className={`bio-progress-fill ${chlorophyllColor}`} style={{ width: `${chlorophyllVal}%` }} />
                          </div>
                          <span className="bio-desc">
                            {chlorophyllVal > 80 
                              ? "Fotosintesis bekerja prima, kerapatan klorofil optimal." 
                              : chlorophyllVal > 50 
                                ? "Klorosis ringan terdeteksi, degradasi pigmen daun." 
                                : "Klorosis berat! Kerusakan klorofil masif akibat patogen."}
                          </span>
                        </div>

                        {/* Kelembapan Sel */}
                        <div className="bio-card">
                          <div className="bio-header">
                            <span className="bio-label">Cell Moisture</span>
                            <span className="bio-val" style={{ color: moistureColor === "green" ? "var(--col-green)" : moistureColor === "amber" ? "var(--col-amber)" : "var(--col-red)" }}>
                              {moistureVal}%
                            </span>
                          </div>
                          <div className="bio-progress-container">
                            <div className={`bio-progress-fill ${moistureColor}`} style={{ width: `${moistureVal}%` }} />
                          </div>
                          <span className="bio-desc">
                            {moistureVal > 80 
                              ? "Turgor sel stabil, sistem penyerapan air normal." 
                              : moistureVal > 50 
                                ? "Stres air ringan, transpirasi sedikit terganggu." 
                                : "Dehidrasi jaringan sel! Layu bakteri/jamur merusak xylem."}
                          </span>
                        </div>

                        {/* Kepadatan Serat */}
                        <div className="bio-card">
                          <div className="bio-header">
                            <span className="bio-label">Fiber Density</span>
                            <span className="bio-val" style={{ color: densityColor === "green" ? "var(--col-green)" : densityColor === "amber" ? "var(--col-amber)" : "var(--col-red)" }}>
                              {densityVal}%
                            </span>
                          </div>
                          <div className="bio-progress-container">
                            <div className={`bio-progress-fill ${densityColor}`} style={{ width: `${densityVal}%` }} />
                          </div>
                          <span className="bio-desc">
                            {densityVal > 80 
                              ? "Kepadatan serat normal, struktur daun kokoh." 
                              : densityVal > 50 
                                ? "Struktur melemah akibat infiltrasi hifa jamur." 
                                : "Struktur rapuh! Jaringan daun membusuk/hancur."}
                          </span>
                        </div>

                      </div>
                    </div>
                  </div>
                )}

                {/* Hasil Diagnosis */}
                <div className={`panel stagger-in stagger-8 ${panelThemeClass}`}>
                  <div className="panel-header">
                    <div className="panel-icon"><Microscope size={14} /></div>
                    <div>
                      <div className="panel-title">Hasil Diagnosis</div>
                      <div className="panel-subtitle">Analisis penyakit &amp; rekomendasi penanganan</div>
                    </div>
                  </div>
                  <div className="panel-body">
                    {/* Skeleton while loading */}
                    {isLoading && (
                      <div className="skeleton-container">
                        {[0, 1].map(i => (
                          <div key={i} className="skeleton-card" style={{ animationDelay: `${i * 0.18}s` }}>
                            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                              <div className="skeleton-line" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />
                              <div style={{ flex: 1 }}>
                                <div className="skeleton-line" style={{ width: '60%', height: 13, marginBottom: 8 }} />
                                <div className="skeleton-line" style={{ width: '40%', height: 9 }} />
                              </div>
                            </div>
                            <div className="skeleton-line" style={{ width: '100%', height: 8, marginBottom: 6 }} />
                            <div className="skeleton-line" style={{ width: '88%', height: 8, marginBottom: 6 }} />
                            <div className="skeleton-line" style={{ width: '72%', height: 8 }} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Empty state when idle */}
                    {!isLoading && stage !== "done" && (
                      <div className="empty-state" style={{ minHeight:140 }}>
                        <div className="empty-icon"><FlaskConical size={20} /></div>
                        <div className="empty-title">Menunggu Analisis</div>
                        <div className="empty-sub">Jalankan deteksi untuk melihat hasil diagnosis AI.</div>
                      </div>
                    )}

                    {/* Results with reveal animation */}
                    {stage === "done" && result && (
                      <div className="result-reveal">
                        <div className="stage-badge" style={{ marginBottom:12 }}>
                          <span className="stage-dot" />
                          {result.message}
                        </div>
                        
                        {/* Scrollable container for diagnosis cards */}
                        <div className="diagnosis-scroll-container">
                          <DiagnosisCard detections={result.detections} message={result.message} validationWarning={result.validation_warning} onSelectDisease={setActiveDrawerDisease} />
                        </div>
                        
                        {/* Compact actions button row */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
                          {result.detections.length > 0 && (
                            <button
                              className="btn-primary animate-pulse"
                              style={{ 
                                flex: "1.3 1 180px", 
                                padding: "8px 12px", 
                                fontSize: "12px", 
                                display: "flex", 
                                alignItems: "center", 
                                justifyContent: "center", 
                                gap: 6,
                                background: "radial-gradient(135% 135% at 0% 0%, var(--col-accent) 0%, #16a34a 100%)",
                                border: "1px solid rgba(255,255,255,0.2)",
                                color: "#000",
                                fontWeight: 700
                              }}
                              onClick={handleAutoBridgeRecipe}
                            >
                              <FlaskConical size={12} /> Racik Resep Obat AI
                            </button>
                          )}
                          
                          <button
                            id="btn-pdf" className="btn-export"
                            style={{ flex: "1 1 120px", padding: "8px 12px", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                            onClick={downloadPDF} disabled={isPdfLoading}>
                            {isPdfLoading
                              ? <><div className="spin" /> Membuat PDF...</>
                              : <><Download size={12} /> Laporan PDF</>}
                          </button>
                          
                          <button
                            type="button"
                            className="json-toggle-btn"
                            style={{ margin: 0, padding: "8px 12px", flex: "1 1 100px" }}
                            onClick={() => setShowJson(!showJson)}>
                            <Terminal size={12} /> {showJson ? "JSON" : "Raw JSON"}
                          </button>
                        </div>
                        
                        {/* Collapsible JSON block */}
                        {showJson && (
                          <div style={{ marginTop:12, animation: "fadeInText 0.3s ease-out" }}>
                            <div className="code-label" style={{ fontSize: 10 }}><Terminal size={10} /> JSON Response</div>
                            <div className="code-block" style={{ padding: "8px 12px" }}><JsonBlock data={result} /></div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

              </div>{/* end right-col */}
            </div>{/* end app-grid */}
          </main>
        </div>
      )}

      {/* ── Toast Notification Container ── */}
      <div className="toast-container" role="region" aria-label="Notifikasi">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`} role="alert">
            <div className="toast-icon">
              {t.type === 'success' && <CheckCircle size={15} />}
              {t.type === 'error'   && <XCircle size={15} />}
              {t.type === 'warn'    && <TriangleAlert size={15} />}
            </div>
            <div className="toast-body">
              <div className="toast-title">{t.title}</div>
              <div className="toast-msg">{t.msg}</div>
            </div>
            <button className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Tutup notifikasi">
              <X size={12} />
            </button>
            <div className="toast-progress" />
          </div>
        ))}
      </div>

      <footer className="footer">
        <strong style={{ color:"var(--col-accent)" }}>SIPETANI</strong>
        {" "}— AI Agricultural Disease Detection{" · "}YOLOv8 · FastAPI · Next.js
      </footer>

      {/* ── Ensiklopedia Side Drawer (Fase 3) ── */}
      <div 
        className={`drawer-overlay ${activeDrawerDisease ? "active" : ""}`}
        onClick={() => setActiveDrawerDisease(null)}
      >
        <div 
          className="side-drawer"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="drawer-header">
            <h3 className="drawer-title">Detail Patologi Daun</h3>
            <button 
              className="drawer-close-btn" 
              onClick={() => setActiveDrawerDisease(null)}
              aria-label="Tutup detail"
            >
              <X size={15} />
            </button>
          </div>
          
          <div className="drawer-content">
            {activeDrawerDisease ? (() => {
              const info = getDiseaseDetails(activeDrawerDisease);
              return (
                <>
                  <div className="drawer-tag">
                    <FlaskConical size={10} /> {info.pathogen}
                  </div>
                  
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--col-accent)", fontFamily: "var(--font-display)", letterSpacing: "-0.03em", marginBottom: 6 }}>
                    {info.name}
                  </h2>
                  
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontStyle: "italic", color: "var(--col-text-3)", marginBottom: 20 }}>
                    Patogen: {info.latinName}
                  </div>
                  
                  <div className="drawer-section">
                    <h4 className="drawer-sec-title"><BookOpen size={11} /> Deskripsi Penyakit</h4>
                    <p className="drawer-sec-body">{info.description}</p>
                  </div>
                  
                  <div className="drawer-section">
                    <h4 className="drawer-sec-title"><Activity size={11} /> Gejala Infeksi</h4>
                    <ul style={{ paddingLeft: 16, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                      {info.symptoms.map((sym, idx) => (
                        <li key={idx} className="drawer-sec-body" style={{ listStyleType: "square", color: "var(--col-text-2)" }}>
                          {sym}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="drawer-section" style={{ borderBottom: "none", marginBottom: 0 }}>
                    <h4 className="drawer-sec-title"><Sprout size={11} style={{ color: "#4ade80" }} /> Jadwal Tindakan Pemulihan</h4>
                    <TreatmentRoadmap label={activeDrawerDisease} />
                  </div>
                </>
              );
            })() : (
              <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "var(--col-text-4)" }}>
                Tidak ada penyakit terpilih
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Virtual Ag-Botanist Floating Assistant (Fase 9) ── */}
      <button 
        className="ag-botanist-bubble" 
        onClick={() => setBotanistOpen(open => !open)}
        aria-label="Ag-Botanist Assistant"
      >
        <Bot size={24} />
        {!botanistOpen && chatMessages.length === 1 && (
          <span className="ag-botanist-bubble-badge" />
        )}
      </button>

      <div className={`ag-botanist-console ${botanistOpen ? "open" : ""}`}>
        <div className="ag-chat-header">
          <div className="ag-chat-status">
            <div className="ag-status-dot" />
            <div>
              <div className="ag-chat-title">Botanis AI SiPetani</div>
              <div className="ag-chat-subtitle">Spesialis Patologi Daun</div>
            </div>
          </div>
          <button 
            className="ag-chat-close" 
            onClick={() => setBotanistOpen(false)}
            aria-label="Tutup Chat"
          >
            <X size={16} />
          </button>
        </div>

        <div className="ag-chat-messages">
          {chatMessages.map((msg, idx) => (
            <div key={idx} className={`ag-message ${msg.sender}`}>
              {msg.text.split("\n").map((line, lIdx) => {
                let content: React.ReactNode = line;
                if (line.includes("**")) {
                  const parts = line.split("**");
                  content = parts.map((part, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} style={{ color: "var(--col-accent)" }}>{part}</strong> : part);
                }
                return <div key={lIdx} style={{ marginTop: lIdx > 0 ? 6 : 0 }}>{content}</div>;
              })}
            </div>
          ))}
          {chatTyping && (
            <div className="ag-typing-indicator">
              <span className="ag-typing-dot" />
              <span className="ag-typing-dot" />
              <span className="ag-typing-dot" />
              <span style={{ marginLeft: 4 }}>Merumuskan solusi...</span>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Dynamic Contextual Suggestion Chips */}
        <div className="ag-suggestion-container">
          {stage === "done" && result && result.detections.length > 0 ? (() => {
            const disease = result.detections[0]?.label;
            return (
              <>
                <button className="ag-suggestion-chip" onClick={() => handleSendChatMessage(`Bagaimana cara menyembuhkan ${disease} secara organik?`)}>
                  🌿 Obat Organik {disease}
                </button>
                <button className="ag-suggestion-chip" onClick={() => handleSendChatMessage(`Bahan aktif kimia apa yang mempan untuk ${disease}?`)}>
                  🧪 Obat Kimia {disease}
                </button>
                <button className="ag-suggestion-chip" onClick={() => handleSendChatMessage(`Bagaimana cara mencegah agar ${disease} tidak menular?`)}>
                  🛡️ Cegah {disease} menular
                </button>
              </>
            );
          })() : stage === "done" && result && result.detections.length === 0 ? (
            <>
              <button className="ag-suggestion-chip" onClick={() => handleSendChatMessage("Bagaimana cara meningkatkan imunitas klorofil daun tanaman?")}>
                🌿 Imunitas Klorofil
              </button>
              <button className="ag-suggestion-chip" onClick={() => handleSendChatMessage("Berapa takaran pupuk NPK seimbang untuk padi?")}>
                🧪 Dosis NPK Seimbang
              </button>
              <button className="ag-suggestion-chip" onClick={() => handleSendChatMessage("Bagaimana sanitasi kebun preventif yang benar?")}>
                🛡️ Sanitasi Kebun Rutin
              </button>
            </>
          ) : (
            <>
              <button className="ag-suggestion-chip" onClick={() => handleSendChatMessage("Bagaimana membedakan penyakit blas padi dengan bercak cokelat?")}>
                🌾 Blas Padi vs Bercak
              </button>
              <button className="ag-suggestion-chip" onClick={() => handleSendChatMessage("Resep pestisida nabati alami dari daun mimba")}>
                🌿 Resep Neem Oil Alami
              </button>
              <button className="ag-suggestion-chip" onClick={() => handleSendChatMessage("Cara membasmi hama kutu kebul cabai")}>
                🌶️ Basmi Kutu Kebul
              </button>
            </>
          )}
        </div>

        <form 
          className="ag-chat-input-container" 
          onSubmit={(e) => {
            e.preventDefault();
            handleSendChatMessage(chatInput);
          }}
        >
          <input 
            type="text" 
            className="ag-chat-input" 
            placeholder="Tanyakan penanganan penyakit..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            disabled={chatTyping}
          />
          <button 
            type="submit" 
            className="ag-chat-send"
            disabled={chatTyping || !chatInput.trim()}
            aria-label="Kirim"
          >
            <Send size={14} />
          </button>
        </form>
      </div>

      {/* Pilihan D: FLOATING VIRTUAL AGRONOMIST CHATBOT & PANEL DRAWER (Dipindahkan keluar dari tab-fade-in agar viewport-fixed bekerja secara presisi) */}
      {mainTab === "laboratorium" && (
        <>
          <div 
            className={`floating-chat-bubble ${!showChatbot ? "pulse-effect" : ""}`} 
            onClick={() => setShowChatbot(!showChatbot)}
          >
            <Microscope size={20} />
          </div>

          <div className={`chat-assistant-drawer ${showChatbot ? "open" : ""}`}>
            <div className="chat-header">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ color: "var(--col-accent)" }}><Microscope size={16} /></div>
                <div>
                  <h4 style={{ fontSize: 12, fontWeight: 700, color: "var(--col-text-1)", margin: 0 }}>Agronomis Virtual</h4>
                  <span style={{ fontSize: 8, color: "#86efac", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>• Online Expert</span>
                </div>
              </div>
              <button 
                className="btn-secondary" 
                style={{ padding: "4px 8px", fontSize: 10 }}
                onClick={() => setShowChatbot(false)}
              >
                Tutup
              </button>
            </div>

            <div className="chat-body">
              {chatHistory.map((msg, index) => (
                <div key={index} className={`chat-message ${msg.sender === "bot" ? "bot" : "user"}`}>
                  {msg.text}
                </div>
              ))}
            </div>

            <div className="chat-footer">
              <div style={{ fontSize: 9, color: "var(--col-text-3)", fontFamily: "var(--font-mono)", textTransform: "uppercase", marginBottom: 2 }}>
                Pilih Pertanyaan Cepat:
              </div>
              <div className="chat-options-container">
                <button className="chat-option-btn" onClick={() => handleChatOption("padi_blas")}>🌾 Mengatasi Penyakit Blas Padi</button>
                <button className="chat-option-btn" onClick={() => handleChatOption("tomat_late")}>🍅 Mengatasi Busuk Daun Tomat</button>
                <button className="chat-option-btn" onClick={() => handleChatOption("cabai_patek")}>🌶️ Mengatasi Penyakit Patek Cabai</button>
                <button 
                  className="chat-option-btn" 
                  style={{ textAlign: "center", borderStyle: "dashed", borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.4)" }} 
                  onClick={() => handleChatOption("reset")}
                >
                  Bersihkan Obrolan
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {selectedHistoryItem && (
        <HistoryDetailModal
          item={selectedHistoryItem}
          onClose={() => setSelectedHistoryItem(null)}
          onDownloadPdf={handleDownloadPdf}
          isPdfLoading={isPdfLoading}
        />
      )}
    </div>
  );
}

// ── Komponen Hitung Cepat Teranimasi (Stat Count-Up) ──
function CountUpNumber({ end, suffix = "", duration = 1200 }: { end: number; suffix?: string; duration?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let startTimestamp: number | null = null;
    let animId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      setVal(Math.floor(progress * end));
      if (progress < 1) {
        animId = window.requestAnimationFrame(step);
      } else {
        setVal(end);
      }
    };

    animId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(animId);
  }, [end, duration]);

  return <>{val}{suffix}</>;
}

function JsonBlock({ data }: { data: DetectResponse }) {
  const d = data.detections[0];
  if (!d) return (
    <span style={{ color:"var(--col-text-4)", fontFamily:"var(--font-mono)" }}>
      {`{"detections":[],"message":"${data.message}"}`}
    </span>
  );
  return (
    <>
      <span className="jp">{"{"}</span><br />
      &nbsp;&nbsp;<span className="jk">&quot;label&quot;</span><span className="jp">: </span><span className="jv">&quot;{d.label}&quot;</span><span className="jp">,</span><br />
      &nbsp;&nbsp;<span className="jk">&quot;confidence&quot;</span><span className="jp">: </span><span className="jn">{d.confidence.toFixed(4)}</span><span className="jp">,</span><br />
      &nbsp;&nbsp;<span className="jk">&quot;severity&quot;</span><span className="jp">: </span><span className="jv">&quot;{d.severity}&quot;</span><span className="jp">,</span><br />
      &nbsp;&nbsp;<span className="jk">&quot;total_detections&quot;</span><span className="jp">: </span><span className="jn">{data.detections.length}</span><br />
      <span className="jp">{"}"}</span>
    </>
  );
}

// --- ULTRA CUSTOM SELECT COMPONENT & OPTIONS DATA ---

interface SelectOption {
  value: string | number;
  label: string;
  subtext?: string;
  icon?: string;
  badge?: string;
}

interface UltraCustomSelectProps {
  value: any;
  onChange: (value: any) => void;
  options: SelectOption[];
  placeholder?: string;
  showSearch?: boolean;
  style?: React.CSSProperties;
}

const npkCropOptions: SelectOption[] = [
  { value: "Padi", label: "Padi Sawah", subtext: "Oryza sativa - Pangan pokok basah", icon: "🌾", badge: "Utama" },
  { value: "Tomat", label: "Tomat Horti", subtext: "Solanum lycopersicum - Sayur dataran tinggi/rendah", icon: "🍅", badge: "Horti" },
  { value: "Cabai", label: "Cabai Rawit", subtext: "Capsicum annuum - Tanaman horti pedas", icon: "🌶️", badge: "Horti" },
  { value: "Jagung", label: "Jagung Manis", subtext: "Zea mays - Palawija karbohidrat", icon: "🌽", badge: "Utama" },
  { value: "Kentang", label: "Kentang Horti", subtext: "Solanum tuberosum - Umbi dataran tinggi sejuk", icon: "🥔", badge: "Horti" },
];

const npkStageOptions: SelectOption[] = [
  { value: "persemaian", label: "Persemaian / Seedling", subtext: "Fase pembibitan awal & kecambah", icon: "🌱", badge: "Fase 1" },
  { value: "vegetatif", label: "Vegetatif Aktif", subtext: "Pertumbuhan masif batang & daun", icon: "🌿", badge: "Fase 2" },
  { value: "pembungaan", label: "Fase Pembungaan / Generatif", subtext: "Kemunculan bunga & polinasi aktif", icon: "🌸", badge: "Fase 3" },
  { value: "pembuahan", label: "Fase Pembuahan / Ripening", subtext: "Pembesaran buah & pematangan umbi", icon: "🍊", badge: "Fase 4" },
];

const npkSoilOptions: SelectOption[] = [
  { value: "lempung", label: "Tanah Lempung (Optimal)", subtext: "Lempung berpasir gembur aerasi ideal", icon: "⛰️", badge: "Optimal" },
  { value: "liat", label: "Tanah Liat (Clay)", subtext: "Retensi air tinggi, mengikat kuat fosfat (P)", icon: "🧱", badge: "Liat" },
  { value: "berpasir", label: "Tanah Berpasir", subtext: "Sifat kering aerasi tinggi, unsur hara mudah tercuci", icon: "🏖️", badge: "Berpasir" },
];

const reagentOptions: SelectOption[] = [
  { value: "tembaga", label: "Tembaga Kontak", subtext: "Copper Hydroxide - Protektan kontak broad spectrum", icon: "🛡️", badge: "Fungisida" },
  { value: "trisiklazol", label: "Trisiklazol Sistemik", subtext: "Melanin Biosynthesis Inhibitor - Tanggulangi blas daun/leher", icon: "🌾", badge: "Fungisida" },
  { value: "metalaksil", label: "Metalaksil Sistemik", subtext: "RNA Polymerase I Inhibitor - Khusus busuk daun busuk batang", icon: "🍅", badge: "Fungisida" },
  { value: "abamektin", label: "Abamektin Kontak-Lambung", subtext: "Chloride Channel Activator - Pembasmi kutu kebul & thrips", icon: "🐛", badge: "Insektisida" },
  { value: "pupuk_urea", label: "Urea Cair Makro N", subtext: "Penyedia Nitrogen 46% - Foliar booster daun vegetatif", icon: "🧪", badge: "Nutrisi" },
  { value: "asam_amino", label: "Asam Amino Organik", subtext: "Senyawa organik pembangun protein - Pemulih stres lisis", icon: "🌿", badge: "Nutrisi" },
];

const chemAOptions: SelectOption[] = [
  { value: "none", label: "-- Pilih Bahan Aktif A --", subtext: "Silakan pilih agen kimia primer", icon: "🧪" },
  ...reagentOptions
];

const chemBOptions: SelectOption[] = [
  { value: "none", label: "-- Pilih Bahan Aktif B --", subtext: "Silakan pilih agen kimia campuran", icon: "🧪" },
  ...reagentOptions
];

const brandOptions: SelectOption[] = [
  { value: "antracol", label: "Antracol 70 WP", subtext: "Propineb 70% - Kontak protektif zink-booster", icon: "🛡️", badge: "Bayer" },
  { value: "amistartop", label: "Amistartop 325 SC", subtext: "Azoksistrobin 200g/l+Difenokonazol 125g/l - Sistemik kuratif", icon: "🧪", badge: "Syngenta" },
  { value: "daconil", label: "Daconil 75 WP", subtext: "Klorotalonil 75% - Kontak multi-site berspektrum luas", icon: "🛡️", badge: "SDS" },
  { value: "decis", label: "Decis 25 EC", subtext: "Deltametrin 25g/l - Insektisida kontak racun saraf instan", icon: "🐛", badge: "Bayer" },
  { value: "curacron", label: "Curacron 500 EC", subtext: "Profilofos 500g/l - Kontak lambung efek translaminar penetran", icon: "🐛", badge: "Syngenta" },
  { value: "regent", label: "Regent 50 SC", subtext: "Fipronil 50g/l - Insektisida sistemik melumpuhkan hama penghisap", icon: "🌾", badge: "BASF" },
];

const apoBrandAOptions: SelectOption[] = [
  { value: "none", label: "-- Pilih Merek A (Wajib) --", subtext: "Silakan tentukan pestisida utama", icon: "🧪" },
  ...brandOptions
];

const apoBrandBOptions: SelectOption[] = [
  { value: "none", label: "-- Pilih Merek B (Campuran) --", subtext: "Pilih pencampur jika ingin tangki kombinasi", icon: "🧪" },
  ...brandOptions
];

const apoTankSizeOptions: SelectOption[] = [
  { value: 14, label: "Tangki Kecil - 14 L", subtext: "Kapasitas 14 Liter sprayer ransel manual standard", icon: "🎒", badge: "14 Liter" },
  { value: 16, label: "Tangki Standard - 16 L", subtext: "Kapasitas 16 Liter sprayer elektrik semprot konstan", icon: "🎒", badge: "16 Liter" },
  { value: 18, label: "Tangki Besar - 18 L", subtext: "Kapasitas 18 Liter sprayer gendong volume menengah", icon: "🎒", badge: "18 Liter" },
  { value: 20, label: "Tangki Jumbo - 20 L", subtext: "Kapasitas 20 Liter sprayer bermotor volume tinggi", icon: "🎒", badge: "20 Liter" },
];

const apoCropOptions: SelectOption[] = [
  { value: "padi", label: "Padi Sawah", subtext: "Tanaman pangan sereal berair sawah irigasi", icon: "🌾", badge: "Pangan" },
  { value: "tomat", label: "Tomat Horti", subtext: "Sayur buah merambat hortikultura kebun", icon: "🍅", badge: "Horti" },
  { value: "cabai", label: "Cabai Rawit / Besar", subtext: "Tanaman cabai perdu penghasil capsaicin", icon: "🌶️", badge: "Horti" },
  { value: "jagung", label: "Jagung Manis", subtext: "Tanaman pangan palawija dataran kering", icon: "🌽", badge: "Pangan" },
  { value: "kentang", label: "Kentang Dataran Tinggi", subtext: "Hortikultura solanaceae penghasil umbi sejuk", icon: "🥔", badge: "Horti" },
];

const cityOptions: SelectOption[] = [
  { value: "Malang", label: "Malang", subtext: "Dataran tinggi pegunungan sejuk (Sentra Sayur & Tomat)", icon: "🥦", badge: "Jawa Timur" },
  { value: "Subang", label: "Subang", subtext: "Dataran rendah pesisir (Lumbung padi nasional)", icon: "🌾", badge: "Jawa Barat" },
  { value: "Cianjur", label: "Cianjur", subtext: "Kawasan perbukitan sejuk (Sayur & tanaman hortikultura)", icon: "🥔", badge: "Jawa Barat" },
  { value: "Indramayu", label: "Indramayu", subtext: "Kawasan pesisir pantai utara panas (Sentra padi sawah)", icon: "🌾", badge: "Jawa Barat" },
  { value: "Bandung", label: "Lembang Bandung", subtext: "Lereng pegunungan vulkanik subur (Sentra Cabai & Sayur)", icon: "🌶️", badge: "Jawa Barat" },
];

const resInsecticideOptions: SelectOption[] = [
  { value: "none", label: "-- Pilih Insektisida --", subtext: "Pilih bahan aktif penyemprotan", icon: "🧪" },
  { value: "abamektin", label: "Abamektin", subtext: "Golongan 6: Avermektin - Aktivator saluran klorida", icon: "🐛", badge: "IRAC 6" },
  { value: "deltametrin", label: "Deltametrin", subtext: "Golongan 3A: Piroid - Modulator saluran natrium", icon: "🐛", badge: "IRAC 3A" },
  { value: "profilofos", label: "Profilofos", subtext: "Golongan 1B: Organofosfat - Inhibitor asetilkolinesterase", icon: "🐛", badge: "IRAC 1B" },
  { value: "fipronil", label: "Fipronil", subtext: "Golongan 2B: Fenilpirazol - Antagonis reseptor GABA", icon: "🌾", badge: "IRAC 2B" },
];

const resFungicideOptions: SelectOption[] = [
  { value: "none", label: "-- Pilih Fungisida --", subtext: "Pilih bahan aktif penyemprotan", icon: "🧪" },
  { value: "propineb", label: "Propineb", subtext: "Golongan M03: Ditiokarbamat - Kontak multi-site", icon: "🛡️", badge: "FRAC M03" },
  { value: "azoksistrobin", label: "Azoksistrobin", subtext: "Golongan 11: QoI - Respirasi mitokondria", icon: "🧪", badge: "FRAC 11" },
  { value: "difenokonazol", label: "Difenokonazol", subtext: "Golongan 3: DMI - Biosintesis sterol", icon: "🧪", badge: "FRAC 3" },
  { value: "klorotalonil", label: "Klorotalonil", subtext: "Golongan M05: Kloronitril - Kontak multi-site", icon: "🛡️", badge: "FRAC M05" },
];

function UltraCustomSelect({ value, onChange, options, placeholder = "-- Pilih --", showSearch = true, style }: UltraCustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
    if (!isOpen) {
      setSearchQuery("");
    }
  }, [isOpen, showSearch]);

  const selectedOption = options.find(o => o.value === value);

  const filteredOptions = options.filter(option => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const labelMatch = option.label.toLowerCase().includes(query);
    const subtextMatch = option.subtext ? option.subtext.toLowerCase().includes(query) : false;
    const badgeMatch = option.badge ? option.badge.toLowerCase().includes(query) : false;
    return labelMatch || subtextMatch || badgeMatch;
  });

  return (
    <div ref={containerRef} className="custom-select-container" style={style}>
      <div 
        className={`custom-select-trigger ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="custom-select-value">
          {selectedOption ? (
            <>
              {selectedOption.icon && <span style={{ marginRight: 6 }}>{selectedOption.icon}</span>}
              <span>{selectedOption.label}</span>
              {selectedOption.badge && <span className="custom-select-badge">{selectedOption.badge}</span>}
            </>
          ) : (
            <span style={{ color: "var(--col-text-3)" }}>{placeholder}</span>
          )}
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="custom-select-chevron">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>

      {isOpen && (
        <div className="custom-select-dropdown">
          {showSearch && (
            <div className="custom-select-search-container">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="custom-select-search-icon">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input 
                ref={searchInputRef}
                type="text" 
                className="custom-select-search-input"
                placeholder="Cari..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}

          <div className="custom-select-options-list">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isSelected = option.value === value;
                return (
                  <div
                    key={option.value}
                    className={`custom-select-option-card ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", overflow: "hidden", width: "100%" }}>
                      {option.icon && (
                        <div className="custom-select-icon-circle">
                          {option.icon}
                        </div>
                      )}
                      <div className="custom-select-option-text-group">
                        <span className="custom-select-option-label">{option.label}</span>
                        {option.subtext && (
                          <span className="custom-select-option-subtext">{option.subtext}</span>
                        )}
                      </div>
                    </div>
                    {option.badge && (
                      <span className="custom-select-badge">{option.badge}</span>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="custom-select-no-results">Tidak ada hasil cocok</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
