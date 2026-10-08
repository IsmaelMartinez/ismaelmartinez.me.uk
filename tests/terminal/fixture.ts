import {
  TERMINAL_STRING_KEYS,
  type GameFloor,
  type Line,
  type TerminalData,
  type TerminalStrings,
} from '../../src/terminal/commands';

/** Every string is its own key wrapped in brackets, plus its placeholders, so tests can see which one printed. */
const strings = Object.fromEntries(TERMINAL_STRING_KEYS.map(key => [key, `[${key}]`])) as TerminalStrings;
strings.notFound = '[notFound] {command}';
strings.noFile = '[noFile] {name}';
strings.usage = '[usage] {usage}';
strings.noMatches = '[noMatches] {query}';
strings.matches = '[matches] {count} {query}';
strings.locked = '[locked] {game}';
strings.opening = '[opening] {target}';
strings.readHint = '[readHint] {ref}';

export const data: TerminalData = {
  name: 'Ada Example',
  role: 'Principal Tester',
  motto: 'Or at least trying to.',
  articles: [
    {
      slug: 'opentelemetry-signals',
      title: 'Senyals d’OpenTelemetry',
      description: 'What each signal is for.',
      date: '27 Feb 2026',
      tags: ['Observability'],
      href: '/en/articles/opentelemetry-signals',
    },
    {
      slug: 'the-ai-automation-trap',
      title: 'The AI Automation Trap',
      description: 'Automating the wrong thing faster.',
      date: '26 Jan 2026',
      tags: ['AI', 'Automation'],
      href: '/en/articles/the-ai-automation-trap',
    },
    {
      slug: 'event-driven-architectures',
      title: 'Event Driven Architectures',
      description: 'Events, mediators and agèntics in distributed systems.',
      date: '16 May 2024',
      tags: ['Architecture'],
      href: '/en/articles/event-driven-architectures',
    },
  ],
  projects: [
    { name: 'teams-for-linux', url: 'https://example.com/teams-for-linux' },
    { name: 'repo-butler', url: 'https://example.com/repo-butler' },
  ],
  arcadeHref: '/en/fun',
  gameHrefPrefix: '/en/fun/',
  langHrefs: { en: '/en/', es: '/es/', cat: '/cat/' },
  strings,
};

/** A floor two cabinets in: tanks and snake open, cascade shrouded. */
export const floor: GameFloor = { unlocked: ['tanks', 'snake'], next: 'cascade' };

/** A printed line as plain text, with two spaces where the renderer puts a column gap. */
export const text = (line: Line): string =>
  line.map(segment => segment.text).join(line.some(segment => segment.cell) ? '  ' : '');
