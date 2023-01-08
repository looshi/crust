
import * as React from 'react';
import { useReducer, useState } from 'react';
// @ts-ignore next-line
import EventEmitter from 'event-emitter';
import queryString from 'query-string';
import { unmute } from './unmute/unmute';
import { reducer, initializeState } from './data/Reducer';
import Synth from './audio/Synth';

const eventEmitter = new EventEmitter();

// Initialize the state.
const urlData = queryString.parse(window.location.hash);
const initialState = initializeState(urlData);

let synth: any;

const App = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
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
      <button onClick={() => synth.noteOn(49)}>Note On</button>
      <button onClick={() => synth.noteOff()}>Note Off</button>
    </div >
  );

};

export default App;

