const fs = require('fs');
const path = require('path');
const cssPath = path.join(__dirname, 'app', 'globals.css');
let css = fs.readFileSync(cssPath, 'utf8');

// Remove any previously injected wow lines to avoid duplicates
css = css.replace(/\/\* ── WOW INJECT[\s\S]*$/, '');

const wowCSS = `
/* ── WOW INJECT ── */

/* Animated floating orbs */
@keyframes floatOrb1{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(-40px,50px) scale(1.06)}66%{transform:translate(25px,-35px) scale(.97)}}
@keyframes floatOrb2{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(30px,-45px) scale(1.05)}66%{transform:translate(-20px,30px) scale(.96)}}
@keyframes floatOrb3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-25px,-40px) scale(1.03)}}

/* Shimmer sweep */
@keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}

/* Pulse ring for upload */
@keyframes scanPulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.5),0 0 0 0 rgba(34,197,94,.25)}60%{box-shadow:0 0 0 14px rgba(34,197,94,0),0 0 0 8px rgba(34,197,94,.08)}}

/* Border glow cycle */
@keyframes borderGlow{0%,100%{border-color:rgba(34,197,94,.13);box-shadow:0 4px 32px rgba(0,0,0,.35),inset 0 1px 0 rgba(134,239,172,.06)}50%{border-color:rgba(34,197,94,.28);box-shadow:0 4px 32px rgba(0,0,0,.35),0 0 30px rgba(34,197,94,.06),inset 0 1px 0 rgba(134,239,172,.06)}}

/* Float up */
@keyframes floatUp{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}

/* Glow pulse text */
@keyframes glowPulse{0%,100%{filter:drop-shadow(0 0 12px rgba(74,222,128,.2))}50%{filter:drop-shadow(0 0 28px rgba(74,222,128,.5))}}

/* ── Page orbs animated ── */
.page-wrapper::before{
  width:65vw;height:65vw;
  background:radial-gradient(circle,rgba(34,197,94,.13) 0%,rgba(34,197,94,.04) 40%,transparent 70%);
  animation:floatOrb1 20s ease-in-out infinite;
}
.page-wrapper::after{
  width:55vw;height:55vw;
  background:radial-gradient(circle,rgba(22,163,74,.1) 0%,rgba(22,163,74,.03) 40%,transparent 70%);
  animation:floatOrb2 26s ease-in-out infinite;
}

/* Third orb via body pseudo */
body::before{
  content:'';position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
  width:40vw;height:40vw;border-radius:50%;
  background:radial-gradient(circle,rgba(74,222,128,.04) 0%,transparent 65%);
  pointer-events:none;z-index:0;
  animation:floatOrb3 30s ease-in-out infinite;
}

/* ── Navbar logo glow ── */
.navbar-logo{
  box-shadow:0 0 0 1px rgba(34,197,94,.4),0 0 25px rgba(34,197,94,.6),0 0 60px rgba(34,197,94,.2);
  animation:floatUp 3s ease-in-out infinite;
}

/* ── Hero upgrades ── */
.hero-eyebrow{
  background:rgba(34,197,94,.12);
  box-shadow:0 0 25px rgba(34,197,94,.18),inset 0 1px 0 rgba(255,255,255,.08);
  border-color:rgba(34,197,94,.35);
}
.hero h1 span{
  animation:glowPulse 3s ease-in-out infinite;
}
.hero-stat-number{
  font-size:2.4rem;
  filter:drop-shadow(0 0 20px rgba(34,197,94,.4));
}
.hero-stat{
  padding:1rem 1.5rem;
  background:rgba(34,197,94,.04);
  border:1px solid rgba(34,197,94,.1);
  border-radius:16px;
  backdrop-filter:blur(8px);
  transition:all .3s var(--ease);
}
.hero-stat:hover{
  background:rgba(34,197,94,.09);
  border-color:rgba(34,197,94,.25);
  transform:translateY(-4px);
  box-shadow:0 8px 32px rgba(34,197,94,.12);
}

/* ── Card glow cycle ── */
.card{animation:borderGlow 5s ease-in-out infinite}
.card:hover{animation:none;border-color:rgba(34,197,94,.4);box-shadow:0 16px 60px rgba(0,0,0,.5),0 0 40px rgba(34,197,94,.1),inset 0 1px 0 rgba(134,239,172,.12)}

/* ── Shimmer CTA button ── */
.btn-analyze{
  background:linear-gradient(135deg,#15803d 0%,#22c55e 40%,#4ade80 60%,#16a34a 80%,#15803d 100%);
  background-size:300% auto;
  animation:shimmer 3s linear infinite;
  box-shadow:0 4px 24px rgba(34,197,94,.4),0 0 60px rgba(34,197,94,.1),inset 0 1px 0 rgba(255,255,255,.2);
  font-weight:800;
  letter-spacing:.04em;
}
.btn-analyze:hover:not(:disabled){
  animation:shimmer 1s linear infinite;
  transform:translateY(-3px) scale(1.01);
  box-shadow:0 12px 48px rgba(34,197,94,.6),0 0 80px rgba(34,197,94,.2),inset 0 1px 0 rgba(255,255,255,.3);
}

/* ── Upload zone pulse ── */
.upload-zone:hover,.upload-zone.drag-over{
  animation:scanPulse 1.8s ease-in-out infinite;
  border-color:rgba(34,197,94,.6);
}
.upload-icon{
  animation:floatUp 2.5s ease-in-out infinite;
  box-shadow:0 0 40px rgba(34,197,94,.25),0 0 80px rgba(34,197,94,.1);
}

/* ── History card hover lift ── */
.history-card:hover{
  transform:translateY(-4px) scale(1.01);
  border-color:rgba(34,197,94,.3);
  box-shadow:0 12px 40px rgba(0,0,0,.4),0 0 20px rgba(34,197,94,.08);
}
.history-card{transition:all .3s var(--ease)}

/* ── Disease card enhanced ── */
.disease-card:hover{
  transform:translateY(-4px);
  border-color:rgba(34,197,94,.4);
  box-shadow:0 16px 48px rgba(0,0,0,.4),0 0 30px rgba(34,197,94,.1);
}

/* ── Navbar brand hover ── */
.navbar-brand:hover .navbar-logo{
  box-shadow:0 0 0 1px rgba(34,197,94,.6),0 0 40px rgba(34,197,94,.8),0 0 80px rgba(34,197,94,.3);
}

/* ── Idle placeholder pulse ── */
.idle-placeholder-icon{animation:floatUp 3s ease-in-out infinite;opacity:.5}

/* ── Diagnosis card slide ── */
.diagnosis-card{
  box-shadow:0 4px 20px rgba(0,0,0,.3),inset 0 1px 0 rgba(134,239,172,.05);
  transition:box-shadow .3s;
}
.diagnosis-card:hover{box-shadow:0 8px 32px rgba(0,0,0,.4),0 0 20px rgba(34,197,94,.06)}

/* ── Stage indicator pulse ── */
.stage-indicator{animation:borderGlow 2s ease-in-out infinite}

/* ── Search input glow ── */
.search-input:focus{
  border-color:rgba(34,197,94,.5);
  box-shadow:0 0 0 4px rgba(34,197,94,.1),0 0 20px rgba(34,197,94,.08);
}

/* ── Footer upgrade ── */
.footer{
  background:rgba(0,0,0,.5);
  border-top:1px solid rgba(34,197,94,.12);
  box-shadow:0 -1px 0 rgba(34,197,94,.06);
}

/* ── Scrollbar ── */
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:rgba(0,0,0,.2)}
::-webkit-scrollbar-thumb{background:rgba(34,197,94,.3);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:rgba(34,197,94,.5)}
`;

fs.writeFileSync(cssPath, css + wowCSS);
console.log('WOW injected! Total size:', fs.readFileSync(cssPath,'utf8').length, 'bytes');
