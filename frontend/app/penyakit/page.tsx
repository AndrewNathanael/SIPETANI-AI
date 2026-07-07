"use client";

import { useState, useEffect, useRef } from "react";
import { Leaf, Search, BookOpen, History, ChevronDown, ChevronUp, Sprout } from "lucide-react";

// ─── Data Penyakit Tanaman (38 kelas PlantVillage) ─────────────────────────
interface DiseaseInfo {
  id: number;
  label: string;
  plant: string;
  disease: string;
  severity: "none" | "low" | "medium" | "high";
  treatment: string;
  description: string;
  symptoms: string;
  emoji: string;
}

const DISEASE_DATABASE: DiseaseInfo[] = [
  // ── PADI ──────────────────────────────────────────────────────────────────
  {
    id: 0, label: "Padi - Bacterial Blight", plant: "Padi", disease: "Hawar Daun Bakteri (Bacterial Blight)",
    severity: "high", emoji: "🌾",
    description: "Penyakit bakteri Xanthomonas oryzae pv. oryzae yang menyerang jaringan pembuluh daun padi, sangat merusak di musim hujan.",
    symptoms: "Daun layu dari ujung ke bawah, warna kuning-oranye, tepi daun tampak seperti dibasahi air lalu mengering.",
    treatment: "Gunakan varietas tahan (IR64, Ciherang). Semprot bakterisida berbasis tembaga. Atur jarak tanam agar sirkulasi udara baik. Buang tanaman terinfeksi parah.",
  },
  {
    id: 1, label: "Padi - Rice Blast", plant: "Padi", disease: "Blas Padi (Rice Blast)",
    severity: "high", emoji: "🌾",
    description: "Penyakit jamur Magnaporthe oryzae — paling merusak pada tanaman padi di seluruh dunia, bisa menyebabkan gagal panen.",
    symptoms: "Bercak berbentuk wajik/belah ketupat abu-abu dengan tepi coklat di daun; malai bisa busuk (blast leher).",
    treatment: "Fungisida berbahan aktif Trisiklazol atau Isoprothiolane saat fase anakan-malai. Keringkan lahan secara berkala. Gunakan benih bersertifikat bebas Blast.",
  },
  {
    id: 2, label: "Padi - Sheath Blight", plant: "Padi", disease: "Busuk Pelepah (Sheath Blight)",
    severity: "high", emoji: "🌾",
    description: "Jamur Rhizoctonia solani menyerang pelepah daun padi, banyak berkembang saat kondisi lembab dan tanam rapat.",
    symptoms: "Lesi oval/bulat lonjong berwarna putih keabu-abuan dengan tepi coklat di pelepah daun, daun bagian atas menguning.",
    treatment: "Kurangi pemupukan nitrogen berlebih. Fungisida validamycin atau hexaconazole. Perbaiki drainase sawah. Rotasi tanaman.",
  },
  // ── SINGKONG ──────────────────────────────────────────────────────────────
  {
    id: 3, label: "Singkong - CBB", plant: "Singkong", disease: "Bacterial Blight (CBB)",
    severity: "high", emoji: "🍠",
    description: "Bakteri Xanthomonas axonopodis pv. manihotis menyerang pembuluh singkong, bisa mematikan tanaman muda.",
    symptoms: "Daun layu mendadak, bercak berair yang mengering, kanker pada batang, eksudat getah kuning.",
    treatment: "Gunakan stek sehat bebas penyakit. Semprot bakterisida tembaga. Cabut dan musnahkan tanaman terinfeksi berat. Kendalikan serangga vektor.",
  },
  {
    id: 4, label: "Singkong - CBSD", plant: "Singkong", disease: "Brown Streak Disease (CBSD)",
    severity: "high", emoji: "🍠",
    description: "Virus CBSV/UCBSV yang ditularkan kutu putih, menyebabkan kerusakan parah pada umbi singkong.",
    symptoms: "Bercak kuning di daun tua, coklat streak di batang, umbi membusuk coklat dari dalam.",
    treatment: "Tidak ada obat kimia efektif. Gunakan varietas toleran (TMS 60444). Kendalikan kutu putih (whitefly) sebagai vektor. Cabut tanaman sakit.",
  },
  {
    id: 5, label: "Singkong - CGM", plant: "Singkong", disease: "Green Mottle (CGM)",
    severity: "low", emoji: "🍠",
    description: "Virus Cassava Green Mottle yang menyebabkan pola belang hijau ringan pada daun singkong.",
    symptoms: "Pola mozaik/belang hijau muda di daun muda, biasanya tidak parah.",
    treatment: "Umumnya ringan, tidak perlu penanganan khusus. Pastikan benih/stek bebas penyakit. Kendalikan tungau merah sebagai vektor.",
  },
  {
    id: 6, label: "Singkong - CMD", plant: "Singkong", disease: "Mosaic Disease (CMD)",
    severity: "high", emoji: "🍠",
    description: "Virus Cassava Mosaic Disease — penyakit singkong paling meluas di Afrika dan Asia, ditularkan kutu kebul.",
    symptoms: "Daun mosaik kuning-hijau tidak merata, daun mengerut dan menggulung, tanaman kerdil.",
    treatment: "Gunakan varietas tahan CMD. Kendalikan kutu kebul (Bemisia tabaci) dengan insektisida imidacloprid. Gunakan stek dari tanaman sehat.",
  },
  {
    id: 7, label: "Singkong - Sehat", plant: "Singkong", disease: "Sehat",
    severity: "none", emoji: "🍠",
    description: "Tanaman singkong dalam kondisi sehat dan prima.",
    symptoms: "Daun hijau segar, batang kokoh, tidak ada bercak atau gejala penyakit.",
    treatment: "Lanjutkan perawatan: pupuk NPK berimbang, penyiangan rutin, dan pastikan drainase baik.",
  },
  // ── APEL ──────────────────────────────────────────────────────────────────
  {
    id: 8, label: "Apel - Apple Scab", plant: "Apel", disease: "Apple Scab",
    severity: "medium", emoji: "🍎",
    description: "Penyakit jamur yang menyebabkan bercak gelap pada daun dan buah apel.",
    symptoms: "Bercak olive-hijau hingga hitam pada daun, buah berbintik dan cacat.",
    treatment: "Semprot fungisida (captan/mancozeb) saat daun muda tumbuh. Pangkas cabang terinfeksi. Buang daun gugur.",
  },
  {
    id: 9, label: "Apel - Sehat", plant: "Apel", disease: "Sehat",
    severity: "none", emoji: "🍎",
    description: "Tanaman apel dalam kondisi sehat tanpa tanda-tanda penyakit.",
    symptoms: "Daun hijau segar, tidak ada bercak atau kelainan.",
    treatment: "Lanjutkan perawatan rutin: pupuk, penyiraman, dan pemangkasan.",
  },
  {
    id: 10, label: "Apel - Cedar Apple Rust", plant: "Apel", disease: "Cedar Apple Rust",
    severity: "medium", emoji: "🍎",
    description: "Penyakit karat yang membutuhkan dua inang: pohon apel dan pohon cedar.",
    symptoms: "Bercak kuning-oranye cerah di permukaan atas daun.",
    treatment: "Fungisida myclobutanil saat daun mulai tumbuh. Hindari menanam apel dekat pohon cedar/juniper.",
  },
  // ── CABAI ─────────────────────────────────────────────────────────────────
  {
    id: 11, label: "Cabai - Bercak Bakteri", plant: "Cabai", disease: "Bercak Bakteri",
    severity: "medium", emoji: "🌶️",
    description: "Bakteri Xanthomonas euvesicatoria yang menyerang daun dan buah cabai.",
    symptoms: "Bercak kecil berair, menguning, kemudian nekrotik di daun.",
    treatment: "Bakterisida tembaga (copper hydroxide). Gunakan benih bersertifikat. Hindari penyiraman dari atas.",
  },
  {
    id: 12, label: "Cabai - Sehat", plant: "Cabai", disease: "Sehat",
    severity: "none", emoji: "🌶️",
    description: "Tanaman cabai dalam kondisi sehat.",
    symptoms: "Daun hijau segar, tidak ada bercak atau keriting.",
    treatment: "Irigasi rutin, pupuk berimbang, dan kontrol gulma.",
  },
  // ── BLUEBERRY ─────────────────────────────────────────────────────────────
  {
    id: 13, label: "Blueberry - Sehat", plant: "Blueberry", disease: "Sehat",
    severity: "none", emoji: "🫐",
    description: "Tanaman blueberry dalam kondisi sehat.",
    symptoms: "Daun hijau mengkilap, tidak ada bercak.",
    treatment: "Jaga pH tanah 4.5-5.5 dengan pupuk asam secara rutin.",
  },
  // ── CERI ──────────────────────────────────────────────────────────────────
  {
    id: 14, label: "Ceri - Sehat", plant: "Ceri", disease: "Sehat",
    severity: "none", emoji: "🍒",
    description: "Tanaman ceri dalam kondisi sehat.",
    symptoms: "Daun hijau tua mengkilap, tidak ada tanda penyakit.",
    treatment: "Pemangkasan setelah panen dan pemupukan rutin.",
  },
  // ── JAGUNG ────────────────────────────────────────────────────────────────
  {
    id: 15, label: "Jagung - Gray Leaf Spot", plant: "Jagung", disease: "Cercospora / Gray Leaf Spot",
    severity: "medium", emoji: "🌽",
    description: "Penyakit jamur Cercospora zeae-maydis yang menyebabkan bercak abu-abu pada daun jagung.",
    symptoms: "Bercak persegi panjang abu-abu/coklat sejajar tulang daun.",
    treatment: "Rotasi tanaman, varietas tahan, fungisida strobilurin jika parah.",
  },
  {
    id: 16, label: "Jagung - Northern Leaf Blight", plant: "Jagung", disease: "Northern Leaf Blight",
    severity: "high", emoji: "🌽",
    description: "Penyakit hawar daun oleh jamur Exserohilum turcicum.",
    symptoms: "Lesio abu-abu-hijau besar berbentuk cerutu, 2.5-15 cm panjangnya.",
    treatment: "Fungisida propiconazole atau tebuconazole. Varietas jagung tahan. Rotasi tanaman.",
  },
  {
    id: 17, label: "Jagung - Karat Daun", plant: "Jagung", disease: "Karat Daun",
    severity: "medium", emoji: "🌽",
    description: "Infeksi jamur Puccinia sorghi yang menghasilkan pustul karat pada daun.",
    symptoms: "Pustul kecil berwarna oranye-coklat tersebar di seluruh permukaan daun.",
    treatment: "Fungisida triazole saat awal infeksi. Tanam varietas tahan karat.",
  },
  // ── PERSIK ────────────────────────────────────────────────────────────────
  {
    id: 18, label: "Persik - Sehat", plant: "Persik", disease: "Sehat",
    severity: "none", emoji: "🍑",
    description: "Tanaman persik dalam kondisi sehat.",
    symptoms: "Daun hijau segar tanpa bercak atau lesi.",
    treatment: "Pemangkasan rutin dan pupuk N-P-K berimbang.",
  },
  // ── KENTANG ───────────────────────────────────────────────────────────────
  {
    id: 19, label: "Kentang - Early Blight", plant: "Kentang", disease: "Early Blight",
    severity: "medium", emoji: "🥔",
    description: "Jamur Alternaria solani yang menyerang daun kentang tua lebih dulu.",
    symptoms: "Bercak coklat dengan pola cincin target (bullseye) pada daun tua.",
    treatment: "Fungisida chlorothalonil/mancozeb. Hindari stres tanaman, rotasi tanaman.",
  },
  {
    id: 20, label: "Kentang - Late Blight", plant: "Kentang", disease: "Late Blight",
    severity: "high", emoji: "🥔",
    description: "Oomycete Phytophthora infestans — penyebab kelaparan kentang Irlandia 1845.",
    symptoms: "Lesi basah coklat-gelap dengan lingkar kuning, spora putih di bawah daun.",
    treatment: "Fungisida metalaxyl + mancozeb SEGERA. Hancurkan dan bakar tanaman terinfeksi berat.",
  },
  {
    id: 21, label: "Kentang - Sehat", plant: "Kentang", disease: "Sehat",
    severity: "none", emoji: "🥔",
    description: "Tanaman kentang dalam kondisi sehat.",
    symptoms: "Daun hijau tua, tidak ada lesi atau perubahan warna.",
    treatment: "Tanam benih bersertifikat, rotasi tanaman setiap musim.",
  },
  // ── RASPBERRY ─────────────────────────────────────────────────────────────
  {
    id: 22, label: "Raspberry - Sehat", plant: "Raspberry", disease: "Sehat",
    severity: "none", emoji: "🫐",
    description: "Tanaman raspberry dalam kondisi sehat.",
    symptoms: "Daun hijau cerah, pertumbuhan normal.",
    treatment: "Pemangkasan cane setelah panen, mulching akar.",
  },
  // ── KEDELAI ───────────────────────────────────────────────────────────────
  {
    id: 23, label: "Kedelai - Sehat", plant: "Kedelai", disease: "Sehat",
    severity: "none", emoji: "🌱",
    description: "Tanaman kedelai dalam kondisi sehat.",
    symptoms: "Daun hijau segar, bintil akar aktif.",
    treatment: "Inokulasi rhizobium, pupuk fosfor dan kalium untuk bintil akar optimal.",
  },
  {
    id: 24, label: "Kedelai - Sehat", plant: "Kedelai", disease: "Sehat",
    severity: "none", emoji: "🌱",
    description: "Tanaman kedelai dalam kondisi sehat.",
    symptoms: "Daun hijau segar, bintil akar aktif.",
    treatment: "Pupuk fosfor dan kalium cukup untuk pertumbuhan optimal.",
  },
  // ── LABU ──────────────────────────────────────────────────────────────────
  {
    id: 25, label: "Labu - Embun Tepung", plant: "Labu", disease: "Embun Tepung",
    severity: "low", emoji: "🎃",
    description: "Jamur Podosphaera xanthii yang membentuk lapisan putih di daun labu.",
    symptoms: "Lapisan putih berbedak di permukaan atas daun, daun menguning dan rontok.",
    treatment: "Fungisida sulfur atau potassium bicarbonate. Pastikan sirkulasi udara baik.",
  },
  // ── STROBERI ──────────────────────────────────────────────────────────────
  {
    id: 26, label: "Stroberi - Sehat", plant: "Stroberi", disease: "Sehat",
    severity: "none", emoji: "🍓",
    description: "Tanaman stroberi dalam kondisi sehat.",
    symptoms: "Daun hijau segar tanpa bercak.",
    treatment: "Renovasi runners, pupuk setelah panen.",
  },
  // ── TOMAT ─────────────────────────────────────────────────────────────────
  {
    id: 27, label: "Tomat - Early Blight", plant: "Tomat", disease: "Early Blight",
    severity: "medium", emoji: "🍅",
    description: "Jamur Alternaria solani menyerang daun tomat tua, meluas ke atas.",
    symptoms: "Bercak coklat pola cincin konsentris (bullseye) dikelilingi jaringan kuning.",
    treatment: "Fungisida chlorothalonil, pangkas daun bawah, rotasi tanaman.",
  },
  {
    id: 28, label: "Tomat - Septoria Leaf Spot", plant: "Tomat", disease: "Septoria Leaf Spot",
    severity: "medium", emoji: "🍅",
    description: "Jamur Septoria lycopersici menghasilkan bercak kecil bulat di daun tomat.",
    symptoms: "Bercak kecil bulat pusat putih dengan tepi coklat tua di daun bawah.",
    treatment: "Fungisida mancozeb/chlorothalonil, pangkas daun bawah, rotasi tanaman.",
  },
  {
    id: 29, label: "Tomat - Bercak Bakteri", plant: "Tomat", disease: "Bercak Bakteri",
    severity: "medium", emoji: "🍅",
    description: "Bakteri Xanthomonas spp. menyerang daun, batang, dan buah tomat.",
    symptoms: "Bercak kecil berair kehitaman di daun, terlihat halo kuning di sekitar bercak.",
    treatment: "Bakterisida tembaga, benih bersertifikat, hindari penyiraman dari atas.",
  },
  {
    id: 30, label: "Tomat - Late Blight", plant: "Tomat", disease: "Late Blight",
    severity: "high", emoji: "🍅",
    description: "Phytophthora infestans — penyakit paling destruktif pada tomat.",
    symptoms: "Lesi air besar berwarna hijau-coklat gelap, busuk pada buah.",
    treatment: "Fungisida metalaxyl SEGERA. Buang seluruh tanaman yang terinfeksi berat.",
  },
  {
    id: 31, label: "Tomat - Mosaic Virus", plant: "Tomat", disease: "Mosaic Virus",
    severity: "high", emoji: "🍅",
    description: "Tobacco Mosaic Virus (TMV) menyebar via kontak dan alat pertanian.",
    symptoms: "Pola mosaik kuning-hijau di daun, daun berkerut dan mengecil.",
    treatment: "Tidak ada obat. Benih tahan virus, desinfeksi alat, cuci tangan sebelum menyentuh tanaman.",
  },
  {
    id: 32, label: "Tomat - Yellow Leaf Curl Virus", plant: "Tomat", disease: "Yellow Leaf Curl Virus",
    severity: "high", emoji: "🍅",
    description: "Virus TYLCV disebarkan oleh kutu kebul (whitefly). Tidak dapat disembuhkan.",
    symptoms: "Daun mengkerut, menguning, dan menggulung ke atas. Tanaman terhambat.",
    treatment: "Kendalikan kutu kebul dengan insektisida imidacloprid. Cabut tanaman terinfeksi.",
  },
  {
    id: 33, label: "Tomat - Sehat", plant: "Tomat", disease: "Sehat",
    severity: "none", emoji: "🍅",
    description: "Tanaman tomat dalam kondisi sehat dan prima.",
    symptoms: "Daun hijau tua, batang kokoh, tidak ada tanda penyakit.",
    treatment: "Pupuk N-P-K berimbang, irigasi konsisten, pangkas tunas air.",
  },
  {
    id: 34, label: "Tomat - Jamur Daun", plant: "Tomat", disease: "Jamur Daun",
    severity: "medium", emoji: "🍅",
    description: "Jamur Passalora fulva (Leaf Mold) berkembang di kondisi lembab.",
    symptoms: "Bercak kuning di permukaan atas daun, spora abu-abu/coklat di bawah daun.",
    treatment: "Kurangi kelembaban, ventilasi greenhouse. Fungisida chlorothalonil.",
  },
  {
    id: 35, label: "Tomat - Tungau Laba-laba", plant: "Tomat", disease: "Tungau Laba-laba",
    severity: "medium", emoji: "🍅",
    description: "Serangan tungau Tetranychus urticae (Spider Mite) di kondisi panas kering.",
    symptoms: "Stippling kuning di daun, jaring halus di bawah daun, daun mengering.",
    treatment: "Mitisida abamectin atau spiromesifen, semprot air bertekanan, neem oil.",
  },
  // ── ANGGUR ────────────────────────────────────────────────────────────────
  {
    id: 36, label: "Anggur - Black Rot", plant: "Anggur", disease: "Black Rot",
    severity: "high", emoji: "🍇",
    description: "Jamur Guignardia bidwellii yang menghancurkan buah dan daun anggur.",
    symptoms: "Bercak coklat di daun, buah mengering menjadi hitam (mumi).",
    treatment: "Fungisida captan/mancozeb, pangkas dan buang bagian terinfeksi.",
  },
  {
    id: 37, label: "Anggur - Sehat", plant: "Anggur", disease: "Sehat",
    severity: "none", emoji: "🍇",
    description: "Tanaman anggur dalam kondisi sehat.",
    symptoms: "Daun hijau cerah, tidak ada gejala penyakit.",
    treatment: "Pemangkasan tahunan dan pemupukan rutin.",
  },
];

const PLANTS = ["Semua", "Padi", "Singkong", "Tomat", "Jagung", "Apel", "Anggur", "Kentang", "Cabai", "Kedelai", "Persik", "Labu", "Ceri", "Stroberi", "Blueberry", "Raspberry"];
const PLANT_ICONS: Record<string, string> = {
  "Semua": "🌱",
  "Padi": "🌾",
  "Singkong": "🍠",
  "Tomat": "🍅",
  "Jagung": "🌽",
  "Apel": "🍎",
  "Anggur": "🍇",
  "Kentang": "🥔",
  "Cabai": "🌶️",
  "Kedelai": "🌱",
  "Persik": "🍑",
  "Labu": "🎃",
  "Ceri": "🍒",
  "Stroberi": "🍓",
  "Blueberry": "🫐",
  "Raspberry": "🫐"
};
const SEVERITIES = ["Semua", "none", "low", "medium", "high"];

const SEVERITY_LABEL: Record<string, string> = {
  none: "Sehat", low: "Rendah", medium: "Sedang", high: "Tinggi"
};
const SEVERITY_COLOR: Record<string, string> = {
  none: "sev-none", low: "sev-low", medium: "sev-medium", high: "sev-high"
};
// ── Komponen Latar Belakang Pendaran Hanyutan Angin Klorofil (Fase 5 - Fitur 2 Shared) ──
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

export default function PenyakitPage() {
  const [search, setSearch] = useState("");
  const [selectedPlant, setSelectedPlant] = useState("Semua");
  const [selectedSeverity, setSelectedSeverity] = useState("Semua");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  // Spotlight Mouse Follower Effect for Dribbble UI
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const elements = document.querySelectorAll(".disease-card");
      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        (el as HTMLElement).style.setProperty("--mouse-x", `${x}px`);
        (el as HTMLElement).style.setProperty("--mouse-y", `${y}px`);
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const filtered = DISEASE_DATABASE.filter((d) => {
    const matchSearch =
      d.label.toLowerCase().includes(search.toLowerCase()) ||
      d.disease.toLowerCase().includes(search.toLowerCase()) ||
      d.plant.toLowerCase().includes(search.toLowerCase());
    const matchPlant = selectedPlant === "Semua" || d.plant === selectedPlant;
    const matchSev = selectedSeverity === "Semua" || d.severity === selectedSeverity;
    return matchSearch && matchPlant && matchSev;
  });

  return (
    <div className="page-wrapper">
      {/* Ambient FX */}
      <BackgroundParticles />
      {/* Dynamic Animated Gradient Blobs */}
      <div className="bg-glow-container">
        <div className="glow-blob glow-1" />
        <div className="glow-blob glow-2" />
        <div className="glow-blob glow-3" />
        <div className="glow-blob glow-4" />
      </div>

      {/* Parallax Floating Glass Spheres */}
      <div className="glass-bubble bubble-1" />
      <div className="glass-bubble bubble-2" />

      {/* Cybernetic Background Floating Tech Nodes */}
      <div className="floating-node node-1" />
      <div className="floating-node node-2" />
      <div className="floating-node node-3" />
      <div className="floating-node node-4" />
      <div className="floating-node node-5" />


      {/* Navbar */}
      <nav className="navbar">
        <a href="/" className="navbar-brand">
          <div className="navbar-icon"><Leaf size={15} /></div>
          <span className="navbar-name">SIPETANI</span>
          <span className="navbar-tag">AI Beta</span>
        </a>
        <button className="nav-hamburger" onClick={() => setNavOpen(o => !o)} aria-label="Menu">
          <span /><span /><span />
        </button>
        <div className={`nav-links ${navOpen ? "open" : ""}`}>
          <a href="/?tab=deteksi" className="nav-link" onClick={() => setNavOpen(false)}>
            <Search size={14} /> Deteksi
          </a>
          <a href="/?tab=riwayat" className="nav-link" onClick={() => setNavOpen(false)}>
            <History size={14} /> Riwayat
          </a>
          <span className="nav-link active">
            <BookOpen size={14} /> Ensiklopedia
          </span>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero" style={{ paddingBottom: 32 }}>
        <div className="hero-chip stagger-in stagger-1">
          <span className="hero-chip-dot" />
          {DISEASE_DATABASE.length} penyakit dalam database
        </div>
        <h1 className="stagger-in stagger-2">Ensiklopedia<br /><span className="hero-accent">Penyakit Tanaman</span></h1>
        <p className="hero-sub stagger-in stagger-3">
          Kenali {DISEASE_DATABASE.length} jenis penyakit &amp; hama yang terdeteksi model AI SIPETANI.
          Lengkap dengan gejala dan rekomendasi penanganan.
        </p>
      </section>

      {/* Filters */}
      <div className="main-container stagger-in stagger-4" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <div className="search-wrap">
          <div className="search-icon-abs"><Search size={14} /></div>
          <input
            id="search-disease"
            type="text"
            placeholder="Cari penyakit atau tanaman..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input"
            aria-label="Cari penyakit"
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--col-text-4)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-mono)", marginBottom: 6 }}>Tanaman</div>
          <div className="crop-card-grid">
            {PLANTS.map(p => (
              <button 
                key={p} 
                className={`crop-card ${selectedPlant === p ? "active" : ""}`}
                onClick={() => setSelectedPlant(p)}
                aria-label={`Filter tanaman ${p}`}
              >
                <div className="crop-card-indicator" />
                <div className="crop-card-icon">{PLANT_ICONS[p] ?? "🌱"}</div>
                <div className="crop-card-name">{p}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--col-text-4)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-mono)", marginBottom: 6 }}>Keparahan</div>
          <div className="filter-bar">
            {SEVERITIES.map(s => (
              <button key={s}
                className={`filter-chip ${selectedSeverity === s ? "active" : ""} ${s !== "Semua" ? `sev-${s}` : ""}`}
                onClick={() => setSelectedSeverity(s)}>
                {s === "Semua" ? "Semua" : SEVERITY_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="count-line">
          Menampilkan <strong>{filtered.length}</strong> dari {DISEASE_DATABASE.length} penyakit
        </div>
      </div>

      {/* Grid */}
      <main className="main-container stagger-in stagger-5" style={{ paddingTop: 0 }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Search size={20} /></div>
            <div className="empty-title">Tidak ditemukan</div>
            <div className="empty-sub">Coba kata kunci atau filter yang berbeda.</div>
          </div>
        ) : (
          <div className="disease-grid">
            {filtered.map(d => (
              <div key={d.id} className={`disease-card ${expandedId === d.id ? "expanded" : ""}`}
                onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}>
                <div className="dc-head">
                  <div className="dc-emoji">{d.emoji}</div>
                  <div className="dc-info">
                    <div className="dc-name">{d.disease}</div>
                    <div className="dc-plant">{d.plant}</div>
                  </div>
                  <div className={`severity-badge ${SEVERITY_COLOR[d.severity]}`}>
                    {SEVERITY_LABEL[d.severity]}
                  </div>
                </div>

                <div className="dc-desc">{d.description}</div>

                {expandedId === d.id && (
                  <div className="dc-detail">
                    <div className="dc-detail-section">
                      <div className="dc-detail-label">Gejala</div>
                      <div className="dc-detail-text">{d.symptoms}</div>
                    </div>
                    <div className="dc-detail-section">
                      <div className="dc-detail-label">Penanganan</div>
                      <div className="dc-detail-text">{d.treatment}</div>
                    </div>
                    <code style={{ fontSize: 10, color: "var(--col-text-4)", fontFamily: "var(--font-mono)" }}>class_id: {d.id}</code>
                  </div>
                )}

                <div className="dc-hint">
                  {expandedId === d.id
                    ? <><ChevronUp size={10} style={{ display: "inline", verticalAlign: "middle" }} /> Tutup</>
                    : <><ChevronDown size={10} style={{ display: "inline", verticalAlign: "middle" }} /> Detail</>
                  }
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="footer">
        <strong style={{ color: "var(--col-text-2)" }}>SIPETANI</strong> — Ensiklopedia Penyakit Tanaman &nbsp;·&nbsp;
        PlantVillage Dataset · {DISEASE_DATABASE.length} kelas
      </footer>
    </div>
  );
}
