// Bubble Dream: you live inside soap bubbles floating on a dreamy sky. Blow a
// kiss for another bubble (another you); touch one — with a tap, or your hand
// in front of the camera — and it pops.
//
//   renderOrder −999  the camera (App.tsx's VideoBackground) — covered
//   renderOrder 0     the sky (opaque: the camera shows only inside bubbles)
//   renderOrder 100+  bubbles — each frames you (head and shoulders, cut out
//                     by the person mask) on the sky seen through it
//   renderOrder 200   droplets from pops
//   renderOrder 210   your hands, as dots of light (you can't see them
//                     otherwise: the room is gone)
//
// All layers draw straight to clip space. Coordinates are design px (the
// 1280-tall design screen, x right, y down); tracker points (centre origin,
// y up, already mirrored by the SDK) map straight onto it because the feed
// fills the screen, and so do the camera and mask textures (screen UVs).
import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  type Mesh,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  type Texture,
} from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { usePersonMaskTexture, XRModel } from "@vincentt-xr/sdk";
import {
  useXRCameraTexture,
  useXRModelNode,
  type XRModelNodeHandTracking,
} from "@vincentt-xr/sdk/low-level";
import {
  getFaceActionValue,
  HandTracker,
  useFaceInfo,
} from "@vincentt-xr/sdk/tracking";

import { BUBBLE, FRAME, HAND_DOTS, PERSON, POP, SKY } from "./config";
import { createKiss, stepKiss } from "./kiss";
import {
  bubbleFrag,
  bubbleVert,
  dotFrag,
  dropletFrag,
  fullVert,
  pointsVert,
  skyFrag,
} from "./shaders";
import { play, playPop } from "./sound";
import { dreamState } from "./state";
import {
  type Bubble,
  blowBubble,
  createWorld,
  popAt,
  type Pt,
  radius,
  stepWorld,
} from "./world";

const DESIGN_H = 1280;
/** Bubble meshes: room for the most bubbles plus a few still bursting. */
const POOL = BUBBLE.max + 4;
const DROPLETS = 260;
const HAND_POINTS = 42;
const TIPS = new Set([4, 8, 12, 16, 20]);

const skyUniforms = () => ({
  uTop: { value: new Color(SKY.top) },
  uMid: { value: new Color(SKY.mid) },
  uBottom: { value: new Color(SKY.bottom) },
  uCloud: { value: new Color(SKY.cloud) },
  uAspect: { value: 1 },
  uTime: { value: 0 },
});

const makePoints = (n: number, fragmentShader: string) => {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(n * 3), 3),
  );
  geometry.setAttribute(
    "color",
    new BufferAttribute(new Float32Array(n * 3), 3),
  );
  geometry.setAttribute("size", new BufferAttribute(new Float32Array(n), 1));
  geometry.setAttribute("alpha", new BufferAttribute(new Float32Array(n), 1));
  const material = new ShaderMaterial({
    uniforms: { uDesign: { value: [1, 1] }, uPxScale: { value: 1 } },
    vertexShader: pointsVert,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  return { geometry, material };
};

const rand = ([a, b]: readonly [number, number]) => a + Math.random() * (b - a);

export const Dream = () => {
  const { gl, size, events } = useThree();
  const cameraTexture = useXRCameraTexture() as Texture | null;
  const { texture: maskTexture } = usePersonMaskTexture();
  const hands = useXRModelNode<XRModelNodeHandTracking>(XRModel.HAND_TRACKER);
  const face = useFaceInfo({ active: true });

  const aspect = size.width / Math.max(1, size.height);
  const designW = DESIGN_H * aspect;

  const sky = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: skyUniforms(),
        vertexShader: fullVert,
        fragmentShader: skyFrag,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );
  const bubbles = useMemo(() => {
    const geometry = new PlaneGeometry(1, 1);
    const materials = Array.from(
      { length: POOL },
      () =>
        new ShaderMaterial({
          uniforms: {
            ...skyUniforms(),
            uCenter: { value: [0, 0] },
            uHalf: { value: [0, 0] },
            uScreen: { value: [0.5, 0.5] },
            uScreenHalf: { value: [0.1, 0.1] },
            uPhase: { value: 0 },
            uPop: { value: 0 },
            uSquash: { value: 0 },
            uSquashDir: { value: [1, 0] },
            uCamera: { value: null },
            uMask: { value: null },
            uCameraLinear: { value: 0 },
            uHasMask: { value: 0 },
            uCrop: { value: [0.5, 0.5] },
            uCropHalf: { value: [0.2, 0.2] },
            uEdge: { value: [...PERSON.edge] },
            uErode: { value: [0, 0] },
          },
          vertexShader: bubbleVert,
          fragmentShader: bubbleFrag,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        }),
    );
    return { geometry, materials, meshes: [] as (Mesh | null)[] };
  }, []);
  const droplets = useMemo(() => {
    const p = makePoints(DROPLETS, dropletFrag);
    return {
      ...p,
      vel: new Float32Array(DROPLETS * 2),
      life: new Float32Array(DROPLETS),
      maxLife: new Float32Array(DROPLETS),
      base: new Float32Array(DROPLETS),
      cursor: 0,
    };
  }, []);
  const dots = useMemo(() => makePoints(HAND_POINTS, dotFrag), []);
  const live = useMemo(
    () => ({
      kiss: createKiss(),
      /** The crop (screen uv centre, radius in design px), smoothed. */
      crop: { x: FRAME.fallback.x, y: FRAME.fallback.y, r: 0 },
      slots: new Map<number, number>(),
    }),
    [],
  );

  useEffect(
    () => () => {
      sky.dispose();
      bubbles.geometry.dispose();
      for (const m of bubbles.materials) m.dispose();
      for (const p of [droplets, dots]) {
        p.geometry.dispose();
        p.material.dispose();
      }
    },
    [sky, bubbles, droplets, dots],
  );

  // Taps pop bubbles (the HUD's buttons excepted).
  const source = events.connected as HTMLElement | undefined;
  useEffect(() => {
    const el = source;
    if (!el) return undefined;
    const down = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.("button")) return;
      const r = el.getBoundingClientRect();
      const k = DESIGN_H / Math.max(1, r.height);
      dreamState.taps.push({
        x: (e.clientX - r.left) * k,
        y: (e.clientY - r.top) * k,
      });
    };
    el.addEventListener("pointerdown", down);
    return () => el.removeEventListener("pointerdown", down);
  }, [source]);

  // Dev hook for inspecting the dream live.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __dream?: unknown }).__dream = {
        state: dreamState,
        live,
        bubbles,
        sky,
      };
    }
  }, [live, bubbles, sky]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const t = state.clock.elapsedTime;
    const W = designW;
    const H = DESIGN_H;
    if (!dreamState.world) dreamState.world = createWorld(W, H, Math.random);
    const { world } = dreamState;

    // Hands: every landmark, in design px.
    const handPts: Pt[] = [];
    const tipFlags: boolean[] = [];
    for (const hand of hands?.hands ?? []) {
      const pts = hand.coordinates;
      if (!pts || pts.length < 21) continue;
      pts.forEach((p, i) => {
        if (handPts.length >= HAND_POINTS) return;
        handPts.push({ x: (p.x * 0.5 + 0.5) * W, y: (0.5 - p.y * 0.5) * H });
        tipFlags.push(TIPS.has(i));
      });
    }

    // The face: the crop that frames you in every bubble, and the kiss.
    dreamState.face = !!face;
    const pout = face ? getFaceActionValue(face, "mouthPout") : null;
    dreamState.pout = pout ?? 0;
    let kissed = stepKiss(live.kiss, pout, dt);
    if (dreamState.kissRequested) {
      dreamState.kissRequested = false;
      kissed = true;
    }
    const target = face
      ? {
          x: face.bounds.centerX,
          y: 1 - (face.bounds.centerY + face.bounds.height * FRAME.down),
          r: face.bounds.height * H * FRAME.zoom,
        }
      : { ...FRAME.fallback, r: FRAME.fallback.r * H };
    const kc = live.crop.r === 0 ? 1 : 1 - Math.exp(-FRAME.follow * dt);
    live.crop.x += (target.x - live.crop.x) * kc;
    live.crop.y += (target.y - live.crop.y) * kc;
    live.crop.r += (target.r - live.crop.r) * kc;
    // Keep the crop's top inside the frame (a face high in the frame would
    // otherwise come out flat-topped).
    live.crop.y = Math.min(live.crop.y, 1 - (live.crop.r / H) * FRAME.topRoom);

    const burst = (b: Bubble) => {
      playPop();
      const pos = droplets.geometry.getAttribute("position") as BufferAttribute;
      const col = droplets.geometry.getAttribute("color") as BufferAttribute;
      const c = new Color();
      const r = radius(b);
      for (let k = 0; k < POP.droplets; k++) {
        const i = droplets.cursor;
        droplets.cursor = (i + 1) % DROPLETS;
        const a = Math.random() * Math.PI * 2;
        const v = rand(POP.speed);
        pos.setXYZ(
          i,
          b.pos.x + Math.cos(a) * r * 0.95,
          b.pos.y + Math.sin(a) * r * 0.95,
          0,
        );
        droplets.vel[i * 2] = Math.cos(a) * v;
        droplets.vel[i * 2 + 1] = Math.sin(a) * v;
        const life = rand(POP.life);
        droplets.life[i] = life;
        droplets.maxLife[i] = life;
        droplets.base[i] = rand(POP.size);
        c.setHSL(Math.random(), 0.8, 0.75, SRGBColorSpace);
        col.setXYZ(i, c.r, c.g, c.b);
      }
      col.needsUpdate = true;
    };

    if (kissed) {
      const { popped } = blowBubble(world, W, H, Math.random, handPts);
      popped.forEach(burst);
      play("bloop");
    }
    // Touches: taps, and any hand landmark over a bubble.
    for (const p of dreamState.taps.splice(0)) popAt(world, p).forEach(burst);
    for (const p of handPts) popAt(world, p).forEach(burst);

    const ev = stepWorld(world, dt, t, W, H, Math.random);
    if (ev.risen) play("bloop");

    // Bubbles → meshes.
    const camLinear = cameraTexture?.colorSpace === SRGBColorSpace ? 1 : 0;
    const { erode } = PERSON;
    const used = new Set<number>();
    const ids = new Set(world.bubbles.map((b) => b.id));
    for (const id of [...live.slots.keys()])
      if (!ids.has(id)) live.slots.delete(id);
    for (const slot of live.slots.values()) used.add(slot);
    world.bubbles.forEach((b, order) => {
      let slot = live.slots.get(b.id);
      if (slot === undefined) {
        slot = [...Array(POOL).keys()].find((k) => !used.has(k));
        if (slot === undefined) return;
        live.slots.set(b.id, slot);
        used.add(slot);
      }
      const mesh = bubbles.meshes[slot];
      if (!mesh) return;
      const u = bubbles.materials[slot].uniforms;
      const r = Math.max(1, radius(b));
      u.uCenter.value = [(b.pos.x / W) * 2 - 1, 1 - (b.pos.y / H) * 2];
      u.uHalf.value = [(r / W) * 2, (r / H) * 2];
      u.uScreen.value = [b.pos.x / W, 1 - b.pos.y / H];
      u.uScreenHalf.value = [r / W, r / H];
      u.uPhase.value = b.phase;
      u.uPop.value = b.pop < 0 ? 0 : Math.max(0.001, b.pop / POP.time);
      u.uSquash.value = b.squash;
      u.uSquashDir.value = [b.squashDir.x, -b.squashDir.y];
      u.uTime.value = t;
      u.uAspect.value = aspect;
      u.uCamera.value = cameraTexture;
      u.uMask.value = maskTexture;
      u.uHasMask.value = maskTexture && cameraTexture ? 1 : 0;
      u.uCameraLinear.value = camLinear;
      u.uCrop.value = [live.crop.x, live.crop.y];
      u.uCropHalf.value = [live.crop.r / W, live.crop.r / H];
      u.uErode.value = [erode / aspect, erode];
      mesh.visible = true;
      mesh.renderOrder = 100 + order;
    });
    bubbles.meshes.forEach((m, k) => {
      if (m && !used.has(k)) m.visible = false;
    });

    sky.uniforms.uTime.value = t;
    sky.uniforms.uAspect.value = aspect;

    // Droplets fly out, slow down, fade.
    const pxScale = (size.height * gl.getPixelRatio()) / DESIGN_H;
    for (const p of [droplets, dots]) {
      p.material.uniforms.uDesign.value = [W, H];
      p.material.uniforms.uPxScale.value = pxScale;
    }
    const dpos = droplets.geometry.getAttribute("position") as BufferAttribute;
    const dsz = droplets.geometry.getAttribute("size") as BufferAttribute;
    const dal = droplets.geometry.getAttribute("alpha") as BufferAttribute;
    const drag = Math.exp(-3.2 * dt);
    for (let i = 0; i < DROPLETS; i++) {
      if (droplets.life[i] <= 0) {
        dal.setX(i, 0);
        continue;
      }
      droplets.life[i] -= dt;
      droplets.vel[i * 2] *= drag;
      droplets.vel[i * 2 + 1] = droplets.vel[i * 2 + 1] * drag + 140 * dt;
      dpos.setXYZ(
        i,
        dpos.getX(i) + droplets.vel[i * 2] * dt,
        dpos.getY(i) + droplets.vel[i * 2 + 1] * dt,
        0,
      );
      const k = Math.max(0, droplets.life[i] / droplets.maxLife[i]);
      dal.setX(i, Math.min(1, k * 1.6));
      dsz.setX(i, droplets.base[i] * (0.5 + 0.5 * k));
    }
    dpos.needsUpdate = true;
    dsz.needsUpdate = true;
    dal.needsUpdate = true;

    // Hand dots.
    const hpos = dots.geometry.getAttribute("position") as BufferAttribute;
    const hcol = dots.geometry.getAttribute("color") as BufferAttribute;
    const hsz = dots.geometry.getAttribute("size") as BufferAttribute;
    const hal = dots.geometry.getAttribute("alpha") as BufferAttribute;
    for (let i = 0; i < HAND_POINTS; i++) {
      const p = handPts[i];
      if (!p) {
        hal.setX(i, 0);
        continue;
      }
      hpos.setXYZ(i, p.x, p.y, 0);
      hcol.setXYZ(i, 0.42, 0.25, 1);
      hsz.setX(i, tipFlags[i] ? HAND_DOTS.tip : HAND_DOTS.size);
      hal.setX(i, tipFlags[i] ? 1 : 0.75);
    }
    for (const a of [hpos, hcol, hsz, hal]) a.needsUpdate = true;
  });

  return (
    <>
      <mesh name="sky" material={sky} renderOrder={0} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      {bubbles.materials.map((material, k) => (
        <mesh
          // eslint-disable-next-line react/no-array-index-key -- a fixed pool
          key={k}
          name={`bubble${k}`}
          ref={(m) => {
            bubbles.meshes[k] = m;
          }}
          geometry={bubbles.geometry}
          material={material}
          visible={false}
          frustumCulled={false}
        />
      ))}
      <points
        name="droplets"
        geometry={droplets.geometry}
        material={droplets.material}
        renderOrder={200}
        frustumCulled={false}
      />
      <points
        name="handDots"
        geometry={dots.geometry}
        material={dots.material}
        renderOrder={210}
        frustumCulled={false}
      />
    </>
  );
};

export const DreamScene = () => (
  <>
    <HandTracker />
    <Dream />
  </>
);
