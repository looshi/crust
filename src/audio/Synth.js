/*
Synth
Contains all the audio components which comprise the synth.
Nodes are connected in this order :
Oscillators -> Osc Bus -> Distortion (subtle) -> Filter -> VCA -> Master
*/
import Oscillator from './Oscillator.js';
import Chorus from './Chorus.js';
import Filter from './Filter.js';
import LFO from './LFO.js';
import Arpeggiator from './Arpeggiator/Arpeggiator.js';
import { limit } from '../helpers/helpers.js';
import Actions from '../data/Actions.js';

class Synth {
  constructor({
    Amp,
    audioContext,
    dispatch,
    Effects,
    eventEmitter,
    FilterState,
    LFOs,
    Master,
    Oscillators,
    store,
  }) {

    this.FilterState = FilterState;
    this.Amp = Amp;
    this.Master = Master;
    this.dispatch = dispatch;

    this.audioContext = audioContext;

    // Amp
    this.masterGain = audioContext.createGain();
    this.vcaGain = audioContext.createGain();
    this.vcaGain.gain.value = 0;

    // Limiter
    this.limiter = audioContext.createDynamicsCompressor();
    this.limiter.threshold.value = 0.0;
    this.limiter.knee.value = 0.0;
    this.limiter.ratio.value = 20.0;
    this.limiter.attack.value = 0.005;
    this.limiter.release.value = 0.050;

    // Distortion
    this.distortion = audioContext.createWaveShaper();
    this.distortion.curve = this.makeDistortionCurve();
    this.distortion.oversample = '4x';

    // Oscillators bus
    this.oscillatorsBus = audioContext.createGain();
    this.oscillatorsBus.gain.value = 1;
    this.oscillators = [];
    this.initOscillators(Oscillators, audioContext, Effects);

    // Filter
    this.biquadFilter = new Filter(audioContext);
    // prevent click when first note is played
    this.biquadFilter.Q = 0;

    // Chorus
    this.chorus = new Chorus(audioContext, store);
    this.chorus.amount = Effects.chorusAmount;
    this.chorus.time = Effects.chorusTime;

    // Arpeggiator
    let options = {
      audioContext,
      eventEmitter: eventEmitter,
      ampEnvelopeOn: this.ampEnvelopeOn.bind(this),
      ampEnvelopeOff: this.ampEnvelopeOff.bind(this)
    };
    this.Arpeggiator = new Arpeggiator(options);
    this.ArpNotes = [];

    // Connections
    this.oscillatorsBus.connect(this.biquadFilter.input);

    // TODO reconnect distortion
    //this.distortion.connect(this.biquadFilter.input)

    this.biquadFilter.output.connect(this.vcaGain);

    this.vcaGain.connect(this.chorus.inputLeft);
    this.vcaGain.connect(this.chorus.inputRight);
    this.chorus.connect(this.masterGain);
    this.vcaGain.connect(this.masterGain);

    this.masterGain.connect(this.limiter);
    this.masterGain.gain.value = limit(0, 1, this.Master.volume / 100);
    this.limiter.connect(audioContext.destination);

    // LFOs
    this.LFOs = [];
    this.initLFOs(LFOs, audioContext);

    this.startListeners(eventEmitter, audioContext);
  }

  noteOn(noteNumber, time) {
    if (!time) {
      time = this.audioContext.currentTime;
    }
    this.oscillators.map((osc) => {
      osc.scheduleNote(time, noteNumber);
    });
    this.ampEnvelopeOn(time);
    this.filterEnvelopeOn(time);
  }

  noteOff(time) {
    if (!time) {
      time = this.audioContext.currentTime;
    }
    this.ampEnvelopeOff(time);
    this.filterEnvelopeOff(time);
  }

  set ampDecay(decay) {
    let { attack, sustain } = this.Amp;
    this.Arpeggiator.noteLength = attack + decay + sustain;
  }

  set ampAttack(attack) {
    let { decay, sustain } = this.Amp;
    this.Arpeggiator.noteLength = attack + decay + sustain;
  }

  set ampSustain(sustain) {
    let { attack, decay } = this.Amp;
    this.Arpeggiator.noteLength = attack + decay + sustain;
  }


  initOscillators(Oscillators, audioContext, Effects) {
    Oscillators.map((o) => {
      let options = {
        id: o.id,
        name: o.name,
        computedChannelData: o.computedChannelData,
        detune: o.detune,
        octave: o.octave,
        amount: o.amount,
        note: o.note,
        audioContext,
        output: this.oscillatorsBus,
        glide: Effects.glide
      };

      let osc = new Oscillator(options);
      this.oscillators.push(osc);
    });
  }

  /*
  'amount',
    'detune',
    'note',
    'octave',
    'computedChannelData',
    'glide'
  */
  setOsc(index, property, val) {
    this.oscillators[index][property] = val;
  }

  initLFOs(LFOs, audioContext) {
    LFOs.map((l) => {
      let options = {
        name: l.name,
        id: l.id,
        shape: l.shape,
        amount: l.amount,
        rate: l.rate,
        min: l.min,
        max: l.max,
        destination: l.destination,
        audioContext,
      };

      let lfo = new LFO(options);
      this.LFOs.push(lfo);
    });
  }
  /*
    'destination',
    'amount',
    'rate',
    'min',
    'max',
  */
  setLFO(index, property, val) {
    this.LFOs[index][property] = val;
  }

  // Route LFOs to targets.
  routeLFO(lfo, destination) {
    lfo.disconnect();
    // Disconnect the LFO from any oscillators ( if it was set to any ).
    this.oscillators.map((osc) => {
      osc.disconnectPitchFromLFO(lfo);
      osc.disconnectAmountFromLFO(lfo);
    });

    let id = destination.moduleId;

    // LFO to Amp.
    if (id === 'amp') {
      lfo.connect(this.oscillatorsBus.gain, 0.04);
    }

    // LFO to Filter.
    if (id === 'filter') {
      // Have to do this for each filter instance.
      this.biquadFilter.filters.forEach((filter) => {
        lfo.connect(filter.detune, 50);
      });
    }

    // LFO to oscillator detune and amount.
    if (id === 'oscAll') {
      this.oscillators.map((osc) => {
        osc.connectPitchToLFO(lfo, true);
      });
    }
    if (id && id[0] === 'o' && id !== 'oscAll') {
      let osc = this.oscillators.find((osc) => osc.id === id);
      if (destination.property === 'detune') {
        osc.connectPitchToLFO(lfo);
      } else if (destination.property === 'amount') {
        osc.connectAmountToLFO(lfo);
      }
    }

    // LFO to Effects.
    if (id === 'effects') {
      if (destination.property === 'chorusTime') {
        lfo.connect(this.chorus.lfoInputTime, 0.01);
      } else if (destination.property === 'chorusAmount') {
        lfo.connect(this.chorus.lfoInputAmount, 0.05);
      }
    }

    // LFO to LFO.
    if (id && id[0] === 'l') {
      let targetLFO = this.LFOs.find((l) => l.id === id);
      lfo.connect(targetLFO.lfoInputFrequency, 1);
    }
  }

  // Stores the notes played in the last few seconds from the last note played.
  // The notes will played in the order recieved by the arpeggiator.
  // Modeled after how the Akai Ax60 collects notes for its arpeggiator.
  collectArpNotes(noteNumber) {
    this.ArpNotes = this.ArpNotes.filter((note) => {
      return note.time > Date.now() - 5000;
    });
    this.ArpNotes.push({ noteNumber, time: Date.now() });

    let notes = this.ArpNotes.map((n) => n.noteNumber);
    this.Arpeggiator.notes = notes;
  }

  set chorusAmount(amount) {
    this.chorus.amount = amount;
  }

  set chorusTime(time) {
    this.chorus.time = time;
  }

  //  Arpeggiator properties.
  set arpIsOn(isOn) {
    this.Arpeggiator.isOn = isOn;
  }
  set arpTempo(tempo) {
    this.Arpeggiator.tempo = tempo;
  }




  startListeners(eventEmitter) {
    // Arpeggiator events.  These notes are scheduled in the near future.
    eventEmitter.on('ARP_NOTE_ON', (time, noteNumber) => {
      this.dispatch(Actions.keyboardNoteShow(noteNumber));
      this.ampEnvelopeOn(time);
      this.filterEnvelopeOn(time);
      this.oscillators.map((osc) => {
        osc.scheduleNote(time, noteNumber);
      });
    });
    eventEmitter.on('ARP_NOTE_OFF', (time, noteNumber) => {
      setTimeout(() => {
        this.dispatch(Actions.keyboardNoteHide(noteNumber));
      }, 50);
      this.ampEnvelopeOff(time);
      this.filterEnvelopeOff(time);
    });
    // Collects the recent notes played when the ARP is ON to form a sequence.
    eventEmitter.on('ARP_COLLECT_NOTE', (noteNumber) => {
      this.collectArpNotes(noteNumber);
    });
  }

  filterEnvelopeOn(now) {
    let { attack, decay, sustain, freq } = this.FilterState;
    attack = limit(0.001, 1, attack / 100);
    decay = limit(0.001, 1, decay / 100);
    sustain = (sustain / 100) * freq; // Sustain is a percentage of freq.
    sustain = limit(60, 20000, sustain * 100);
    freq = limit(60, 20000, freq * 100);

    this.biquadFilter.Q = this.FilterState.res;
    this.biquadFilter.cancelScheduledValues(now);
    this.biquadFilter.setTargetAtTime(freq, now, attack);
    this.biquadFilter.setTargetAtTime(sustain, now + attack, decay);
  }

  filterEnvelopeOff(now) {
    let { release } = this.FilterState;
    release = limit(0.02, 1, release / 50);

    this.biquadFilter.cancelScheduledValues(now);
    this.biquadFilter.setTargetAtTime(60, now, release);
  }

  ampEnvelopeOn(now) {
    let { gain } = this.vcaGain;
    let { attack, decay, sustain } = this.Amp;
    attack = limit(0.003, 1, attack / 100);
    decay = limit(0.001, 1, decay / 100);
    sustain = limit(0.001, 1, sustain / 100);

    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(1, now, attack);
    gain.setTargetAtTime(sustain, now + attack, decay);
  }

  ampEnvelopeOff(now) {
    let { gain } = this.vcaGain;
    let { release } = this.Amp;
    release = limit(0.02, 1, release / 100);

    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(0, now, release);
  }

  // http://www.carbon111.com/waveshaping1.html
  // f(x)=(arctan x)/pi
  makeDistortionCurve() {
    let nSamples = 44100;
    let curve = new Float32Array(nSamples);
    let x;
    for (var i = 0; i < nSamples; ++i) {
      x = i * 2 / nSamples - 1;
      curve[i] = Math.atan(x) / (Math.PI / 2);
    }
    return curve;
  }
}

export default Synth;
