import * as THREE from "three";
import "../texture";
import { Context, Effect, Ref } from "effect";
import type { Scene } from "three";
import { loadTextureFromFile } from "../texture";
import {
  AttemptedToReleaseInvalidInstanceIndex,
  EmptyFreeIndicesArray,
  EmptyMeshPoolArray,
  MaxInstancesReached,
} from "./errors";

export interface ResourceConfig {
  imagePath: string;
  sheetNumFrames: number;
}

export interface SheetProperties {
  imagePath: string;
  sheetTilesetWidth: number;
  sheetTilesetHeight: number;
  sheetNumFrames: number;
}

export interface InstanceManagerOptions {
  maxInstances: number;
  renderOrder?: number;
  depthWrite?: boolean;
  name?: string;
  frustumCulled?: boolean;
  matrix?: THREE.Matrix4;
}

export interface MeshPoolOptions {
  geometry: () => THREE.BufferGeometry;
  material: THREE.Material;
  maxInstances: number;
  name?: string;
}

const HIDDEN_MATRIX = new THREE.Matrix4().scale(new THREE.Vector3(0, 0, 0));

export type MeshPoolService = Effect.Effect.Success<ReturnType<typeof makeMeshPool>>;

export class MeshPool extends Context.Tag("MeshPool")<MeshPool, MeshPoolService>() {}

export const makeMeshPool = Effect.fn(function* () {
  const pool = yield* Ref.make<Map<string, THREE.InstancedMesh[]>>(new Map());

  const acquireMesh = Effect.fn(function* (poolId, options: MeshPoolOptions) {
    const poolMap = yield* Ref.get(pool);
    const poolArray = poolMap.get(poolId) ?? [];
    yield* Ref.update(pool, (pool) => {
      poolMap.set(poolId, poolArray);
      return pool;
    });

    if (poolArray.length > 0) {
      const mesh = poolArray.pop();
      if (!mesh) return Effect.fail(new EmptyMeshPoolArray({ pool: poolArray }));
      mesh.material = options.material;
      mesh.count = options.maxInstances;
      return mesh;
    }

    const mesh = new THREE.InstancedMesh(options.geometry(), options.material, options.maxInstances);

    if (options.name) {
      mesh.name = options.name;
    }

    return mesh;
  });

  const releaseMesh = Effect.fn(function* (poolId, mesh: THREE.InstancedMesh) {
    const poolMap = yield* Ref.get(pool);
    const poolArray = poolMap.get(poolId) ?? [];
    poolArray.push(mesh);
    yield* Ref.update(pool, (pool) => {
      poolMap.set(poolId, poolArray);
      return pool;
    });
  });

  const fill = Effect.fn(function* (poolId, options: MeshPoolOptions, count: number) {
    const poolMap = yield* Ref.get(pool);
    const poolArray = poolMap.get(poolId) ?? [];
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.InstancedMesh(options.geometry(), options.material, options.maxInstances);
      mesh.count = options.maxInstances;
      if (options.name) {
        mesh.name = options.name;
      }
      poolArray.push(mesh);
    }
    yield* Ref.update(pool, (pool) => {
      poolMap.set(poolId, poolArray);
      return pool;
    });
  });

  const clearPool = Effect.fn(function* (poolId: string) {
    const poolMap = yield* Ref.get(pool);
    const poolArray = poolMap.get(poolId);
    if (poolArray) {
      poolArray.forEach((mesh) => {
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => mat.dispose());
        } else {
          mesh.material.dispose();
        }
      });
      poolArray.length = 0;
    }
  });

  const clearAllPools = Effect.fn(function* () {
    const poolMap = yield* Ref.get(pool);
    yield* Effect.all(poolMap.keys().map((poolId) => clearPool(poolId)));
  });

  return {
    acquireMesh,
    releaseMesh,
    fill,
    clearPool,
    clearAllPools,
  };
});

export type InstanceManagerService = Effect.Effect.Success<ReturnType<typeof makeInstanceManager>>;

export class InstanceManager extends Context.Tag("InstanceManager")<InstanceManager, InstanceManagerService>() {}

export const makeInstanceManager = Effect.fn(function* (
  scene: Scene,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  options: InstanceManagerOptions,
) {
  const _freeIndices = yield* Ref.make<number[]>([]);
  const _scene = yield* Ref.make(scene);
  const _material = yield* Ref.make(material);
  const _maxInstances = yield* Ref.make(options.maxInstances);
  const _matrix = yield* Ref.make(options.matrix ?? HIDDEN_MATRIX);
  const _instanceCount = yield* Ref.make(0);

  const im = new THREE.InstancedMesh(geometry, material, options.maxInstances);
  im.renderOrder = options.renderOrder ?? 0;
  im.frustumCulled = options.frustumCulled ?? false;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (options.name) {
    im.name = options.name;
  }
  const mi = yield* Ref.get(_maxInstances);
  for (let i = 0; i < mi; i++) {
    yield* Ref.update(_freeIndices, (freeIndices) => {
      freeIndices.push(i);
      return freeIndices;
    });
    const m = yield* Ref.get(_matrix);
    im.setMatrixAt(i, m);
  }
  im.instanceMatrix.needsUpdate = true;
  yield* Ref.update(_scene, (scene) => {
    scene.add(im);
    return scene;
  });
  const instancedMesh = yield* Ref.make(im);

  const acquireInstanceSlot = Effect.fn(function* () {
    const fi = yield* Ref.get(_freeIndices);
    if (fi.length === 0) {
      const mi = yield* Ref.get(_maxInstances);
      return Effect.fail(new MaxInstancesReached({ maxInstances: mi }));
    }
    const instanceIndex = fi.pop();
    if (!instanceIndex) return Effect.fail(new EmptyFreeIndicesArray({ freeIndices: fi }));

    yield* Ref.update(_instanceCount, (instanceCount) => instanceCount + 1);
    return instanceIndex;
  });

  const releaseInstanceSlot = Effect.fn(function* (instanceIndex: number) {
    const mi = yield* Ref.get(_maxInstances);
    if (instanceIndex >= 0 && instanceIndex < mi) {
      const m = yield* Ref.get(_matrix);
      yield* Ref.update(instancedMesh, (im) => {
        im.setMatrixAt(instanceIndex, m);
        im.instanceMatrix.needsUpdate = true;
        return im;
      });
      yield* Ref.update(_freeIndices, (freeIndices) => {
        if (!freeIndices.includes(instanceIndex)) {
          freeIndices.push(instanceIndex);
          freeIndices.sort((a, b) => a - b);
        }
        return freeIndices;
      });
      yield* Ref.update(_instanceCount, (instanceCount) => instanceCount - 1);
      return yield* Effect.void;
    } else {
      // console.warn(`[InstanceManager] Attempted to release invalid instanceIndex ${instanceIndex}`);
      return yield* Effect.fail(new AttemptedToReleaseInvalidInstanceIndex({ instanceIndex }));
    }
  });

  const getInstanceCount = Effect.fn(function* () {
    return yield* Ref.get(_instanceCount);
  });

  const getMaxInstances = Effect.fn(function* () {
    return yield* Ref.get(_maxInstances);
  });

  const hasFreeInstances = Effect.fn(function* () {
    const fi = yield* Ref.get(_freeIndices);
    return fi.length > 0;
  });

  const getMesh = Effect.fn(function* () {
    return yield* Ref.get(instancedMesh);
  });

  const dispose = Effect.fn(function* () {
    const im = yield* Ref.get(instancedMesh);
    yield* Ref.update(_scene, (scene) => {
      scene.remove(im);
      return scene;
    });
    yield* Ref.update(instancedMesh, (im) => {
      im.geometry.dispose();
      return im;
    });
    const material = yield* Ref.get(_material);
    if (Array.isArray(material)) {
      material.forEach((mat) => mat.dispose());
    } else {
      material.dispose();
    }
  });

  return {
    acquireInstanceSlot,
    releaseInstanceSlot,
    getInstanceCount,
    getMaxInstances,
    hasFreeInstances,
    getMesh,
    dispose,
  };
});

export type SpriteResourceService = Effect.Effect.Success<ReturnType<typeof makeSpriteResource>>;

export class SpriteResource extends Context.Tag("SpriteResource")<SpriteResource, SpriteResourceService>() {}

export const makeSpriteResource = Effect.fn(function* (
  texture: THREE.DataTexture,
  sheetProperties: SheetProperties,
  scene: Scene,
) {
  const _texture = yield* Ref.make(texture);
  const _sheetProperties = yield* Ref.make(sheetProperties);
  const _scene = yield* Ref.make(scene);
  const _meshPool = yield* makeMeshPool();

  const getTexture = Effect.fn(function* () {
    return yield* Ref.get(_texture);
  });

  const getSheetProperties = Effect.fn(function* () {
    return yield* Ref.get(_sheetProperties);
  });

  const getMeshPool = Effect.fn(function* () {
    return _meshPool;
  });

  const createInstanceManager = Effect.fn(function* (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    options: InstanceManagerOptions,
  ) {
    const sp = yield* Ref.get(_sheetProperties);
    const managerOptions = {
      ...options,
      name: options.name ?? `InstancedSprites_${sp.imagePath.replace(/[^a-zA-Z0-9_]/g, "_")}`,
    };

    const s = yield* Ref.get(_scene);
    return yield* makeInstanceManager(s, geometry, material, managerOptions);
  });

  const uvTileSize = Effect.fn(function* () {
    const sp = yield* Ref.get(_sheetProperties);
    const uvTileWidth = 1.0 / sp.sheetNumFrames;
    const uvTileHeight = 1.0;
    return new THREE.Vector2(uvTileWidth, uvTileHeight);
  });

  const dispose = Effect.fn(function* () {
    yield* _meshPool.clearAllPools();
  });

  return {
    getTexture,
    getSheetProperties,
    getMeshPool,
    createInstanceManager,
    uvTileSize,
    dispose,
  };
});

export type SpriteResourceManagerService = Effect.Effect.Success<ReturnType<typeof makeSpriteResourceManager>>;

export class SpriteResourceManager extends Context.Tag("SpriteResourceManager")<
  SpriteResourceManager,
  SpriteResourceManagerService
>() {}

export const makeSpriteResourceManager = Effect.fn(function* (scene: Scene) {
  const _resources = yield* Ref.make<Map<string, SpriteResourceService>>(new Map());
  const textureCache = yield* Ref.make<Map<string, THREE.DataTexture>>(new Map());
  const _scene = yield* Ref.make(scene);

  const getResourceKey = Effect.fn(function* (sheetProps: SheetProperties) {
    return sheetProps.imagePath;
  });

  const getOrCreateResource = Effect.fn(function* (texture: THREE.DataTexture, sheetProps: SheetProperties) {
    const key = yield* getResourceKey(sheetProps);
    const resources = yield* Ref.get(_resources);
    let resource = resources.get(key);
    if (!resource) {
      resource = yield* makeSpriteResource(texture, sheetProps, scene);
      resources.set(key, resource);
    }

    return resource;
  });

  const createResource = Effect.fn(function* (config: ResourceConfig) {
    const tc = yield* Ref.get(textureCache);
    let texture = tc.get(config.imagePath);
    if (!texture) {
      const loadedTexture = yield* loadTextureFromFile(config.imagePath);
      if (!loadedTexture) {
        return yield* Effect.fail(new Error(`[SpriteResourceManager] Failed to load texture for ${config.imagePath}`));
      }
      loadedTexture.needsUpdate = true;
      texture = loadedTexture;
      yield* Ref.update(textureCache, (tc) => {
        tc.set(config.imagePath, texture!);
        return tc;
      });
    }

    const sheetProps: SheetProperties = {
      imagePath: config.imagePath,
      sheetTilesetWidth: texture.image.width,
      sheetTilesetHeight: texture.image.height,
      sheetNumFrames: config.sheetNumFrames,
    };

    return yield* getOrCreateResource(texture, sheetProps);
  });

  const clearCache = Effect.fn(function* () {
    const res = yield* Ref.get(_resources);
    res.clear();
    const tc = yield* Ref.get(textureCache);
    tc.clear();
  });

  return {
    getOrCreateResource,
    createResource,
    clearCache,
  };
});
