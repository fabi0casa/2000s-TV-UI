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

        const sounds = {
            nav: 'sfx/conected.mp3',
            select: 'sfx/frutiger-aero-sound.mp3',
            back: 'sfx/achievement.mp3',
            exit: 'sfx/default.mp3'
        };

        const src = sounds[type];
        if (!src) return;

        // Cacheia os áudios para reutilizá-los
        this.beepAudios ??= {};

        if (!this.beepAudios[type]) {
            this.beepAudios[type] = new Audio(src);
        }

        const audio = this.beepAudios[type];

        audio.volume = Math.max(0, Math.min(1, this.volume));
        audio.currentTime = 0;

        audio.play().catch((error) => {
            console.error(`Erro ao reproduzir o som "${type}":`, error);
        });
    }

    /**
     * TV Channel Switch click / CRT tuner pop
     */
    playChannelSwitch() {
        if (this.isMuted) return;

        if (!this.channelSwitchAudio) {
            this.channelSwitchAudio = new Audio(
                'sfx/click.mp3'
            );
        }

        this.channelSwitchAudio.volume = this.volume;
        this.channelSwitchAudio.currentTime = 0;

        this.channelSwitchAudio.play().catch((error) => {
            console.error('Erro ao reproduzir o som:', error);
        });
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
