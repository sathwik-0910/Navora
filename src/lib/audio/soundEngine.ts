// Web Audio API Sound Synthesizer for Navora Autonomous Navigation System

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = true; // start muted by default, user can toggle
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private lastBeepTime: number = 0;

  public init() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && this.engineGain && this.ctx) {
      this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public updateEngineSound(velocity: number, maxVelocity: number = 250) {
    if (this.isMuted || !this.ctx) return;

    const normSpeed = Math.max(0, Math.min(1, velocity / maxVelocity));
    const targetFreq = 50 + normSpeed * 120; // 50Hz idle to 170Hz high speed

    if (!this.engineOsc) {
      try {
        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();
        this.engineOsc.type = "sawtooth";

        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(220, this.ctx.currentTime);

        this.engineOsc.connect(filter);
        filter.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);

        this.engineOsc.frequency.setValueAtTime(targetFreq, this.ctx.currentTime);
        this.engineGain.gain.setValueAtTime(0.04, this.ctx.currentTime);
        this.engineOsc.start();
      } catch {
        // Audio policy restriction
      }
    } else if (this.engineGain) {
      this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
      this.engineGain.gain.setTargetAtTime(normSpeed > 0.05 ? 0.04 : 0.015, this.ctx.currentTime, 0.1);
    }
  }

  public playWarningBeep(ttc: number) {
    if (this.isMuted || !this.ctx) return;
    const now = performance.now();

    // Frequency of beeps increases as TTC decreases
    let interval = 1000;
    if (ttc < 1.2) interval = 120; // continuous rapid alarm
    else if (ttc < 2.0) interval = 250;
    else if (ttc < 3.5) interval = 600;
    else return;

    if (now - this.lastBeepTime > interval) {
      this.lastBeepTime = now;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(ttc < 1.2 ? 920 : 680, this.ctx.currentTime);

        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.09);
      } catch {
        // Audio error handling
      }
    }
  }

  public playAEBAlarm() {
    if (this.isMuted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(1100, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.16);
    } catch {
      // Audio error handling
    }
  }

  public playSuccessChime() {
    if (this.isMuted || !this.ctx) return;
    try {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, index) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + index * 0.08);

        gain.gain.setValueAtTime(0, this.ctx.currentTime + index * 0.08);
        gain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + index * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + index * 0.08 + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime + index * 0.08);
        osc.stop(this.ctx.currentTime + index * 0.08 + 0.35);
      });
    } catch {
      // Audio error handling
    }
  }
}

export const soundEngine = new SoundEngine();
