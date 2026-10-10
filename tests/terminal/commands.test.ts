import { describe, it, expect } from 'vitest';
import { run, complete, fill } from '../../src/terminal/commands';
import { data, floor, closedData, closedFloor, text } from './fixture';

const printed = (input: string) => run(input, data, floor).lines.map(text);

describe('run', () => {
  it('prints nothing for an empty line', () => {
    expect(run('   ', data, floor)).toEqual({ lines: [] });
  });

  it('lists every documented command with its localised description', () => {
    const lines = printed('help');
    expect(lines[0]).toBe('[helpTitle]');
    for (const [command, key] of [
      ['help', 'helpHelp'],
      ['ls', 'helpLs'],
      ['cat', 'helpCat'],
      ['search', 'helpSearch'],
      ['open', 'helpOpen'],
      ['play', 'helpPlay'],
      ['theme', 'helpTheme'],
      ['lang', 'helpLang'],
      ['clear', 'helpClear'],
    ]) {
      expect(lines.some(line => line.startsWith(command) && line.endsWith(`[${key}]`))).toBe(true);
    }
  });

  it('lays help out in columns rather than padding with spaces, so a narrow screen can stack them', () => {
    const rows = run('help', data, floor).lines.slice(1);
    expect(rows.every(row => row.length === 2 && row.every(segment => segment.cell))).toBe(true);
    expect(rows.every(row => !row[0].text.endsWith(' '))).toBe(true);
  });

  it('names an unknown command back in an error line', () => {
    const [line] = run('rm -rf /', data, floor).lines;
    expect(text(line)).toBe('[notFound] rm');
    expect(line[0].tone).toBe('error');
  });

  it('treats the command word case-insensitively', () => {
    expect(printed('WHOAMI')).toEqual(['Ada Example']);
  });

  describe('ls', () => {
    it('lists the three directories with no argument', () => {
      expect(printed('ls')).toEqual(['articles/  projects/  games/  ']);
    });

    it('numbers the articles newest first and links each title', () => {
      const { lines } = run('ls articles', data, floor);
      expect(lines.slice(0, 3).map(text)).toEqual([
        '[1]  27 Feb 2026  Senyals d’OpenTelemetry',
        '[2]  26 Jan 2026  The AI Automation Trap',
        '[3]  16 May 2024  Event Driven Architectures',
      ]);
      expect(lines[1][2].href).toBe('/en/articles/the-ai-automation-trap');
      expect(text(lines[3])).toBe('[listHint]');
    });

    it('accepts a trailing slash, as tab-completed directories carry one in a real shell', () => {
      expect(printed('ls articles/')).toEqual(printed('ls articles'));
    });

    it('links projects to their own sites in a new tab', () => {
      const [first] = run('ls projects', data, floor).lines;
      expect(first).toEqual([{ text: 'teams-for-linux', href: 'https://example.com/teams-for-linux', external: true }]);
    });

    it('says when the directory does not exist', () => {
      expect(printed('ls secrets')).toEqual(['[noFile] secrets']);
    });
  });

  describe('cat', () => {
    it('reads the same article by number or by slug', () => {
      expect(printed('cat 2')).toEqual(printed('cat the-ai-automation-trap'));
      expect(printed('cat 2')).toEqual([
        'The AI Automation Trap',
        '26 Jan 2026',
        'Automating the wrong thing faster.',
        '#AI #Automation',
        '[readHint] 2',
      ]);
    });

    it('prints the role for cat role, as the static intro does', () => {
      expect(printed('cat role')).toEqual(['Principal Tester']);
    });

    it('asks for an argument, and rejects an article number past the end', () => {
      expect(printed('cat')).toEqual(['[usage] cat <article>']);
      expect(printed('cat 4')).toEqual(['[noFile] 4']);
      expect(printed('cat 0')).toEqual(['[noFile] 0']);
    });
  });

  describe('search', () => {
    it('ignores case and accents, so plain typing finds accented titles', () => {
      expect(printed('search SENYALS')).toEqual(['[matches] 1 SENYALS', '[1]  27 Feb 2026  Senyals d’OpenTelemetry']);
      expect(printed('search agentics')).toEqual(['[matches] 1 agentics', '[3]  16 May 2024  Event Driven Architectures']);
    });

    it('matches tags and requires every word, keeping the ls number so open can follow it', () => {
      expect(printed('grep ai automation')).toEqual([
        '[matches] 1 ai automation',
        '[2]  26 Jan 2026  The AI Automation Trap',
      ]);
      expect(printed('search ai architecture')).toEqual(['[noMatches] ai architecture']);
    });

    it('asks for words when given none', () => {
      expect(printed('search')).toEqual(['[usage] search <words>']);
    });
  });

  describe('open', () => {
    it('navigates to an article by number or slug', () => {
      expect(run('open 3', data, floor).effect).toEqual({ kind: 'navigate', href: '/en/articles/event-driven-architectures' });
      expect(run('open event-driven-architectures', data, floor).effect).toEqual(run('open 3', data, floor).effect);
    });

    it('opens a project in a new tab, matching its name in any case', () => {
      expect(run('open Repo-Butler', data, floor).effect).toEqual({ kind: 'external', href: 'https://example.com/repo-butler' });
    });

    it('walks into the arcade and onto an unlocked cabinet', () => {
      expect(run('open arcade', data, floor).effect).toEqual({ kind: 'navigate', href: '/en/fun' });
      expect(run('open snake', data, floor).effect).toEqual({ kind: 'navigate', href: '/en/fun/snake' });
    });

    it('does nothing for a name it does not know', () => {
      const result = run('open nowhere', data, floor);
      expect(result.effect).toBeUndefined();
      expect(result.lines.map(text)).toEqual(['[noFile] nowhere']);
    });
  });

  describe('the arcade unlock chain', () => {
    it('lists only revealed cabinets, with the shroud naming its predecessor and never the next id', () => {
      const lines = printed('ls games');
      expect(lines).toEqual(['tanks', 'snake', '???  [locked] snake']);
      expect(lines.join('\n')).not.toContain('cascade');
    });

    it('drops the shroud once the chain is fully open', () => {
      expect(run('ls games', data, { unlocked: ['tanks', 'snake'], next: null }).lines.map(text)).toEqual(['tanks', 'snake']);
    });

    it('answers a shrouded cabinet exactly as it answers a made-up name, so play cannot probe the chain', () => {
      for (const verb of ['play', 'open']) {
        const shrouded = run(`${verb} cascade`, data, floor);
        const madeUp = run(`${verb} pinball`, data, floor);
        expect(shrouded.effect).toBeUndefined();
        expect(shrouded.lines.map(text)).toEqual(madeUp.lines.map(text).map(line => line.replace('pinball', 'cascade')));
      }
    });

    it('plays an unlocked cabinet, and lists the floor when play has no argument', () => {
      expect(run('play tanks', data, floor).effect).toEqual({ kind: 'navigate', href: '/en/fun/tanks' });
      expect(printed('play')).toEqual(printed('ls games'));
    });
  });

  describe('before the arcade is released', () => {
    const closed = (input: string) => run(input, closedData, closedFloor);

    it('answers ls games, play and open arcade with the construction notice and goes nowhere', () => {
      for (const input of ['ls games', 'play', 'play tanks', 'open arcade']) {
        const result = closed(input);
        expect(result.effect, input).toBeUndefined();
        expect(result.lines.map(text), input).toEqual(['[closed]']);
      }
    });

    it('still lists games as a directory and play in help, so the notice can be found', () => {
      expect(closed('ls').lines.map(text)[0]).toContain('games/');
      expect(closed('help').lines.map(text).join('\n')).toContain('play <game>');
    });

    it('offers neither the arcade nor a cabinet to Tab', () => {
      expect(complete('open arc', closedData, closedFloor)).toEqual({ value: 'open arc', options: [] });
      expect(complete('play t', closedData, closedFloor)).toEqual({ value: 'play t', options: [] });
    });
  });

  it('toggles, sets, or refuses a theme', () => {
    expect(run('theme', data, floor).effect).toEqual({ kind: 'theme', mode: 'toggle' });
    expect(run('theme light', data, floor).effect).toEqual({ kind: 'theme', mode: 'light' });
    const bogus = run('theme sepia', data, floor);
    expect(bogus.effect).toBeUndefined();
    expect(bogus.lines.map(text)).toEqual(['[usage] theme [dark|light]']);
  });

  it('switches language through the locale homes and lists them when the code is wrong', () => {
    expect(run('lang es', data, floor).effect).toEqual({ kind: 'navigate', href: '/es/' });
    expect(printed('lang fr')).toEqual(['[usage] lang <en|es|cat>']);
  });

  it('echoes text as typed and expands $MOTTO', () => {
    expect(printed('echo Hello,  World')).toEqual(['Hello,  World']);
    expect(printed('echo $MOTTO')).toEqual(['Or at least trying to.']);
  });

  it('clears the screen through an effect rather than a line', () => {
    expect(run('clear', data, floor)).toEqual({ lines: [], effect: { kind: 'clear' } });
  });
});

describe('complete', () => {
  it('finishes a unique command and leaves room for its argument', () => {
    expect(complete('sea', data, floor)).toEqual({ value: 'search ', options: [] });
  });

  it('offers every candidate when the prefix is ambiguous', () => {
    expect(complete('c', data, floor)).toEqual({ value: 'c', options: ['cat', 'clear'] });
  });

  it('completes article slugs for open, extending to the shared prefix first', () => {
    expect(complete('open event', data, floor)).toEqual({ value: 'open event-driven-architectures ', options: [] });
    expect(complete('open t', data, floor)).toEqual({ value: 'open t', options: ['the-ai-automation-trap', 'tanks', 'teams-for-linux'] });
  });

  it('never completes a shrouded cabinet', () => {
    expect(complete('play ca', data, floor)).toEqual({ value: 'play ca', options: [] });
  });

  it('leaves input it cannot complete untouched', () => {
    expect(complete('zzz', data, floor)).toEqual({ value: 'zzz', options: [] });
    expect(complete('open a b', data, floor)).toEqual({ value: 'open a b', options: [] });
  });
});

describe('fill', () => {
  it('fills known placeholders and leaves unknown ones visible', () => {
    expect(fill('{a} and {b}', { a: 1 })).toBe('1 and {b}');
  });
});
