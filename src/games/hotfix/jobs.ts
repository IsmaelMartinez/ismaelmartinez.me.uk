/**
 * HOTFIX's jobs: what a ringing phone box can ask for. Each one is a small
 * joke about something the site's owner actually maintains, and each uses a
 * different thing the city lets you do, so the deck is seven kinds of errand
 * and not one errand with seven names.
 *
 * DOM-free. A job is a list of stages played in order against one clock; the
 * brief and the place names are translated by the page, keyed by `id`.
 */
import type { PlaceId } from './map';

export type Stage =
  /** Get to a place and slow down there. */
  | { type: 'goto'; place: PlaceId }
  /** Pass every place, in any order, at any speed. */
  | { type: 'sweep'; places: PlaceId[] }
  /** Squash `count` bugs let loose around a place. */
  | { type: 'squash'; place: PlaceId; count: number }
  /** Round up `count` penguins around a place, on foot. */
  | { type: 'collect'; place: PlaceId; count: number }
  /** Find one of these places with no marker and no arrow: by ear, or by the signal meter. */
  | { type: 'sonar'; places: PlaceId[] };

export type JobId =
  | 'prodDown'
  | 'penguins'
  | 'butler'
  | 'wardrive'
  | 'triage'
  | 'audiogram'
  | 'paella'
  | 'reviewer'
  | 'lighthouse';

export interface JobDef {
  id: JobId;
  stages: Stage[];
  /** Seconds for the whole job. */
  time: number;
  /** The fee before the multiplier and the time bonus. */
  pay: number;
  /** A passenger who docks the fee for every bump once aboard. */
  fragile?: boolean;
}

const job = (def: JobDef): JobDef => def;

export const JOBS: Record<JobId, JobDef> = {
  // Production is down. It is always production.
  prodDown: job({ id: 'prodDown', stages: [{ type: 'goto', place: 'datacentre' }], time: 45, pay: 400 }),
  // teams-for-linux: the user group's penguins are out.
  penguins: job({
    id: 'penguins',
    stages: [{ type: 'collect', place: 'seat', count: 5 }, { type: 'goto', place: 'hall' }],
    time: 100,
    pay: 700
  }),
  // repo-butler: Reginald takes the car, and takes notes.
  butler: job({
    id: 'butler',
    stages: [{ type: 'goto', place: 'castle' }, { type: 'goto', place: 'basilica' }],
    time: 75,
    pay: 700,
    fragile: true
  }),
  // wifisentinel: three open hotspots want auditing.
  wardrive: job({ id: 'wardrive', stages: [{ type: 'sweep', places: ['pub', 'mercat', 'docks'] }], time: 75, pay: 650 }),
  // github-issue-triage-bot: a release shipped with bugs.
  triage: job({ id: 'triage', stages: [{ type: 'squash', place: 'mercat', count: 8 }], time: 70, pay: 600 }),
  // yourear and sound3fy: find it by listening.
  audiogram: job({
    id: 'audiogram',
    stages: [{ type: 'goto', place: 'clinic' }, { type: 'sonar', places: ['lighthouse', 'seat', 'hall', 'docks'] }],
    time: 95,
    pay: 800
  }),
  // Lunch, from one home to the other.
  paella: job({
    id: 'paella',
    stages: [{ type: 'goto', place: 'mercat' }, { type: 'goto', place: 'pub' }],
    time: 60,
    pay: 500
  }),
  // Open source: a pull request needs its second reviewer.
  reviewer: job({
    id: 'reviewer',
    stages: [{ type: 'goto', place: 'hall' }, { type: 'goto', place: 'datacentre' }],
    time: 65,
    pay: 550
  }),
  // The keeper is on a call and the call keeps dropping.
  lighthouse: job({ id: 'lighthouse', stages: [{ type: 'goto', place: 'lighthouse' }], time: 50, pay: 450 })
};
