export const languages = {
  en: 'English',
  es: 'Español',
  cat: 'Català'
};

export const defaultLang = 'en';

export const locales = ['en', 'es', 'cat'] as const;
export type Locale = typeof locales[number];

export function isValidLocale(lang: string): lang is Locale {
  return locales.includes(lang as Locale);
}

export const translations = {
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.projects': 'Projects',
    'nav.writing': 'Writing',
    'nav.connect': 'Connect',
    'nav.fun': 'Arcade',
    'nav.skipToContent': 'Skip to content',
    'nav.mainNavigation': 'Main navigation',
    'nav.languageSwitcher': 'Language switcher',
    'nav.themeToggle': 'Toggle dark/light mode',
    'nav.uses': 'Uses',

    // Hero
    'hero.greeting': "Hi, I'm",
    'hero.name': 'Ismael Martinez',
    'hero.tagline': 'Principal Software Developer & Open Source Enthusiast',
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
    'common.viewOnDevto': 'View on Dev.to',

    // Articles
    'article.updated': 'Updated',
    'article.availableIn': 'Available in',
    'article.originallyOn': 'Originally published on',
    'article.originallyPublished': 'This site',
    'article.backToWriting': 'Back to Writing',
    'article.noArticles': 'No articles yet. Check back soon!',
    'article.localArticles': 'Articles',
    'article.externalPlatforms': 'External Platforms',
    'article.minRead': 'min read',

    // Uses
    'uses.title': 'Uses',
    'uses.description': 'Tools, software, and hardware I use for development and everyday work',

    // Fun Section
    'fun.title': 'Fun Stuff',
    'fun.subtitle': 'Because life is too short to be serious all the time',
    'fun.quiz.title': 'What Kind of Developer Are You?',
    'fun.quiz.description': 'Take this totally scientific personality quiz',
    'fun.quiz.start': 'Start Quiz',
    'fun.quiz.next': 'Next',
    'fun.quiz.seeResults': 'See Results',
    'fun.quiz.restart': 'Take Again',
    'fun.quiz.share': 'Share Result',
    'fun.snake.title': 'Snake Game',
    'fun.snake.description': 'Classic snake game. Waste some time!',
    'fun.snake.play': 'Play',
    'fun.snake.score': 'Score',
    'fun.snake.highScore': 'High Score',
    'fun.snake.gameOver': 'Game Over!',
    'fun.snake.playAgain': 'Play Again',
    'fun.snake.instructions': 'Use arrow keys or swipe to move',
    'fun.excuse.title': 'Dev Excuse Generator',
    'fun.excuse.description': 'Need an excuse? We got you covered',
    'fun.excuse.generate': 'Generate Excuse',
    'fun.excuse.copy': 'Copy',
    'fun.excuse.copied': 'Copied!',
    'fun.trivia.title': 'Tech Trivia',
    'fun.trivia.description': 'Test your tech knowledge',
    'fun.trivia.start': 'Start Trivia',
    'fun.trivia.question': 'Question',
    'fun.trivia.of': 'of',
    'fun.trivia.correct': 'Correct!',
    'fun.trivia.wrong': 'Wrong!',
    'fun.trivia.score': 'Your Score',
    'fun.trivia.playAgain': 'Play Again',
    'fun.backToFun': 'Back to Fun Stuff',

    // Poo Poo Land
    'fun.pooLand.title': 'Poo Poo Land',
    'fun.pooLand.description': 'Find the hidden poos!',
    'fun.pooLand.subtitle': 'A detective game of epic proportions',
    'fun.pooLand.start': 'Start Investigation',
    'fun.pooLand.instructions': 'Find all the hidden 💩 among the decoys. Tiles you search show how many poos are nearby!',
    'fun.pooLand.level': 'Level',
    'fun.pooLand.score': 'Score',
    'fun.pooLand.highScore': 'High Score',
    'fun.pooLand.levelComplete': 'Case Closed!',
    'fun.pooLand.accuracy': 'Accuracy',
    'fun.pooLand.timeBonus': 'Time Bonus',
    'fun.pooLand.nextLevel': 'Next Case',
    'fun.pooLand.gameOver': 'Investigation Over!',
    'fun.pooLand.totalPoos': 'Poos Found',
    'fun.pooLand.playAgain': 'New Investigation',
    'fun.pooLand.bonusRound': 'BONUS ROUND!',
    'fun.pooLand.miniPoo': 'POO!',
    'fun.pooLand.miniNot': 'NOT POO!',
    'fun.pooLand.powerUp': 'Sniff',

    // Mobile Menu
    'nav.menuToggle': 'Toggle menu',

    // Tags
    'tags.title': 'Tags',
    'tags.description': 'Browse articles by topic',
    'tags.articlesTagged': 'Articles tagged',
    'tags.article': 'article',
    'tags.articles': 'articles',

    // Table of Contents
    'toc.title': 'Table of Contents',

    // Related Articles
    'related.title': 'Related Articles',

    // About
    'nav.about': 'About',
    'about.title': 'About',
    'about.description': 'Principal Software Developer, open source enthusiast, and lifelong learner',
    'about.bioTitle': 'Hello!',
    'about.bio': "I'm Ismael Martinez, a principal software developer based in the UK with a passion for building reliable, well-crafted software. I enjoy working across the full stack, contributing to open source, and writing about what I learn along the way.",
    'about.careerTitle': 'Career Highlights',
    'about.career1': 'Over 15 years of experience in software development across multiple industries',
    'about.career2': 'Specialising in cloud-native architectures, DevOps practices, and platform engineering',
    'about.career3': 'Active open source contributor and community participant',
    'about.career4': 'Regular writer on Medium and Dev.to covering software development topics',
    'about.interestsTitle': 'Interests',
    'about.interests': 'Outside of coding, I enjoy exploring new technologies, reading about software architecture, and spending time with my family. I believe in continuous learning and sharing knowledge with the community.',

    // Health
    'nav.health': 'Health',
    'health.title': 'Portfolio Health',
    'health.description': 'Health status across all open source repositories, powered by Repo Butler',
    'health.pulse.gold': 'Gold',
    'health.pulse.silver': 'Silver',
    'health.pulse.bronze': 'Bronze',
    'health.pulse.none': 'None',
    'health.pulse.repos': 'repos',
    'health.pulse.active': 'active',
    'health.pulse.dormant': 'dormant/archive',
    'health.table.repo': 'Repo',
    'health.table.tier': 'Tier',
    'health.table.issues': 'Issues',
    'health.table.ci': 'CI%',
    'health.table.vulns': 'Vulns',
    'health.table.nextStep': 'Next Step',
    'health.table.allPass': 'All checks pass',
    'health.table.showAll': 'Show all metrics',
    'health.unavailable': 'Health data is currently unavailable. Visit the',
    'health.unavailable.link': 'standalone dashboard',
    'health.badge.label': 'Portfolio Health',
  },
  es: {
    // Navigation
    'nav.home': 'Inicio',
    'nav.projects': 'Proyectos',
    'nav.writing': 'Escritos',
    'nav.connect': 'Conectar',
    'nav.fun': 'Arcade',
    'nav.skipToContent': 'Saltar al contenido',
    'nav.mainNavigation': 'Navegación principal',
    'nav.languageSwitcher': 'Selector de idioma',
    'nav.themeToggle': 'Cambiar modo oscuro/claro',
    'nav.uses': 'Herramientas',

    // Hero
    'hero.greeting': 'Hola, soy',
    'hero.name': 'Ismael Martinez',
    'hero.tagline': 'Desarrollador de Software Principal y Entusiasta del Open Source',
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
    'common.viewOnDevto': 'Ver en Dev.to',

    // Articles
    'article.updated': 'Actualizado',
    'article.availableIn': 'Disponible en',
    'article.originallyOn': 'Publicado originalmente en',
    'article.originallyPublished': 'Este sitio',
    'article.backToWriting': 'Volver a Escritos',
    'article.noArticles': 'Aún no hay artículos. ¡Vuelve pronto!',
    'article.localArticles': 'Artículos',
    'article.externalPlatforms': 'Plataformas Externas',
    'article.minRead': 'min de lectura',

    // Uses
    'uses.title': 'Herramientas',
    'uses.description': 'Herramientas, software y hardware que uso para desarrollo y trabajo diario',

    // Fun Section
    'fun.title': 'Diversión',
    'fun.subtitle': 'Porque la vida es demasiado corta para ser serio todo el tiempo',
    'fun.quiz.title': '¿Qué Tipo de Desarrollador Eres?',
    'fun.quiz.description': 'Haz este test de personalidad totalmente científico',
    'fun.quiz.start': 'Empezar Test',
    'fun.quiz.next': 'Siguiente',
    'fun.quiz.seeResults': 'Ver Resultados',
    'fun.quiz.restart': 'Repetir',
    'fun.quiz.share': 'Compartir Resultado',
    'fun.snake.title': 'Juego de la Serpiente',
    'fun.snake.description': '¡El clásico juego de la serpiente. Pierde el tiempo!',
    'fun.snake.play': 'Jugar',
    'fun.snake.score': 'Puntos',
    'fun.snake.highScore': 'Récord',
    'fun.snake.gameOver': '¡Fin del Juego!',
    'fun.snake.playAgain': 'Jugar de Nuevo',
    'fun.snake.instructions': 'Usa las flechas o desliza para moverte',
    'fun.excuse.title': 'Generador de Excusas Dev',
    'fun.excuse.description': '¿Necesitas una excusa? Te cubrimos',
    'fun.excuse.generate': 'Generar Excusa',
    'fun.excuse.copy': 'Copiar',
    'fun.excuse.copied': '¡Copiado!',
    'fun.trivia.title': 'Trivia Tech',
    'fun.trivia.description': 'Pon a prueba tus conocimientos tech',
    'fun.trivia.start': 'Empezar Trivia',
    'fun.trivia.question': 'Pregunta',
    'fun.trivia.of': 'de',
    'fun.trivia.correct': '¡Correcto!',
    'fun.trivia.wrong': '¡Incorrecto!',
    'fun.trivia.score': 'Tu Puntuación',
    'fun.trivia.playAgain': 'Jugar de Nuevo',
    'fun.backToFun': 'Volver a Diversión',

    // Poo Poo Land
    'fun.pooLand.title': 'Poo Poo Land',
    'fun.pooLand.description': '¡Encuentra las cacas ocultas!',
    'fun.pooLand.subtitle': 'Un juego de detective de proporciones épicas',
    'fun.pooLand.start': 'Iniciar Investigación',
    'fun.pooLand.instructions': 'Encuentra todos los 💩 entre los señuelos. ¡Las casillas buscadas muestran cuántas cacas hay cerca!',
    'fun.pooLand.level': 'Nivel',
    'fun.pooLand.score': 'Puntos',
    'fun.pooLand.highScore': 'Récord',
    'fun.pooLand.levelComplete': '¡Caso Cerrado!',
    'fun.pooLand.accuracy': 'Precisión',
    'fun.pooLand.timeBonus': 'Bonus de Tiempo',
    'fun.pooLand.nextLevel': 'Siguiente Caso',
    'fun.pooLand.gameOver': '¡Investigación Terminada!',
    'fun.pooLand.totalPoos': 'Cacas Encontradas',
    'fun.pooLand.playAgain': 'Nueva Investigación',
    'fun.pooLand.bonusRound': '¡RONDA BONUS!',
    'fun.pooLand.miniPoo': '¡CACA!',
    'fun.pooLand.miniNot': '¡NO CACA!',
    'fun.pooLand.powerUp': 'Olfatear',

    // Mobile Menu
    'nav.menuToggle': 'Alternar menú',

    // Tags
    'tags.title': 'Etiquetas',
    'tags.description': 'Explorar artículos por tema',
    'tags.articlesTagged': 'Artículos etiquetados',
    'tags.article': 'artículo',
    'tags.articles': 'artículos',

    // Table of Contents
    'toc.title': 'Tabla de Contenidos',

    // Related Articles
    'related.title': 'Artículos Relacionados',

    // About
    'nav.about': 'Sobre mí',
    'about.title': 'Sobre mí',
    'about.description': 'Desarrollador de Software Principal, entusiasta del código abierto y aprendiz permanente',
    'about.bioTitle': '¡Hola!',
    'about.bio': 'Soy Ismael Martinez, desarrollador de software principal en Reino Unido con pasión por construir software fiable y bien diseñado. Me gusta trabajar en todo el stack, contribuir al código abierto y escribir sobre lo que aprendo.',
    'about.careerTitle': 'Trayectoria',
    'about.career1': 'Más de 15 años de experiencia en desarrollo de software en múltiples industrias',
    'about.career2': 'Especializado en arquitecturas cloud-native, prácticas DevOps e ingeniería de plataformas',
    'about.career3': 'Contribuidor activo de código abierto y participante de la comunidad',
    'about.career4': 'Escritor habitual en Medium y Dev.to sobre desarrollo de software',
    'about.interestsTitle': 'Intereses',
    'about.interests': 'Fuera del código, me gusta explorar nuevas tecnologías, leer sobre arquitectura de software y pasar tiempo con mi familia. Creo en el aprendizaje continuo y en compartir conocimiento con la comunidad.',

    // Health
    'nav.health': 'Salud',
    'health.title': 'Salud del Portfolio',
    'health.description': 'Estado de salud de todos los repositorios de código abierto, con Repo Butler',
    'health.pulse.gold': 'Oro',
    'health.pulse.silver': 'Plata',
    'health.pulse.bronze': 'Bronce',
    'health.pulse.none': 'Ninguno',
    'health.pulse.repos': 'repos',
    'health.pulse.active': 'activos',
    'health.pulse.dormant': 'inactivos/archivo',
    'health.table.repo': 'Repo',
    'health.table.tier': 'Nivel',
    'health.table.issues': 'Issues',
    'health.table.ci': 'CI%',
    'health.table.vulns': 'Vulns',
    'health.table.nextStep': 'Siguiente Paso',
    'health.table.allPass': 'Todos los checks pasan',
    'health.table.showAll': 'Mostrar todas las métricas',
    'health.unavailable': 'Los datos de salud no están disponibles. Visita el',
    'health.unavailable.link': 'dashboard independiente',
    'health.badge.label': 'Salud del Portfolio',
  },
  cat: {
    // Navigation
    'nav.home': 'Inici',
    'nav.projects': 'Projectes',
    'nav.writing': 'Escrits',
    'nav.connect': 'Connectar',
    'nav.fun': 'Arcade',
    'nav.skipToContent': 'Saltar al contingut',
    'nav.mainNavigation': 'Navegació principal',
    'nav.languageSwitcher': 'Selector d\'idioma',
    'nav.themeToggle': 'Canviar mode fosc/clar',
    'nav.uses': 'Eines',

    // Hero
    'hero.greeting': 'Hola, sóc',
    'hero.name': 'Ismael Martinez',
    'hero.tagline': 'Desenvolupador de Software Principal i Entusiasta de l\'Open Source',
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
    'common.viewOnDevto': 'Veure a Dev.to',

    // Articles
    'article.updated': 'Actualitzat',
    'article.availableIn': 'Disponible en',
    'article.originallyOn': 'Publicat originalment a',
    'article.originallyPublished': 'Aquest lloc',
    'article.backToWriting': 'Tornar a Escrits',
    'article.noArticles': 'Encara no hi ha articles. Torna aviat!',
    'article.localArticles': 'Articles',
    'article.externalPlatforms': 'Plataformes Externes',
    'article.minRead': 'min de lectura',

    // Uses
    'uses.title': 'Eines',
    'uses.description': 'Eines, software i hardware que faig servir per al desenvolupament i treball diari',

    // Fun Section
    'fun.title': 'Diversió',
    'fun.subtitle': 'Perquè la vida és massa curta per ser seriós tot el temps',
    'fun.quiz.title': 'Quin Tipus de Desenvolupador Ets?',
    'fun.quiz.description': 'Fes aquest test de personalitat totalment científic',
    'fun.quiz.start': 'Començar Test',
    'fun.quiz.next': 'Següent',
    'fun.quiz.seeResults': 'Veure Resultats',
    'fun.quiz.restart': 'Repetir',
    'fun.quiz.share': 'Compartir Resultat',
    'fun.snake.title': 'Joc de la Serp',
    'fun.snake.description': 'El clàssic joc de la serp. Perd el temps!',
    'fun.snake.play': 'Jugar',
    'fun.snake.score': 'Punts',
    'fun.snake.highScore': 'Rècord',
    'fun.snake.gameOver': 'Fi del Joc!',
    'fun.snake.playAgain': 'Jugar de Nou',
    'fun.snake.instructions': 'Utilitza les fletxes o llisca per moure\'t',
    'fun.excuse.title': 'Generador d\'Excuses Dev',
    'fun.excuse.description': 'Necessites una excusa? T\'ajudem',
    'fun.excuse.generate': 'Generar Excusa',
    'fun.excuse.copy': 'Copiar',
    'fun.excuse.copied': 'Copiat!',
    'fun.trivia.title': 'Trivia Tech',
    'fun.trivia.description': 'Posa a prova els teus coneixements tech',
    'fun.trivia.start': 'Començar Trivia',
    'fun.trivia.question': 'Pregunta',
    'fun.trivia.of': 'de',
    'fun.trivia.correct': 'Correcte!',
    'fun.trivia.wrong': 'Incorrecte!',
    'fun.trivia.score': 'La Teva Puntuació',
    'fun.trivia.playAgain': 'Jugar de Nou',
    'fun.backToFun': 'Tornar a Diversió',

    // Poo Poo Land
    'fun.pooLand.title': 'Poo Poo Land',
    'fun.pooLand.description': 'Troba les caques amagades!',
    'fun.pooLand.subtitle': 'Un joc de detectiu de proporcions èpiques',
    'fun.pooLand.start': 'Iniciar Investigació',
    'fun.pooLand.instructions': 'Troba tots els 💩 entre els esquers. Les caselles cercades mostren quantes caques hi ha a prop!',
    'fun.pooLand.level': 'Nivell',
    'fun.pooLand.score': 'Punts',
    'fun.pooLand.highScore': 'Rècord',
    'fun.pooLand.levelComplete': 'Cas Tancat!',
    'fun.pooLand.accuracy': 'Precisió',
    'fun.pooLand.timeBonus': 'Bonus de Temps',
    'fun.pooLand.nextLevel': 'Següent Cas',
    'fun.pooLand.gameOver': 'Investigació Acabada!',
    'fun.pooLand.totalPoos': 'Caques Trobades',
    'fun.pooLand.playAgain': 'Nova Investigació',
    'fun.pooLand.bonusRound': 'RONDA BONUS!',
    'fun.pooLand.miniPoo': 'CACA!',
    'fun.pooLand.miniNot': 'NO CACA!',
    'fun.pooLand.powerUp': 'Ensumar',

    // Mobile Menu
    'nav.menuToggle': 'Alternar menú',

    // Tags
    'tags.title': 'Etiquetes',
    'tags.description': 'Explorar articles per tema',
    'tags.articlesTagged': 'Articles etiquetats',
    'tags.article': 'article',
    'tags.articles': 'articles',

    // Table of Contents
    'toc.title': 'Taula de Continguts',

    // Related Articles
    'related.title': 'Articles Relacionats',

    // About
    'nav.about': 'Sobre mi',
    'about.title': 'Sobre mi',
    'about.description': 'Desenvolupador de Software Principal, entusiasta del codi obert i aprenent permanent',
    'about.bioTitle': 'Hola!',
    'about.bio': "Sóc Ismael Martinez, desenvolupador de software principal al Regne Unit amb passió per construir software fiable i ben dissenyat. M'agrada treballar en tot l'stack, contribuir al codi obert i escriure sobre el que aprenc.",
    'about.careerTitle': 'Trajectòria',
    'about.career1': "Més de 15 anys d'experiència en desenvolupament de software en múltiples indústries",
    'about.career2': 'Especialitzat en arquitectures cloud-native, pràctiques DevOps i enginyeria de plataformes',
    'about.career3': 'Contribuïdor actiu de codi obert i participant de la comunitat',
    'about.career4': 'Escriptor habitual a Medium i Dev.to sobre desenvolupament de software',
    'about.interestsTitle': 'Interessos',
    'about.interests': "Fora del codi, m'agrada explorar noves tecnologies, llegir sobre arquitectura de software i passar temps amb la meva família. Crec en l'aprenentatge continu i en compartir coneixement amb la comunitat.",

    // Health
    'nav.health': 'Salut',
    'health.title': 'Salut del Portfolio',
    'health.description': 'Estat de salut de tots els repositoris de codi obert, amb Repo Butler',
    'health.pulse.gold': 'Or',
    'health.pulse.silver': 'Plata',
    'health.pulse.bronze': 'Bronze',
    'health.pulse.none': 'Cap',
    'health.pulse.repos': 'repos',
    'health.pulse.active': 'actius',
    'health.pulse.dormant': 'inactius/arxiu',
    'health.table.repo': 'Repo',
    'health.table.tier': 'Nivell',
    'health.table.issues': 'Issues',
    'health.table.ci': 'CI%',
    'health.table.vulns': 'Vulns',
    'health.table.nextStep': 'Proper Pas',
    'health.table.allPass': 'Tots els checks passen',
    'health.table.showAll': 'Mostrar totes les mètriques',
    'health.unavailable': 'Les dades de salut no estan disponibles. Visita el',
    'health.unavailable.link': 'dashboard independent',
    'health.badge.label': 'Salut del Portfolio',
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
