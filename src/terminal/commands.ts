/**
 * The home page terminal's command interpreter.
 *
 * Pure and DOM-free, like the arcade's game logic: `run` turns one input line
 * into the lines to print plus at most one effect for the page to perform
 * (navigate, open a tab, clear, switch theme), and `complete` does Tab
 * completion. `dom.ts` owns the input, the history and the effects.
 *
 * Everything the terminal knows arrives as `TerminalData`, composed server-side
 * in `Hero.astro`: the strings come from `useTranslations` there, so this
 * module never imports the translations dictionary and the client bundle does
 * not carry three locales to print a dozen lines.
 *
 * The arcade's unlock chain is respected rather than bypassed. The floor is
 * passed in per command (`GameFloor`, from `visibleCabinets`), and a cabinet
 * the floor has not revealed is answered exactly like a name that is not a
 * cabinet at all, so the terminal can never be used to learn what is next.
 */

export const TERMINAL_STRING_KEYS = [
  'hint',
  'inputLabel',
  'helpTitle',
  'helpHelp',
  'helpLs',
  'helpCat',
  'helpSearch',
  'helpOpen',
  'helpPlay',
  'helpTheme',
  'helpLang',
  'helpClear',
  'notFound',
  'noFile',
  'usage',
  'noMatches',
  'matches',
  'locked',
  'closed',
  'opening',
  'readHint',
  'listHint',
  'sudo',
] as const;

export type TerminalStringKey = typeof TERMINAL_STRING_KEYS[number];
export type TerminalStrings = Record<TerminalStringKey, string>;

export interface TerminalArticle {
  slug: string;
  title: string;
  description: string;
  /** Already formatted for the locale. */
  date: string;
  tags: string[];
  href: string;
}

export interface TerminalProject {
  name: string;
  url: string;
}

export interface TerminalData {
  name: string;
  role: string;
  motto: string;
  /** Newest first; `ls articles` numbers them in this order and `open 3` reads it back. */
  articles: TerminalArticle[];
  projects: TerminalProject[];
  /**
   * The released chain, in floor order (`src/data/release.ts`). Empty while the
   * arcade is still under construction, when every arcade command answers
   * with the `closed` notice instead and `arcadeHref` leads nowhere.
   */
  games: string[];
  arcadeHref: string;
  /** Prefix a cabinet id is appended to, e.g. `/en/fun/`. */
  gameHrefPrefix: string;
  /** Locale code to that locale's home page. */
  langHrefs: Record<string, string>;
  strings: TerminalStrings;
}

/** The arcade floor as `visibleCabinets` reports it. */
export interface GameFloor {
  unlocked: readonly string[];
  next: string | null;
}

export type Tone = 'out' | 'muted' | 'accent' | 'error';

export interface Segment {
  text: string;
  tone?: Tone;
  href?: string;
  external?: boolean;
  /**
   * A column cell. Consecutive lines of cells are laid out as one grid, the
   * last column taking the remaining width, so long text wraps inside its own
   * column instead of under the first one.
   */
  cell?: boolean;
}

export type Line = Segment[];

export type Effect =
  | { kind: 'navigate'; href: string }
  | { kind: 'external'; href: string }
  | { kind: 'clear' }
  | { kind: 'theme'; mode: 'dark' | 'light' | 'toggle' };

export interface Result {
  lines: Line[];
  effect?: Effect;
}

/** Command names, in the order `help` lists them. Aliases are not listed. */
const HELP: ReadonlyArray<[usage: string, key: TerminalStringKey]> = [
  ['help', 'helpHelp'],
  ['ls [articles|projects|games]', 'helpLs'],
  ['cat <article>', 'helpCat'],
  ['search <words>', 'helpSearch'],
  ['open <article|game|project>', 'helpOpen'],
  ['play <game>', 'helpPlay'],
  ['theme [dark|light]', 'helpTheme'],
  ['lang <en|es|cat>', 'helpLang'],
  ['clear', 'helpClear'],
];

const COMMANDS = ['help', 'ls', 'cat', 'search', 'grep', 'open', 'play', 'theme', 'lang', 'clear', 'whoami', 'echo'];
const DIRECTORIES = ['articles', 'projects', 'games'];

/** Fills `{name}` placeholders. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/** Lower case with accents stripped, so `senal` finds `Señal` and `agentics` finds `agèntics`. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

const out = (text: string, tone: Tone = 'out'): Line => [{ text, tone }];

/** An article by its 1-based `ls articles` number or by its slug. */
function findArticle(ref: string, data: TerminalData): { article: TerminalArticle; index: number } | null {
  if (/^\d+$/.test(ref)) {
    const index = Number(ref) - 1;
    const article = data.articles[index];
    return article ? { article, index } : null;
  }
  const index = data.articles.findIndex(a => a.slug === ref.toLowerCase());
  return index === -1 ? null : { article: data.articles[index], index };
}

function articleRow(article: TerminalArticle, index: number): Line {
  return [
    { text: `[${index + 1}]`, tone: 'accent', cell: true },
    { text: article.date, tone: 'muted', cell: true },
    { text: article.title, href: article.href, cell: true },
  ];
}

const arcadeClosed = (data: TerminalData): boolean => data.games.length === 0;

const closedNotice = (data: TerminalData): Result => ({ lines: [out(data.strings.closed, 'muted')] });

function listGames(data: TerminalData, floor: GameFloor): Line[] {
  if (arcadeClosed(data)) return closedNotice(data).lines;
  const lines: Line[] = floor.unlocked.map(id => [{ text: id, href: `${data.gameHrefPrefix}${id}` }]);
  if (floor.next) {
    const newest = floor.unlocked[floor.unlocked.length - 1];
    lines.push([
      { text: '???  ', tone: 'muted' },
      { text: fill(data.strings.locked, { game: newest }), tone: 'muted' },
    ]);
  }
  return lines;
}

function ls(arg: string | undefined, data: TerminalData, floor: GameFloor): Result {
  switch (arg?.replace(/\/$/, '').toLowerCase()) {
    case undefined:
      return { lines: [DIRECTORIES.map(dir => ({ text: `${dir}/  `, tone: 'accent' as Tone }))] };
    case 'articles':
      return {
        lines: [...data.articles.map(articleRow), out(data.strings.listHint, 'muted')],
      };
    case 'projects':
      return {
        lines: data.projects.map(project => [{ text: project.name, href: project.url, external: true }]),
      };
    case 'games':
      return { lines: listGames(data, floor) };
    default:
      return { lines: [out(fill(data.strings.noFile, { name: arg ?? '' }), 'error')] };
  }
}

function cat(arg: string | undefined, data: TerminalData): Result {
  if (!arg) return usage('cat <article>', data);
  if (arg.toLowerCase() === 'role') return { lines: [out(data.role)] };
  const found = findArticle(arg, data);
  if (!found) return { lines: [out(fill(data.strings.noFile, { name: arg }), 'error')] };
  const { article, index } = found;
  const lines: Line[] = [
    [{ text: article.title, tone: 'accent', href: article.href }],
    out(article.date, 'muted'),
    out(article.description),
  ];
  if (article.tags.length > 0) lines.push(out(article.tags.map(tag => `#${tag}`).join(' '), 'muted'));
  lines.push(out(fill(data.strings.readHint, { ref: index + 1 }), 'muted'));
  return { lines };
}

function search(words: string[], data: TerminalData): Result {
  if (words.length === 0) return usage('search <words>', data);
  const terms = words.map(fold);
  const hits = data.articles
    .map((article, index) => ({ article, index }))
    .filter(({ article }) => {
      const haystack = fold([article.title, article.description, ...article.tags].join(' '));
      return terms.every(term => haystack.includes(term));
    });
  const query = words.join(' ');
  if (hits.length === 0) return { lines: [out(fill(data.strings.noMatches, { query }), 'muted')] };
  return {
    lines: [
      out(fill(data.strings.matches, { count: hits.length, query }), 'muted'),
      ...hits.map(({ article, index }) => articleRow(article, index)),
    ],
  };
}

function opening(target: string, data: TerminalData): Line {
  return out(fill(data.strings.opening, { target }), 'muted');
}

function open(arg: string | undefined, data: TerminalData, floor: GameFloor): Result {
  if (!arg) return usage('open <article|game|project>', data);
  const found = findArticle(arg, data);
  if (found) {
    return { lines: [opening(found.article.title, data)], effect: { kind: 'navigate', href: found.article.href } };
  }
  const name = arg.toLowerCase();
  if (name === 'arcade') {
    if (arcadeClosed(data)) return closedNotice(data);
    return { lines: [opening('arcade', data)], effect: { kind: 'navigate', href: data.arcadeHref } };
  }
  if (floor.unlocked.includes(name)) return playGame(name, data);
  const project = data.projects.find(p => p.name.toLowerCase() === name);
  if (project) {
    return { lines: [opening(project.name, data)], effect: { kind: 'external', href: project.url } };
  }
  return { lines: [out(fill(data.strings.noFile, { name: arg }), 'error')] };
}

function playGame(id: string, data: TerminalData): Result {
  return { lines: [opening(id, data)], effect: { kind: 'navigate', href: `${data.gameHrefPrefix}${id}` } };
}

function play(arg: string | undefined, data: TerminalData, floor: GameFloor): Result {
  if (!arg || arcadeClosed(data)) return { lines: listGames(data, floor) };
  const id = arg.toLowerCase();
  // A shrouded cabinet answers exactly like a name that is not one, so `play`
  // cannot be used to probe the unlock chain for what comes next.
  if (!floor.unlocked.includes(id)) return { lines: [out(fill(data.strings.noFile, { name: arg }), 'error')] };
  return playGame(id, data);
}

function usage(form: string, data: TerminalData): Result {
  return { lines: [out(fill(data.strings.usage, { usage: form }), 'error')] };
}

function help(data: TerminalData): Result {
  return {
    lines: [
      out(data.strings.helpTitle, 'muted'),
      ...HELP.map(([form, key]): Line => [
        { text: form, tone: 'accent', cell: true },
        { text: data.strings[key], tone: 'muted', cell: true },
      ]),
    ],
  };
}

/** Runs one input line. */
export function run(input: string, data: TerminalData, floor: GameFloor): Result {
  const trimmed = input.trim();
  if (trimmed === '') return { lines: [] };
  const [rawCommand, ...args] = trimmed.split(/\s+/);
  const command = rawCommand.toLowerCase();

  switch (command) {
    case 'help':
    case '?':
      return help(data);
    case 'ls':
    case 'dir':
      return ls(args[0], data, floor);
    case 'cat':
      return cat(args[0], data);
    case 'search':
    case 'grep':
      return search(args, data);
    case 'open':
    case 'cd':
      return open(args[0], data, floor);
    case 'play':
      return play(args[0], data, floor);
    case 'theme': {
      const mode = args[0]?.toLowerCase();
      if (mode === undefined) return { lines: [], effect: { kind: 'theme', mode: 'toggle' } };
      if (mode === 'dark' || mode === 'light') return { lines: [], effect: { kind: 'theme', mode } };
      return usage('theme [dark|light]', data);
    }
    case 'lang': {
      const code = args[0]?.toLowerCase();
      const href = code ? data.langHrefs[code] : undefined;
      if (!href) return usage(`lang <${Object.keys(data.langHrefs).join('|')}>`, data);
      return { lines: [opening(code!, data)], effect: { kind: 'navigate', href } };
    }
    case 'clear':
    case 'cls':
      return { lines: [], effect: { kind: 'clear' } };
    case 'whoami':
      return { lines: [out(data.name)] };
    case 'echo': {
      const text = trimmed.slice(rawCommand.length).trim();
      return { lines: [out(text === '$MOTTO' ? data.motto : text)] };
    }
    case 'sudo':
      return { lines: [out(data.strings.sudo, 'error')] };
    default:
      return { lines: [out(fill(data.strings.notFound, { command: rawCommand }), 'error')] };
  }
}

export interface Completion {
  /** The input with the shared prefix of every candidate filled in. */
  value: string;
  /** Every candidate, when there is more than one to choose from. */
  options: string[];
}

function candidatesFor(command: string, data: TerminalData, floor: GameFloor): string[] {
  const slugs = data.articles.map(a => a.slug);
  switch (command) {
    case 'ls':
    case 'dir':
      return DIRECTORIES;
    case 'cat':
      return ['role', ...slugs];
    case 'open':
    case 'cd':
      return [...slugs, ...(arcadeClosed(data) ? [] : ['arcade']), ...floor.unlocked, ...data.projects.map(p => p.name)];
    case 'play':
      return [...floor.unlocked];
    case 'theme':
      return ['dark', 'light'];
    case 'lang':
      return Object.keys(data.langHrefs);
    default:
      return [];
  }
}

function sharedPrefix(words: string[]): string {
  let prefix = words[0];
  for (const word of words.slice(1)) {
    while (!word.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

/** Tab completion for the command word, or for a command's first argument. */
export function complete(input: string, data: TerminalData, floor: GameFloor): Completion {
  const match = /^(\S*)(\s+)?(\S*)$/.exec(input.trimStart());
  if (!match) return { value: input, options: [] };
  const [, command, gap, partial] = match;
  const before = gap ? `${command}${gap}` : '';
  const word = gap ? partial : command;
  const pool = gap ? candidatesFor(command.toLowerCase(), data, floor) : COMMANDS;
  const hits = [...new Set(pool)].filter(c => c.toLowerCase().startsWith(word.toLowerCase()));
  if (hits.length === 0) return { value: input, options: [] };
  if (hits.length === 1) return { value: `${before}${hits[0]} `, options: [] };
  const prefix = sharedPrefix(hits);
  return { value: `${before}${prefix.length > word.length ? prefix : word}`, options: hits };
}
