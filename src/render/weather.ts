import * as THREE from "three";
import type { WeatherKind } from "../season";

const MAX_PARTICLES = 36;

interface FallingKindParams {
  scaleX: number;
  scaleY: number;
  fallSpeedMin: number; // 世界單位／秒
  fallSpeedMax: number;
  driftAmount: number; // 左右搖擺幅度（世界單位）
  opacity: number;
  spin: boolean; // 落葉會慢慢轉，雨/雪不會
}

const KIND_PARAMS: Record<Exclude<WeatherKind, "clear">, FallingKindParams> = {
  rain: { scaleX: 0.12, scaleY: 0.9, fallSpeedMin: 9, fallSpeedMax: 13, driftAmount: 0.15, opacity: 0.55, spin: false },
  snow: { scaleX: 0.4, scaleY: 0.4, fallSpeedMin: 1.2, fallSpeedMax: 2.1, driftAmount: 0.5, opacity: 0.92, spin: false },
  leaves: { scaleX: 0.32, scaleY: 0.32, fallSpeedMin: 1.1, fallSpeedMax: 1.9, driftAmount: 0.6, opacity: 0.9, spin: true },
};

function createRainTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 8;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#bfe0f5";
  ctx.fillRect(0, 0, 2, 8);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

function createSnowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(3, 0, 2, 8); // 十字主幹
  ctx.fillRect(0, 3, 8, 2);
  ctx.fillRect(1, 1, 2, 2); // 四角小尖角，看起來更像雪花而不是純十字
  ctx.fillRect(5, 1, 2, 2);
  ctx.fillRect(1, 5, 2, 2);
  ctx.fillRect(5, 5, 2, 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

function createLeafTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#d98a3d";
  ctx.fillRect(2, 1, 4, 1);
  ctx.fillRect(1, 2, 6, 3);
  ctx.fillRect(2, 5, 4, 1);
  ctx.fillStyle = "#b96a2c";
  ctx.fillRect(3, 3, 2, 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

interface WeatherParticle {
  sprite: THREE.Sprite;
  seedX: number; // 0..1，決定水平起始位置與（配合 KIND_PARAMS 範圍）落下速度，同一顆粒子重複使用不用另外存速度種子
  seedPhase: number; // 0..2π，左右搖擺與旋轉的相位，讓每顆粒子節奏錯開
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * 天氣粒子層：固定大小的粒子池（雨滴/雪花/落葉共用同一批 sprite，只是切換貼圖跟參數），
 * 位置永遠是 sim.time 的函式（跟雲朵飄移、水池氾濫同一手法），不用 dt 累加狀態——
 * 這樣遊戲快轉、離線結算重新整理都能直接算出正確位置，不會因為沒有累積 dt 而跳格或對不上。
 */
export class WeatherLayer {
  private group = new THREE.Group();
  private particles: WeatherParticle[] = [];
  private textures: Record<Exclude<WeatherKind, "clear">, THREE.CanvasTexture>;
  private currentKind: WeatherKind = "clear";

  constructor(scene: THREE.Scene) {
    this.textures = { rain: createRainTexture(), snow: createSnowTexture(), leaves: createLeafTexture() };
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const material = new THREE.SpriteMaterial({ map: this.textures.rain, transparent: true, opacity: 0 });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = 5;
      this.group.add(sprite);
      this.particles.push({ sprite, seedX: Math.random(), seedPhase: Math.random() * Math.PI * 2 });
    }
    scene.add(this.group);
  }

  update(kind: WeatherKind, intensity: number, time: number, rect: Rect): void {
    if (kind !== this.currentKind) {
      this.currentKind = kind;
      if (kind !== "clear") this.applyKindParams(kind);
    }

    if (kind === "clear" || intensity <= 0.02) {
      for (const p of this.particles) p.sprite.visible = false;
      return;
    }

    const params = KIND_PARAMS[kind];
    const width = rect.right - rect.left;
    const fallRange = rect.top - rect.bottom + 2;
    const activeCount = Math.round(MAX_PARTICLES * intensity);

    this.particles.forEach((p, i) => {
      if (i >= activeCount) {
        p.sprite.visible = false;
        return;
      }
      p.sprite.visible = true;
      const fallSpeed = params.fallSpeedMin + (params.fallSpeedMax - params.fallSpeedMin) * p.seedX;
      const y = rect.top + 1 - ((time * fallSpeed + p.seedX * fallRange) % fallRange);
      const drift = Math.sin(time * 1.3 + p.seedPhase) * params.driftAmount;
      const x = rect.left + p.seedX * width + drift;
      p.sprite.position.set(x, y, 0.5);
      const material = p.sprite.material as THREE.SpriteMaterial;
      material.opacity = params.opacity * intensity;
      if (params.spin) material.rotation = time * 0.8 + p.seedPhase;
    });
  }

  private applyKindParams(kind: Exclude<WeatherKind, "clear">): void {
    const params = KIND_PARAMS[kind];
    const texture = this.textures[kind];
    for (const p of this.particles) {
      const material = p.sprite.material as THREE.SpriteMaterial;
      material.map = texture;
      material.needsUpdate = true;
      p.sprite.scale.set(params.scaleX, params.scaleY, 1);
    }
  }

  dispose(): void {
    for (const p of this.particles) p.sprite.material.dispose();
    for (const t of Object.values(this.textures)) t.dispose();
  }
}
