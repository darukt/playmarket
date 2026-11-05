// Tiny synth for in-browser games. No assets, no network — Web Audio API only.
let ctx: AudioContext | null = null;
let muted = false;

try {
  muted = typeof window !== "undefined" && window.localStorage.getItem("pm.sound") === "off";
} catch {
  muted = false;
}

export function soundMuted() {
  return muted;
}

export function setSoundMuted(value: boolean) {
  muted = value;
  try {
    window.localStorage.setItem("pm.sound", value ? "off" : "on");
  } catch {
    /* ignore */
  }
}

function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

export function blip(freq = 660, duration = 0.07, type: OscillatorType = "square", gain = 0.06) {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  amp.gain.setValueAtTime(gain, ac.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  osc.connect(amp).connect(ac.destination);
  osc.onended = () => { osc.disconnect(); amp.disconnect(); };
  osc.start();
  osc.stop(ac.currentTime + duration);
}

export function thud() {
  blip(90, 0.18, "sawtooth", 0.09);
}

export function chime() {
  blip(880, 0.1, "square", 0.05);
  window.setTimeout(() => blip(1320, 0.16, "square", 0.05), 90);
}

export function clatter() {
  blip(420, 0.05, "triangle", 0.07);
  window.setTimeout(() => blip(240, 0.06, "triangle", 0.06), 45);
}
