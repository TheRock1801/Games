// Tiny synthesised sound effects. Silent wherever WebAudio is missing (tests, old browsers).
let ac: AudioContext | null = null;
let muted = false;

export function unlockAudio() {
  if (ac || typeof window === 'undefined') return;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  try { ac = new AC(); } catch { ac = null; }
}

export function setMuted(m: boolean) { muted = m; }
export function isMuted() { return muted; }

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

export function sfx(name: string) {
  switch (name) {
    case 'ui': tone(520, 0.05, 'square', 0.04); break;
    case 'pass': tone(700, 0.06, 'triangle', 0.06, 200); break;
    case 'kick': tone(180, 0.12, 'square', 0.08, -100); break;
    case 'tackle': tone(110, 0.14, 'sawtooth', 0.09, -50); break;
    case 'break': tone(420, 0.08, 'square', 0.05, 260); break;
    case 'step': tone(300, 0.05, 'triangle', 0.05, 180); break;
    case 'knock': tone(150, 0.12, 'sawtooth', 0.06, -40); break;
    case 'whistle': tone(1900, 0.22, 'square', 0.04, 80); tone(1900, 0.3, 'square', 0.04, -200, 0.26); break;
    case 'good': tone(523, 0.1, 'square', 0.06); tone(784, 0.16, 'square', 0.06, 0, 0.1); break;
    case 'bad': tone(260, 0.14, 'sawtooth', 0.06, -80); tone(180, 0.2, 'sawtooth', 0.06, -60, 0.14); break;
    case 'try':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.06, 0, i * 0.11));
      break;
  }
}
