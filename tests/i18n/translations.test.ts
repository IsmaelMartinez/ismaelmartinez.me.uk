import { describe, it, expect } from 'vitest';
import { useTranslations, getLocalizedPath, formatDate, localeMeta, translations } from '../../src/i18n/translations';

describe('useTranslations', () => {
  it('returns English translation for known key', () => {
    const t = useTranslations('en');
    expect(t('nav.home')).toBe('Home');
  });

  it('returns Spanish translation for known key', () => {
    const t = useTranslations('es');
    expect(t('nav.home')).toBe('Inicio');
  });

  it('returns Catalan translation for known key', () => {
    const t = useTranslations('cat');
    expect(t('nav.home')).toBe('Inici');
  });

  it('all locales have the same keys', () => {
    const enKeys = Object.keys(translations.en).sort();
    const esKeys = Object.keys(translations.es).sort();
    const catKeys = Object.keys(translations.cat).sort();
    expect(esKeys).toEqual(enKeys);
    expect(catKeys).toEqual(enKeys);
  });
});

describe('localeMeta and formatDate', () => {
  it('maps the cat route segment to the ca language tag and leaves the others alone', () => {
    expect(localeMeta.cat.tag).toBe('ca');
    expect(localeMeta.en.tag).toBe('en');
    expect(localeMeta.es.tag).toBe('es');
  });

  it('formats a date in each locale', () => {
    const date = new Date(Date.UTC(2026, 2, 5, 12));
    expect(formatDate(date, 'en', 'long')).toBe('5 March 2026');
    expect(formatDate(date, 'es', 'long')).toBe('5 de marzo de 2026');
    expect(formatDate(date, 'cat', 'long')).toBe('5 de març del 2026');
    expect(formatDate(date, 'en', 'short')).toBe('5 Mar 2026');
  });
});

describe('getLocalizedPath', () => {
  it('prefixes path with locale', () => {
    expect(getLocalizedPath('/about', 'en')).toBe('/en/about');
    expect(getLocalizedPath('/about', 'es')).toBe('/es/about');
    expect(getLocalizedPath('/', 'cat')).toBe('/cat/');
  });
});
