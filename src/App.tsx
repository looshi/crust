
import * as React from 'react';
import { useReducer, useState, useEffect } from 'react';
// @ts-ignore next-line
import EventEmitter from 'event-emitter';
import queryString from 'query-string';
import { unmute } from './unmute/unmute';
import { reducer, initializeState } from './data/Reducer';
import Synth from './audio/Synth';
import { Actions } from './types/Types';

const eventEmitter = new EventEmitter();

// Initialize the state.
const urlData = queryString.parse(window.location.hash);
const initialState = initializeState(urlData);

let synth: Synth;

const App = () => {
  const [state, dispatch] = useReducer<React.Reducer<any, any>>(reducer, initialState);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

  useEffect(() => {
    synth?.update(state);
  }, [state])

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
      audioContext,
      dispatch,
      eventEmitter,
      state,
      // Amp: state.Amp,
      // Effects: state.Effects,
      // FilterState: state.Filter,
      // LFOs: state.LFOs,
      // Master: state.Master,
      // Oscillators: state.Oscillators,

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
      >Note</button>
      <h2>
        Amp
      </h2>
      <Fader
        value={state.Amp.attack}
        dispatch={dispatch}
        label="attack"
        actionType={Actions.AMP_ATTACK}
      />
      <Fader
        value={state.Amp.decay}
        dispatch={dispatch}
        label="decay"
        actionType={Actions.AMP_DECAY}
      />

      <Fader
        value={state.Amp.sustain}
        dispatch={dispatch}
        label="sustain"
        actionType={Actions.AMP_SUSTAIN}
      />

      <Fader
        value={state.Amp.release}
        dispatch={dispatch}
        label="release"
        actionType={Actions.AMP_RELEASE}
      />


      <h2>Filter</h2>
      <Fader
        value={state.Filter.freq}
        dispatch={dispatch}
        label="filter freq"
        actionType={Actions.FILTER_FREQUENCY}
      />

      <Fader
        value={state.Filter.res}
        dispatch={dispatch}
        label="filter res"
        actionType={Actions.FILTER_RES}
      />

      <Fader
        value={state.Filter.attack}
        dispatch={dispatch}
        label="filter attack"
        actionType={Actions.FILTER_ATTACK}
      />


      <Fader
        value={state.Filter.sustain}
        dispatch={dispatch}
        label="filter sustain"
        actionType={Actions.FILTER_SUSTAIN}
      />

      <Fader
        value={state.Filter.decay}
        dispatch={dispatch}
        label="filter decay"
        actionType={Actions.FILTER_DECAY}
      />

      <Fader
        value={state.Filter.release}
        dispatch={dispatch}
        label="filter release"
        actionType={Actions.FILTER_RELEASE}
      />

      <h2>Effects</h2>
      <Fader
        value={state.Effects.chorusAmount}
        dispatch={dispatch}
        label="chorus amount"
        actionType={Actions.CHORUS_AMOUNT}
      />

      <Fader
        value={state.Effects.chorusTime}
        dispatch={dispatch}
        label="chorus time"
        actionType={Actions.CHORUS_TIME}
      />

    </div >
  );

};

const Fader = ({
  value,
  dispatch,
  label,
  actionType,
}: {
  value: number,
  dispatch: React.Dispatch<any>,
  label: string,
  actionType: keyof typeof Actions,
}) => {
  return <div>
    <input
      type="range"
      id="freq-attack"
      name="freq-attack"
      min="0"
      max="100"
      step="1"
      onChange={(e) => {
        dispatch({
          type: actionType,
          value: e.target.value
        });
      }}
    />
    <label htmlFor="amp-attack">{label} {value}</label>
  </div >
}

export default App;

