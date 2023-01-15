
import * as React from 'react';
import { useReducer, useState } from 'react';
// @ts-ignore next-line
import EventEmitter from 'event-emitter';
import queryString from 'query-string';
import { unmute } from './unmute/unmute';
import { reducer, initializeState } from './data/Reducer';
import Synth from './audio/Synth';
import Actions from './data/Actions';

const eventEmitter = new EventEmitter();

// Initialize the state.
const urlData = queryString.parse(window.location.hash);
const initialState = initializeState(urlData);

let synth: any;

const App = () => {
  const [state, dispatch] = useReducer<React.Reducer<any, any>>(reducer, initialState);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

  if (!audioContext) {
    return (
      <div className="get-started">
        <h1>Welcome to Crust</h1>
        {/* audio context must be created on a user initiated event */}
        <button
          onClick={() => setAudioContext(new AudioContext())}>
          Click Here to Start
        </button>
      </div>
    );
  }

  if (!synth) {
    unmute(audioContext, false, false);
    synth = new Synth({
      Amp: state.Amp,
      audioContext,
      dispatch,
      Effects: state.Effects,
      eventEmitter,
      FilterState: state.Filter,
      LFOs: state.LFOs,
      Master: state.Master,
      Oscillators: state.Oscillators,
      store: state, // ?
    });
  }

  return (
    <div>
      <h1>
        Crust
      </h1>
      <button
        onMouseDown={() => synth.noteOn(49)}
        onMouseUp={() => synth.noteOff()}
      >Note </button>
      <input
        type="range"
        id="amp-attack"
        name="amp-attack"
        min="0"
        max="100"
        step="1"
        onChange={(e) => {
          dispatch(Actions.filterSliderChanged("amp-attack", e.target.value, "amp-attack"));
          // synth.setAmpAttack(e.target.value);
          // synth.setFreqAttack(e.target.value);
        }}
      />
      <label htmlFor="amp-attack">amp attack</label>
    </div >
  );

};

export default App;

