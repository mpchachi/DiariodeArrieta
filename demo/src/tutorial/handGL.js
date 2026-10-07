// Render 3D de la mano de la guía con WebGL: la mano es una superficie continua
// (campo de distancia con uniones suaves) trazada por rayos en el fragment shader y
// sombreada como arcilla mate gris con sombra proyectada, oclusión ambiental, luz de
// relleno y un contorno fino en la silueta.
//
// El trazado ocurre en el sistema LOCAL de la mano (+x pulgar, +y dedos, +z palma hacia
// el espectador): así la palma puede ser plana (ancha y fina) y el dorso llevar nudillos
// y tendones en su sitio aunque la mano esté girada. La cámara coincide con `project()`
// del modelo (pinhole en z = focal mirando a −z), así que `fitLayout` sirve tal cual.
// Si WebGL no está disponible, `createHandRenderer` devuelve null y la guía usa el
// dibujo 2D de `handRender.js`.

import { ANATOMY, WRIST_L, WRIST_R, nailAnchors } from './handModel.js';

const FOCAL = 900;
// El antebrazo sale de la muñeca en la dirección opuesta al corazón y se desvanece.
export const FOREARM_MM = 36;
export const forearmEnd = points => {
  const w = points[0], m = points[9];
  const d = [w[0] - m[0], w[1] - m[1], w[2] - m[2]];
  const l = Math.hypot(...d) || 1;
  return d.map((v, i) => w[i] + v / l * FOREARM_MM);
};

const VS = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `
precision highp float;
uniform vec3 uP[24];      // local: 0-20 landmarks, 21/22 bordes de la muñeca, 23 fin del antebrazo
uniform vec3 uNailC[5];   // centro de cada uña (local)
uniform vec3 uNailN[5];   // normal dorsal de cada uña (local)
uniform vec2 uNailS[5];   // radio, longitud
uniform mat3 uM;          // base de la mano en el mundo (columnas)
uniform vec4 uR;          // radios: índice, corazón, anular, meñique
uniform vec3 uR2;         // radios: pulgar, palma, antebrazo
uniform vec3 uView;       // zoom (px por mm), cx, cy (px) del lienzo
uniform vec2 uSize;       // tamaño del lienzo en px
uniform int uSteps;
uniform float uFocal;

const float PALM_FLAT = 1.7;    // la palma es 1,7 veces más ancha que gruesa
const float FINGER_FLAT = 1.12; // los dedos son un poco más anchos que gruesos

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
// Cono redondeado entre a (radio ra) y b (radio rb).
float sdCone(vec3 p, vec3 a, vec3 b, float ra, float rb) {
  vec3 ba = b - a, pa = p - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}
// Segmento aplanado en z (cross-section ovalada): se evalúa en coordenadas estiradas.
vec3 oval(vec3 p, float k) { return vec3(p.x, p.y, p.z * k); }
float sdFlatCone(vec3 p, vec3 a, vec3 b, float ra, float rb, float k) {
  return sdCone(oval(p, k), oval(a, k), oval(b, k), ra, rb) / k;
}
// Dedo: tres falanges lisas que se estrechan hacia la yema, unidas con suavidad para que
// al doblarse no se marquen escalones (dibujo limpio, sin nudillos ni bultos).
float finger(vec3 p, vec3 a, vec3 b, vec3 c, vec3 d, float r) {
  float k = FINGER_FLAT;
  float s = sdFlatCone(p, a, b, r, r * 0.9, k);
  s = smin(s, sdFlatCone(p, b, c, r * 0.9, r * 0.82, k), 4.0);
  s = smin(s, sdFlatCone(p, c, d, r * 0.82, r * 0.7, k), 3.5);
  // Yema algo más llena y redonda.
  s = smin(s, length(oval(p - d, k)) / k - r * 0.68, 3.0);
  return s;
}
float palm(vec3 p) {
  float r = uR2.y * 1.25, k = PALM_FLAT; // radio en el plano; grosor = r / k
  vec3 w = uP[0];
  // Cuerpo de la palma: abanico de la muñeca a los nudillos, aplanado y muy fundido.
  float s = sdFlatCone(p, uP[21], uP[22], r * 0.8, r * 0.8, k);          // muñeca
  s = smin(s, sdFlatCone(p, uP[21], uP[17], r * 0.88, r * 0.84, k), 12.0); // borde del meñique
  s = smin(s, sdFlatCone(p, w, uP[13], r * 1.0, r * 0.88, k), 12.0);
  s = smin(s, sdFlatCone(p, w, uP[9], r * 1.02, r * 0.9, k), 12.0);        // centro
  s = smin(s, sdFlatCone(p, w, uP[5], r * 1.0, r * 0.88, k), 12.0);
  s = smin(s, sdFlatCone(p, uP[22], uP[5], r * 0.88, r * 0.86, k), 12.0);
  // Membrana entre los dedos: une las bases.
  s = smin(s, sdFlatCone(p, uP[5], uP[9], r * 0.62, r * 0.62, k), 8.0);
  s = smin(s, sdFlatCone(p, uP[9], uP[13], r * 0.62, r * 0.6, k), 8.0);
  s = smin(s, sdFlatCone(p, uP[13], uP[17], r * 0.6, r * 0.56, k), 8.0);
  // Eminencia tenar: la almohadilla bajo el pulgar, algo más gruesa que la palma.
  s = smin(s, sdFlatCone(p, uP[22], uP[1], r * 0.9, r * 0.9, 1.3), 12.0);
  s = smin(s, sdFlatCone(p, uP[1], uP[5], r * 0.84, r * 0.78, 1.4), 12.0);
  return s;
}
float forearm(vec3 p) {
  // De la muñeca (ovalada) al antebrazo (más ancho y redondo).
  float r = uR2.z;
  return sdFlatCone(p, uP[0], uP[23], r * 0.88, r * 1.1, 1.35);
}
float nails(vec3 p) {
  float s = 1e9;
  const float k = 3.0; // la uña es 3 veces más ancha que gruesa
  for (int i = 0; i < 5; i++) {
    vec3 q = p - uNailC[i];
    vec3 n = uNailN[i];
    q += n * dot(q, n) * (k - 1.0);
    s = min(s, (length(q) - uNailS[i].x) / k);
  }
  return s;
}
float body(vec3 p) {
  float s = palm(p);
  s = smin(s, forearm(p), 8.0);
  s = smin(s, finger(p, uP[1], uP[2], uP[3], uP[4], uR2.x), 9.0);          // pulgar
  // Los cuatro dedos se funden un poco entre sí (se tocan al cerrarse) y luego con la palma.
  float f = finger(p, uP[5], uP[6], uP[7], uP[8], uR.x);
  f = smin(f, finger(p, uP[9], uP[10], uP[11], uP[12], uR.y), 3.0);
  f = smin(f, finger(p, uP[13], uP[14], uP[15], uP[16], uR.z), 3.0);
  f = smin(f, finger(p, uP[17], uP[18], uP[19], uP[20], uR.w), 3.0);
  s = smin(s, f, 5.0);
  return s;
}
float map(vec3 p) { return smin(body(p), nails(p), 1.0); }
vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.5, 0.0);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}
float ao(vec3 p, vec3 n) {
  float occ = 0.0, w = 1.0;
  for (int i = 1; i <= 5; i++) {
    float h = 1.0 + 4.0 * float(i);
    occ += (h - map(p + n * h)) * w;
    w *= 0.7;
  }
  return clamp(1.0 - 0.06 * occ, 0.0, 1.0);
}
// Sombra suave hacia la luz principal.
float shadow(vec3 p, vec3 l) {
  float res = 1.0, t = 2.5;
  for (int i = 0; i < 20; i++) {
    float h = map(p + l * t);
    res = min(res, 10.0 * h / t);
    t += clamp(h, 1.0, 8.0);
    if (res < 0.01 || t > 180.0) break;
  }
  return clamp(res, 0.0, 1.0);
}
// Cuánto antebrazo se ve: 1 en la muñeca, 0 al final.
float forearmFade(vec3 p) {
  vec3 a = uP[0], b = uP[23];
  float h = dot(p - a, b - a) / dot(b - a, b - a);
  return 1.0 - smoothstep(0.15, 0.9, h);
}
void main() {
  vec2 px = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  vec2 uv = vec2((px.x - uView.y) / uView.x, -(px.y - uView.z) / uView.x); // mm en z = 0
  mat3 Mt = mat3(uM[0][0], uM[1][0], uM[2][0], uM[0][1], uM[1][1], uM[2][1], uM[0][2], uM[1][2], uM[2][2]);
  // Rayo en el mundo, llevado al sistema local de la mano.
  vec3 roW = vec3(0.0, 0.0, uFocal);
  vec3 rdW = normalize(vec3(uv, -uFocal));
  vec3 ro = Mt * roW, rd = Mt * rdW;
  float t = uFocal - 170.0, minD = 1e9, d = 0.0;
  bool hit = false;
  for (int i = 0; i < 110; i++) {
    if (i >= uSteps) break;
    vec3 p = ro + rd * t;
    d = map(p);
    minD = min(minD, d);
    if (d < 0.04) { hit = true; break; }
    t += d * 0.85;
    if (t > uFocal + 170.0) break;
  }
  float pxMm = 1.0 / uView.x; // mm que mide un píxel
  if (!hit && minD > pxMm * 1.5) { gl_FragColor = vec4(0.0); return; }
  vec3 p = ro + rd * t;
  vec3 nl = normalAt(p);
  vec3 n = normalize(uM * nl);  // normal en el mundo
  vec3 v = -rdW;
  vec3 key = normalize(vec3(-0.46, 0.74, 0.5));
  vec3 fill = normalize(vec3(0.75, -0.15, 0.65));
  float sh = shadow(p, Mt * key);
  float occ = ao(p, nl);
  // Difuso envolvente (la piel no corta la luz en seco) más relleno frío y cielo.
  float wrap = clamp((dot(n, key) + 0.35) / 1.35, 0.0, 1.0);
  float dif = pow(wrap, 1.4) * mix(0.35, 1.0, sh);
  float fil = clamp(dot(n, fill), 0.0, 1.0) * 0.28;
  float sky = 0.5 + 0.5 * n.y;
  bool nail = nails(p) < 0.9;
  vec3 light = nail ? vec3(0.965, 0.972, 0.98) : vec3(0.915, 0.928, 0.945);
  vec3 dark = nail ? vec3(0.68, 0.72, 0.77) : vec3(0.53, 0.585, 0.65);
  float lum = clamp(0.26 + 0.62 * dif + fil + 0.16 * sky, 0.0, 1.0);
  vec3 col = mix(dark, light, lum) * mix(0.68, 1.0, occ);
  // Brillo: amplio y mate en la piel, más tenso en la uña.
  vec3 hvec = normalize(key + v);
  float spec = pow(clamp(dot(n, hvec), 0.0, 1.0), nail ? 60.0 : 22.0) * (nail ? 0.28 : 0.07) * sh * occ;
  col += vec3(spec);
  // Velo de borde (fresnel) para que la arcilla no quede plana.
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  col = mix(col, vec3(0.82, 0.86, 0.90), fres * 0.2);
  // Contorno fino en la silueta.
  float edge = smoothstep(0.30, 0.10, dot(n, v));
  col = mix(col, vec3(0.34, 0.39, 0.46), edge * 0.72);
  // Borde suavizado: cobertura según lo cerca que pasó el rayo.
  float alpha = hit ? 1.0 : 1.0 - smoothstep(0.0, pxMm * 1.5, minD);
  alpha *= forearmFade(p);
  gl_FragColor = vec4(col * alpha, alpha);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader');
  return sh;
}

// Devuelve { render(frame, layout, dpr), dispose() } o null si no hay WebGL.
export function createHandRenderer(canvas, { anatomy = ANATOMY, steps = 96 } = {}) {
  let gl;
  try {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
  } catch { gl = null; }
  if (!gl) return null;
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
  } catch (e) {
    console.warn('[tutorial] WebGL no disponible para la mano, se usa el dibujo 2D:', e.message);
    return null;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = name => gl.getUniformLocation(prog, name);
  const uP = u('uP'), uM = u('uM'), uR = u('uR'), uR2 = u('uR2'), uView = u('uView'), uSize = u('uSize'), uSteps = u('uSteps'), uFocal = u('uFocal');
  const uNailC = u('uNailC'), uNailN = u('uNailN'), uNailS = u('uNailS');
  gl.uniform4f(uR, ...anatomy.fingers.map(f => f.radius));
  gl.uniform3f(uR2, anatomy.thumb.radius, anatomy.palmRadius, anatomy.forearmRadius ?? 12.5);
  gl.uniform1i(uSteps, steps);
  gl.uniform1f(uFocal, FOCAL);
  gl.clearColor(0, 0, 0, 0);
  const pts = new Float32Array(24 * 3), nc = new Float32Array(15), nn = new Float32Array(15), ns = new Float32Array(10), m = new Float32Array(9);
  let lost = false;
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });

  return {
    get lost() { return lost; },
    // `frame`: de gestureFrame (con `local` y `basis`); `layout` en px CSS (de fitLayout);
    // `dpr` escala al tamaño real del lienzo.
    render(frame, layout, dpr = 1) {
      if (lost) return;
      const w = canvas.width, h = canvas.height;
      gl.viewport(0, 0, w, h);
      const P = frame.local;
      for (let i = 0; i < 23; i++) { pts[i * 3] = P[i][0]; pts[i * 3 + 1] = P[i][1]; pts[i * 3 + 2] = P[i][2]; }
      const fe = forearmEnd(P);
      pts[69] = fe[0]; pts[70] = fe[1]; pts[71] = fe[2];
      gl.uniform3fv(uP, pts);
      const B = frame.basis; // columnas
      for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 3 + r] = B[c][r];
      gl.uniformMatrix3fv(uM, false, m);
      nailAnchors(frame.pose, P, anatomy).forEach((a, i) => {
        nc.set(a.center, i * 3); nn.set(a.normal, i * 3); ns[i * 2] = a.radius; ns[i * 2 + 1] = a.length;
      });
      gl.uniform3fv(uNailC, nc); gl.uniform3fv(uNailN, nn); gl.uniform2fv(uNailS, ns);
      gl.uniform3f(uView, layout.zoom * dpr, layout.cx * dpr, layout.cy * dpr);
      gl.uniform2f(uSize, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* nada */ }
    },
  };
}

// Puntos a usar para encajar la mano en el lienzo: los del modelo (orientados) más el
// antebrazo (sin él, la mano quedaría cortada por abajo cuando apunta hacia arriba).
export const WRIST_IDX = [WRIST_L, WRIST_R];
export function fitPoints(points) {
  return [...points, forearmEnd(points)];
}
