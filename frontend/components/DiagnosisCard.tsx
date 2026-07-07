"use client";

import { useEffect, useState } from "react";
import { Bug, Pill, MapPin, Leaf, Sprout, FlaskConical, ShieldCheck, TriangleAlert } from "lucide-react";

interface Detection {
  class_id: number;
  label: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  severity: string;
  treatment: string;
}

const SEV_LABEL: Record<string, string> = {
  none: "Sehat",
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
};

// ── Helper Pemisah Rekomendasi Pengobatan Dinamis ──
function getStructuredTreatments(label: string, genericTreatment: string, severity: string, classId: number) {
  let pencegahan = "Gunakan benih unggul bersertifikat yang bebas dari virus/patogen. Terapkan sanitasi lahan dengan membersihkan gulma dan sisa tanaman sakit dari musim sebelumnya. Hindari penyiraman langsung ke daun di sore hari.";
  let organik = "Semprotkan Bio-pestisida atau ekstrak daun nimba/neem oil konsentrasi 1-2%. Aplikasikan agen hayati seperti Trichoderma harzianum pada tanah untuk menekan jamur patogen.";
  let kimiawi = "Apabila kerusakan melebihi ambang batas ekonomi (>10%), semprotkan fungisida/bakterisida sistemik berbahan aktif Tembaga Hidroksida atau Mancozeb sesuai dosis anjuran.";

  const isHealthy = severity === "none" || label.toLowerCase().includes("sehat");

  if (isHealthy) {
    return {
      pencegahan: "Lakukan pengawasan rutin mingguan. Jaga sistem drainase lahan agar air tidak menggenang di sekitar perakaran.",
      organik: "Berikan pupuk kandang matang atau kompos organik untuk menyuburkan tanah dan memperkuat imun alami tanaman.",
      kimiawi: "Tanaman sehat! Tidak direkomendasikan penggunaan pestisida kimiawi untuk mencegah polusi tanah dan lingkungan."
    };
  }

  if (label.includes("Blast") || label.includes("Blight") || label.includes("Hawar") || label.includes("Busuk")) {
    pencegahan = "Pangkas segera bagian tanaman yang sakit dan bakar agar spora tidak menyebar angin. Kurangi pemupukan Nitrogen berlebih yang memicu kerentanan jaringan daun. Atur jarak tanam agar sirkulasi udara lancar.";
    organik = "Semprotkan larutan baking soda (potassium bicarbonate) atau minyak neem organik sebagai fungisida alami. Aplikasikan mikroba antagonis Pseudomonas fluorescens pada perakaran tanaman.";
    kimiawi = "Gunakan fungisida berbahan aktif Difenokonazol, Trisiklazol, atau Azoksistrobin. Untuk bakteri (seperti Hawar Daun Bakteri), gunakan bakterisida berbasis Tembaga Hidroksida atau Streptomisin Sulfat.";
  } else if (label.includes("Kutu") || label.includes("Tungau") || label.includes("Mosaic") || label.includes("Virus")) {
    pencegahan = "Tanam pembatas tanaman (refugia) seperti bunga marigold untuk menarik predator alami hama. Pasang perangkap lengket berwarna kuning (yellow sticky trap) di sekitar lahan. Cabut tanaman yang menunjukkan gejala mosaik berat.";
    organik = "Semprotkan larutan sabun kalium (potassium soap) atau ekstrak bawang putih dicampur minyak mineral untuk melapisi daun dan melarutkan lilin pelindung hama penghisap.";
    kimiawi = "Gunakan insektisida sistemik berbahan aktif Imidakloprid, Abamektin, atau Asetamiprid untuk mengendalikan serangga vektor pembawa virus (seperti kutu kebul atau tungau merah).";
  } else if (label.includes("Bercak") || label.includes("Rust") || label.includes("Karat") || label.includes("Spot")) {
    pencegahan = "Jaga kebersihan alat pangkas dengan menyemprot alkohol 70% setelah dipakai. Lakukan pergiliran (rotasi) tanaman dengan keluarga tanaman non-inang selama minimal 1 musim tanam.";
    organik = "Aplikasikan teh kompos aerasi (compost tea) atau semprotan sulfur alami untuk membatasi perkecambahan spora jamur di permukaan daun.";
    kimiawi = "Semprotkan fungisida protektif berbahan aktif Klorotalonil, Mancozeb, atau Tembaga Oksiklorida setiap 7-10 hari sekali pada musim hujan.";
  }

  if (genericTreatment && genericTreatment.length > 20) {
    if (genericTreatment.toLowerCase().includes("fungisida") || genericTreatment.toLowerCase().includes("bakterisida") || genericTreatment.toLowerCase().includes("insektisida")) {
      kimiawi = genericTreatment;
    } else {
      pencegahan = genericTreatment;
    }
  }

  return { pencegahan, organik, kimiawi };
}

// ── Komponen Semi-Circular SVG Gauge untuk Visualisasi Confidence (Mini / Compact) ──
function RadialGauge({ value, severity }: { value: number; severity: string }) {
  const [percent, setPercent] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setPercent(Math.round(value * 100)), 150);
    return () => clearTimeout(t);
  }, [value]);

  const radius = 45;
  const stroke = 5;
  const normalizedRadius = radius - stroke;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="gauge-compact-box">
      <svg height={radius * 2} width={radius * 2} className="gauge-compact-svg">
        <circle
          className="gauge-compact-track"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          className={`gauge-compact-fill ${severity}`}
          strokeDasharray={circumference + " " + circumference}
          style={{ strokeDashoffset }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      <div className="gauge-compact-text">
        <span className="gauge-compact-num">{percent}%</span>
        <span className="gauge-compact-lbl">CONF</span>
      </div>
    </div>
  );
}

// ── Sub-Komponen Card Tunggal Deteksi ──
function SingleDiagnosisCard({ det, index, onSelectDisease }: { det: Detection; index: number; onSelectDisease?: (label: string) => void }) {
  const [activeTab, setActiveTab] = useState<"pencegahan" | "organik" | "kimiawi">("pencegahan");
  
  const treatments = getStructuredTreatments(det.label, det.treatment, det.severity, det.class_id);

  return (
    <div className="det-card stagger-card" style={{ 
      display: "flex", 
      flexDirection: "column", 
      gap: 10, 
      padding: 12,
      animationDelay: `${index * 120}ms`
    }}>
      {/* Header */}
      <div className="det-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div 
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: onSelectDisease ? "pointer" : "default" }}
          onClick={() => onSelectDisease?.(det.label)}
          title="Klik untuk detail Ensiklopedia"
          className="det-header-clickable"
        >
          <div className={`det-sev-dot ${det.severity}`} />
          <div className="det-name" style={{ fontSize: 14.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
            {det.label}
            <span style={{ fontSize: 8.5, color: "var(--col-accent)", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.18)", padding: "1px 4px", borderRadius: 4, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}>INFO</span>
          </div>
        </div>
        <div className={`sev-chip ${det.severity}`} style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 8px" }}>
          {SEV_LABEL[det.severity] ?? det.severity}
        </div>
      </div>

      {/* Side-by-Side: Gauge on left, Metadata on right */}
      <div className="gauge-compact-row">
        <RadialGauge value={det.confidence} severity={det.severity} />
        
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
            <Bug size={11} style={{ color: "var(--col-text-3)", flexShrink: 0 }} />
            <span style={{ color: "var(--col-text-3)" }}>Imun Tanaman</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", color: "var(--col-red)", fontSize: 9.5 }}>TERINFEKSI</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, borderTop: "1px solid rgba(255,255,255,0.03)", paddingTop: 5 }}>
            <MapPin size={10} style={{ color: "var(--col-text-4)", flexShrink: 0 }} />
            <span style={{ color: "var(--col-text-4)" }}>ROIs Bounding Box</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", color: "var(--col-text-3)", fontSize: 9 }}>
              x:{det.bbox.x.toFixed(2)} y:{det.bbox.y.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Treatment Switcher Tabs */}
      <div style={{ marginTop: 2 }}>
        <div className="treatment-tabs" style={{ marginBottom: 8 }}>
          <button
            className={`treatment-tab-btn ${activeTab === "pencegahan" ? "active pencegahan" : ""}`}
            onClick={() => setActiveTab("pencegahan")}>
            <ShieldCheck size={12} /> Cegah
          </button>
          <button
            className={`treatment-tab-btn ${activeTab === "organik" ? "active organik" : ""}`}
            onClick={() => setActiveTab("organik")}>
            <Sprout size={12} /> Organik
          </button>
          <button
            className={`treatment-tab-btn ${activeTab === "kimiawi" ? "active kimiawi" : ""}`}
            onClick={() => setActiveTab("kimiawi")}>
            <FlaskConical size={12} /> Kimia
          </button>
        </div>

        {/* Content Box */}
        <div className={`treatment-content-box ${activeTab}`} style={{ padding: "10px 12px", minHeight: "75px" }}>
          {activeTab === "pencegahan" && (
            <p style={{ fontSize: 12 }}>{treatments.pencegahan}</p>
          )}
          {activeTab === "organik" && (
            <p style={{ fontSize: 12 }}>{treatments.organik}</p>
          )}
          {activeTab === "kimiawi" && (
            <p style={{ fontSize: 12 }}>{treatments.kimiawi}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DiagnosisCard({ 
  detections, 
  message, 
  validationWarning,
  onSelectDisease
}: { 
  detections: Detection[]; 
  message: string; 
  validationWarning?: string; 
  onSelectDisease?: (label: string) => void;
}) {
  // Jika gambar terdeteksi BUKAN daun (ada validationWarning) dan tidak ada deteksi penyakit
  if (validationWarning && detections.length === 0) {
    // Deteksi apakah pesan terkait logo/grafis
    const isLogoWarning = validationWarning.toLowerCase().includes("logo") ||
      validationWarning.toLowerCase().includes("grafis") ||
      validationWarning.toLowerCase().includes("ikon") ||
      validationWarning.toLowerCase().includes("latar putih");

    const warningTitle = isLogoWarning
      ? "Logo / Gambar Grafis Terdeteksi"
      : "Gambar Tidak Dikenali Sebagai Daun";

    const warningTips = isLogoWarning
      ? "Tips: Sistem hanya dapat menganalisis foto daun tanaman yang diambil langsung dari kamera. Hindari mengunggah logo, ilustrasi, atau gambar digital."
      : "Tips: Dekatkan kamera, pastikan pencahayaan cukup, dan fokuskan hanya pada satu helai daun tanaman.";

    return (
      <div className="warning-state" style={{ 
        padding: "20px 16px", 
        textAlign: "center",
        borderRadius: "12px",
        border: "1px dashed rgba(245, 158, 11, 0.3)",
        background: "rgba(245, 158, 11, 0.04)",
        boxShadow: "0 4px 20px -2px rgba(0, 0, 0, 0.3)",
        animation: "fadeInText 0.3s ease-out"
      }}>
        <div className="warning-icon-wrap" style={{ 
          width: 42, 
          height: 42, 
          borderRadius: "50%", 
          background: "rgba(245, 158, 11, 0.12)", 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center", 
          margin: "0 auto 12px",
          boxShadow: "0 0 12px rgba(245, 158, 11, 0.2)"
        }}>
          <TriangleAlert size={20} style={{ color: "rgb(245, 158, 11)" }} />
        </div>
        <div className="warning-title" style={{ 
          fontSize: 15.5, 
          fontWeight: 700, 
          color: "rgb(245, 158, 11)", 
          marginBottom: 6,
          letterSpacing: "-0.01em"
        }}>
          {warningTitle}
        </div>
        <div className="warning-sub" style={{ 
          fontSize: 12, 
          color: "var(--col-text-3)", 
          lineHeight: "1.5",
          marginBottom: 12
        }}>
          {validationWarning}
        </div>
        <div style={{ 
          fontSize: 10.5, 
          color: "rgba(255, 255, 255, 0.4)", 
          borderTop: "1px solid rgba(255, 255, 255, 0.05)",
          paddingTop: 10,
          fontStyle: "italic"
        }}>
          {warningTips}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {validationWarning && (
        <div style={{ 
          padding: "10px 12px", 
          borderRadius: "8px",
          border: "1px solid rgba(245, 158, 11, 0.2)",
          background: "rgba(245, 158, 11, 0.06)",
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 4
        }}>
          <TriangleAlert size={14} style={{ color: "rgb(245, 158, 11)", flexShrink: 0, marginTop: 1.5 }} />
          <div style={{ fontSize: 11, color: "var(--col-text-2)", lineHeight: "1.4" }}>
            <strong style={{ color: "rgb(245, 158, 11)" }}>Peringatan Kualitas:</strong> {validationWarning} Hasil diagnosis di bawah mungkin kurang akurat.
          </div>
        </div>
      )}

      {detections.length === 0 ? (
        <div className="healthy-state" style={{ padding: "20px 14px", textAlign: "center" }}>
          <div className="healthy-icon-wrap" style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(74,222,128,0.1)", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
            <Leaf size={18} style={{ color: "var(--col-accent)" }} />
          </div>
          <div className="healthy-title" style={{ fontSize: 15, fontWeight: 700, color: "var(--col-text-1)", marginBottom: 4 }}>Tanaman Sehat!</div>
          <div className="healthy-sub" style={{ fontSize: 12, color: "var(--col-text-3)" }}>{message}</div>
        </div>
      ) : (
        detections.map((det, i) => (
          <SingleDiagnosisCard key={i} det={det} index={i} onSelectDisease={onSelectDisease} />
        ))
      )}
    </div>
  );
}
