export const languages = {
  en: 'English',
  es: 'Español',
  cat: 'Català'
};

export const defaultLang = 'en';

export const translations = {
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.projects': 'Projects',
    'nav.writing': 'Writing',
    'nav.connect': 'Connect',

    // Hero
    'hero.greeting': "Hi, I'm",
    'hero.name': 'Ismael Martinez',
    'hero.tagline': 'Software Engineer & Open Source Enthusiast',
    'hero.description': 'I build things, write about technology, and contribute to open source. Welcome to my corner of the internet.',

    // Sections
    'section.projects': 'Open Source Projects',
    'section.projects.description': 'Some of my contributions to the open source community',
    'section.writing': 'Latest Writing',
    'section.writing.description': 'Thoughts on software development, technology, and more',
    'section.connect': 'Let\'s Connect',
    'section.connect.description': 'Find me on these platforms',

    // Footer
    'footer.built': 'Built with',
    'footer.and': 'and',

    // Common
    'common.viewAll': 'View All',
    'common.readMore': 'Read More',
    'common.viewOnGithub': 'View on GitHub',
    'common.viewOnMedium': 'View on Medium',
    'common.viewOnDevto': 'View on Dev.to'
  },
  es: {
    // Navigation
    'nav.home': 'Inicio',
    'nav.projects': 'Proyectos',
    'nav.writing': 'Escritos',
    'nav.connect': 'Conectar',

    // Hero
    'hero.greeting': 'Hola, soy',
    'hero.name': 'Ismael Martinez',
    'hero.tagline': 'Ingeniero de Software y Entusiasta del Open Source',
    'hero.description': 'Construyo cosas, escribo sobre tecnología y contribuyo al código abierto. Bienvenido a mi rincón de internet.',

    // Sections
    'section.projects': 'Proyectos Open Source',
    'section.projects.description': 'Algunas de mis contribuciones a la comunidad de código abierto',
    'section.writing': 'Últimos Escritos',
    'section.writing.description': 'Reflexiones sobre desarrollo de software, tecnología y más',
    'section.connect': 'Conectemos',
    'section.connect.description': 'Encuéntrame en estas plataformas',

    // Footer
    'footer.built': 'Construido con',
    'footer.and': 'y',

    // Common
    'common.viewAll': 'Ver Todo',
    'common.readMore': 'Leer Más',
    'common.viewOnGithub': 'Ver en GitHub',
    'common.viewOnMedium': 'Ver en Medium',
    'common.viewOnDevto': 'Ver en Dev.to'
  },
  cat: {
    // Navigation
    'nav.home': 'Inici',
    'nav.projects': 'Projectes',
    'nav.writing': 'Escrits',
    'nav.connect': 'Connectar',

    // Hero
    'hero.greeting': 'Hola, sóc',
    'hero.name': 'Ismael Martinez',
    'hero.tagline': 'Enginyer de Software i Entusiasta de l\'Open Source',
    'hero.description': 'Construeixo coses, escric sobre tecnologia i contribueixo al codi obert. Benvingut al meu racó d\'internet.',

    // Sections
    'section.projects': 'Projectes Open Source',
    'section.projects.description': 'Algunes de les meves contribucions a la comunitat de codi obert',
    'section.writing': 'Últims Escrits',
    'section.writing.description': 'Reflexions sobre desenvolupament de software, tecnologia i més',
    'section.connect': 'Connectem',
    'section.connect.description': 'Troba\'m en aquestes plataformes',

    // Footer
    'footer.built': 'Construït amb',
    'footer.and': 'i',

    // Common
    'common.viewAll': 'Veure Tot',
    'common.readMore': 'Llegir Més',
    'common.viewOnGithub': 'Veure a GitHub',
    'common.viewOnMedium': 'Veure a Medium',
    'common.viewOnDevto': 'Veure a Dev.to'
  }
} as const;

export type TranslationKey = keyof typeof translations.en;

export function getLangFromUrl(url: URL) {
  const [, lang] = url.pathname.split('/');
  if (lang in translations) return lang as keyof typeof translations;
  return defaultLang;
}

export function useTranslations(lang: keyof typeof translations) {
  return function t(key: TranslationKey) {
    return translations[lang][key] || translations[defaultLang][key];
  }
}

export function getLocalizedPath(path: string, lang: string) {
  return `/${lang}${path}`;
}
