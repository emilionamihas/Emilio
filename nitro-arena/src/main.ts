import { Game } from './game/Game';

const TIPS = [
  'Mantén pulsado el salto para saltar más alto: la fuerza extra dura 0,2 s.',
  'Si las cuatro ruedas tocan el balón en el aire, recuperas el dodge (flip reset).',
  'Tira del stick en sentido contrario durante un flip para cancelarlo: es la base del half-flip.',
  'Por encima de 22 m/s eres supersónico: si chocas de frente con un rival, lo demueles.',
  'El powerslide reduce el agarre lateral y conserva la velocidad en los giros cerrados.',
  'Haz un dodge justo al tocar el suelo con las ruedas traseras para ganar velocidad (wavedash).',
];

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

async function boot(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const ui = document.getElementById('ui-root') as HTMLElement;
  const loading = document.getElementById('loading') as HTMLElement;
  const fill = loading.querySelector('.ld-fill') as HTMLElement;
  const step = loading.querySelector('.ld-step') as HTMLElement;
  const tip = loading.querySelector('.ld-tip') as HTMLElement;
  tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  const started = performance.now();

  try {
    const game = await Game.create(canvas, ui, async (progress, text) => {
      fill.style.width = `${Math.round(progress * 100)}%`;
      step.textContent = text;
      await nextFrame();
      await nextFrame();
    });
    (window as unknown as { nitro: Game }).nitro = game;
    const wait = Math.max(0, 900 - (performance.now() - started));
    await new Promise((r) => setTimeout(r, wait));
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 450);
  } catch (err) {
    step.textContent = `No se pudo iniciar el juego: ${err instanceof Error ? err.message : String(err)}`;
    loading.classList.add('error');
    throw err;
  }
}

void boot();
