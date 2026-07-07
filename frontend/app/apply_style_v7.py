import re

css_path = r"c:\Users\Lenovo\Documents\sipetani\frontend\app\globals.css"

with open(css_path, "r", encoding="utf-8") as f:
    css = f.read()

print("Initial CSS size:", len(css))

# ==========================================
# 1. LIQUID AURORA MORPHING BLOBS & GRID
# ==========================================
# Let's replace the glow blob definitions with morphing fluid properties and blobMorph animation
glow_definitions_v7 = """
.glow-1 {
  top: -15%;
  left: 10%;
  width: 1000px;
  height: 1000px;
  background: radial-gradient(circle at 30% 30%, rgba(61, 214, 140, 0.16) 0%, rgba(61, 214, 140, 0) 70%);
  animation: blobMorph1 35s ease-in-out infinite alternate;
  mix-blend-mode: screen;
}

.glow-2 {
  top: 10%;
  left: -15%;
  width: 900px;
  height: 900px;
  background: radial-gradient(circle at 30% 30%, rgba(99, 102, 241, 0.14) 0%, rgba(99, 102, 241, 0) 70%);
  animation: blobMorph2 40s ease-in-out infinite alternate;
  mix-blend-mode: screen;
}

.glow-3 {
  top: -10%;
  right: -10%;
  width: 1100px;
  height: 1100px;
  background: radial-gradient(circle at 30% 30%, rgba(6, 182, 212, 0.12) 0%, rgba(6, 182, 212, 0) 70%);
  animation: blobMorph3 45s ease-in-out infinite alternate;
  mix-blend-mode: screen;
}

.glow-4 {
  bottom: -15%;
  right: 5%;
  width: 950px;
  height: 950px;
  background: radial-gradient(circle at 30% 30%, rgba(168, 85, 247, 0.08) 0%, rgba(168, 85, 247, 0) 70%);
  animation: blobMorph4 38s ease-in-out infinite alternate;
  mix-blend-mode: screen;
}
"""

# Let's replace the old glow-1 to glow-4 styles
glow_pattern = r'\.glow-1\s*\{[^}]*\}\s*\.glow-2\s*\{[^}]*\}\s*\.glow-3\s*\{[^}]*\}\s*\.glow-4\s*\{[^}]*\}'
css = re.sub(glow_pattern, glow_definitions_v7.strip(), css, flags=re.DOTALL)

# Add the morphing keyframes to the CSS
morphing_keyframes_v7 = """
/* Liquid Aurora Fluid Morphing Keyframes */
@keyframes blobMorph1 {
  0% {
    border-radius: 42% 58% 70% 30% / 45% 45% 55% 55%;
    transform: translate(0, 0) rotate(0deg) scale(1);
  }
  33% {
    border-radius: 70% 30% 52% 48% / 60% 40% 60% 40%;
    transform: translate(60px, 40px) rotate(120deg) scale(1.08);
  }
  66% {
    border-radius: 40% 60% 30% 70% / 50% 60% 40% 50%;
    transform: translate(-30px, 60px) rotate(240deg) scale(0.92);
  }
  100% {
    border-radius: 42% 58% 70% 30% / 45% 45% 55% 55%;
    transform: translate(0, 0) rotate(360deg) scale(1);
  }
}

@keyframes blobMorph2 {
  0% {
    border-radius: 50% 50% 30% 70% / 50% 60% 40% 50%;
    transform: translate(0, 0) rotate(0deg) scale(1);
  }
  50% {
    border-radius: 30% 70% 70% 30% / 50% 30% 70% 50%;
    transform: translate(-40px, 50px) rotate(-180deg) scale(0.95);
  }
  100% {
    border-radius: 50% 50% 30% 70% / 50% 60% 40% 50%;
    transform: translate(0, 0) rotate(-360deg) scale(1);
  }
}

@keyframes blobMorph3 {
  0% {
    border-radius: 60% 40% 60% 40% / 40% 60% 40% 60%;
    transform: translate(0, 0) scale(1);
  }
  50% {
    border-radius: 40% 60% 40% 60% / 60% 40% 60% 40%;
    transform: translate(50px, -50px) scale(1.1);
  }
  100% {
    border-radius: 60% 40% 60% 40% / 40% 60% 40% 60%;
    transform: translate(0, 0) scale(1);
  }
}

@keyframes blobMorph4 {
  0% {
    border-radius: 40% 60% 50% 50% / 50% 50% 50% 50%;
    transform: translate(0, 0) scale(1);
  }
  50% {
    border-radius: 60% 40% 30% 70% / 50% 60% 40% 50%;
    transform: translate(-30px, -30px) scale(1.05);
  }
  100% {
    border-radius: 40% 60% 50% 50% / 50% 50% 50% 50%;
    transform: translate(0, 0) scale(1);
  }
}
"""
css += "\n" + morphing_keyframes_v7.strip()

# ==========================================
# 2. VERCEL-GRADE BEVELED GLASS PANEL
# ==========================================
# Let's redefine the base .panel, .hcard, .disease-card, .hero-stat classes
# to feature the double-bevel inset border reflections and wide indigo-green specular spotlight!
beveled_panels_v7 = """
/* ═══════════════════════════════════════════════════
   UNIFIED DYNAMIC MOUSE SPOTLIGHT (Vercel & Linear)
   ═══════════════════════════════════════════════════ */
.panel,
.hcard,
.disease-card,
.hero-stat {
  position: relative;
  background: linear-gradient(180deg, rgba(8, 11, 20, 0.76) 0%, rgba(4, 5, 10, 0.86) 100%) padding-box,
              linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.01) 50%, rgba(61, 214, 140, 0.12)) border-box;
  border: 1px solid transparent !important;
  backdrop-filter: blur(36px) saturate(220%);
  -webkit-backdrop-filter: blur(36px) saturate(220%);
  overflow: hidden;
  transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), 
              box-shadow 0.6s cubic-bezier(0.16, 1, 0.3, 1),
              background 0.5s ease;
  box-shadow: 
    inset 0 1px 0 0 rgba(255, 255, 255, 0.07), 
    inset 0 0 0 1px rgba(255, 255, 255, 0.02),
    0 1px 2px 0 rgba(0, 0, 0, 0.8),
    0 16px 40px -10px rgba(0, 0, 0, 0.7);
}

.panel:hover,
.hcard:hover,
.disease-card:hover,
.hero-stat:hover {
  background: radial-gradient(
                380px circle at var(--mouse-x, 0) var(--mouse-y, 0),
                rgba(61, 214, 140, 0.05) 0%,
                rgba(99, 102, 241, 0.02) 50%,
                transparent 100%
              ) padding-box,
              linear-gradient(180deg, rgba(12, 17, 27, 0.8) 0%, rgba(6, 8, 14, 0.9) 100%) padding-box,
              radial-gradient(
                380px circle at var(--mouse-x, 0) var(--mouse-y, 0),
                rgba(61, 214, 140, 0.38) 0%,
                rgba(99, 102, 241, 0.22) 50%,
                transparent 100%
              ) border-box !important;
  box-shadow: 
    inset 0 1px 0 0 rgba(255, 255, 255, 0.12),
    inset 0 0 0 1px rgba(255, 255, 255, 0.04),
    0 24px 60px rgba(0, 0, 0, 0.8),
    0 0 40px rgba(61, 214, 140, 0.05) !important;
  transform: translateY(-4px) scale(1.002);
}
"""

# Replace the previous unified mouse spotlight section at the bottom
spotlight_pattern = r'/\* ═══════════════════════════════════════════════════\s*UNIFIED DYNAMIC MOUSE SPOTLIGHT.*?\*/.*?panel:hover,.*?hero-stat:hover\s*\{[^}]*\}'
css = re.sub(spotlight_pattern, beveled_panels_v7.strip(), css, flags=re.DOTALL)

# ==========================================
# 3. CONVEYOR DASH UPLOAD ZONE
# ==========================================
# We want to replace the .upload-zone and hover states to use our masked pseudoelement conveyor animation!
conveyor_upload_v7 = """
.upload-zone {
  position: relative;
  border: 1.5px dashed rgba(61, 214, 140, 0.12);
  border-radius: var(--r-lg);
  padding: 44px 24px;
  text-align: center;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.18);
  box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.35);
  transition: all 0.3s var(--ease);
  overflow: hidden;
}

.upload-zone::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: var(--r-lg);
  padding: 1.5px;
  background: repeating-linear-gradient(90deg, var(--col-accent) 0%, var(--col-accent) 12px, transparent 12px, transparent 24px);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  opacity: 0.12;
  transition: opacity 0.3s;
}

.upload-zone:hover,
.upload-zone.drag-over {
  background: rgba(61, 214, 140, 0.015);
  box-shadow: 0 10px 30px rgba(0,0,0,0.4), inset 0 0 24px rgba(61, 214, 140, 0.04);
  transform: translateY(-1.5px);
}

.upload-zone:hover::before,
.upload-zone.drag-over::before {
  opacity: 0.85;
  animation: conveyorFlow 0.8s linear infinite;
}

@keyframes conveyorFlow {
  from { background-position: 0 0; }
  to { background-position: 48px 0; }
}
"""

upload_zone_pattern = r'\.upload-zone\s*\{[^}]*\}\s*\.upload-zone:hover,\s*\.upload-zone\.drag-over\s*\{[^}]*\}'
css = re.sub(upload_zone_pattern, conveyor_upload_v7.strip(), css, flags=re.DOTALL)

# ==========================================
# 4. HASSELBLAD TICK SCALES & VIEWPORT HUD
# ==========================================
# We want to style the viewport with high-end linear tick calibrations
viewport_hud_v7 = """
/* Viewport Calibrations - Hasselblad millimetric scale ticks */
.bento-viewport {
  position: relative;
}

.bento-viewport::before {
  content: '';
  position: absolute;
  left: 20px;
  right: 20px;
  top: 14px;
  height: 4px;
  background-image: linear-gradient(90deg, rgba(61, 214, 140, 0.25) 1px, transparent 1px);
  background-size: 8px 100%;
  pointer-events: none;
  z-index: 5;
  opacity: 0.55;
  mask-image: linear-gradient(90deg, black, transparent 30%, transparent 70%, black);
  -webkit-mask-image: linear-gradient(90deg, black, transparent 30%, transparent 70%, black);
}

.bento-viewport::after {
  content: '';
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: 34px;
  height: 4px;
  background-image: linear-gradient(90deg, rgba(61, 214, 140, 0.25) 1px, transparent 1px);
  background-size: 8px 100%;
  pointer-events: none;
  z-index: 5;
  opacity: 0.55;
  mask-image: linear-gradient(90deg, black, transparent 30%, transparent 70%, black);
  -webkit-mask-image: linear-gradient(90deg, black, transparent 30%, transparent 70%, black);
}
"""

css += "\n" + viewport_hud_v7.strip()

# Let's also enhance the scanner sweeping laser line inside bento-viewport
laser_curtain_sweep_v7 = """
/* Dynamic Scan Line effect - Sleek Laser Sweep & Curtain */
.scanner-line-sweep {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: #ffffff;
  box-shadow: 
    0 0 4px #ffffff,
    0 0 12px var(--col-accent),
    0 0 35px rgba(61, 214, 140, 0.85);
  z-index: 5;
  pointer-events: none;
  animation: laserSweepCurtain 3.2s cubic-bezier(0.25, 1, 0.5, 1) infinite;
}

.scanner-line-sweep::after {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  height: 90px;
  background: linear-gradient(to top, rgba(61, 214, 140, 0.22) 0%, rgba(61, 214, 140, 0.05) 50%, transparent 100%);
  pointer-events: none;
}
"""

# Replace the previous laser sweeping section
laser_sweep_pattern = r'/\* Dynamic Scan Line effect - Sleek Laser Sweep.*?\*/.*?laserSweepCurtain\s*\{[^}]*\}'
css = re.sub(laser_sweep_pattern, laser_curtain_sweep_v7.strip(), css, flags=re.DOTALL)

# ==========================================
# 5. DOUBLE-PULSE HEARTBEAT BADGES
# ==========================================
# We want to replace dot pulse keyframes to represent biometric heartbeat doublePulse!
heartbeat_dots_v7 = """
/* Heartbeat Dot Pulse Keyframe */
.det-sev-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.det-sev-dot.none   { background: var(--col-green); animation: heartbeatGreen 2.2s ease-in-out infinite; }
.det-sev-dot.low    { background: #86efac; animation: heartbeatGreen 2.2s ease-in-out infinite; }
.det-sev-dot.medium { background: var(--col-amber); animation: heartbeatAmber 2.2s ease-in-out infinite; }
.det-sev-dot.high   { background: var(--col-red); animation: heartbeatRed 2.2s ease-in-out infinite; }

@keyframes heartbeatGreen {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.8); }
  14% { transform: scale(1.2); box-shadow: 0 0 0 7px rgba(52, 211, 153, 0); }
  28% { transform: scale(1); box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
  42% { transform: scale(1.15); box-shadow: 0 0 0 5px rgba(52, 211, 153, 0); }
  56% { transform: scale(1); box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
}

@keyframes heartbeatAmber {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.8); }
  14% { transform: scale(1.2); box-shadow: 0 0 0 7px rgba(251, 191, 36, 0); }
  28% { transform: scale(1); box-shadow: 0 0 0 0 rgba(251, 191, 36, 0); }
  42% { transform: scale(1.15); box-shadow: 0 0 0 5px rgba(251, 191, 36, 0); }
  56% { transform: scale(1); box-shadow: 0 0 0 0 rgba(251, 191, 36, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(251, 191, 36, 0); }
}

@keyframes heartbeatRed {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.8); }
  14% { transform: scale(1.2); box-shadow: 0 0 0 7px rgba(248, 113, 113, 0); }
  28% { transform: scale(1); box-shadow: 0 0 0 0 rgba(248, 113, 113, 0); }
  42% { transform: scale(1.15); box-shadow: 0 0 0 5px rgba(248, 113, 113, 0); }
  56% { transform: scale(1); box-shadow: 0 0 0 0 rgba(248, 113, 113, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(248, 113, 113, 0); }
}
"""

dot_pulse_pattern = r'\.det-sev-dot\s*\{[^}]*\}[^}]*@keyframes\s*dotPulse\s*\{[^}]*\}'
css = re.sub(dot_pulse_pattern, heartbeat_dots_v7.strip(), css, flags=re.DOTALL)

# Clean up any residual dotPulse keyframes if there are duplicates
css = re.sub(r'@keyframes dotPulse\s*\{[^}]*\}', '', css, flags=re.DOTALL)

with open(css_path, "w", encoding="utf-8") as f:
    f.write(css)

print("Modernization style injected successfully!")
print("Final CSS size:", len(css))
