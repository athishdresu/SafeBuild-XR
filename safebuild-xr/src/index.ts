import {
  AssetManifest,
  AssetType,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  BoxGeometry,
  CylinderGeometry,
  Color,
  Vector3,
  SessionMode,
  AssetManager,
  World,
  RayInteractable,
  AudioSource,
  PlaybackMode,
  PanelUI,
} from '@iwsdk/core';
import { signal } from '@preact/signals-core';

import { KeypadSystem } from './systems/keypad-system.js';
import { SubmitSystem } from './systems/submit-system.js';
import { CircuitResponseSystem } from './systems/circuit-response-system.js';
import { KeyBit, SubmitButton, LEDLight, OutputLED } from './components/circuit.js';

const assets: AssetManifest = {
  breadboard: { url: '/glb/Breadboard.glb', type: AssetType.GLTF, priority: 'critical' },
  chip:       { url: '/glb/Chip.glb',       type: AssetType.GLTF, priority: 'critical' },
  led:        { url: '/glb/LED.glb',         type: AssetType.GLTF, priority: 'critical' },
  safebox:    { url: '/glb/Safebox.glb',     type: AssetType.GLTF, priority: 'critical' },
  alarm:      { url: '/audio/chime.mp3',     type: AssetType.Audio, priority: 'background' },
};

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: 'always',
    features: { handTracking: true, layers: true },
  },
  features: {
    locomotion: { useWorker: true },
    grabbing: true,
    physics: false,
    sceneUnderstanding: false,
    environmentRaycast: false,
    spatialUI: true,
  },
  level: './glxf/Composition.glxf',
}).then((world) => {
  // --- Shared reactive state ---
  (world.globals as Record<string, unknown>).currentPin    = signal('0000');
  (world.globals as Record<string, unknown>).circuitResult = signal(null);
  (world.globals as Record<string, unknown>).fetchPending  = signal(false);
  (world.globals as Record<string, unknown>).resetKeypad   = signal(0);

  // --- Register custom components ---
  world
    .registerComponent(KeyBit)
    .registerComponent(SubmitButton)
    .registerComponent(LEDLight)
    .registerComponent(OutputLED);

  // --- Register systems ---
  world
    .registerSystem(KeypadSystem,           { priority: 0 })
    .registerSystem(SubmitSystem,           { priority: 5 })
    .registerSystem(CircuitResponseSystem,  { priority: 10 });

  // Camera starting position
  const { camera } = world;
  // Front-on view so judges see the full circuit left→right
  camera.position.set(0.3, 1.6, 0.3);
  camera.rotateX(-0.18);

  // -------------------------------------------------------
  // Scene models  (adjust scale if your GLBs are too big/small)
  // -------------------------------------------------------

  // ── Chip GLB measured: 0.008w × 0.006h × 0.019d, bbox centre (0, +0.009, -0.019)
  //    chipPlaceY = deskY  - bottomOffset*S   → bottom sits on desk
  //    chipPlaceZ = targetZ + 0.019*S          → visual centre at targetZ
  //    CHIP_Y     = chipPlaceY + 0.009*S       → visual centre y
  const CHIP_SCALE  = 12;
  const CHIP_CX     = 0.40;                              // x centre in scene
  const CHIP_HW     = (0.008 * CHIP_SCALE) / 2;         // 0.048
  const CHIP_HALF_D = (0.019 * CHIP_SCALE) / 2;         // 0.114
  const chipPlaceY  = 0.88 - 0.006 * CHIP_SCALE;        // 0.808
  const chipPlaceZ  = -1.9  + 0.019 * CHIP_SCALE;       // -1.672
  const CHIP_Y      = chipPlaceY + 0.009 * CHIP_SCALE;  // 0.916 — visual centre y
  const chipScene   = AssetManager.getGLTF('chip')!.scene.clone();
  chipScene.scale.setScalar(CHIP_SCALE);
  chipScene.position.set(CHIP_CX, chipPlaceY, chipPlaceZ);
  world.createTransformEntity(chipScene);

  // Breadboard — GLB centred under the bit-sphere area (x -0.35, spans ≈ -1 to 0.3)
  const boardScene = AssetManager.getGLTF('breadboard')!.scene.clone();
  boardScene.scale.setScalar(7);
  boardScene.position.set(-0.35, 0.88, -1.9);
  world.createTransformEntity(boardScene);

  // LED — GLB (measured: 0.010w × 0.045h × 0.011d, bbox centre y=-0.005)
  //    ledPlaceY so LED bottom sits at desk surface
  const LED_SCALE = 4;
  const ledPlaceY = 0.88 + (0.005 - 0.0225) * LED_SCALE; // 0.88 + (-0.0175)*4 = 0.81
  const ledScene  = AssetManager.getGLTF('led')!.scene.clone();
  ledScene.scale.setScalar(LED_SCALE);
  ledScene.position.set(0.72, ledPlaceY, -1.9);
  const ledEntity = world.createTransformEntity(ledScene);
  ledEntity.addComponent(LEDLight);

  // Output LED — same GLB, immediately right of chip, only green on OPEN
  const outLEDScene = AssetManager.getGLTF('led')!.scene.clone();
  outLEDScene.scale.setScalar(LED_SCALE);
  outLEDScene.position.set(CHIP_CX + CHIP_HW + 0.05, ledPlaceY, -1.9);
  const outLEDEntity = world.createTransformEntity(outLEDScene);
  outLEDEntity.addComponent(OutputLED);

  // Safe Box — far right of desk
  const safeScene = AssetManager.getGLTF('safebox')!.scene.clone();
  safeScene.scale.setScalar(0.65);
  safeScene.position.set(1.15, 0.8, -1.9);
  const safeEntity = world.createTransformEntity(safeScene);
  safeEntity.addComponent(AudioSource, {
    src: '/audio/chime.mp3',
    positional: true,
    volume: 0.8,
    playbackMode: PlaybackMode.Restart,
  });

  // Find door mesh for hinge animation — tries common names, falls back to second child
  let doorObject: any = null;
  safeScene.traverse((obj: any) => {
    const name = (obj.name ?? '').toLowerCase();
    if (!doorObject && (name.includes('door') || name.includes('hinge') || name.includes('panel'))) {
      doorObject = obj;
    }
  });
  if (!doorObject) {
    doorObject = safeScene.children.length > 1
      ? safeScene.children[1]
      : safeScene.children[0] ?? null;
  }
  (world.globals as Record<string, unknown>).doorObject = doorObject;
  console.log('[SafeBuild XR] Door mesh:', doorObject?.name ?? '(fallback child)');

  // -------------------------------------------------------
  // 4-bit input pins — sitting on the breadboard
  // bitIndex 3 = MSB (leftmost), bitIndex 0 = LSB (rightmost)
  // -------------------------------------------------------
  const bitPositions: [number, number, number][] = [
    [-0.80, 1.05, -1.9], // bit 3 (MSB)
    [-0.50, 1.05, -1.9], // bit 2
    [-0.20, 1.05, -1.9], // bit 1
    [ 0.10, 1.05, -1.9], // bit 0 (LSB)
  ];

  for (let i = 3; i >= 0; i--) {
    const pos = bitPositions[3 - i];
    const geo = new SphereGeometry(0.07, 12, 8);
    const mat = new MeshStandardMaterial({
      color: new Color(0.15, 0.15, 0.15),
      emissive: new Color(0, 0, 0),
      roughness: 0.4,
      metalness: 0.6,
    });
    const sphere = new Mesh(geo, mat);
    sphere.position.set(...pos);
    const bitEntity = world.createTransformEntity(sphere);
    bitEntity.addComponent(KeyBit, { bitIndex: i, isOn: false });
    bitEntity.addComponent(RayInteractable);
  }

  // -------------------------------------------------------
  // Wires — each bit sphere → chip, converging at staggered y
  // Simple straight diagonals, clearly readable left→right
  // -------------------------------------------------------
  const wireColors = [
    new Color(0.9, 0.1, 0.1),   // bit 3 — red
    new Color(0.1, 0.4, 1.0),   // bit 2 — blue
    new Color(0.95, 0.85, 0.0), // bit 1 — yellow
    new Color(0.1, 0.8, 0.1),   // bit 0 — green
  ];
  // Chip entry points: exact left face, spread in z within chip's depth
  // Chip z range in scene: -1.9 ± (0.019*CHIP_SCALE/2) = -1.9 ± 0.114
  const CHIP_LEFT   = CHIP_CX - CHIP_HW;  // 0.352
  const chipPins: [number, number, number][] = [
    [CHIP_LEFT, CHIP_Y, -1.9 + CHIP_HALF_D * 0.6],  // bit 3 — near side
    [CHIP_LEFT, CHIP_Y, -1.9 + CHIP_HALF_D * 0.2],  // bit 2
    [CHIP_LEFT, CHIP_Y, -1.9 - CHIP_HALF_D * 0.2],  // bit 1
    [CHIP_LEFT, CHIP_Y, -1.9 - CHIP_HALF_D * 0.6],  // bit 0 — far side
  ];
  const wireMats: MeshStandardMaterial[] = new Array(4);

  const nubGeo = new SphereGeometry(0.028, 10, 7); // shared nub geometry

  bitPositions.forEach((bitPos, idx) => {
    const bitIndex = 3 - idx;
    const a = new Vector3(bitPos[0], bitPos[1], bitPos[2]);
    const b = new Vector3(...chipPins[idx]);
    const dir = b.clone().sub(a);
    const length = dir.length();
    if (length < 0.001) return;
    const mid = new Vector3().addVectors(a, b).multiplyScalar(0.5);

    const wireMat = new MeshStandardMaterial({ color: wireColors[idx], roughness: 0.5, metalness: 0.2 });
    wireMats[bitIndex] = wireMat;

    const wireGeo = new CylinderGeometry(0.016, 0.016, length, 8);
    const wireMesh = new Mesh(wireGeo, wireMat);
    wireMesh.position.copy(mid);
    wireMesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
    world.createTransformEntity(wireMesh);

    // Connector nub at chip end — anchors wire visually to chip face
    const nubMesh = new Mesh(nubGeo, wireMat);
    nubMesh.position.copy(b);
    world.createTransformEntity(nubMesh);
  });
  (world.globals as Record<string, unknown>).wireMats = wireMats;

  // -------------------------------------------------------
  // Wire — chip output → safe (thick single wire)
  // -------------------------------------------------------
  {
    const a = new Vector3(CHIP_CX + CHIP_HW, CHIP_Y, -1.9);   // exact chip right face
    const b = new Vector3(1.05, CHIP_Y, -1.9);                // safe left side
    const dir = b.clone().sub(a);
    const length = dir.length();
    const mid = new Vector3().addVectors(a, b).multiplyScalar(0.5);
    const wireGeo = new CylinderGeometry(0.024, 0.024, length, 8);
    const wireMat = new MeshStandardMaterial({ color: new Color(0.9, 0.9, 0.9), roughness: 0.5, metalness: 0.4 });
    const wireMesh = new Mesh(wireGeo, wireMat);
    wireMesh.position.copy(mid);
    wireMesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
    world.createTransformEntity(wireMesh);

    // Nubs at both ends of the chip→safe wire
    const nubMat = new MeshStandardMaterial({ color: new Color(0.75, 0.75, 0.75), roughness: 0.4, metalness: 0.5 });
    [a, b].forEach((pt) => {
      const nub = new Mesh(nubGeo, nubMat);
      nub.position.copy(pt);
      world.createTransformEntity(nub);
    });
  }

  // -------------------------------------------------------
  // Submit button — small red pushbutton, clearly a button not a component
  // -------------------------------------------------------
  const submitGeo = new BoxGeometry(0.10, 0.05, 0.10);
  const submitMat = new MeshStandardMaterial({
    color: new Color(0.85, 0.1, 0.05),
    emissive: new Color(0.3, 0.02, 0),
    roughness: 0.4,
    metalness: 0.2,
  });
  const submitMesh = new Mesh(submitGeo, submitMat);
  submitMesh.position.set(0.26, 0.91, -1.9);
  const submitEntity = world.createTransformEntity(submitMesh);
  submitEntity.addComponent(SubmitButton);
  submitEntity.addComponent(RayInteractable);

  // -------------------------------------------------------
  // Circuit info + AI tutor panel — centered above the desk
  // -------------------------------------------------------
  const panelAnchor = new Mesh(new PlaneGeometry(0.001, 0.001));
  panelAnchor.position.set(0.1, 2.1, -1.9);
  const panelEntity = world.createTransformEntity(panelAnchor);
  panelEntity.addComponent(PanelUI, { config: './ui/circuit.json' });
  panelEntity.addComponent(RayInteractable);
});
