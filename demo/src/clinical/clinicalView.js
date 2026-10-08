import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { computeHandMetrics, computeAsymmetry, resetMetrics } from './metrics.js';

// MediaPipe local (misma copia verificada por hash que usa el Runner), nunca desde CDN ni modelo «latest».
const PINCH_ASSETS_BASE = import.meta.env?.BASE_URL ?? '/';

const HAND_PALM   = [[0,1],[0,5],[0,17],[5,9],[9,13],[13,17]];
const HAND_THUMB  = [[1,2],[2,3],[3,4]];
const HAND_INDEX  = [[5,6],[6,7],[7,8]];
const HAND_MIDDLE = [[9,10],[10,11],[11,12]];
const HAND_RING   = [[13,14],[14,15],[15,16]];
const HAND_PINKY  = [[17,18],[18,19],[19,20]];
const ALL_HAND_LINKS = [...HAND_PALM,...HAND_THUMB,...HAND_INDEX,...HAND_MIDDLE,...HAND_RING,...HAND_PINKY];

const VIDEO_W = 960;
const VIDEO_H = 540;

const C = {
  ok: '#10B981', warn: '#F59E0B', bad: '#EF4444', accent: '#00D4FF',
};

function statusColor(s) { return s === 'ok' ? C.ok : s === 'warn' ? C.warn : s === 'bad' ? C.bad : C.accent; }
function statusLabel(s) { return s === 'ok' ? 'OPT' : s === 'warn' ? 'MOD' : s === 'bad' ? 'CRI' : 'ACT'; }


function thresh(val, good, mid) { return val > good ? 'ok' : val > mid ? 'warn' : 'bad'; }

function setCard(id, code, name, status, value, unit) {
  const el = document.getElementById(id);
  if (!el) return;
  const col = statusColor(status);
  el.style.borderLeft = `3px solid ${col}`;
  el.innerHTML = `
    <div class="cv-card-header">
      <span class="cv-code">${code}</span><span class="cv-name">${name}</span>
      <span class="cv-status" style="color:${col};border-color:${col}">${statusLabel(status)}</span>
    </div>
    <div class="cv-card-value"><span class="cv-val">${value}</span><span class="cv-unit">${unit}</span></div>`;
}

function renderDashboard(mL, mR, asym) {
  const m = (mL && mR) ? (mL.palmSpeed >= mR.palmSpeed ? mL : mR) : (mL || mR);
  if (!m) return;

  // CRI: weighted composite (SPARC normalized to 0-100 where 0=worst -5, 100=best 0)
  const sparcNorm = Math.max(0, Math.min(100, (m.sparc + 5) * 20));
  const cri = Math.round(
    m.handOpenPct * 0.20 + (m.fingers / 5) * 100 * 0.15 + (m.romDeg / 180) * 100 * 0.15 +
    sparcNorm * 0.20 + m.tripodQuality * 0.15 +
    (m.indexExtension / 180) * 100 * 0.15
  );
  const criColor = cri < 35 ? C.bad : cri < 70 ? C.warn : C.ok;
  const criLabel = cri < 35 ? 'CRITICAL' : cri < 70 ? 'MODERATE' : 'OPTIMAL';

  const criVal = document.getElementById('cv-cri-value');
  const criLbl = document.getElementById('cv-cri-label');
  if (criVal) { criVal.textContent = cri; criVal.style.color = criColor; }
  if (criLbl) { criLbl.textContent = criLabel; criLbl.style.color = criColor; criLbl.style.borderColor = criColor; }

  // Right column (r1-r10)
  setCard('cv-r1', 'M1', 'PINCH', m.pinchActive ? 'ok' : 'idle', m.pinchActive ? 'YES' : 'NO', `${m.pinchMm} mm`);
  setCard('cv-r2', 'M15', 'TRIPOD', thresh(m.tripodQuality, 70, 40), Math.round(m.tripodQuality), '%');
  setCard('cv-r3', 'THB', 'THUMB OPP.', thresh(m.thumbOpposition, 60, 30), Math.round(m.thumbOpposition), '%');
  setCard('cv-r4', 'M2', 'HAND OPEN', thresh(m.handOpenPct, 70, 35), Math.round(m.handOpenPct), '%');
  setCard('cv-r5', 'FNG', 'FINGERS', 'idle', m.fingers, '/ 5');
  setCard('cv-r6', 'IDX', 'INDEX EXT.', thresh(m.indexExtension, 140, 90), Math.round(m.indexExtension), '°');
  setCard('cv-r7', 'M9', 'INDIVID.', thresh(m.fingerIndividuation, 50, 20), m.fingerIndividuation, '%');
  setCard('cv-r8', 'SPD', 'PALM SPEED', thresh(m.palmSpeed, 50, 10), Math.round(m.palmSpeed), 'mm/s');
  setCard('cv-r9', 'M11', 'SPARC', thresh(m.sparc, -1.5, -3), m.sparc.toFixed(2), 'SAL');
  setCard('cv-r10', 'M2s', 'OPEN SPEED', thresh(m.handOpeningSpeed, 80, 30), Math.round(m.handOpeningSpeed), 'mm/s');

  // Bottom row (b1-b3)
  setCard('cv-b1', 'M4', 'HAND ROM', thresh(m.romDeg, 120, 70), Math.round(m.romDeg), '°');
  setCard('cv-b2', 'QTY', 'SIGNAL', m.qualityOk ? 'ok' : 'bad', m.qualityOk ? 'OK' : 'LOW', '');

  if (mL && mR && asym) {
    setCard('cv-b3', 'ASY', 'ASYMMETRY', thresh(100 - asym.asymmetryIndex, 70, 40), asym.asymmetryIndex, '%');
  } else {
    // C4: Show tremor with frequency band flag
    const combinedTremor = Math.max(m.tremorAmp, m.intentionTremor);
    const tremorStatus = combinedTremor < 0.3 ? 'ok' : combinedTremor < 0.6 ? 'warn' : 'bad';
    const freqLabel = m.tremorFreqHz > 0 ? ` ${m.tremorFreqHz}Hz` : '';
    const bandTag = m.tremorBand === 'pathological' ? ' ⚠' : '';
    setCard('cv-b3', 'TRM', 'TREMOR', tremorStatus, (combinedTremor * 100).toFixed(0) + bandTag, '%' + freqLabel);
  }
}

function drawHandSkeleton(ctx, landmarks, color1, color2) {
  if (!landmarks || landmarks.length < 21) return;

  ALL_HAND_LINKS.forEach(([a, b]) => {
    const p1 = landmarks[a], p2 = landmarks[b];
    const x1 = p1.x * VIDEO_W, y1 = p1.y * VIDEO_H;
    const x2 = p2.x * VIDEO_W, y2 = p2.y * VIDEO_H;
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, color1);
    grad.addColorStop(1, color2);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = grad;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  ctx.shadowBlur = 8;
  ctx.shadowColor = color1;
  landmarks.forEach((lm) => {
    ctx.beginPath();
    ctx.arc(lm.x * VIDEO_W, lm.y * VIDEO_H, 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  });
  ctx.shadowBlur = 0;
}

export function openClinicalView(container, onBack) {
  resetMetrics();

  let destroyed = false;
  let animId = null;
  let handLandmarker = null;
  let lastTimestamp = -1;

  container.innerHTML = `
    <div id="clinical-view">
      <div class="cv-header">
        <span>FIXEDGAP · CLINICAL REPORT · REAL-TIME</span>
        <span>PAC-0001 · v1.0</span>
      </div>
      <div class="cv-cam-panel">
        <div class="cv-cam-header">
          <span>CAM-01 · DIRECT OBSERVATION</span>
          <span class="cv-rec">● REC</span>
        </div>
        <div class="cv-cam-viewport">
          <video id="cv-video" autoplay playsinline muted></video>
          <canvas id="cv-canvas"></canvas>
          <div class="cv-cam-telemetry" id="cv-telemetry">● LOADING MODEL...</div>
        </div>
      </div>
      <div class="cv-cri-hero">
        <div><div class="cv-cri-title">CLINICAL RECOVERY INDEX</div>
        <div class="cv-cri-row">
          <span id="cv-cri-value" class="cv-cri-num">0</span>
          <span class="cv-cri-max">/ 100</span>
          <span id="cv-cri-label" class="cv-cri-badge">—</span>
        </div></div>
      </div>
      <div id="cv-r1" class="cv-card" style="grid-area:r1"></div>
      <div id="cv-r2" class="cv-card" style="grid-area:r2"></div>
      <div id="cv-r3" class="cv-card" style="grid-area:r3"></div>
      <div id="cv-r4" class="cv-card" style="grid-area:r4"></div>
      <div id="cv-r5" class="cv-card" style="grid-area:r5"></div>
      <div id="cv-r6" class="cv-card" style="grid-area:r6"></div>
      <div id="cv-r7" class="cv-card" style="grid-area:r7"></div>
      <div id="cv-r8" class="cv-card" style="grid-area:r8"></div>
      <div id="cv-r9" class="cv-card" style="grid-area:r9"></div>
      <div id="cv-r10" class="cv-card" style="grid-area:r10"></div>
      <div id="cv-b1" class="cv-card" style="grid-area:b1"></div>
      <div id="cv-b2" class="cv-card" style="grid-area:b2"></div>
      <div id="cv-b3" class="cv-card" style="grid-area:b3"></div>
      <button id="cv-back-btn">◀ BACK TO GAME</button>
    </div>
  `;

  document.getElementById('cv-back-btn').addEventListener('click', () => {
    cleanup();
    onBack();
  });

  const video = document.getElementById('cv-video');
  const canvas = document.getElementById('cv-canvas');
  canvas.width = VIDEO_W;
  canvas.height = VIDEO_H;
  const ctx = canvas.getContext('2d');

  let frameCount = 0;
  let lastFpsTime = performance.now();

  function processFrame() {
    if (destroyed) return;
    animId = requestAnimationFrame(processFrame);

    if (video.readyState < 2) return;

    ctx.clearRect(0, 0, VIDEO_W, VIDEO_H);
    ctx.drawImage(video, 0, 0, VIDEO_W, VIDEO_H);

    if (handLandmarker) {
      const timestamp = performance.now();
      if (timestamp > lastTimestamp) {
        lastTimestamp = timestamp;
        const results = handLandmarker.detectForVideo(video, timestamp);

        let mL = null, mR = null;

        if (results.landmarks && results.landmarks.length > 0) {
          // First hand — cyan/purple
          const hand0 = results.landmarks[0];
          drawHandSkeleton(ctx, hand0, '#00D4FF', '#7C3AED');
          mL = computeHandMetrics(hand0, 0);

          // Second hand — green/yellow
          if (results.landmarks.length > 1) {
            const hand1 = results.landmarks[1];
            drawHandSkeleton(ctx, hand1, '#00FF88', '#FFD700');
            mR = computeHandMetrics(hand1, 1);
          }
        }

        const asym = (mL && mR) ? computeAsymmetry(mL, mR) : null;
        renderDashboard(mL, mR, asym);
      }
    }

    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
      const fps = frameCount;
      frameCount = 0;
      lastFpsTime = now;
      const tel = document.getElementById('cv-telemetry');
      if (tel) tel.textContent = `● TRACKING · ${fps} FPS`;
    }
  }

  async function init() {
    try {
      await new Promise(r => setTimeout(r, 200));
      if (destroyed) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: VIDEO_W }, height: { ideal: VIDEO_H }, facingMode: 'user' }
      });
      if (destroyed) { stream.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = stream;
      await new Promise(resolve => { video.onloadedmetadata = resolve; });
      await video.play();
      if (destroyed) return;

      // Start render loop — shows camera immediately
      animId = requestAnimationFrame(processFrame);

      const vision = await FilesetResolver.forVisionTasks(
        `${PINCH_ASSETS_BASE}pinch-assets/wasm`
      );
      if (destroyed) return;

      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `${PINCH_ASSETS_BASE}pinch-assets/hand_landmarker.task`,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      if (destroyed) return;

      const tel = document.getElementById('cv-telemetry');
      if (tel) tel.textContent = '● TRACKING ACTIVE';
    } catch (err) {
      console.error('Clinical view init failed:', err);
    }
  }

  init();

  function cleanup() {
    destroyed = true;
    if (animId) cancelAnimationFrame(animId);
    animId = null;
    if (handLandmarker) {
      handLandmarker.close();
      handLandmarker = null;
    }
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
  }

  return cleanup;
}

export function createClinicalButton() {
  const btn = document.createElement('button');
  btn.id = 'clinical-btn';
  btn.innerHTML = '⊞ CLINICAL VIEW';
  btn.className = 'clinical-view-btn';
  document.body.appendChild(btn);
  return btn;
}

export function removeClinicalButton() {
  const btn = document.getElementById('clinical-btn');
  if (btn) btn.remove();
}
