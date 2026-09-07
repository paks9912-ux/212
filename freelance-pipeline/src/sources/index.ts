import { hn } from './hn.js';
import { reddit } from './reddit.js';
import { telegram } from './telegram.js';
import { freelancer } from './freelancer.js';
import type { Source } from './base.js';
export const SOURCES: Source[] = [hn, reddit, telegram, freelancer];
