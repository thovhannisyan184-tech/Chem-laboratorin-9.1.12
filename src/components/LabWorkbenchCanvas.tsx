import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { CameraPreset, LabStep, SafetyState } from '../types/lab';
import {
  PLATE_WELLS,
  getNearWellState,
  getFarWellState,
  getCenterWellState,
} from '../utils/chemistryEngine';

interface LabWorkbenchCanvasProps {
  safety: SafetyState;
  step: LabStep;
  timeSeconds: number;
  cameraPreset: CameraPreset;
  showMolecules: boolean;
  onAdvanceStep: (nextStep: LabStep) => void;
  onActionFeedback: (message: string, type?: 'info' | 'success' | 'warning') => void;
}

interface DraggableTool {
  id: 'spatula' | 'weighPaper' | 'pipette' | 'cover';
  x: number;
  y: number;
  homeX: number;
  homeY: number;
}

interface BubbleParticle {
  x: number;
  y: number;
  r: number;
  vy: number;
  alpha: number;
}

interface FallingDrop {
  x: number;
  y: number;
  targetY: number;
  vy: number;
}

interface ThreeGasParticleData {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  targetWellIndex: number; // Guides diffusion toward surrounding wells #2..#9
  angle: number;
  radialDist: number;
  speed: number;
  heightPhase: number;
  wobbleSpeed: number;
  baseScale: number;
}

const CANVAS_W = 960;
const CANVAS_H = 560;
const PARTICLE_COUNT = 160;

// Surrounding 8 well direction vectors in 3x3 grid relative to center #1 (0,0)
const SURROUNDING_WELL_TARGETS = [
  { rowOffset: -1, colOffset: 0, distFactor: 1.0 },     // #2 (Near Top)
  { rowOffset: 0, colOffset: -1, distFactor: 1.0 },     // #4 (Near Left)
  { rowOffset: 0, colOffset: 1, distFactor: 1.0 },      // #6 (Near Right)
  { rowOffset: 1, colOffset: 0, distFactor: 1.0 },      // #8 (Near Bottom)
  { rowOffset: -1, colOffset: 1, distFactor: 1.414 },   // #3 (Far Top-Right)
  { rowOffset: -1, colOffset: -1, distFactor: 1.414 },  // #5 (Far Top-Left)
  { rowOffset: 1, colOffset: -1, distFactor: 1.414 },   // #7 (Far Bottom-Left)
  { rowOffset: 1, colOffset: 1, distFactor: 1.414 },    // #9 (Far Bottom-Right)
];

export const LabWorkbenchCanvas: React.FC<LabWorkbenchCanvasProps> = ({
  safety,
  step,
  timeSeconds,
  cameraPreset,
  showMolecules,
  onAdvanceStep,
  onActionFeedback,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const threeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const allSafetyReady = safety.goggles && safety.gloves && safety.coat;

  // Tool states
  const [spatulaLoadedFromJar, setSpatulaLoadedFromJar] = useState(false);
  const [scaleHasPowder, setScaleHasPowder] = useState(false);
  const [spatulaLoadedFromScale, setSpatulaLoadedFromScale] = useState(false);
  const [pipetteFilled, setPipetteFilled] = useState(false);
  const [hoveredWellId, setHoveredWellId] = useState<number | null>(null);
  const [activeDragId, setActiveDragId] = useState<DraggableTool['id'] | null>(null);

  // Latest props ref for Three.js animation loop
  const simStateRef = useRef({
    step,
    timeSeconds,
    cameraPreset,
    showMolecules,
    allSafetyReady,
  });

  useEffect(() => {
    simStateRef.current = {
      step,
      timeSeconds,
      cameraPreset,
      showMolecules,
      allSafetyReady,
    };
  }, [step, timeSeconds, cameraPreset, showMolecules, allSafetyReady]);

  // Mutable refs for smooth 60fps animation loop without re-renders
  const toolsRef = useRef<Record<DraggableTool['id'], DraggableTool>>({
    spatula: { id: 'spatula', x: 120, y: 410, homeX: 120, homeY: 410 },
    weighPaper: { id: 'weighPaper', x: 290, y: 318, homeX: 290, homeY: 318 },
    pipette: { id: 'pipette', x: 825, y: 315, homeX: 825, homeY: 315 },
    cover: { id: 'cover', x: 825, y: 455, homeX: 825, homeY: 455 },
  });

  const dragRef = useRef<{
    id: DraggableTool['id'] | null;
    offsetX: number;
    offsetY: number;
  }>({ id: null, offsetX: 0, offsetY: 0 });

  const bubblesRef = useRef<BubbleParticle[]>([]);
  const dropsRef = useRef<FallingDrop[]>([]);
  const appearProgressRef = useRef<number>(0);

  // Sync internal tool state if lab resets
  useEffect(() => {
    if (step === 'safety' || step === 'step1_scoop') {
      setSpatulaLoadedFromJar(false);
      setScaleHasPowder(false);
      setSpatulaLoadedFromScale(false);
      setPipetteFilled(false);
      toolsRef.current.spatula.x = toolsRef.current.spatula.homeX;
      toolsRef.current.spatula.y = toolsRef.current.spatula.homeY;
      toolsRef.current.weighPaper.x = toolsRef.current.weighPaper.homeX;
      toolsRef.current.weighPaper.y = toolsRef.current.weighPaper.homeY;
      toolsRef.current.pipette.x = toolsRef.current.pipette.homeX;
      toolsRef.current.pipette.y = toolsRef.current.pipette.homeY;
      toolsRef.current.cover.x = toolsRef.current.cover.homeX;
      toolsRef.current.cover.y = toolsRef.current.cover.homeY;
    }
  }, [step]);

  // Geometry helpers based on camera preset
  const getPlateGeometry = useCallback((preset: CameraPreset = cameraPreset) => {
    if (preset === 'closeup') {
      return {
        cx: 530,
        cy: 295,
        width: 340,
        height: 300,
        tiltY: 0.88,
        depth3D: 22,
        wellRadius: 31,
      };
    }
    if (preset === 'top') {
      return {
        cx: 535,
        cy: 300,
        width: 280,
        height: 280,
        tiltY: 1.0,
        depth3D: 10,
        wellRadius: 27,
      };
    }
    // Default 3D perspective
    return {
      cx: 535,
      cy: 320,
      width: 290,
      height: 225,
      tiltY: 0.76,
      depth3D: 28,
      wellRadius: 26,
    };
  }, [cameraPreset]);

  const getWellScreenCoords = useCallback(
    (row: number, col: number, preset: CameraPreset = cameraPreset) => {
      const plate = getPlateGeometry(preset);
      const spacingX = plate.width * 0.3;
      const spacingY = plate.height * 0.3;
      const rowOffset = row - 1; // -1, 0, 1
      const colOffset = col - 1; // -1, 0, 1
      const perspectiveScale =
        preset === 'top' ? 1 : 1 + rowOffset * 0.045;
      const x = plate.cx + colOffset * spacingX * perspectiveScale;
      const y = plate.cy + rowOffset * spacingY;
      return { x, y, scale: perspectiveScale };
    },
    [getPlateGeometry, cameraPreset]
  );

  // ==========================================================================
  // THREE.JS 3D GAS PARTICLE VISUALIZATION SYSTEM (SO2 DIFFUSION FROM WELL #1)
  // ==========================================================================
  useEffect(() => {
    const threeCanvas = threeCanvasRef.current;
    if (!threeCanvas) return;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: threeCanvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(CANVAS_W, CANVAS_H, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
    } catch {
      // Graceful fallback if WebGL is unavailable in environment
      return;
    }

    // Orthographic camera mapped 1:1 to the 960x560 canvas coordinate space
    // with Z depth [-300, 300] so 3D spheres have real volumetric shading and Z-height
    const camera = new THREE.OrthographicCamera(
      0,
      CANVAS_W,
      0,
      CANVAS_H,
      -400,
      400
    );
    camera.position.set(0, 0, 200);
    camera.lookAt(0, 0, 0);

    const scene = new THREE.Scene();

    // Three-Point Studio Lighting for 3D Grayish Transparent SO2 Spheres
    const ambientLight = new THREE.AmbientLight(0xe2e8f0, 1.35);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
    keyLight.position.set(320, -260, 350);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x94a3b8, 1.1);
    rimLight.position.set(-280, 250, 180);
    scene.add(rimLight);

    const particleGroup = new THREE.Group();
    scene.add(particleGroup);

    // Shared 3D Sphere Geometry for SO2 gas particles
    const sphereGeo = new THREE.SphereGeometry(4.6, 16, 16);
    const particles: ThreeGasParticleData[] = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // 70% of particles follow directed diffusion streams toward the 8 surrounding wells,
      // 30% diffuse radially across the entire airspace under the cover
      const targetWellIndex = i % SURROUNDING_WELL_TARGETS.length;
      const targetWell = SURROUNDING_WELL_TARGETS[targetWellIndex];
      const baseAngle = Math.atan2(targetWell.rowOffset, targetWell.colOffset);
      const angleJitter = (Math.random() - 0.5) * 0.62;

      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xcbd5e1), // Grayish-silver SO2 gas tone
        roughness: 0.28,
        metalness: 0.08,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(sphereGeo, mat);
      const baseScale = 0.55 + Math.random() * 0.85;
      mesh.scale.setScalar(baseScale);
      particleGroup.add(mesh);

      particles.push({
        mesh,
        material: mat,
        targetWellIndex,
        angle: baseAngle + angleJitter,
        radialDist: Math.random(), // Normalized [0..1] progress along diffusion path
        speed: 0.0028 + Math.random() * 0.0042,
        heightPhase: Math.random() * Math.PI * 2,
        wobbleSpeed: 1.5 + Math.random() * 2.5,
        baseScale,
      });
    }

    // Central Well #1 Effervescent Source Plume Halo (3D Torus / Ring)
    const ringGeo = new THREE.RingGeometry(6, 26, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xcbd5e1,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const plumeRing = new THREE.Mesh(ringGeo, ringMat);
    scene.add(plumeRing);

    // WebGL Context Lost / Restored Handlers
    const handleContextLost = (event: Event) => {
      event.preventDefault();
    };
    threeCanvas.addEventListener('webglcontextlost', handleContextLost, false);

    let frameId: number;
    const animateThree = (nowMs: number) => {
      frameId = requestAnimationFrame(animateThree);
      if (!renderer) return;

      const {
        step: currentStep,
        timeSeconds: currentTime,
        cameraPreset: currentPreset,
        showMolecules: moleculesVisible,
        allSafetyReady: safetyReady,
      } = simStateRef.current;

      const isDiffusingState =
        safetyReady &&
        (currentStep === 'diffusing' || currentStep === 'completed') &&
        moleculesVisible;

      if (!isDiffusingState) {
        particleGroup.visible = false;
        plumeRing.visible = false;
        renderer.render(scene, camera);
        return;
      }

      particleGroup.visible = true;
      plumeRing.visible = true;

      const plate = getPlateGeometry(currentPreset);
      const centerWell = getWellScreenCoords(1, 1, currentPreset);
      const spacingX = plate.width * 0.3;
      const spacingY = plate.height * 0.3;

      // Maximum diffusion frontier expands with timeSeconds (0 -> 300s)
      // At t = 30s, frontier reaches orthogonal wells (#2, #4, #6, #8, dist = 1.0)
      // At t = 120s..300s, frontier reaches and saturates corner wells (#3, #5, #7, #9, dist = 1.414)
      const diffusionProgress = Math.min(
        1.52,
        0.18 + 1.34 * Math.pow(Math.min(1, Math.max(0.02, currentTime / 140)), 0.58)
      );

      // Update source plume ring at Center Well #1
      const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.005);
      plumeRing.position.set(centerWell.x, centerWell.y, 12);
      plumeRing.scale.set(1 + pulse * 0.25, plate.tiltY * (1 + pulse * 0.25), 1);
      ringMat.opacity = currentTime < 300 ? 0.16 + pulse * 0.12 : 0.08;

      // Update each 3D grayish-transparent sphere particle originating from Well #1
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const targetWell = SURROUNDING_WELL_TARGETS[p.targetWellIndex];

        // Advance particle outward from center Well #1
        const activeSpeed = currentTime >= 300 ? p.speed * 0.35 : p.speed;
        p.radialDist += activeSpeed;

        // Max normalized distance allowed for this particle at current timeSeconds
        const allowedMaxDist = Math.min(
          targetWell.distFactor * 1.08,
          diffusionProgress
        );

        if (p.radialDist > allowedMaxDist) {
          // Respawn particle at central #1 well origin
          p.radialDist = 0.02 + Math.random() * 0.08;
          const baseAngle = Math.atan2(targetWell.rowOffset, targetWell.colOffset);
          p.angle = baseAngle + (Math.random() - 0.5) * 0.62;
        }

        // Compute 3D Brownian motion jitter
        const wobbleAngle =
          p.angle +
          Math.sin(nowMs * 0.0025 * p.wobbleSpeed + p.heightPhase) * 0.11;

        const dx = Math.cos(wobbleAngle) * spacingX * p.radialDist;
        const dy = Math.sin(wobbleAngle) * spacingY * p.radialDist;

        // Parabolic arch under the transparent cover plate (rises from well #1, settles into target wells)
        const normalizedPath = p.radialDist / Math.max(0.1, targetWell.distFactor);
        const zArch = Math.sin(Math.min(1, normalizedPath) * Math.PI) * 28;
        const yPerspectiveLift =
          currentPreset === 'top' ? 0 : -zArch * (1 - plate.tiltY) * 0.65;

        const px = centerWell.x + dx;
        const py = centerWell.y + dy + yPerspectiveLift;
        const pz = 15 + zArch;

        p.mesh.position.set(px, py, pz);

        // Scale slightly larger as the gas sphere rises toward the cover, smaller as it dissolves
        const dynamicScale =
          p.baseScale * (0.85 + 0.35 * Math.sin(Math.min(1, normalizedPath) * Math.PI));
        p.mesh.scale.setScalar(dynamicScale);

        // Grayish transparent opacity: smooth fade-in at Well #1 origin and fade-out at frontier/absorption
        const fadeIn = Math.min(1, p.radialDist / 0.18);
        const fadeOut = Math.max(
          0,
          1 - Math.pow(p.radialDist / Math.max(0.25, allowedMaxDist), 2.2)
        );
        p.material.opacity = fadeIn * fadeOut * 0.58;
      }

      renderer.render(scene, camera);
    };

    frameId = requestAnimationFrame(animateThree);

    return () => {
      cancelAnimationFrame(frameId);
      threeCanvas.removeEventListener('webglcontextlost', handleContextLost);
      sphereGeo.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      for (const p of particles) {
        p.material.dispose();
      }
      if (renderer) {
        renderer.dispose();
      }
    };
  }, [getPlateGeometry, getWellScreenCoords]);

  // Convert client mouse/touch event to internal 960x560 canvas coordinates
  const getCanvasPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!allSafetyReady) {
      onActionFeedback(
        'Նախ ակտիվացրե՛ք բոլոր 3 անվտանգության պարագաները ձախ վահանակում (Ակնոց, Ձեռնոց, Խալաթ)։',
        'warning'
      );
      return;
    }

    const pt = getCanvasPoint(e.clientX, e.clientY);
    const tools = toolsRef.current;

    // 1. Spatula
    const distSpatula = Math.hypot(pt.x - tools.spatula.x, pt.y - tools.spatula.y);
    if (distSpatula < 58) {
      if (
        step === 'step1_scoop' ||
        step === 'step1_weigh' ||
        step === 'step1_transfer'
      ) {
        dragRef.current = {
          id: 'spatula',
          offsetX: pt.x - tools.spatula.x,
          offsetY: pt.y - tools.spatula.y,
        };
        setActiveDragId('spatula');
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      } else {
        onActionFeedback(
          'Շպատելն արդեն օգտագործվել է Քայլ 1-ում։ Հետևե՛ք ընթացիկ քայլի հրահանգին։',
          'warning'
        );
        return;
      }
    }

    // 2. Weighing Paper
    const distPaper = Math.hypot(
      pt.x - tools.weighPaper.x,
      pt.y - tools.weighPaper.y
    );
    if (distPaper < 46 && step === 'step1_transfer' && scaleHasPowder) {
      dragRef.current = {
        id: 'weighPaper',
        offsetX: pt.x - tools.weighPaper.x,
        offsetY: pt.y - tools.weighPaper.y,
      };
      setActiveDragId('weighPaper');
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // 3. Pipette
    const distPipette = Math.hypot(pt.x - tools.pipette.x, pt.y - tools.pipette.y);
    if (distPipette < 58) {
      if (step === 'step2_draw_acid' || step === 'step2_add_acid') {
        dragRef.current = {
          id: 'pipette',
          offsetX: pt.x - tools.pipette.x,
          offsetY: pt.y - tools.pipette.y,
        };
        setActiveDragId('pipette');
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      } else {
        onActionFeedback(
          step.startsWith('step1')
            ? 'Նախ ավարտե՛ք Քայլ 1-ը (կշռե՛ք 0,1 գ Na₂SO₃ և լցրե՛ք #1 փոսիկի մեջ)։'
            : 'Պիպետն արդեն օգտագործվել է Քայլ 2-ում։',
          'warning'
        );
        return;
      }
    }

    // 4. Transparent Cover
    const distCover = Math.hypot(pt.x - tools.cover.x, pt.y - tools.cover.y);
    if (distCover < 75 && step !== 'diffusing' && step !== 'completed') {
      if (step === 'step3_cover') {
        dragRef.current = {
          id: 'cover',
          offsetX: pt.x - tools.cover.x,
          offsetY: pt.y - tools.cover.y,
        };
        setActiveDragId('cover');
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      } else {
        onActionFeedback(
          'Կափարիչը տեղադրվում է Քայլ 3-ում՝ Na₂SO₃-ը և H₂SO₄-ը #1 փոսիկում ավելացնելուց հետո։',
          'warning'
        );
        return;
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getCanvasPoint(e.clientX, e.clientY);

    // Check if hovering over any well on the plate for live tooltip
    if (allSafetyReady && !dragRef.current.id) {
      let foundWell: number | null = null;
      const plate = getPlateGeometry();
      for (const w of PLATE_WELLS) {
        const coords = getWellScreenCoords(w.row, w.col);
        if (Math.hypot(pt.x - coords.x, pt.y - coords.y) <= plate.wellRadius + 6) {
          foundWell = w.id;
          break;
        }
      }
      if (foundWell !== hoveredWellId) {
        setHoveredWellId(foundWell);
      }
    }

    const activeId = dragRef.current.id;
    if (!activeId) return;

    const tool = toolsRef.current[activeId];
    tool.x = Math.max(40, Math.min(CANVAS_W - 40, pt.x - dragRef.current.offsetX));
    tool.y = Math.max(40, Math.min(CANVAS_H - 40, pt.y - dragRef.current.offsetY));

    const centerWell = getWellScreenCoords(1, 1);

    if (activeId === 'spatula') {
      if (
        step === 'step1_scoop' &&
        !spatulaLoadedFromJar &&
        Math.hypot(tool.x - 120, tool.y - 220) < 68
      ) {
        setSpatulaLoadedFromJar(true);
        onAdvanceStep('step1_weigh');
        onActionFeedback(
          'Շպատելով վերցրեցիք Na₂SO₃ սպիտակ փոշին։ Այժմ տարե՛ք այն կշեռքի թերթոնի վրա։',
          'success'
        );
      }

      if (
        step === 'step1_weigh' &&
        spatulaLoadedFromJar &&
        Math.hypot(tool.x - 290, tool.y - 315) < 68
      ) {
        setSpatulaLoadedFromJar(false);
        setScaleHasPowder(true);
        onAdvanceStep('step1_transfer');
        onActionFeedback(
          'Կշեռքը ցույց է տալիս 0,1 գ Na₂SO₃։ Այժմ տեղափոխե՛ք փոշին թերթոնից կենտրոնական #1 փոսիկի մեջ։',
          'success'
        );
      }

      if (
        step === 'step1_transfer' &&
        scaleHasPowder &&
        !spatulaLoadedFromScale &&
        Math.hypot(tool.x - 290, tool.y - 315) < 55
      ) {
        setSpatulaLoadedFromScale(true);
        setScaleHasPowder(false);
        onActionFeedback(
          'Վերցրեցիք 0,1 գ Na₂SO₃ փոշին թերթոնից։ Լցրե՛ք կենտրոնական #1 փոսիկի մեջ։',
          'info'
        );
      }

      if (
        step === 'step1_transfer' &&
        spatulaLoadedFromScale &&
        Math.hypot(tool.x - centerWell.x, tool.y - centerWell.y) < 58
      ) {
        setSpatulaLoadedFromScale(false);
        onAdvanceStep('step2_draw_acid');
        onActionFeedback(
          'Քայլ 1-ն ավարտված է. 0,1 գ Na₂SO₃ սպիտակ փոշին #1 փոսիկում է։ Այժմ վերցրե՛ք պիպետը և H₂SO₄ տարայից վերցրե՛ք լուծույթը։',
          'success'
        );
      }
    }

    if (activeId === 'weighPaper') {
      if (
        step === 'step1_transfer' &&
        scaleHasPowder &&
        Math.hypot(tool.x - centerWell.x, tool.y - centerWell.y) < 65
      ) {
        setScaleHasPowder(false);
        onAdvanceStep('step2_draw_acid');
        onActionFeedback(
          'Քայլ 1-ն ավարտված է. 0,1 գ Na₂SO₃ սպիտակ փոշին թերթոնից լցվեց #1 փոսիկի մեջ։ Այժմ վերցրե՛ք պիպետը։',
          'success'
        );
      }
    }

    if (activeId === 'pipette') {
      if (
        step === 'step2_draw_acid' &&
        !pipetteFilled &&
        Math.hypot(tool.x - 825, tool.y - 185) < 68
      ) {
        setPipetteFilled(true);
        onAdvanceStep('step2_add_acid');
        onActionFeedback(
          'Պիպետով վերցրեցիք 0,1 մլ 10% H₂SO₄ լուծույթ։ Կաթեցրե՛ք այն #1 փոսիկի մեջ (Na₂SO₃ փոշու վրա)։',
          'success'
        );
      }

      if (
        step === 'step2_add_acid' &&
        pipetteFilled &&
        Math.hypot(tool.x - centerWell.x, tool.y - centerWell.y) < 60
      ) {
        setPipetteFilled(false);
        dropsRef.current = [
          { x: centerWell.x, y: centerWell.y - 38, targetY: centerWell.y, vy: 2.5 },
          { x: centerWell.x - 3, y: centerWell.y - 54, targetY: centerWell.y, vy: 2.2 },
          { x: centerWell.x + 3, y: centerWell.y - 70, targetY: centerWell.y, vy: 2.0 },
        ];
        onAdvanceStep('step3_cover');
        onActionFeedback(
          'Քայլ 2-ն ավարտված է. 0,1 մլ H₂SO₄-ը կաթեցվեց Na₂SO₃-ի վրա։ Անմիջապես ծածկե՛ք սալիկը թափանցիկ կափարիչով (Քայլ 3)։',
          'success'
        );
      }
    }

    if (activeId === 'cover') {
      const plate = getPlateGeometry();
      if (
        step === 'step3_cover' &&
        Math.hypot(tool.x - plate.cx, tool.y - plate.cy) < 95
      ) {
        tool.x = plate.cx;
        tool.y = plate.cy;
        dragRef.current.id = null;
        setActiveDragId(null);
        onAdvanceStep('diffusing');
        onActionFeedback(
          'Քայլ 3-ն ավարտված է. Սալիկը ծածկված է կափարիչով։ Վայրկենաչափը միացավ, և սկսվեց SO₂ գազի 3D մասնիկների դիֆուզիան։',
          'success'
        );
      }
    }
  };

  const handlePointerUp = () => {
    const activeId = dragRef.current.id;
    if (!activeId) return;

    const tool = toolsRef.current[activeId];
    if (activeId !== 'cover' || (step !== 'diffusing' && step !== 'completed')) {
      tool.x = tool.homeX;
      tool.y = tool.homeY;
    }

    dragRef.current.id = null;
    setActiveDragId(null);
  };

  // Main 60fps 2D/3D Workbench Canvas Render Loop
  useEffect(() => {
    let animationFrameId: number;

    const render = (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // 1. Draw 3D Laboratory Room Background & Tiled Backsplash Wall
      const wallGrad = ctx.createLinearGradient(0, 0, 0, 175);
      wallGrad.addColorStop(0, '#0B1324');
      wallGrad.addColorStop(1, '#162238');
      ctx.fillStyle = wallGrad;
      ctx.fillRect(0, 0, CANVAS_W, 175);

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= CANVAS_W; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 175);
        ctx.stroke();
      }
      for (let y = 0; y <= 175; y += 35) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_W, y);
        ctx.stroke();
      }

      // 2. Draw 3D Laboratory Epoxy Workbench Surface
      const benchGrad = ctx.createLinearGradient(0, 165, 0, CANVAS_H);
      benchGrad.addColorStop(0, '#1E293B');
      benchGrad.addColorStop(0.04, '#0F172A');
      benchGrad.addColorStop(0.88, '#131C2E');
      benchGrad.addColorStop(0.95, '#090D16');
      benchGrad.addColorStop(1, '#05080F');
      ctx.fillStyle = benchGrad;
      ctx.fillRect(0, 168, CANVAS_W, CANVAS_H - 168);

      ctx.fillStyle = '#334155';
      ctx.fillRect(0, 162, CANVAS_W, 8);
      ctx.fillStyle = '#475569';
      ctx.fillRect(0, 160, CANVAS_W, 2);

      const spotGrad = ctx.createRadialGradient(
        CANVAS_W * 0.52,
        290,
        20,
        CANVAS_W * 0.52,
        290,
        420
      );
      spotGrad.addColorStop(0, 'rgba(56, 189, 248, 0.09)');
      spotGrad.addColorStop(0.6, 'rgba(30, 64, 175, 0.03)');
      spotGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = spotGrad;
      ctx.fillRect(0, 168, CANVAS_W, CANVAS_H - 168);

      // STRICT SAFETY GATE
      if (!allSafetyReady) {
        appearProgressRef.current = 0;

        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 2;
        ctx.strokeRect(180, 215, 600, 250);
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
        ctx.fillRect(182, 217, 596, 246);

        ctx.fillStyle = '#38BDF8';
        ctx.font = '700 20px "Noto Sans Armenian", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          'ԼԱԲՈՐԱՏՈՐ ՍԵՂԱՆԸ ԴԱՏԱՐԿ Է (ԱՆՎՏԱՆԳՈՒԹՅԱՆ ՓՈՒԼ)',
          CANVAS_W / 2,
          310
        );

        ctx.fillStyle = '#CBD5E1';
        ctx.font = '500 15px "Noto Sans Armenian", sans-serif';
        ctx.fillText(
          'Սեղմե՛ք ձախ վահանակի բոլոր 3 անվտանգության պատկերակների վրա',
          CANVAS_W / 2,
          345
        );
        ctx.fillText(
          '(Ակնոց, Ձեռնոց, Խալաթ), որպեսզի լաբորատոր սարքավորումները հայտնվեն սեղանին։',
          CANVAS_W / 2,
          372
        );
        ctx.restore();

        animationFrameId = requestAnimationFrame(render);
        return;
      }

      appearProgressRef.current = Math.min(1, appearProgressRef.current + 0.06);
      const hasPowderInWell1 =
        step === 'step2_draw_acid' ||
        step === 'step2_add_acid' ||
        step === 'step3_cover' ||
        step === 'diffusing' ||
        step === 'completed';
      const hasAcidInWell1 =
        step === 'step3_cover' || step === 'diffusing' || step === 'completed';
      const isCovered = step === 'diffusing' || step === 'completed';

      // ASSET 1: Na2SO3 Reagent Jar
      drawReagentJarNa2SO3(
        ctx,
        120,
        225,
        step === 'step1_scoop' && !spatulaLoadedFromJar,
        timestamp
      );

      // ASSET 2: Electronic Scale & Weighing Paper
      drawDigitalScale(
        ctx,
        290,
        345,
        scaleHasPowder ? '0,1 գ' : '0,0 գ',
        step === 'step1_weigh',
        timestamp
      );

      const wp = toolsRef.current.weighPaper;
      drawWeighingPaper(
        ctx,
        wp.x,
        wp.y,
        scaleHasPowder,
        step === 'step1_transfer' && scaleHasPowder,
        timestamp
      );

      // ASSET 3: 3x3 Multi-well Plate
      const plate = getPlateGeometry();
      drawMultiWellPlate3D(
        ctx,
        plate,
        getWellScreenCoords,
        hasPowderInWell1,
        hasAcidInWell1,
        isCovered,
        timeSeconds,
        hoveredWellId,
        timestamp,
        bubblesRef.current
      );

      // Falling Acid Drops
      if (dropsRef.current.length > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(186, 230, 253, 0.9)';
        for (let i = dropsRef.current.length - 1; i >= 0; i--) {
          const d = dropsRef.current[i];
          d.y += d.vy;
          d.vy += 0.35;
          ctx.beginPath();
          ctx.arc(d.x, d.y, 4.2, 0, Math.PI * 2);
          ctx.fill();
          if (d.y >= d.targetY) {
            dropsRef.current.splice(i, 1);
          }
        }
        ctx.restore();
      }

      // ASSET 4: 10% H2SO4 Reagent Bottle
      drawAcidBottleH2SO4(
        ctx,
        825,
        195,
        step === 'step2_draw_acid' && !pipetteFilled,
        timestamp
      );

      // ASSET 5: Transparent Cover Plate
      const cov = toolsRef.current.cover;
      if (!isCovered) {
        drawPlasticCover(
          ctx,
          cov.x,
          cov.y,
          135,
          96,
          step === 'step3_cover',
          false,
          timestamp
        );
      } else {
        drawPlasticCover(
          ctx,
          plate.cx,
          plate.cy - 6,
          plate.width + 18,
          plate.height + 16,
          false,
          true,
          timestamp
        );
      }

      // DRAGGABLE TOOL: Spatula
      const spat = toolsRef.current.spatula;
      drawSpatula3D(
        ctx,
        spat.x,
        spat.y,
        spatulaLoadedFromJar || spatulaLoadedFromScale,
        step === 'step1_scoop' ||
          step === 'step1_weigh' ||
          (step === 'step1_transfer' && spatulaLoadedFromScale),
        timestamp
      );

      // DRAGGABLE TOOL: Pipette
      const pip = toolsRef.current.pipette;
      drawPipette3D(
        ctx,
        pip.x,
        pip.y,
        pipetteFilled,
        step === 'step2_draw_acid' || step === 'step2_add_acid',
        timestamp
      );

      // Interactive Step Guide Ring
      drawGuidedTargetRing(
        ctx,
        step,
        spatulaLoadedFromJar,
        pipetteFilled,
        getWellScreenCoords(1, 1),
        plate,
        timestamp
      );

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [
    allSafetyReady,
    step,
    timeSeconds,
    cameraPreset,
    showMolecules,
    spatulaLoadedFromJar,
    scaleHasPowder,
    spatulaLoadedFromScale,
    pipetteFilled,
    hoveredWellId,
    getPlateGeometry,
    getWellScreenCoords,
  ]);

  // Compute hovered well details for floating HUD overlay
  const hoveredWellInfo = React.useMemo(() => {
    if (!hoveredWellId) return null;
    const well = PLATE_WELLS.find((w) => w.id === hoveredWellId);
    if (!well) return null;
    const hasPowder =
      step !== 'safety' &&
      step !== 'step1_scoop' &&
      step !== 'step1_weigh' &&
      step !== 'step1_transfer';
    const hasAcid =
      step === 'step3_cover' || step === 'diffusing' || step === 'completed';

    if (well.zone === 'center') {
      const cState = getCenterWellState(hasPowder, hasAcid, timeSeconds);
      return {
        title: `Փոսիկ #1 (Կենտրոնական ռեակցիոն փոսիկ)`,
        colorHex: cState.colorHex,
        status: cState.label,
        detail: cState.subtext,
      };
    }
    if (well.zone === 'near') {
      const nState = getNearWellState(timeSeconds);
      return {
        title: `Փոսիկ #${well.id} (Կենտրոնին մոտ՝ d = 1.0)`,
        colorHex: nState.colorHex,
        status: nState.label,
        detail: `Մեթիլ նարնջագույն · pH ≈ ${nState.pH}`,
      };
    }
    const fState = getFarWellState(timeSeconds);
    return {
      title: `Փոսիկ #${well.id} (Հեռավոր անկյունային՝ d = 1.41)`,
      colorHex: fState.colorHex,
      status: fState.label,
      detail: `Մեթիլ նարնջագույն · pH ≈ ${fState.pH}`,
    };
  }, [hoveredWellId, step, timeSeconds]);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-800 bg-[#0B111E] shadow-2xl">
      {/* Base 2D/3D Interactive Workbench Canvas */}
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`block w-full h-auto touch-none select-none ${
          !allSafetyReady
            ? 'cursor-not-allowed'
            : activeDragId
            ? 'cursor-grabbing'
            : 'cursor-grab'
        }`}
      />

      {/* Three.js WebGL Overlay Canvas for 3D SO2 Gas Particle Diffusion Spheres */}
      <canvas
        ref={threeCanvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="pointer-events-none absolute inset-0 block w-full h-full"
      />

      {/* Floating Well Inspector HUD when hovering any well */}
      {hoveredWellInfo && (
        <div className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-3 rounded-lg border border-white/15 bg-slate-950/85 px-3.5 py-2 backdrop-blur-md">
          <span
            className="h-5 w-5 shrink-0 rounded-full border border-white/30 shadow-inner"
            style={{ backgroundColor: hoveredWellInfo.colorHex }}
          />
          <div className="text-xs">
            <div className="font-semibold text-white">{hoveredWellInfo.title}</div>
            <div className="text-slate-300">
              {hoveredWellInfo.status} ·{' '}
              <span className="font-mono text-sky-300">{hoveredWellInfo.detail}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 3D Canvas Drawing Routines for Laboratory Equipment
// ============================================================================

function drawShadowOval(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  alpha = 0.45
) {
  ctx.save();
  const grad = ctx.createRadialGradient(x, y, 2, x, y, rx);
  grad.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawReagentJarNa2SO3(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  highlight: boolean,
  timestamp: number
) {
  ctx.save();
  drawShadowOval(ctx, x, y + 66, 52, 16, 0.55);

  if (highlight) {
    const pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.006);
    ctx.strokeStyle = `rgba(56, 189, 248, ${0.4 + pulse * 0.5})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(x, y + 58, 54, 18, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const jarW = 76;
  const jarH = 96;
  const left = x - jarW / 2;
  const top = y - 35;

  const glassGrad = ctx.createLinearGradient(left, top, left + jarW, top);
  glassGrad.addColorStop(0, 'rgba(148, 163, 184, 0.32)');
  glassGrad.addColorStop(0.2, 'rgba(226, 232, 240, 0.18)');
  glassGrad.addColorStop(0.8, 'rgba(148, 163, 184, 0.15)');
  glassGrad.addColorStop(1, 'rgba(71, 85, 105, 0.38)');

  ctx.fillStyle = glassGrad;
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.roundRect(left, top, jarW, jarH, 12);
  ctx.fill();
  ctx.stroke();

  const powderGrad = ctx.createLinearGradient(x, top + 48, x, top + jarH - 4);
  powderGrad.addColorStop(0, '#FFFFFF');
  powderGrad.addColorStop(0.6, '#E2E8F0');
  powderGrad.addColorStop(1, '#CBD5E1');
  ctx.fillStyle = powderGrad;

  ctx.beginPath();
  ctx.moveTo(left + 5, top + jarH - 8);
  ctx.quadraticCurveTo(x - 10, top + 46, x, top + 50);
  ctx.quadraticCurveTo(x + 14, top + 44, left + jarW - 5, top + jarH - 8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x - 14, top + 68, 3, 3);
  ctx.fillRect(x + 8, top + 64, 2.5, 2.5);
  ctx.fillRect(x - 2, top + 74, 3, 3);

  ctx.fillStyle = 'rgba(248, 250, 252, 0.94)';
  ctx.fillRect(left + 8, top + 18, jarW - 16, 28);
  ctx.strokeStyle = '#0284C7';
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 8, top + 18, jarW - 16, 28);

  ctx.fillStyle = '#0F172A';
  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Na₂SO₃', x, top + 34);
  ctx.fillStyle = '#475569';
  ctx.font = '600 8px "Noto Sans Armenian", sans-serif';
  ctx.fillText('ՍՊԻՏԱԿ ՓՈՇԻ', x, top + 43);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, top, jarW / 2 - 4, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#E2E8F0';
  ctx.font = '600 12px "Noto Sans Armenian", sans-serif';
  ctx.fillText('Տարա Na₂SO₃ փոշիով', x, y + 84);
  ctx.restore();
}

function drawDigitalScale(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  readingText: string,
  highlight: boolean,
  timestamp: number
) {
  ctx.save();
  drawShadowOval(ctx, x, y + 36, 78, 22, 0.6);

  if (highlight) {
    const pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.006);
    ctx.strokeStyle = `rgba(56, 189, 248, ${0.45 + pulse * 0.5})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(x - 72, y - 55, 144, 95, 14);
    ctx.stroke();
  }

  const bodyGrad = ctx.createLinearGradient(x - 64, y - 22, x + 64, y + 32);
  bodyGrad.addColorStop(0, '#334155');
  bodyGrad.addColorStop(0.5, '#1E293B');
  bodyGrad.addColorStop(1, '#0F172A');
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - 64, y - 22, 128, 54, 10);
  ctx.fill();
  ctx.stroke();

  const panGrad = ctx.createLinearGradient(x - 48, y - 30, x + 48, y - 30);
  panGrad.addColorStop(0, '#94A3B8');
  panGrad.addColorStop(0.5, '#F1F5F9');
  panGrad.addColorStop(1, '#64748B');
  ctx.fillStyle = panGrad;
  ctx.beginPath();
  ctx.ellipse(x, y - 26, 48, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.stroke();

  ctx.fillStyle = '#022C22';
  ctx.strokeStyle = '#10B981';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(x - 44, y - 6, 88, 26, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = readingText === '0,1 գ' ? '#34D399' : '#6EE7B7';
  ctx.font = '700 16px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(readingText, x, y + 12);

  ctx.fillStyle = '#E2E8F0';
  ctx.font = '600 12px "Noto Sans Armenian", sans-serif';
  ctx.fillText('Կշեռք և կշռման թերթոն', x, y + 52);
  ctx.restore();
}

function drawWeighingPaper(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hasPowder: boolean,
  highlight: boolean,
  timestamp: number
) {
  ctx.save();
  ctx.fillStyle = '#F8FAFC';
  ctx.strokeStyle = highlight
    ? `rgba(56, 189, 248, ${0.6 + 0.4 * Math.sin(timestamp * 0.008)})`
    : '#94A3B8';
  ctx.lineWidth = highlight ? 2.2 : 1.2;

  ctx.beginPath();
  ctx.moveTo(x, y - 13);
  ctx.lineTo(x + 34, y);
  ctx.lineTo(x, y + 13);
  ctx.lineTo(x - 34, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x - 30, y);
  ctx.lineTo(x + 30, y);
  ctx.moveTo(x, y - 11);
  ctx.lineTo(x, y + 11);
  ctx.stroke();

  if (hasPowder) {
    const pGrad = ctx.createRadialGradient(x, y - 2, 1, x, y, 12);
    pGrad.addColorStop(0, '#FFFFFF');
    pGrad.addColorStop(0.7, '#E2E8F0');
    pGrad.addColorStop(1, '#CBD5E1');
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.ellipse(x, y - 1, 13, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawAcidBottleH2SO4(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  highlight: boolean,
  timestamp: number
) {
  ctx.save();
  drawShadowOval(ctx, x, y + 66, 50, 16, 0.55);

  if (highlight) {
    const pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.006);
    ctx.strokeStyle = `rgba(56, 189, 248, ${0.45 + pulse * 0.5})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(x, y + 58, 54, 18, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const jarW = 74;
  const jarH = 94;
  const left = x - jarW / 2;
  const top = y - 34;

  const glassGrad = ctx.createLinearGradient(left, top, left + jarW, top);
  glassGrad.addColorStop(0, 'rgba(148, 163, 184, 0.30)');
  glassGrad.addColorStop(0.3, 'rgba(226, 232, 240, 0.15)');
  glassGrad.addColorStop(1, 'rgba(71, 85, 105, 0.38)');
  ctx.fillStyle = glassGrad;
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(left, top, jarW, jarH, 12);
  ctx.fill();
  ctx.stroke();

  const liqTop = top + 46;
  const liqGrad = ctx.createLinearGradient(left, liqTop, left, top + jarH);
  liqGrad.addColorStop(0, 'rgba(186, 230, 253, 0.28)');
  liqGrad.addColorStop(1, 'rgba(125, 211, 252, 0.38)');
  ctx.fillStyle = liqGrad;
  ctx.beginPath();
  ctx.roundRect(left + 3, liqTop, jarW - 6, jarH - 49, [0, 0, 10, 10]);
  ctx.fill();

  ctx.strokeStyle = 'rgba(224, 242, 254, 0.65)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(x, liqTop, jarW / 2 - 4, 5, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(254, 242, 242, 0.95)';
  ctx.fillRect(left + 6, top + 14, jarW - 12, 28);
  ctx.strokeStyle = '#EF4444';
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 6, top + 14, jarW - 12, 28);

  ctx.fillStyle = '#0F172A';
  ctx.font = '700 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('10% H₂SO₄', x, top + 29);
  ctx.fillStyle = '#B91C1C';
  ctx.font = '600 8px "Noto Sans Armenian", sans-serif';
  ctx.fillText('ԱՆԳՈՒՅՆ ՀԵՂՈՒԿ', x, top + 39);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, top, jarW / 2 - 8, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#E2E8F0';
  ctx.font = '600 12px "Noto Sans Armenian", sans-serif';
  ctx.fillText('Տարա 10% H₂SO₄ լուծույթով', x, y + 80);
  ctx.restore();
}

function drawSpatula3D(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hasPowder: boolean,
  isActiveStep: boolean,
  timestamp: number
) {
  ctx.save();
  drawShadowOval(ctx, x, y + 22, 46, 10, 0.45);

  if (isActiveStep) {
    const pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.007);
    ctx.strokeStyle = `rgba(56, 189, 248, ${0.4 + pulse * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - 56, y - 24, 112, 46, 12);
    ctx.stroke();
  }

  ctx.translate(x, y);
  ctx.rotate(-0.22);

  const handleGrad = ctx.createLinearGradient(-48, -6, -5, 6);
  handleGrad.addColorStop(0, '#0284C7');
  handleGrad.addColorStop(1, '#0369A1');
  ctx.fillStyle = handleGrad;
  ctx.beginPath();
  ctx.roundRect(-48, -6, 44, 12, 5);
  ctx.fill();

  const steelGrad = ctx.createLinearGradient(-4, -5, 48, 5);
  steelGrad.addColorStop(0, '#94A3B8');
  steelGrad.addColorStop(0.5, '#F8FAFC');
  steelGrad.addColorStop(1, '#CBD5E1');
  ctx.fillStyle = steelGrad;
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-4, -3.5, 38, 7, 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(38, 0, 12, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (hasPowder) {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(38, -2, 10, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.stroke();
  }

  ctx.rotate(0.22);
  ctx.fillStyle = '#CBD5E1';
  ctx.font = '600 11px "Noto Sans Armenian", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(hasPowder ? 'Շպատել (Na₂SO₃ փոշով)' : 'Շպատել (Drag)', 0, 34);
  ctx.restore();
}

function drawPipette3D(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isFilled: boolean,
  isActiveStep: boolean,
  timestamp: number
) {
  ctx.save();
  drawShadowOval(ctx, x, y + 40, 34, 10, 0.45);

  if (isActiveStep) {
    const pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.007);
    ctx.strokeStyle = `rgba(56, 189, 248, ${0.4 + pulse * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - 36, y - 50, 72, 98, 12);
    ctx.stroke();
  }

  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(226, 232, 240, 0.28)';
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.75)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-6, -12);
  ctx.lineTo(-4, 24);
  ctx.lineTo(-1.5, 36);
  ctx.lineTo(1.5, 36);
  ctx.lineTo(4, 24);
  ctx.lineTo(6, -12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (isFilled) {
    ctx.fillStyle = 'rgba(125, 211, 252, 0.72)';
    ctx.beginPath();
    ctx.moveTo(-4.8, 2);
    ctx.lineTo(-3.8, 24);
    ctx.lineTo(-1.2, 35);
    ctx.lineTo(1.2, 35);
    ctx.lineTo(3.8, 24);
    ctx.lineTo(4.8, 2);
    ctx.closePath();
    ctx.fill();
  }

  const bulbGrad = ctx.createRadialGradient(-3, -26, 2, 0, -24, 16);
  bulbGrad.addColorStop(0, '#FB7185');
  bulbGrad.addColorStop(0.6, '#E11D48');
  bulbGrad.addColorStop(1, '#881337');
  ctx.fillStyle = bulbGrad;
  ctx.beginPath();
  ctx.ellipse(0, -25, 11, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#F43F5E';
  ctx.fillRect(-8, -14, 16, 5);

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '600 11px "Noto Sans Armenian", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(isFilled ? 'Պիպետ (0,1 մլ H₂SO₄)' : 'Պիպետ (Drag)', 0, 52);
  ctx.restore();
}

function drawPlasticCover(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  highlight: boolean,
  isPlacedOnPlate: boolean,
  timestamp: number
) {
  ctx.save();
  if (!isPlacedOnPlate) {
    drawShadowOval(ctx, x, y + h / 2 + 8, w * 0.5, 12, 0.45);
  }

  const left = x - w / 2;
  const top = y - h / 2;

  const coverGrad = ctx.createLinearGradient(left, top, left + w, top + h);
  coverGrad.addColorStop(0, 'rgba(224, 242, 254, 0.20)');
  coverGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.07)');
  coverGrad.addColorStop(1, 'rgba(186, 230, 253, 0.18)');

  ctx.fillStyle = coverGrad;
  ctx.strokeStyle = highlight
    ? `rgba(56, 189, 248, ${0.55 + 0.45 * Math.sin(timestamp * 0.008)})`
    : 'rgba(224, 242, 254, 0.7)';
  ctx.lineWidth = highlight ? 2.5 : 1.8;

  ctx.beginPath();
  ctx.roundRect(left, top, w, h, 10);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(left + 18, top + 8);
  ctx.lineTo(left + 48, top + h - 8);
  ctx.stroke();

  if (!isPlacedOnPlate) {
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '600 12px "Noto Sans Armenian", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Թափանցիկ կափարիչ (Drag)', x, y + h / 2 + 20);
  } else {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
    ctx.font = '600 11px "Noto Sans Armenian", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Կափարիչով հերմետիկ ծածկված է', left + w - 10, top + 16);
  }
  ctx.restore();
}

function drawMultiWellPlate3D(
  ctx: CanvasRenderingContext2D,
  plate: {
    cx: number;
    cy: number;
    width: number;
    height: number;
    tiltY: number;
    depth3D: number;
    wellRadius: number;
  },
  getWellScreenCoords: (
    row: number,
    col: number
  ) => { x: number; y: number; scale: number },
  hasPowderInWell1: boolean,
  hasAcidInWell1: boolean,
  isCovered: boolean,
  timeSeconds: number,
  hoveredWellId: number | null,
  timestamp: number,
  bubbles: BubbleParticle[]
) {
  ctx.save();
  const left = plate.cx - plate.width / 2;
  const top = plate.cy - plate.height / 2;

  ctx.fillStyle = 'rgba(2, 6, 23, 0.65)';
  ctx.beginPath();
  ctx.roundRect(
    left - 6,
    top + plate.depth3D + 6,
    plate.width + 12,
    plate.height,
    18
  );
  ctx.fill();

  const sideGrad = ctx.createLinearGradient(
    left,
    top + plate.height,
    left + plate.width,
    top + plate.height + plate.depth3D
  );
  sideGrad.addColorStop(0, 'rgba(148, 163, 184, 0.42)');
  sideGrad.addColorStop(0.5, 'rgba(203, 213, 225, 0.28)');
  sideGrad.addColorStop(1, 'rgba(100, 116, 139, 0.48)');
  ctx.fillStyle = sideGrad;
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(
    left,
    top + plate.depth3D,
    plate.width,
    plate.height,
    16
  );
  ctx.fill();
  ctx.stroke();

  const plateGrad = ctx.createLinearGradient(
    left,
    top,
    left + plate.width,
    top + plate.height
  );
  plateGrad.addColorStop(0, 'rgba(241, 245, 249, 0.22)');
  plateGrad.addColorStop(0.5, 'rgba(203, 213, 225, 0.14)');
  plateGrad.addColorStop(1, 'rgba(148, 163, 184, 0.25)');
  ctx.fillStyle = plateGrad;
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.68)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(left, top, plate.width, plate.height, 16);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left + plate.width / 3, top + 8);
  ctx.lineTo(left + plate.width / 3, top + plate.height - 8);
  ctx.moveTo(left + (plate.width * 2) / 3, top + 8);
  ctx.lineTo(left + (plate.width * 2) / 3, top + plate.height - 8);
  ctx.moveTo(left + 8, top + plate.height / 3);
  ctx.lineTo(left + plate.width - 8, top + plate.height / 3);
  ctx.moveTo(left + 8, top + (plate.height * 2) / 3);
  ctx.lineTo(left + plate.width - 8, top + (plate.height * 2) / 3);
  ctx.stroke();

  const nearState = getNearWellState(timeSeconds);
  const farState = getFarWellState(timeSeconds);

  for (const well of PLATE_WELLS) {
    const pos = getWellScreenCoords(well.row, well.col);
    const rx = plate.wellRadius * pos.scale;
    const ry = plate.wellRadius * plate.tiltY * pos.scale;
    const isHovered = hoveredWellId === well.id;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.strokeStyle = isHovered
      ? '#38BDF8'
      : well.zone === 'center'
      ? 'rgba(56, 189, 248, 0.7)'
      : 'rgba(226, 232, 240, 0.55)';
    ctx.lineWidth = isHovered ? 2.6 : 1.6;
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const cavityOffset = 5 * (1 - plate.tiltY * 0.5);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + cavityOffset, rx * 0.88, ry * 0.88, 0, 0, Math.PI * 2);
    ctx.stroke();

    if (well.zone === 'center') {
      if (hasPowderInWell1) {
        const powderAlpha = hasAcidInWell1
          ? Math.max(0.25, 1 - timeSeconds / 260)
          : 1;
        ctx.fillStyle = `rgba(248, 250, 252, ${powderAlpha})`;
        ctx.beginPath();
        ctx.ellipse(
          pos.x,
          pos.y + 2,
          rx * 0.58 * powderAlpha + 4,
          ry * 0.58 * powderAlpha + 3,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      if (hasAcidInWell1) {
        const acidGrad = ctx.createRadialGradient(
          pos.x - 4,
          pos.y - 4,
          2,
          pos.x,
          pos.y,
          rx * 0.86
        );
        acidGrad.addColorStop(0, 'rgba(224, 242, 254, 0.55)');
        acidGrad.addColorStop(1, 'rgba(125, 211, 252, 0.35)');
        ctx.fillStyle = acidGrad;
        ctx.beginPath();
        ctx.ellipse(pos.x, pos.y + 1, rx * 0.85, ry * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();

        if (timeSeconds < 300) {
          if (bubbles.length < 18 && Math.random() < 0.45) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * (rx * 0.55);
            bubbles.push({
              x: pos.x + Math.cos(angle) * dist,
              y: pos.y + Math.sin(angle) * (dist * plate.tiltY),
              r: 1.8 + Math.random() * 2.8,
              vy: 0.35 + Math.random() * 0.55,
              alpha: 0.9,
            });
          }

          ctx.save();
          for (let i = bubbles.length - 1; i >= 0; i--) {
            const b = bubbles[i];
            b.y -= b.vy;
            b.alpha -= 0.022;
            if (b.alpha <= 0) {
              bubbles.splice(i, 1);
              continue;
            }
            ctx.fillStyle = `rgba(255, 255, 255, ${b.alpha})`;
            ctx.strokeStyle = `rgba(186, 230, 253, ${b.alpha})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    } else {
      const wellColor = well.zone === 'near' ? nearState.colorHex : farState.colorHex;

      ctx.fillStyle = wellColor;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y + 1.5, rx * 0.85, ry * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();

      const shineGrad = ctx.createRadialGradient(
        pos.x - rx * 0.28,
        pos.y - ry * 0.28,
        1,
        pos.x,
        pos.y,
        rx * 0.85
      );
      shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
      shineGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.12)');
      shineGrad.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
      ctx.fillStyle = shineGrad;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y + 1.5, rx * 0.85, ry * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.beginPath();
    ctx.roundRect(pos.x - 13, pos.y + ry - 7, 26, 15, 4);
    ctx.fill();

    ctx.fillStyle = well.zone === 'center' ? '#38BDF8' : '#F8FAFC';
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`#${well.id}`, pos.x, pos.y + ry + 4);
  }

  // Concentric Diffusion Wavefront Rings under the cover
  if (isCovered && timeSeconds > 0) {
    const centerPos = getWellScreenCoords(1, 1);
    const maxRadius = Math.min(
      plate.width * 0.52,
      22 + (plate.width * 0.48) * Math.pow(Math.min(1, timeSeconds / 180), 0.65)
    );

    const cloudGrad = ctx.createRadialGradient(
      centerPos.x,
      centerPos.y,
      4,
      centerPos.x,
      centerPos.y,
      maxRadius
    );
    cloudGrad.addColorStop(0, 'rgba(226, 232, 240, 0.24)');
    cloudGrad.addColorStop(0.5, 'rgba(148, 163, 184, 0.14)');
    cloudGrad.addColorStop(1, 'rgba(148, 163, 184, 0)');

    ctx.fillStyle = cloudGrad;
    ctx.beginPath();
    ctx.ellipse(
      centerPos.x,
      centerPos.y,
      maxRadius,
      maxRadius * plate.tiltY,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    for (let ring = 0; ring < 3; ring++) {
      const phase = ((timestamp * 0.00045 + ring / 3) % 1) * maxRadius;
      const ringAlpha = (1 - phase / maxRadius) * 0.32;
      ctx.strokeStyle = `rgba(226, 232, 240, ${ringAlpha})`;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.ellipse(
        centerPos.x,
        centerPos.y,
        phase,
        phase * plate.tiltY,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  ctx.fillStyle = '#E2E8F0';
  ctx.font = '600 13px "Noto Sans Armenian", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    'Բազմափոսիկ սալիկ (3×3) · #2,4,6,8՝ մոտ, #3,5,7,9՝ հեռու',
    plate.cx,
    top + plate.height + plate.depth3D + 26
  );

  ctx.restore();
}

function drawGuidedTargetRing(
  ctx: CanvasRenderingContext2D,
  step: LabStep,
  spatulaLoadedFromJar: boolean,
  pipetteFilled: boolean,
  centerWellPos: { x: number; y: number },
  plate: { cx: number; cy: number },
  timestamp: number
) {
  let target: { x: number; y: number; label: string } | null = null;

  if (step === 'step1_scoop' && !spatulaLoadedFromJar) {
    target = { x: 120, y: 195, label: '1. Շպատելը տարե՛ք Na₂SO₃ տարայի մեջ' };
  } else if (step === 'step1_weigh') {
    target = { x: 290, y: 315, label: '2. Փոշին դրե՛ք կշեռքի թերթոնի վրա (0,1 գ)' };
  } else if (step === 'step1_transfer') {
    target = {
      x: centerWellPos.x,
      y: centerWellPos.y,
      label: '3. Լցրե՛ք 0,1 գ Na₂SO₃-ը #1 փոսիկի մեջ',
    };
  } else if (step === 'step2_draw_acid' && !pipetteFilled) {
    target = { x: 825, y: 165, label: '4. Պիպետով վերցրե՛ք 10% H₂SO₄' };
  } else if (step === 'step2_add_acid') {
    target = {
      x: centerWellPos.x,
      y: centerWellPos.y,
      label: '5. Կաթեցրե՛ք 0,1 մլ H₂SO₄ #1 փոսիկի մեջ',
    };
  } else if (step === 'step3_cover') {
    target = {
      x: plate.cx,
      y: plate.cy,
      label: '6. Ծածկե՛ք սալիկը թափանցիկ կափարիչով',
    };
  }

  if (!target) return;

  ctx.save();
  const pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.008);
  const r = 28 + pulse * 7;

  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.arc(target.x, target.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = '600 12px "Noto Sans Armenian", sans-serif';
  const textWidth = ctx.measureText(target.label).width;
  const boxW = textWidth + 24;
  const boxX = Math.max(12, Math.min(CANVAS_W - boxW - 12, target.x - boxW / 2));
  const boxY = Math.max(16, target.y - r - 36);

  ctx.fillStyle = 'rgba(2, 132, 199, 0.92)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, 26, 6);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText(target.label, boxX + boxW / 2, boxY + 17);
  ctx.restore();
}
