import {
  AssetManifest,
  AssetType,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  BoxGeometry,
  Color,
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
import { KeyBit, SubmitButton, LEDLight } from './components/circuit.js';

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
    .registerComponent(LEDLight);

  // --- Register systems ---
  world
    .registerSystem(KeypadSystem,           { priority: 0 })
    .registerSystem(SubmitSystem,           { priority: 5 })
    .registerSystem(CircuitResponseSystem,  { priority: 10 });

  // Camera starting position
  const { camera } = world;
  camera.position.set(-4, 1.5, -6);
  camera.rotateY(-Math.PI * 0.75);

  // -------------------------------------------------------
  // Scene models  (adjust scale if your GLBs are too big/small)
  // -------------------------------------------------------

  // Breadboard — big centerpiece on desk
  const boardScene = AssetManager.getGLTF('breadboard')!.scene.clone();
  boardScene.scale.setScalar(2.2);
  boardScene.position.set(-0.3, 0.88, -1.9);
  world.createTransformEntity(boardScene);

  // Comparator Chip — right of breadboard, on desk surface
  const chipScene = AssetManager.getGLTF('chip')!.scene.clone();
  chipScene.scale.setScalar(2.5);
  chipScene.position.set(0.5, 0.88, -1.9);
  world.createTransformEntity(chipScene);

  // LED — on desk surface next to chip
  const ledScene = AssetManager.getGLTF('led')!.scene.clone();
  ledScene.scale.setScalar(2.0);
  ledScene.position.set(0.9, 0.88, -1.9);
  const ledEntity = world.createTransformEntity(ledScene);
  ledEntity.addComponent(LEDLight);

  // Safe Box — far right of desk
  const safeScene = AssetManager.getGLTF('safebox')!.scene.clone();
  safeScene.scale.setScalar(0.65);
  safeScene.position.set(1.5, 0.8, -1.9);
  const safeEntity = world.createTransformEntity(safeScene);
  safeEntity.addComponent(AudioSource, {
    src: '/audio/chime.mp3',
    positional: true,
    volume: 0.8,
    playbackMode: PlaybackMode.Restart,
  });

  // -------------------------------------------------------
  // 4-bit input pins — sitting on the breadboard
  // bitIndex 3 = MSB (leftmost), bitIndex 0 = LSB (rightmost)
  // -------------------------------------------------------
  const bitPositions: [number, number, number][] = [
    [-0.9, 1.05, -1.9], // bit 3 (MSB)
    [-0.55, 1.05, -1.9], // bit 2
    [-0.2, 1.05, -1.9], // bit 1
    [ 0.15, 1.05, -1.9], // bit 0 (LSB)
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
  // Submit button — green cube between breadboard and chip
  // -------------------------------------------------------
  const submitGeo = new BoxGeometry(0.14, 0.07, 0.14);
  const submitMat = new MeshStandardMaterial({
    color: new Color(0.05, 0.5, 0.05),
    emissive: new Color(0, 0.2, 0),
    roughness: 0.5,
    metalness: 0.3,
  });
  const submitMesh = new Mesh(submitGeo, submitMat);
  submitMesh.position.set(0.5, 1.0, -1.9);
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
