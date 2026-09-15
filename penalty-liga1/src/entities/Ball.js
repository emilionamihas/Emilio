import { quadraticBezier } from '../utils/MathUtils.js';

// Balón: vuela desde el punto de penal hasta el objetivo siguiendo una curva de
// Bézier cuadrática (el punto de control se desplaza según el efecto/curva del swipe).
// Se encoge en el trayecto para simular que se aleja hacia el fondo de la portería,
// y deja una breve estela en tiros potentes ("estelas de fuego" arcade).
export default class Ball {
  constructor(scene, x, y) {
    this.scene = scene;
    this.sprite = scene.add.image(x, y, 'ball').setDepth(10);
    this.trailSprites = [];
    this.flying = false;
  }

  resetTo(pos) {
    this.sprite.setPosition(pos.x, pos.y).setScale(1).setRotation(0).setAlpha(1);
    this.flying = false;
  }

  shootTo({ origin, target, power01, curveSigned01, durationMs = 620 }, onComplete) {
    this.flying = true;
    const midX = (origin.x + target.x) / 2;
    const midY = (origin.y + target.y) / 2 - 60; // arco natural del disparo
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const len = Math.hypot(dx, dy) || 1;
    const perpX = -dy / len;
    const perpY = dx / len;
    const curveAmount = curveSigned01 * 70 * (0.5 + power01);
    const control = { x: midX + perpX * curveAmount, y: midY + perpY * curveAmount };

    const state = { t: 0 };
    const spinDir = curveSigned01 >= 0 ? 1 : -1;
    const rotSpeed = (0.15 + power01 * 0.35) * spinDir;

    this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: durationMs * (1.15 - power01 * 0.3),
      ease: 'Sine.easeIn',
      onUpdate: () => {
        const p = quadraticBezier(origin, control, target, state.t);
        this.sprite.setPosition(p.x, p.y);
        this.sprite.setScale(1 - state.t * 0.55);
        this.sprite.setRotation(this.sprite.rotation + rotSpeed);
        if (power01 > 0.7 && state.t < 0.85) this._spawnTrailGhost();
      },
      onComplete: () => {
        this.flying = false;
        onComplete?.();
      }
    });
  }

  _spawnTrailGhost() {
    const ghost = this.scene.add.image(this.sprite.x, this.sprite.y, 'ball')
      .setScale(this.sprite.scaleX)
      .setAlpha(0.35)
      .setTint(0xffcc55)
      .setDepth(9);
    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: 220,
      onComplete: () => ghost.destroy()
    });
  }

  destroy() {
    this.sprite.destroy();
  }
}
