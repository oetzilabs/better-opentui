import { Effect } from "effect";
import { Sprite, SpriteMaterial, type SpriteMaterialParameters } from "three";
import { loadTextureFromFile } from "../texture";

export class SheetSprite extends Sprite {
  private _frameIndex: number = 0;
  private _numFrames: number = 0;

  constructor(material: SpriteMaterial, numFrames: number) {
    super(material);
    this._numFrames = numFrames;
    this.setIndex(0);
  }

  setIndex = (index: number) => {
    this._frameIndex = index;
    this.material.map?.repeat.set(1 / this._numFrames, 1);
    this.material.map?.offset.set(this._frameIndex / this._numFrames, 0);
  };
}

export const loadSpriteSheet = Effect.fn(function* (path: string, numFrames: number) {
  const spriteTexture = yield* loadTextureFromFile(path);

  if (!spriteTexture) {
    console.error("Failed to load sprite texture, exiting.");
    process.exit(1);
  }

  const spriteMaterial = new SpriteMaterial({ map: spriteTexture });
  const sprite = new SheetSprite(spriteMaterial, numFrames);

  const singleFrameWidth = spriteTexture.image.width / numFrames;
  const singleFrameHeight = spriteTexture.image.height;
  const frameAspectRatio = singleFrameWidth / singleFrameHeight;

  sprite.updateMatrix = function () {
    this.matrix.compose(this.position, this.quaternion, this.scale.clone().setX(this.scale.x * frameAspectRatio));
  };

  return sprite;
});

export const createSpriteFromFile = Effect.fn(function* (
  path: string,
  {
    materialParameters = {
      alphaTest: 0.1,
      depthWrite: true,
    },
  }: {
    materialParameters?: Omit<SpriteMaterialParameters, "map">;
  } = {},
) {
  const texture = yield* loadTextureFromFile(path);
  if (!texture) {
    return yield* Effect.fail(new Error("Failed to load texture, exiting."));
  }

  const spriteMaterial = new SpriteMaterial({ map: texture, ...materialParameters });
  const sprite = new Sprite(spriteMaterial);

  const textureAspectRatio = texture.image.width / texture.image.height;

  sprite.updateMatrix = function () {
    this.matrix.compose(this.position, this.quaternion, this.scale.clone().setX(this.scale.x * textureAspectRatio));
  };

  return sprite;
});
