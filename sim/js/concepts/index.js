// Concept registry for the concept lab (SIM-030). Order = display order.
import sledpack from './sledpack/index.js';
import activetether from './activetether/index.js';
import boom360 from './boom360/index.js';
import trackdrone from './trackdrone/index.js';
import tetherdrone from './tetherdrone/index.js';
import kite2 from './kite2/index.js';
import towglider from './towglider/index.js';
import descentglider from './descentglider/index.js';
import leapfrog from './leapfrog/index.js';
import baseline from './baseline/index.js';

export const CONCEPTS = [sledpack, activetether, kite2, towglider, descentglider, leapfrog, tetherdrone, trackdrone, boom360, baseline];
export const conceptById = (id) => CONCEPTS.find((c) => c.id === id);
