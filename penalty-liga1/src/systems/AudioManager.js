// Comentarista arcade: usa la Web Speech API (síntesis de voz del navegador) para
// narrar frases, así no dependemos de clips de audio con derechos de autor.
// La música/cánticos de fondo son opcionales: si el usuario coloca archivos reales
// en public/audio/, se reproducen; si no existen, el juego sigue funcionando en silencio.

const LINES = {
  gol: ['¡GOOOL!', '¡La puso adentro!', '¡No hay nada que hacer, portero!', '¡Inatajable!'],
  atajada: ['¡Atajó el portero!', '¡Qué reflejos!', '¡Se la sacó de la escuadra!', '¡Enorme el arquero!'],
  afuera: ['¡A la tribuna!', '¡Se le fue por arriba!', '¡Uy, la tiró afuera!'],
  campeon: ['¡CAMPEÓN! ¡Así se gritan los títulos!', '¡La hinchada estalla de alegría!']
};

export default class AudioManager {
  constructor() {
    this.enabled = true;
    this.ttsEnabled = 'speechSynthesis' in window;
    this.music = null;
    this._tryLoadAmbient();
  }

  _tryLoadAmbient() {
    try {
      const audio = new Audio('audio/hinchada.mp3');
      audio.loop = true;
      audio.volume = 0.35;
      audio.addEventListener('error', () => { this.music = null; }, { once: true });
      this.music = audio;
    } catch {
      this.music = null;
    }
  }

  playAmbient() {
    if (!this.enabled || !this.music) return;
    this.music.play().catch(() => {});
  }

  stopAmbient() {
    this.music?.pause();
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) this.stopAmbient();
  }

  say(category) {
    if (!this.enabled) return null;
    const options = LINES[category] || [];
    const line = options[Math.floor(Math.random() * options.length)] || '';
    if (this.ttsEnabled && line) {
      try {
        const utter = new SpeechSynthesisUtterance(line);
        utter.lang = 'es-PE';
        utter.rate = 1.05;
        utter.pitch = 1.1;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
      } catch {
        // Si el navegador no soporta TTS, simplemente se muestra el texto en pantalla
      }
    }
    return line;
  }
}
