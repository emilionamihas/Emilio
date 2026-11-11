import { Game } from './game/Game';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const ui = document.getElementById('ui-root') as HTMLElement;
  const loading = document.getElementById('loading') as HTMLElement;
  try {
    const game = await Game.create(canvas, ui);
    (window as unknown as { nitro: Game }).nitro = game;
    loading.remove();
  } catch (err) {
    loading.textContent = `No se pudo iniciar el juego: ${err instanceof Error ? err.message : String(err)}`;
    throw err;
  }
}

void boot();
