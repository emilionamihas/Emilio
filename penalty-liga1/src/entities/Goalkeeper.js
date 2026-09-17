import { zoneCenterToWorld, indexToZone } from '../ui/GoalZones.js';
import { GOAL_RECT } from '../config/gameConfig.js';

const HOME = { x: GOAL_RECT.x + GOAL_RECT.width / 2, y: GOAL_RECT.y + GOAL_RECT.height - 10 };

export default class Goalkeeper {
  constructor(scene, tintColor = 0x222222) {
    this.scene = scene;
    this.sprite = scene.add.image(HOME.x, HOME.y, 'keeper').setDepth(8).setTint(tintColor);
    this.diving = false;
  }

  reset() {
    this.sprite.setPosition(HOME.x, HOME.y).setRotation(0).setScale(1);
    this.diving = false;
  }

  dive(zoneIndex, durationMs = 320) {
    this.diving = true;
    const { col, row } = indexToZone(zoneIndex);
    const target = zoneCenterToWorld(col, row);
    const lean = col === 1 ? 0 : (col < 1 ? -0.5 : 0.5);

    this.scene.tweens.add({
      targets: this.sprite,
      x: target.x,
      y: Math.max(target.y, HOME.y - 30),
      rotation: lean,
      scaleX: 1.15,
      scaleY: 0.9,
      duration: durationMs,
      ease: 'Quad.easeOut'
    });

    return target;
  }
}
