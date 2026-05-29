export class AudioSystem {
  constructor() {
    this.context = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.noiseGain = null;
    this.noiseSource = null;
    this.started = false;
    this.engineVolume = 0;
    this.masterVolume = 0.34;
  }

  ensure() {
    if (this.context) {
      this.context.resume?.();
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }
    this.context = new AudioContextClass();
    this.master = this.context.createGain();
    this.master.gain.value = this.masterVolume;
    this.master.connect(this.context.destination);
    this.started = true;
  }

  update() {}

  setMasterVolume(value) {
    this.masterVolume = Math.max(0, Math.min(1, Number(value) || 0));
    if (this.master) {
      this.master.gain.value = this.masterVolume;
    }
  }

  blip(frequency, duration = 0.08, gain = 0.16, type = "sine") {
    this.ensure();
    if (!this.context) {
      return;
    }
    const osc = this.context.createOscillator();
    const amp = this.context.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    amp.gain.setValueAtTime(0, this.context.currentTime);
    amp.gain.linearRampToValueAtTime(gain, this.context.currentTime + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
    osc.connect(amp);
    amp.connect(this.master);
    osc.start();
    osc.stop(this.context.currentTime + duration + 0.02);
  }

  nearMiss() {
    this.blip(680, 0.12, 0.12, "triangle");
    window.setTimeout(() => this.blip(920, 0.08, 0.08, "triangle"), 55);
  }

  coin() {
    this.blip(840, 0.08, 0.09, "sine");
  }

  upgrade() {
    this.blip(360, 0.09, 0.12, "square");
    window.setTimeout(() => this.blip(540, 0.11, 0.1, "sine"), 70);
  }

  crash() {
    this.blip(96, 0.28, 0.22, "sawtooth");
  }
}
