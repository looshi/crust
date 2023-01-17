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

import { FilterStateType, EffectsStateType, LFODestination } from '../types/Types';

type Props = {
  audioContext: AudioContext,
  dispatch: (args: any) => any,
  eventEmitter: { on: (...args: any[]) => any },
  state: { [key: string]: any },
}

class Synth {
  FilterState: FilterStateType;
  Amp: { [key: string]: number };
  Master: { [key: string]: number };
  dispatch: Props['dispatch'];
  audioContext: Props['audioContext'];
  masterGain: GainNode;
  vcaGain: GainNode;
  limiter: DynamicsCompressorNode;
  distortion: WaveShaperNode;
  oscillatorsBus: GainNode;
  oscillators: Oscillator[];
  biquadFilter: Filter;

  freqAttack: number = 0;
  freqDecay: number = 0;
  freqFrequency: number = 0;
  freqSustain: number = 0;
  freqRelease: number = 0;
  freqRes: number = 0;

  chorus: Chorus;
  Arpeggiator: Arpeggiator;
  ArpNotes: any[];
  LFOs: LFO[];

  constructor(props: Props) {
    let {
      audioContext,
      dispatch,
      eventEmitter,
      state,
    } = props;

    this.FilterState = state.Filter;
    this.Amp = state.Amp;
    this.Master = state.Master;
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
    this.initOscillators(state.Oscillators, audioContext, state.Effects);

    // Filter
    this.biquadFilter = new Filter(audioContext);
    this.biquadFilter.Q = 0;  // prevent click when first note is played

    // Chorus
    this.chorus = new Chorus(audioContext);

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

    this.masterGain.gain.value = limit(0, 0.05, this.Master.volume / 100);

    this.masterGain.connect(this.limiter);

    this.limiter.connect(audioContext.destination);

    // LFOs
    this.LFOs = [];
    this.initLFOs(state.LFOs, audioContext);

    this.startListeners(eventEmitter);
  }

  noteOn(noteNumber: number, time?: number) {
    if (!time) {
      time = this.audioContext.currentTime;
    }
    this.oscillators.map((osc) => {
      osc.scheduleNote(time, noteNumber);
    });
    this.ampEnvelopeOn(time);
    this.filterEnvelopeOn(time);
  }

  noteOff(time?: number) {
    if (!time) {
      time = this.audioContext.currentTime;
    }
    this.ampEnvelopeOff(time);
    this.filterEnvelopeOff(time);
  }


  update(state: any) {
    this.freqAttack = state.Filter.attack;
    this.freqDecay = state.Filter.decay;
    this.freqFrequency = state.Filter.freq;
    this.freqSustain = state.Filter.sustain;
    this.freqRelease = state.Filter.release;
    this.freqRes = state.Filter.res;
    this.chorus.amount = state.Effects.chorusAmount;
    this.chorus.time = state.Effects.chorusTime;

    state.Oscillators.forEach((osc: Oscillator, index: number) => {
      this.oscillators[index].update(osc);
    })

  }

  // updateOsc(index: number, property: keyof Oscillator, val: any) {
  //   this.oscillators[index][property] = val;
  // }
  // set(property: keyof Synth, value: string | number) {
  //   this[property] = value;
  // }


  setAmpAttack(attack: number) {
    let { decay, sustain } = this.Amp;
    this.Arpeggiator.noteLength = attack + decay + sustain;
  }

  setAmpSustain(sustain: number) {
    let { attack, decay } = this.Amp;
    this.Arpeggiator.noteLength = attack + decay + sustain;
  }
  setAmpDecay(decay: number) {
    let { attack, sustain } = this.Amp;
    this.Arpeggiator.noteLength = attack + decay + sustain;
  }



  // setFreqAttack(val) {
  //   this.freqAttack = val;
  // }
  // setFreqSustain(val) {
  //   this.freqSustain = val;
  // }
  // setFreqDecay(val) {
  //   this.freqDecay = val;
  // }
  // setFreqRelease(val) {
  //   this.freqRelease = val;
  // }
  // setFreqFrequency(val) {
  //   this.freqFrequency = val;
  // }
  // setFreqRes(val) {
  //   this.freqRes = val;
  // }


  initOscillators(Oscillators: Oscillator[], audioContext: AudioContext, Effects: EffectsStateType) {
    Oscillators.map((o) => {
      let options = {
        id: o.id,
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


  initLFOs(LFOs: LFO[], audioContext: AudioContext) {
    LFOs.map((l: LFO) => {
      let options = {
        name: l.name,
        id: l.id,
        shape: l.shape,
        amount: l.amount,
        rate: l.rate,
        min: l.min,
        max: l.max,
        destinations: l.destinations,
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
  // { -readonly [P in keyof LFO]: LFO[P] }
  setLFO(index: number, property: keyof LFO, val: any) {
    this.LFOs[index][property] = val;
  }

  // Route LFOs to targets.
  routeLFO(lfo: LFO, destination: LFODestination) {
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
      if (!osc) {
        console.warn("Osc not found", id);
      }
      if (destination.property === 'detune') {
        osc?.connectPitchToLFO(lfo);
      } else if (destination.property === 'amount') {
        osc?.connectAmountToLFO(lfo);
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
      if (!targetLFO) {
        console.warn("Target LFO not found:", id);
      }
      lfo.connect(targetLFO?.lfoInputFrequency, 1);
    }
  }

  // Stores the notes played in the last few seconds from the last note played.
  // The notes will played in the order recieved by the arpeggiator.
  // Modeled after how the Akai Ax60 collects notes for its arpeggiator.
  collectArpNotes(noteNumber: number) {
    this.ArpNotes = this.ArpNotes.filter((note) => {
      return note.time > Date.now() - 5000;
    });
    this.ArpNotes.push({ noteNumber, time: Date.now() });

    let notes = this.ArpNotes.map((n) => n.noteNumber);
    this.Arpeggiator.notes = notes;
  }

  set chorusAmount(amount: number) {
    this.chorus.amount = amount;
  }

  set chorusTime(time: number) {
    this.chorus.time = time;
  }

  //  Arpeggiator properties.
  set arpIsOn(isOn: 1 | 0) {
    this.Arpeggiator.isOn = isOn;
  }
  set arpTempo(tempo: number) {
    this.Arpeggiator.tempo = tempo;
  }


  startListeners(eventEmitter: Props['eventEmitter']) {
    // Arpeggiator events.  These notes are scheduled in the near future.
    eventEmitter.on('ARP_NOTE_ON', (time: number, noteNumber: number) => {
      this.dispatch(Actions.keyboardNoteShow(noteNumber));
      this.ampEnvelopeOn(time);
      this.filterEnvelopeOn(time);
      this.oscillators.map((osc) => {
        osc.scheduleNote(time, noteNumber);
      });
    });
    eventEmitter.on('ARP_NOTE_OFF', (time: number, noteNumber: number) => {
      setTimeout(() => {
        this.dispatch(Actions.keyboardNoteHide(noteNumber));
      }, 50);
      this.ampEnvelopeOff(time);
      this.filterEnvelopeOff(time);
    });
    // Collects the recent notes played when the ARP is ON to form a sequence.
    eventEmitter.on('ARP_COLLECT_NOTE', (noteNumber: number) => {
      this.collectArpNotes(noteNumber);
    });
  }

  filterEnvelopeOn(now: number) {
    const attack = limit(0.001, 1, this.freqAttack / 100);
    const decay = limit(0.001, 1, this.freqDecay / 100);
    let sustain: number = (this.freqSustain / 100) * this.freqFrequency; // Sustain is a percentage of freq.  ?  Still need this ??
    sustain = limit(60, 20000, sustain * 100);
    const freq = limit(60, 20000, this.freqFrequency * 100);

    this.biquadFilter.Q = this.freqRes;
    this.biquadFilter.cancelScheduledValues(now);
    this.biquadFilter.setTargetAtTime(freq, now, attack);
    this.biquadFilter.setTargetAtTime(sustain, now + attack, decay);
  }

  filterEnvelopeOff(now: number) {
    const release = limit(0.02, 1, this.freqRelease / 50);

    this.biquadFilter.cancelScheduledValues(now);
    this.biquadFilter.setTargetAtTime(60, now, release);
  }

  ampEnvelopeOn(now: number) {
    let { gain } = this.vcaGain;
    let { attack, decay, sustain } = this.Amp;
    attack = limit(0.003, 1, attack / 100);
    decay = limit(0.001, 1, decay / 100);
    sustain = limit(0.001, 1, sustain / 100);

    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(1, now, attack);
    gain.setTargetAtTime(sustain, now + attack, decay);
  }

  ampEnvelopeOff(now: number) {
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
