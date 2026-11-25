/**
 * Sintetizador Procedural Web Audio API para Veículos Elétricos (EV - BYD Dolphin Mini & BYD Seal):
 * - Motor Elétrico PMSM & Inversor (harmônicos puros sine/triangle sincronizados à rotação + assobio de inversor PWM + regeneração)
 * - Ruído aerodinâmico e de rolamento suave proporcional à velocidade
 * - Derrapagem de pneus (ruído branco com filtro passa-faixa + guincho ressonante)
 * - Efeitos de interface (clique cristalino GT Mode, compra, largada, colisão, medalha)
 */
export class RaceAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private oscMain: OscillatorNode | null = null;
  private oscHarm: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private aeroGain: GainNode | null = null;
  private aeroFilter: BiquadFilterNode | null = null;

  private screechGain: GainNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;
  private screechOsc: OscillatorNode | null = null;

  private running = false;
  private muted = false;
  private unlocked = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.unlocked = true;
        if (this.ctx && this.ctx.state === 'suspended') {
          void this.ctx.resume();
        }
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.32, this.ctx.currentTime, 0.04);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined' || !this.unlocked) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.32;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public startEngineLoop(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.running) return;

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'bandpass';
    this.engineFilter.frequency.value = 520;
    this.engineFilter.Q.value = 1.6;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0001;

    // Oscilador principal: fundamental suave do rotor magnético (PMSM)
    this.oscMain = ctx.createOscillator();
    this.oscMain.type = 'sine';
    this.oscMain.frequency.value = 140;

    // Harmônico de transmissão redutora de marcha única
    this.oscHarm = ctx.createOscillator();
    this.oscHarm.type = 'triangle';
    this.oscHarm.frequency.value = 280;

    // Harmônico agudo sutil do inversor SiC / PWM
    this.oscSub = ctx.createOscillator();
    this.oscSub.type = 'sine';
    this.oscSub.frequency.value = 560;

    const mainMix = ctx.createGain();
    mainMix.gain.value = 0.48;
    const harmMix = ctx.createGain();
    harmMix.gain.value = 0.24;
    const inverterMix = ctx.createGain();
    inverterMix.gain.value = 0.12;

    this.oscMain.connect(mainMix).connect(this.engineFilter);
    this.oscHarm.connect(harmMix).connect(this.engineFilter);
    this.oscSub.connect(inverterMix).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.masterGain);

    this.oscMain.start();
    this.oscHarm.start();
    this.oscSub.start();

    // Buffer de ruído compartilhado para rolamento/vento EV e derrapagem de pneus
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    // Sopro aerodinâmico / rolamento de pneus de carro elétrico em velocidade
    const aeroNoise = ctx.createBufferSource();
    aeroNoise.buffer = noiseBuffer;
    aeroNoise.loop = true;

    this.aeroFilter = ctx.createBiquadFilter();
    this.aeroFilter.type = 'bandpass';
    this.aeroFilter.frequency.value = 380;
    this.aeroFilter.Q.value = 1.1;

    this.aeroGain = ctx.createGain();
    this.aeroGain.gain.value = 0.0001;

    aeroNoise.connect(this.aeroFilter).connect(this.aeroGain).connect(this.masterGain);
    aeroNoise.start();

    // Tire screech noise + resonant tone
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    this.screechFilter = ctx.createBiquadFilter();
    this.screechFilter.type = 'bandpass';
    this.screechFilter.frequency.value = 1450;
    this.screechFilter.Q.value = 6.5;

    this.screechOsc = ctx.createOscillator();
    this.screechOsc.type = 'triangle';
    this.screechOsc.frequency.value = 1280;

    const squealMix = ctx.createGain();
    squealMix.gain.value = 0.16;

    this.screechGain = ctx.createGain();
    this.screechGain.gain.value = 0.0;

    noiseSource.connect(this.screechFilter).connect(this.screechGain);
    this.screechOsc.connect(squealMix).connect(this.screechGain);
    this.screechGain.connect(this.masterGain);

    noiseSource.start();
    this.screechOsc.start();
    this.running = true;
  }

  public updateEngine(
    rpm: number,
    redlineRpm: number,
    throttle: number,
    tireScreech: number,
    active: boolean,
  ): void {
    if (
      !this.ctx ||
      !this.running ||
      !this.engineGain ||
      !this.oscMain ||
      !this.oscHarm ||
      !this.oscSub ||
      !this.engineFilter ||
      !this.screechGain ||
      !this.screechFilter ||
      !this.screechOsc
    ) {
      return;
    }
    const now = this.ctx.currentTime;
    if (!active || this.muted) {
      this.engineGain.gain.setTargetAtTime(0.0001, now, 0.08);
      this.aeroGain?.gain.setTargetAtTime(0.0001, now, 0.08);
      this.screechGain.gain.setTargetAtTime(0.0001, now, 0.06);
      return;
    }

    // Normaliza rotação do motor elétrico (0 parado .. 1 velocidade máxima)
    const speedNorm = Math.max(0, Math.min(1.08, (rpm - 850) / Math.max(3000, redlineRpm - 850)));
    // Frequência futurista limpa do motor elétrico (135 Hz parado -> ~980 Hz em alta velocidade)
    const baseFreq = 135 + speedNorm * 820 + throttle * 42;

    this.oscMain.frequency.setTargetAtTime(baseFreq, now, 0.025);
    this.oscHarm.frequency.setTargetAtTime(baseFreq * 1.995, now, 0.025);
    // Assobio harmônico de alta frequência do inversor elétrico
    this.oscSub.frequency.setTargetAtTime(480 + speedNorm * 1950 + throttle * 160, now, 0.03);

    const centerFreq = 260 + speedNorm * 1850 + throttle * 650;
    this.engineFilter.frequency.setTargetAtTime(centerFreq, now, 0.03);

    // Em EVs: silêncio quase absoluto parado, zumbido tecnológico sob carga (throttle) e leve regeneração ao soltar o pedal em movimento
    const regenHum = speedNorm > 0.08 && throttle < 0.05 ? 0.045 * speedNorm : 0;
    const evWhineVol =
      speedNorm < 0.02 && throttle < 0.05
        ? 0.004
        : 0.025 + speedNorm * 0.095 + throttle * (0.11 + speedNorm * 0.04) + regenHum;
    this.engineGain.gain.setTargetAtTime(evWhineVol, now, 0.035);

    // Som suave de vento e rolamento dos pneus proporcional à velocidade
    if (this.aeroGain && this.aeroFilter) {
      this.aeroFilter.frequency.setTargetAtTime(280 + speedNorm * 720, now, 0.05);
      this.aeroGain.gain.setTargetAtTime(speedNorm * speedNorm * 0.095, now, 0.05);
    }

    // Tire screech modulation
    const clampedScreech = Math.max(0, Math.min(1, tireScreech));
    this.screechGain.gain.setTargetAtTime(clampedScreech * 0.22, now, 0.04);
    this.screechFilter.frequency.setTargetAtTime(1180 + clampedScreech * 580, now, 0.05);
    this.screechOsc.frequency.setTargetAtTime(1020 + clampedScreech * 380, now, 0.05);
  }

  public silenceLoop(): void {
    if (!this.ctx || !this.engineGain || !this.screechGain) return;
    const now = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(0.0001, now, 0.05);
    this.aeroGain?.gain.setTargetAtTime(0.0001, now, 0.05);
    this.screechGain.gain.setTargetAtTime(0.0001, now, 0.05);
  }

  public playUiClick(pitch = 1.0): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(980 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(1480 * pitch, now + 0.045);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playPurchaseChime(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const notes = [587.33, 880, 1174.66];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t0 = now + idx * 0.07;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.18, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
      osc.connect(gain).connect(this.masterGain!);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    });
  }

  public playCountdownBeep(isGo: boolean): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isGo ? 880 : 440, now);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isGo ? 0.36 : 0.16));
    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + (isGo ? 0.38 : 0.18));
  }

  public playTurboBlowOff(intensity = 0.8): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    // Synthesize realistic pressurized air release + flutter ("psshh-tu-tu")
    const dur = 0.28;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const flutter = 0.65 + 0.35 * Math.sin(t * Math.PI * 10);
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-t * 4.5) * flutter;
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3400, now);
    filter.frequency.exponentialRampToValueAtTime(1150, now + dur);
    filter.Q.value = 2.6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.min(0.32, 0.26 * intensity), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    src.connect(filter).connect(gain).connect(this.masterGain);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  public playImpactThud(intensity: number): void {
    if (this.muted || intensity < 0.08) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110 + intensity * 40, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.16);
    gain.gain.setValueAtTime(Math.min(0.45, intensity * 0.42), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playFanfare(success: boolean): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const notes = success ? [523.25, 659.25, 783.99, 1046.5] : [392.0, 349.23, 293.66];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + i * 0.11;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(gain).connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  }

  public dispose(): void {
    this.silenceLoop();
    try {
      this.oscMain?.stop();
      this.oscHarm?.stop();
      this.oscSub?.stop();
      this.screechOsc?.stop();
      void this.ctx?.close();
    } catch {
      // ignore
    }
    this.ctx = null;
    this.running = false;
  }
}
