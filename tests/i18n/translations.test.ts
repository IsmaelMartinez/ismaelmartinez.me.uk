import { describe, it, expect } from 'vitest';
import { useTranslations, getLangFromUrl, getLocalizedPath, translations } from '../../src/i18n/translations';

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

describe('getLangFromUrl', () => {
  it('extracts "en" from /en/about', () => {
    expect(getLangFromUrl(new URL('https://example.com/en/about'))).toBe('en');
  });

  it('extracts "es" from /es/', () => {
    expect(getLangFromUrl(new URL('https://example.com/es/'))).toBe('es');
  });

  it('extracts "cat" from /cat/projects', () => {
    expect(getLangFromUrl(new URL('https://example.com/cat/projects'))).toBe('cat');
  });

  it('falls back to "en" for unknown locale', () => {
    expect(getLangFromUrl(new URL('https://example.com/fr/about'))).toBe('en');
  });
});

describe('getLocalizedPath', () => {
  it('prefixes path with locale', () => {
    expect(getLocalizedPath('/about', 'en')).toBe('/en/about');
    expect(getLocalizedPath('/about', 'es')).toBe('/es/about');
    expect(getLocalizedPath('/', 'cat')).toBe('/cat/');
  });
});
