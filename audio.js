/**
 * TV Audio Synthesizer (Web Audio API)
 * Generates authentic 2000s TV sounds without external audio assets:
 * - OSD navigation beeps & select clicks
 * - Channel switch tuner pop / relay click
 * - Realistic analog TV white noise / static ("chiado")
 * - Satellite chirp / tone
 */

class RetroTVAudio {
    constructor() {
        this.ctx = null;
        this.isMuted = false;
        this.volume = 0.7;

        // Static noise nodes
        this.noiseNode = null;
        this.noiseGain = null;
        this.noiseFilter = null;
        this.isNoisePlaying = false;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    setMute(mute) {
        this.isMuted = mute;
        if (this.noiseGain) {
            this.noiseGain.gain.setValueAtTime(this.isMuted ? 0 : 0.25 * this.volume, this.ctx ? this.ctx.currentTime : 0);
        }
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
        if (this.noiseGain && !this.isMuted) {
            this.noiseGain.gain.setValueAtTime(0.25 * this.volume, this.ctx ? this.ctx.currentTime : 0);
        }
    }

    /**
     * Set-top box gentle high-tech beep when pressing arrows/navigating
     */
    playBeep(type = 'nav') {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        if (type === 'nav') {
            // Soft rounded 2000s DirecTV blip
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1480, now);
            osc.frequency.exponentialRampToValueAtTime(1900, now + 0.04);
            gain.gain.setValueAtTime(0.08 * this.volume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.055);
        } else if (type === 'select') {
            // Confirmation chirp (two tones)
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(980, now);
            osc.frequency.setValueAtTime(1420, now + 0.04);
            gain.gain.setValueAtTime(0.12 * this.volume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.13);
        } else if (type === 'back' || type === 'exit') {
            // Descending tone
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, now);
            osc.frequency.exponentialRampToValueAtTime(600, now + 0.08);
            gain.gain.setValueAtTime(0.1 * this.volume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
            osc.start(now);
            osc.stop(now + 0.095);
        }
    }

    /**
     * TV Channel Switch click / CRT tuner pop
     */
    playChannelSwitch() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        
        // Tuner relay thump
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.06);
        gain.gain.setValueAtTime(0.3 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.075);

        // Subtle static burst during tuning
        const bufferSize = this.ctx.sampleRate * 0.06;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.3;
        }
        const burstSource = this.ctx.createBufferSource();
        burstSource.buffer = buffer;
        const burstGain = this.ctx.createGain();
        burstGain.gain.setValueAtTime(0.12 * this.volume, now);
        burstGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        
        // High-pass filter for crisp burst
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1000;

        burstSource.connect(filter);
        filter.connect(burstGain);
        burstGain.connect(this.ctx.destination);
        burstSource.start(now);
    }

    /**
     * Start continuous TV Static Noise ("Chiado de TV sem sinal")
     */
    startStaticNoise() {
        if (this.isNoisePlaying) return;
        this.init();
        if (!this.ctx) return;

        const bufferSize = this.ctx.sampleRate * 2; // 2 seconds looped
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        // Generate authentic analog TV snow noise with 60Hz hum baseline
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            const hum = Math.sin((i / this.ctx.sampleRate) * 60 * 2 * Math.PI) * 0.08;
            data[i] = white * 0.75 + hum;
        }

        this.noiseNode = this.ctx.createBufferSource();
        this.noiseNode.buffer = buffer;
        this.noiseNode.loop = true;

        // Bandpass to sound like an old RF receiver demodulator
        this.noiseFilter = this.ctx.createBiquadFilter();
        this.noiseFilter.type = 'bandpass';
        this.noiseFilter.frequency.value = 3200;
        this.noiseFilter.Q.value = 0.8;

        this.noiseGain = this.ctx.createGain();
        const currentGain = this.isMuted ? 0 : 0.22 * this.volume;
        this.noiseGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
        this.noiseGain.gain.exponentialRampToValueAtTime(Math.max(0.001, currentGain), this.ctx.currentTime + 0.05);

        this.noiseNode.connect(this.noiseFilter);
        this.noiseFilter.connect(this.noiseGain);
        this.noiseGain.connect(this.ctx.destination);

        this.noiseNode.start();
        this.isNoisePlaying = true;
    }

    /**
     * Stop TV Static Noise
     */
    stopStaticNoise() {
        if (!this.isNoisePlaying) return;
        if (this.noiseGain && this.ctx) {
            const now = this.ctx.currentTime;
            this.noiseGain.gain.setValueAtTime(this.noiseGain.gain.value, now);
            this.noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
            setTimeout(() => {
                if (this.noiseNode) {
                    try { this.noiseNode.stop(); } catch(e) {}
                    this.noiseNode.disconnect();
                    this.noiseNode = null;
                }
                this.isNoisePlaying = false;
            }, 90);
        } else {
            this.isNoisePlaying = false;
        }
    }
}

window.retroAudio = new RetroTVAudio();
