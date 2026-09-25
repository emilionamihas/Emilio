import * as THREE from 'three';

/**
 * Figura humana procedural (≈1,80 m) con articulaciones en hombros, codos, caderas y rodillas.
 * Origen en los pies, mirando hacia +Z. La usan el jugador y todos los NPC.
 * Geometrías y materiales se comparten entre instancias para no multiplicar memoria.
 */

const GEO = {};
function geo(key, make) {
  if (!GEO[key]) GEO[key] = make();
  return GEO[key];
}
const MATS = new Map();
function mat(color, roughness = 0.8, metalness = 0) {
  const key = `${color}|${roughness}|${metalness}`;
  if (!MATS.has(key)) MATS.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  return MATS.get(key);
}

export const SKIN_TONES = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a1e, 0xffdbac];
const HAIR_COLORS = [0x1b1b1b, 0x3b2314, 0x6b4423, 0xa0522d, 0xd6b370, 0x777777];

/** Vestuarios predefinidos (también para el armario de casa). */
export const OUTFITS = {
  calle: { name: 'Calle', shirt: 0xeeeeee, pants: 0x2c3e66, shoes: 0x1b1b1b, jacket: null },
  cuero: { name: 'Chupa de cuero', shirt: 0x222222, pants: 0x1c1c22, shoes: 0x3a2a1a, jacket: 0x2a1c14 },
  traje: { name: 'Traje', shirt: 0xf5f5f5, pants: 0x1f2430, shoes: 0x0e0e0e, jacket: 0x1f2430, tie: 0x8e1b1b },
  deporte: { name: 'Chándal', shirt: 0x1565c0, pants: 0x1565c0, shoes: 0xf5f5f5, jacket: null, stripes: 0xffffff },
  golpe: { name: 'Mono de golpe', shirt: 0x2f3b2a, pants: 0x2f3b2a, shoes: 0x1b1b1b, jacket: null, mask: 0x111111, gloves: 0x111111 },
  verano: { name: 'Verano', shirt: 0xf4a261, pants: 0xc8b28c, shoes: 0x8d6e63, jacket: null },
  // Uniformes de NPC
  guardia: { name: 'Guardia', shirt: 0x37474f, pants: 0x263238, shoes: 0x111111, jacket: null, cap: 0x263238, badge: true },
  policia: { name: 'Policía', shirt: 0x1a237e, pants: 0x111a3a, shoes: 0x111111, jacket: null, cap: 0x0d1333, badge: true },
  cajero: { name: 'Cajero', shirt: 0xf5f5f5, pants: 0x37474f, shoes: 0x111111, jacket: null, tie: 0x1e3a8a },
  dependiente: { name: 'Dependiente', shirt: 0xc62828, pants: 0x263238, shoes: 0x111111, jacket: null, cap: 0xc62828 },
};

const CIVIL_SHIRTS = [0xeeeeee, 0x90a4ae, 0x1e88e5, 0xe53935, 0x43a047, 0xfdd835, 0x6d4c41, 0x8e24aa, 0x212121, 0xff7043];
const CIVIL_PANTS = [0x2c3e66, 0x212121, 0x6d4c41, 0x9e9e9e, 0x37474f, 0xc8b28c];

export function randomCivilianOutfit() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return {
    shirt: pick(CIVIL_SHIRTS),
    pants: pick(CIVIL_PANTS),
    shoes: pick([0x1b1b1b, 0x5d4037, 0xf5f5f5]),
    jacket: Math.random() < 0.3 ? pick([0x263238, 0x4e342e, 0x1a237e, 0x33691e]) : null,
    skin: pick(SKIN_TONES),
    hair: pick(HAIR_COLORS),
    hairStyle: pick(['short', 'short', 'long', 'bald', 'bun']),
  };
}

const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);

export class HumanModel {
  constructor(outfit = OUTFITS.calle, { skin = SKIN_TONES[2], hair = HAIR_COLORS[0], hairStyle = 'short', scale = 1 } = {}) {
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // se desplaza al agacharse/caer
    this.root.add(this.body);
    this.meshes = [];
    this.skinColor = outfit.skin ?? skin;
    this.hairColor = outfit.hair ?? hair;
    this.hairStyle = outfit.hairStyle ?? hairStyle;
    this.phase = Math.random() * 10;
    this.pose = 'idle';
    this.poseBlend = 0;
    this.build();
    this.setOutfit(outfit);
    this.root.scale.setScalar(scale);
  }

  part(geometry, material, parent, x = 0, y = 0, z = 0, tag = 'body') {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.userData.part = tag;
    parent.add(m);
    this.meshes.push(m);
    return m;
  }

  build() {
    const b = this.body;
    // Piel y pelo con material propio: se pueden cambiar sin afectar a otros personajes
    const skin = new THREE.MeshStandardMaterial({ color: this.skinColor, roughness: 0.65 });
    this.skinMat = skin;
    this.hairMat = new THREE.MeshStandardMaterial({ color: this.hairColor, roughness: 0.9 });

    // Pelvis y torso: esferas escaladas dan una silueta orgánica
    this.pelvis = this.part(geo('pelvis', () => new THREE.SphereGeometry(1, 14, 10)), skin, b, 0, 0.98, 0);
    this.pelvis.scale.set(0.165, 0.11, 0.11);
    this.abdomen = this.part(geo('abdomen', () => new THREE.SphereGeometry(1, 14, 10)), skin, b, 0, 1.13, 0.005);
    this.abdomen.scale.set(0.15, 0.15, 0.1);
    this.chest = this.part(geo('chest', () => new THREE.SphereGeometry(1, 16, 12)), skin, b, 0, 1.33, 0);
    this.chest.scale.set(0.2, 0.19, 0.12);
    this.jacketShell = this.part(geo('jacket', () => new THREE.SphereGeometry(1, 16, 12)), skin, b, 0, 1.3, -0.005);
    this.jacketShell.scale.set(0.215, 0.235, 0.13);
    this.tie = this.part(geo('tie', () => new THREE.BoxGeometry(0.035, 0.26, 0.01)), skin, b, 0, 1.3, 0.125);
    // Cuello de polo/camisa y botonadura
    this.collar = this.part(geo('collar', () => new THREE.TorusGeometry(0.062, 0.02, 6, 16)), skin, b, 0, 1.48, 0.01);
    this.collar.rotation.x = Math.PI / 2 + 0.25;
    this.buttons = this.part(geo('buttons', () => new THREE.BoxGeometry(0.012, 0.3, 0.008)), mat(0xeeeeee, 0.4), b, 0, 1.3, 0.122);
    this.badge = this.part(geo('badge', () => new THREE.BoxGeometry(0.05, 0.05, 0.01)), mat(0xd4af37, 0.3, 0.8), b, 0.09, 1.38, 0.12);
    this.part(geo('neck', () => new THREE.CylinderGeometry(0.045, 0.05, 0.12, 10)), skin, b, 0, 1.53, 0);

    // Cabeza
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 1.58, 0);
    b.add(this.headPivot);
    const head = this.part(geo('head', () => new THREE.SphereGeometry(1, 20, 16)), skin, this.headPivot, 0, 0.1, 0.005, 'head');
    head.scale.set(0.098, 0.118, 0.108);
    const eyeMat = mat(0x151515, 0.3);
    this.part(geo('eye', () => new THREE.SphereGeometry(0.014, 8, 6)), eyeMat, this.headPivot, 0.036, 0.12, 0.094, 'head');
    this.part(geo('eye', () => null), eyeMat, this.headPivot, -0.036, 0.12, 0.094, 'head');
    const nose = this.part(geo('nose', () => new THREE.ConeGeometry(0.018, 0.05, 6)), skin, this.headPivot, 0, 0.095, 0.108, 'head');
    nose.rotation.x = Math.PI / 2 + 0.3;
    const ear = geo('ear', () => new THREE.SphereGeometry(1, 8, 6));
    const earL = this.part(ear, skin, this.headPivot, 0.097, 0.1, 0, 'head');
    earL.scale.set(0.015, 0.03, 0.02);
    const earR = this.part(ear, skin, this.headPivot, -0.097, 0.1, 0, 'head');
    earR.scale.set(0.015, 0.03, 0.02);
    this.brows = [
      this.part(geo('brow', () => new THREE.BoxGeometry(0.035, 0.008, 0.01)), this.hairMat, this.headPivot, 0.036, 0.145, 0.098, 'head'),
      this.part(geo('brow', () => null), this.hairMat, this.headPivot, -0.036, 0.145, 0.098, 'head'),
    ];
    this.mouth = this.part(geo('mouth', () => new THREE.BoxGeometry(0.04, 0.008, 0.01)), mat(0x7a3b3b, 0.6), this.headPivot, 0, 0.055, 0.1, 'head');

    // Pelo: se construyen todas las variantes y se muestran según el estilo
    const hairMat = this.hairMat;
    this.hairCap = this.part(geo('hairCap', () => new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)), hairMat, this.headPivot, 0, 0.115, -0.005, 'head');
    this.hairCap.scale.set(0.106, 0.125, 0.116);
    this.hairCap.rotation.x = -0.25;
    this.hairLong = this.part(geo('hairBack', () => new THREE.SphereGeometry(1, 12, 10)), hairMat, this.headPivot, 0, 0.02, -0.06, 'head');
    this.hairLong.scale.set(0.1, 0.16, 0.06);
    this.hairBun = this.part(geo('bun', () => new THREE.SphereGeometry(0.045, 10, 8)), hairMat, this.headPivot, 0, 0.2, -0.08, 'head');
    this.setHairStyle(this.hairStyle);
    // Gorra (uniformes) y pasamontañas (golpes)
    this.cap = this.part(geo('cap', () => new THREE.CylinderGeometry(0.108, 0.112, 0.07, 16)), hairMat, this.headPivot, 0, 0.2, 0, 'head');
    this.capVisor = this.part(geo('visor', () => new THREE.BoxGeometry(0.16, 0.012, 0.09)), hairMat, this.headPivot, 0, 0.17, 0.11, 'head');
    this.beanie = this.part(geo('beanie', () => new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)), hairMat, this.headPivot, 0, 0.11, -0.005, 'head');
    this.beanie.scale.set(0.112, 0.15, 0.122);
    this.beanie.rotation.x = -0.15;
    this.hatCrown = this.part(geo('hatCrown', () => new THREE.CylinderGeometry(0.095, 0.11, 0.13, 18)), hairMat, this.headPivot, 0, 0.225, 0, 'head');
    this.hatBrim = this.part(geo('hatBrim', () => new THREE.CylinderGeometry(0.19, 0.19, 0.012, 24)), hairMat, this.headPivot, 0, 0.17, 0, 'head');
    this.hatBand = this.part(geo('hatBand', () => new THREE.CylinderGeometry(0.112, 0.112, 0.03, 18)), mat(0x111111), this.headPivot, 0, 0.19, 0, 'head');
    this.mask = this.part(geo('mask', () => new THREE.SphereGeometry(1, 16, 12)), hairMat, this.headPivot, 0, 0.09, 0.005, 'head');
    this.mask.scale.set(0.103, 0.124, 0.113);

    // Brazos: hombro -> codo -> muñeca
    const arm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.215 * side, 1.44, 0);
      b.add(shoulder);
      const upper = this.part(geo('upperArm', () => capsule(0.047, 0.2)), skin, shoulder, 0, -0.14, 0);
      const elbow = new THREE.Group();
      elbow.position.set(0, -0.29, 0);
      shoulder.add(elbow);
      const fore = this.part(geo('foreArm', () => capsule(0.04, 0.19)), skin, elbow, 0, -0.13, 0);
      const hand = this.part(geo('hand', () => new THREE.SphereGeometry(1, 10, 8)), skin, elbow, 0, -0.29, 0.005);
      hand.scale.set(0.035, 0.06, 0.028);
      const wrist = new THREE.Group();
      wrist.position.set(0, -0.29, 0);
      elbow.add(wrist);
      return { shoulder, upper, elbow, fore, hand, wrist };
    };
    this.armL = arm(1);
    this.armR = arm(-1);

    // Piernas: cadera -> rodilla -> tobillo
    const leg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(0.095 * side, 0.95, 0);
      b.add(hip);
      const thigh = this.part(geo('thigh', () => capsule(0.075, 0.32)), skin, hip, 0, -0.22, 0);
      const knee = new THREE.Group();
      knee.position.set(0, -0.45, 0);
      hip.add(knee);
      const shin = this.part(geo('shin', () => capsule(0.058, 0.33)), skin, knee, 0, -0.21, 0);
      const foot = this.part(geo('foot', () => new THREE.BoxGeometry(0.1, 0.07, 0.25)), skin, knee, 0, -0.44, 0.05);
      return { hip, thigh, knee, shin, foot };
    };
    this.legL = leg(1);
    this.legR = leg(-1);
    this.stripes = [];
    for (const l of [this.legL, this.legR]) {
      const s = this.part(geo('stripe', () => new THREE.BoxGeometry(0.012, 0.8, 0.03)), skin, l.hip, 0.08 * (l === this.legL ? 1 : -1), -0.42, 0);
      this.stripes.push(s);
    }
  }

  setOutfit(o) {
    const shirt = mat(o.shirt, 0.85);
    const pants = mat(o.pants, 0.9);
    const shoes = mat(o.shoes, 0.5);
    const jacket = o.jacket != null ? mat(o.jacket, 0.7) : shirt;
    this.chest.material = shirt;
    this.abdomen.material = shirt;
    this.pelvis.material = pants;
    this.jacketShell.visible = o.jacket != null;
    this.jacketShell.material = jacket;
    this.tie.visible = !!o.tie;
    if (o.tie) this.tie.material = mat(o.tie, 0.6);
    this.badge.visible = !!o.badge;
    for (const a of [this.armL, this.armR]) {
      a.upper.material = o.sleeveless ? this.skinMat : jacket;
      a.fore.material = o.jacket != null ? jacket : o.long ? shirt : this.skinMat;
      a.hand.material = o.gloves ? mat(o.gloves) : this.skinMat;
    }
    for (const l of [this.legL, this.legR]) {
      l.thigh.material = pants;
      l.shin.material = o.shorts ? this.skinMat : pants;
      l.foot.material = shoes;
    }
    this.collar.visible = !!o.collar;
    if (o.collar) this.collar.material = o.jacket != null ? jacket : shirt;
    this.buttons.visible = !!o.buttons;
    // Gorros: 'gorra', 'gorraAtras', 'lana', 'sombrero' (los uniformes usan `cap` = gorra)
    const hat = o.hatStyle || (o.cap != null ? 'gorra' : 'none');
    const hatMat = mat(o.hatColor ?? o.cap ?? 0x222222, 0.75);
    const isCap = hat === 'gorra' || hat === 'gorraAtras';
    this.cap.visible = this.capVisor.visible = isCap;
    this.cap.material = this.capVisor.material = hatMat;
    this.capVisor.position.z = hat === 'gorraAtras' ? -0.11 : 0.11;
    this.beanie.visible = hat === 'lana';
    this.beanie.material = hatMat;
    this.hatCrown.visible = this.hatBrim.visible = this.hatBand.visible = hat === 'sombrero';
    this.hatCrown.material = this.hatBrim.material = hatMat;
    this.hairCap.visible = this.hairStyle !== 'bald' && hat !== 'lana';
    this.mask.visible = o.mask != null;
    if (o.mask != null) this.mask.material = mat(o.mask, 0.9);
    for (const s of this.stripes) {
      s.visible = !!o.stripes;
      if (o.stripes) s.material = mat(o.stripes);
    }
  }

  setSkin(color) {
    this.skinMat.color.setHex(color);
  }

  setHairColor(color) {
    this.hairMat.color.setHex(color);
  }

  setHairStyle(style) {
    this.hairStyle = style;
    this.hairCap.visible = style !== 'bald';
    this.hairLong.visible = style === 'long';
    this.hairBun.visible = style === 'bun';
  }

  /**
   * Aspecto personalizado del vestidor:
   * { top, topColor, hat, hatColor, bottom, bottomColor, shoes, skin, hair, hairStyle }
   */
  setLook(l) {
    this.setSkin(l.skin);
    this.setHairColor(l.hair);
    this.setHairStyle(l.hairStyle);
    const darker = new THREE.Color(l.topColor).multiplyScalar(0.8).getHex();
    this.setOutfit({
      shirt: l.topColor,
      pants: l.bottomColor,
      shoes: l.shoes,
      jacket: l.top === 'sudadera' ? darker : null,
      long: l.top === 'camisa' || l.top === 'sudadera',
      collar: l.top === 'polo' || l.top === 'camisa',
      buttons: l.top === 'camisa',
      sleeveless: l.top === 'tirantes',
      shorts: l.bottom === 'short',
      hatStyle: l.hat,
      hatColor: l.hatColor,
    });
  }

  /** Mano derecha: punto de anclaje para el arma. */
  get rightHand() {
    return this.armR.wrist;
  }

  // ------------------------------------------------------------------
  // Animación. `state`: { speed (m/s), grounded, aim (bool), pitch, pose }
  // pose: 'idle' | 'handsUp' | 'cower' | 'dead' | 'punch' | 'reload' | 'sit'
  // ------------------------------------------------------------------
  animate(dt, { speed = 0, grounded = true, aim = false, pitch = 0, pose = 'idle' } = {}) {
    const L = this.legL;
    const R = this.legR;
    const aL = this.armL;
    const aR = this.armR;
    const body = this.body;
    const lerp = (obj, x, y, z, k = 0.25) => {
      obj.rotation.x += (x - obj.rotation.x) * k;
      obj.rotation.y += (y - obj.rotation.y) * k;
      obj.rotation.z += (z - obj.rotation.z) * k;
    };
    const k = Math.min(1, dt * 14);

    if (pose === 'dead') {
      body.position.y += (0.12 - body.position.y) * k;
      body.rotation.x += (-Math.PI / 2 - body.rotation.x) * Math.min(1, dt * 6);
      body.position.z += (-0.85 - body.position.z) * k;
      lerp(aL.shoulder, -2.6, 0, 0.6, k);
      lerp(aR.shoulder, -2.2, 0, -0.9, k);
      lerp(aL.elbow, -0.4, 0, 0, k);
      lerp(aR.elbow, -0.2, 0, 0, k);
      lerp(L.hip, 0.1, 0, 0.1, k);
      lerp(R.hip, -0.2, 0, -0.15, k);
      lerp(L.knee, 0.3, 0, 0, k);
      lerp(R.knee, 0.1, 0, 0, k);
      return;
    }
    body.rotation.x += (0 - body.rotation.x) * k;
    body.position.z += (0 - body.position.z) * k;

    if (pose === 'cower') {
      body.position.y += (-0.42 - body.position.y) * k;
      lerp(L.hip, -1.5, 0, 0.15, k);
      lerp(R.hip, -1.5, 0, -0.15, k);
      lerp(L.knee, 2.3, 0, 0, k);
      lerp(R.knee, 2.3, 0, 0, k);
      lerp(aL.shoulder, -2.7, 0, -0.5, k);
      lerp(aR.shoulder, -2.7, 0, 0.5, k);
      lerp(aL.elbow, -1.9, 0, 0, k);
      lerp(aR.elbow, -1.9, 0, 0, k);
      lerp(this.headPivot, 0.5, 0, 0, k);
      return;
    }
    body.position.y += (0 - body.position.y) * k;
    lerp(this.headPivot, aim ? -pitch * 0.5 : 0, 0, 0, k);

    if (pose === 'ride') {
      // En moto: muslos hacia delante y abajo, brazos estirados al manillar, algo echado hacia delante
      lerp(this.body, 0.25, 0, 0, k);
      lerp(L.hip, -1.15, 0, 0.18, k);
      lerp(R.hip, -1.15, 0, -0.18, k);
      lerp(L.knee, 1.55, 0, 0, k);
      lerp(R.knee, 1.55, 0, 0, k);
      lerp(aL.shoulder, -1.15, 0, 0.12, k);
      lerp(aR.shoulder, -1.15, 0, -0.12, k);
      lerp(aL.elbow, -0.35, 0, 0, k);
      lerp(aR.elbow, -0.35, 0, 0, k);
      return;
    }
    if (pose !== 'ride' && this.body.rotation.x !== 0) this.body.rotation.x += (0 - this.body.rotation.x) * k;

    if (pose === 'sit') {
      lerp(L.hip, -1.5, 0, 0.05, k);
      lerp(R.hip, -1.5, 0, -0.05, k);
      lerp(L.knee, 1.5, 0, 0, k);
      lerp(R.knee, 1.5, 0, 0, k);
      lerp(aL.shoulder, -0.6, 0, 0.1, k);
      lerp(aR.shoulder, -0.6, 0, -0.1, k);
      lerp(aL.elbow, -0.6, 0, 0, k);
      lerp(aR.elbow, -0.6, 0, 0, k);
      return;
    }

    // Piernas
    if (!grounded) {
      lerp(L.hip, -0.7, 0, 0.05, k);
      lerp(R.hip, 0.35, 0, -0.05, k);
      lerp(L.knee, 1.1, 0, 0, k);
      lerp(R.knee, 0.5, 0, 0, k);
    } else if (speed > 0.3) {
      this.phase += dt * (2.2 + speed * 1.25);
      const run = Math.min(1, speed / 7);
      const amp = 0.45 + run * 0.45;
      const s = Math.sin(this.phase);
      const c = Math.cos(this.phase);
      L.hip.rotation.set(s * amp, 0, 0.03);
      R.hip.rotation.set(-s * amp, 0, -0.03);
      // Rodilla doblada cuando la pierna vuelve hacia delante
      L.knee.rotation.x = Math.max(0, -c) * (0.8 + run * 0.9) + 0.08;
      R.knee.rotation.x = Math.max(0, c) * (0.8 + run * 0.9) + 0.08;
      body.position.y = Math.abs(s) * 0.035 * (1 + run);
      body.rotation.y = s * 0.06;
    } else {
      this.phase += dt * 1.6;
      lerp(L.hip, 0, 0, 0.04, k);
      lerp(R.hip, 0, 0, -0.04, k);
      lerp(L.knee, 0.04, 0, 0, k);
      lerp(R.knee, 0.04, 0, 0, k);
      body.rotation.y *= 0.8;
    }

    // Brazos
    const s = Math.sin(this.phase);
    const walkAmp = speed > 0.3 && grounded ? 0.3 + Math.min(1, speed / 7) * 0.5 : 0.03;
    if (pose === 'handsUp') {
      lerp(aL.shoulder, -2.9, 0, 0.35, k);
      lerp(aR.shoulder, -2.9, 0, -0.35, k);
      lerp(aL.elbow, -0.7, 0, 0, k);
      lerp(aR.elbow, -0.7, 0, 0, k);
    } else {
      if (aim) {
        aR.shoulder.rotation.set(-Math.PI / 2 - pitch, 0.08, 0);
        aR.elbow.rotation.set(0, 0, 0);
        aL.shoulder.rotation.set(-Math.PI / 2 - pitch + 0.1, -0.1, -0.55);
        aL.elbow.rotation.set(-0.35, 0, 0);
      } else if (pose === 'punch') {
        lerp(aR.shoulder, -Math.PI / 2, 0, 0.15, 0.6);
        lerp(aR.elbow, 0, 0, 0, 0.6);
        lerp(aL.shoulder, -0.9, 0, 0.2, k);
        lerp(aL.elbow, -1.6, 0, 0, k);
      } else if (pose === 'reload') {
        lerp(aR.shoulder, -0.9, 0, 0.5, k);
        lerp(aR.elbow, -1.2, 0, 0, k);
        lerp(aL.shoulder, -0.8, 0, -0.3, k);
        lerp(aL.elbow, -1.3, 0, 0, k);
      } else {
        aL.shoulder.rotation.set(-s * walkAmp, 0, 0.06);
        aR.shoulder.rotation.set(s * walkAmp, 0, -0.06);
        aL.elbow.rotation.x = -0.15 - Math.max(0, s) * walkAmp * 0.9;
        aR.elbow.rotation.x = -0.15 - Math.max(0, -s) * walkAmp * 0.9;
      }
    }
  }
}
