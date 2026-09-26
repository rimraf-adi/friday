// Browser sound synthesis via Web Audio API (zero external assets needed)

export type NotificationTone =
  | "chime"
  | "trader"
  | "glass"
  | "bloomberg"
  | "pop"
  | "silent";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playNotificationTone(tone: NotificationTone = "chime"): void {
  if (tone === "silent") return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  switch (tone) {
    case "trader": {
      // Rapid urgent 3-beep trading floor alert (880Hz -> 1046Hz)
      const beeps = [
        { freq: 880, start: 0, dur: 0.08 },
        { freq: 987, start: 0.1, dur: 0.08 },
        { freq: 1174, start: 0.2, dur: 0.15 },
      ];

      beeps.forEach(({ freq, start, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + start);

        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(0.3, now + start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + start);
        osc.stop(now + start + dur);
      });
      break;
    }

    case "glass": {
      // High delicate crystal glass ping (1760Hz with resonant harmonic)
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1760, now); // A6

      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(3520, now); // harmonic

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc2.start(now);
      osc.stop(now + 0.9);
      osc2.stop(now + 0.9);
      break;
    }

    case "bloomberg": {
      // Crisp terminal notification beep (two quick punchy square/sine pulses)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.setValueAtTime(880, now + 0.07); // A5

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
      gain.gain.setValueAtTime(0.25, now + 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
      break;
    }

    case "pop": {
      // Soft modern UI bubble pop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.06);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
      break;
    }

    case "chime":
    default: {
      // Elegant standard chime: dual tone G5 -> C6 (784Hz -> 1046Hz)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(783.99, now); // G5
      osc1.frequency.setValueAtTime(1046.5, now + 0.12); // C6

      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1567.98, now); // harmonic G6
      osc2.frequency.setValueAtTime(2093.0, now + 0.12); // harmonic C7

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
      gain.gain.setValueAtTime(0.25, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.6);
      osc2.stop(now + 0.6);
      break;
    }
  }
}
