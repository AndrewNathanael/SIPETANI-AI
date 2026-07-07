import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Bersihkan URL dari rest/v1/ atau slash di bagian akhir untuk menghindari eror koneksi Storage/DB
let supabaseUrl = rawSupabaseUrl ? rawSupabaseUrl.trim() : "";
if (supabaseUrl.endsWith("/rest/v1/")) {
  supabaseUrl = supabaseUrl.replace("/rest/v1/", "");
} else if (supabaseUrl.endsWith("/rest/v1")) {
  supabaseUrl = supabaseUrl.replace("/rest/v1", "");
}
if (supabaseUrl.endsWith("/")) {
  supabaseUrl = supabaseUrl.slice(0, -1);
}

// Cek apakah Supabase sudah dikonfigurasi dengan benar (bukan nilai default template)
export const isSupabaseConfigured = !!(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== "https://your-supabase-project-id.supabase.co" &&
  !supabaseUrl.includes("your-supabase-project-id")
);

// Inisialisasi klien Supabase (dengan penanganan fallback jika tidak dikonfigurasi)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey!)
  : null;

if (!isSupabaseConfigured) {
  console.warn(
    "⚠️ Supabase belum dikonfigurasi secara lengkap di berkas .env.local.\n" +
    "Aplikasi akan secara otomatis menggunakan cadangan LocalStorage."
  );
}
