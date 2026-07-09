// apps/web/src/utils/callSounds.ts
// Generates all call sounds programmatically using Web Audio API (no audio files needed)

/** Short haptic pulse for keypad taps — works on Android/mobile Chrome */
export function playHaptic(durationMs = 30) {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(durationMs);
    }
  } catch (_) {
    // Not supported — silently no-op
  }
}

let audioCtx: AudioContext | null = null;
let ringtoneInterval: ReturnType<typeof setInterval> | null = null;
let ringbackInterval: ReturnType<typeof setInterval> | null = null;

function getCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(
  frequency: number,
  duration: number,
  volume = 0.4,
  type: OscillatorType = 'sine',
  startDelay = 0
) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime + startDelay);

    gain.gain.setValueAtTime(0, ctx.currentTime + startDelay);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startDelay + 0.01);
    gain.gain.setValueAtTime(volume, ctx.currentTime + startDelay + duration - 0.02);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + startDelay + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + startDelay);
    osc.stop(ctx.currentTime + startDelay + duration);
  } catch (e) {
    // Silently fail if audio API is not available
  }
}

/** Inbound ringtone – plays a double-ring pattern on repeat */
export function startRingtone() {
  stopAllSounds();
  const ring = () => {
    playTone(480, 0.4, 0.5, 'sine', 0);
    playTone(620, 0.4, 0.5, 'sine', 0);
    playTone(480, 0.4, 0.5, 'sine', 0.5);
    playTone(620, 0.4, 0.5, 'sine', 0.5);
  };
  ring();
  ringtoneInterval = setInterval(ring, 3000);
}

/** Outbound ringback – plays a single pulse every 4s while waiting for answer */
export function startRingback() {
  stopAllSounds();
  const tone = () => {
    playTone(440, 1.0, 0.2, 'sine', 0);
  };
  tone();
  ringbackInterval = setInterval(tone, 4000);
}

/** Call connected – short ascending chime */
export function playConnectSound() {
  stopAllSounds();
  playTone(523, 0.15, 0.3, 'sine', 0);   // C5
  playTone(659, 0.15, 0.3, 'sine', 0.15); // E5
  playTone(784, 0.2, 0.35, 'sine', 0.3); // G5
}

/** Call ended / hangup – short descending tone */
export function playHangupSound() {
  stopAllSounds();
  playTone(440, 0.15, 0.35, 'sine', 0);
  playTone(330, 0.2, 0.35, 'sine', 0.15);
}

/** DTMF keypress click */
export function playDtmfTone() {
  playTone(941, 0.08, 0.2, 'square', 0);
  playTone(1336, 0.08, 0.2, 'square', 0);
}

export function stopAllSounds() {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
  if (ringbackInterval) {
    clearInterval(ringbackInterval);
    ringbackInterval = null;
  }
}
