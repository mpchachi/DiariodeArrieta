import * as THREE from 'three';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f4ede4');
  scene.fog = new THREE.Fog('#f4ede4', 12, 22);

  // Camera: slightly top-down for table overview
  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 7.5, 7.5);
  camera.lookAt(0, 0, 0.5);

  // Lighting: soft and warm, no harsh shadows
  const ambient = new THREE.AmbientLight('#fffaf0', 0.6);
  scene.add(ambient);

  const key = new THREE.DirectionalLight('#fff8f0', 1.0);
  key.position.set(3, 10, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 25;
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -8;
  key.shadow.radius = 4;
  key.shadow.bias = -0.0005;
  scene.add(key);

  const fill = new THREE.DirectionalLight('#e8e0ff', 0.35);
  fill.position.set(-4, 6, -2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight('#ffd4a8', 0.25);
  rim.position.set(0, 3, -6);
  scene.add(rim);

  const resize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, dispose: () => {
    window.removeEventListener('resize', resize);
    renderer.dispose();
  } };
}
