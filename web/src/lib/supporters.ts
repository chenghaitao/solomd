/**
 * The supporter lists — sponsors and testers — from the one file every surface
 * reads (public/sponsors.json: this site, the README script, the app's About
 * dialog).
 *
 * The fork dropped the promoter half of this file along with the /promote
 * program itself.
 */
import data from '../../public/sponsors.json';

export interface Sponsor {
  name: string;
  since: string;
  github?: string;
  url?: string;
}

export interface Tester {
  name: string;
  since: string;
  /** What they tested, per language. */
  contribution: { en: string; zh: string };
  github?: string;
}

export const sponsors: Sponsor[] = (data as { sponsors: Sponsor[] }).sponsors ?? [];
export const testers: Tester[] = (data as { testers?: Tester[] }).testers ?? [];
