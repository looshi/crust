export type FilterStateType = {
  id: 'filter',
  freq: number,
  res: number,
  attack: number,
  decay: number,
  sustain: number,
  release: number,
}

export type EffectsStateType = {
  id: 'effects',
  chorusAmount: number,
  chorusTime: number,
  glide: number,
  arpIsOn: 1 | 0;  // 1 is on
  arpTempo: number;
}

export type LFODestination = {
  id: string;
  label: string;
  moduleId: string;
  property: string;
}
