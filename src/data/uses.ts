interface UsesItem {
  name: string;
  description: Record<'en' | 'es' | 'cat', string>;
  url?: string;
}

interface UsesCategory {
  title: Record<'en' | 'es' | 'cat', string>;
  items: UsesItem[];
}

export const usesData: UsesCategory[] = [
  {
    title: {
      en: 'Editor & Terminal',
      es: 'Editor y Terminal',
      cat: 'Editor i Terminal',
    },
    items: [
      {
        name: 'VS Code',
        description: {
          en: 'My primary code editor with vim keybindings',
          es: 'Mi editor de código principal con atajos vim',
          cat: 'El meu editor de codi principal amb dreceres vim',
        },
        url: 'https://code.visualstudio.com',
      },
      {
        name: 'Warp',
        description: {
          en: 'Modern terminal with AI-powered features',
          es: 'Terminal moderna con funciones potenciadas por IA',
          cat: 'Terminal moderna amb funcions potenciades per IA',
        },
        url: 'https://www.warp.dev',
      },
      {
        name: 'GitHub Copilot',
        description: {
          en: 'AI pair programmer for code suggestions',
          es: 'Programador en pareja IA para sugerencias de código',
          cat: 'Programador en parella IA per a suggeriments de codi',
        },
        url: 'https://github.com/features/copilot',
      },
    ],
  },
  {
    title: {
      en: 'Languages & Frameworks',
      es: 'Lenguajes y Frameworks',
      cat: 'Llenguatges i Frameworks',
    },
    items: [
      {
        name: 'TypeScript',
        description: {
          en: 'My go-to language for most projects',
          es: 'Mi lenguaje preferido para la mayoría de proyectos',
          cat: 'El meu llenguatge preferit per a la majoria de projectes',
        },
        url: 'https://www.typescriptlang.org',
      },
      {
        name: 'Python',
        description: {
          en: 'For data tooling, scripting, and open source projects',
          es: 'Para herramientas de datos, scripting y proyectos open source',
          cat: 'Per a eines de dades, scripting i projectes open source',
        },
        url: 'https://www.python.org',
      },
      {
        name: 'Astro',
        description: {
          en: 'Static site framework powering this very site',
          es: 'Framework de sitios estáticos que impulsa este sitio',
          cat: 'Framework de llocs estàtics que impulsa aquest lloc',
        },
        url: 'https://astro.build',
      },
      {
        name: 'Node.js',
        description: {
          en: 'Runtime for backend services and tooling',
          es: 'Runtime para servicios backend y herramientas',
          cat: 'Runtime per a serveis backend i eines',
        },
        url: 'https://nodejs.org',
      },
    ],
  },
  {
    title: {
      en: 'DevOps & Infrastructure',
      es: 'DevOps e Infraestructura',
      cat: 'DevOps i Infraestructura',
    },
    items: [
      {
        name: 'Docker',
        description: {
          en: 'Containerisation for reproducible environments',
          es: 'Contenedorización para entornos reproducibles',
          cat: 'Contenidorització per a entorns reproduïbles',
        },
        url: 'https://www.docker.com',
      },
      {
        name: 'GitHub Actions',
        description: {
          en: 'CI/CD pipelines for automated builds and deployments',
          es: 'Pipelines CI/CD para compilaciones y despliegues automatizados',
          cat: 'Pipelines CI/CD per a compilacions i desplegaments automatitzats',
        },
        url: 'https://github.com/features/actions',
      },
      {
        name: 'AWS',
        description: {
          en: 'Cloud platform for production workloads',
          es: 'Plataforma cloud para cargas de trabajo en producción',
          cat: 'Plataforma cloud per a càrregues de treball en producció',
        },
        url: 'https://aws.amazon.com',
      },
    ],
  },
  {
    title: {
      en: 'Productivity',
      es: 'Productividad',
      cat: 'Productivitat',
    },
    items: [
      {
        name: 'Obsidian',
        description: {
          en: 'Markdown-based knowledge management and note-taking',
          es: 'Gestión del conocimiento y notas basada en Markdown',
          cat: 'Gestió del coneixement i notes basada en Markdown',
        },
        url: 'https://obsidian.md',
      },
      {
        name: 'Raycast',
        description: {
          en: 'Launcher and productivity tool for macOS',
          es: 'Lanzador y herramienta de productividad para macOS',
          cat: 'Llançador i eina de productivitat per a macOS',
        },
        url: 'https://www.raycast.com',
      },
      {
        name: 'Arc Browser',
        description: {
          en: 'Modern browser with workspace organisation',
          es: 'Navegador moderno con organización de espacios de trabajo',
          cat: 'Navegador modern amb organització d\'espais de treball',
        },
        url: 'https://arc.net',
      },
    ],
  },
  {
    title: {
      en: 'Hardware',
      es: 'Hardware',
      cat: 'Hardware',
    },
    items: [
      {
        name: 'MacBook Pro',
        description: {
          en: 'Apple Silicon — the daily driver',
          es: 'Apple Silicon — el equipo de uso diario',
          cat: 'Apple Silicon — l\'equip d\'ús diari',
        },
      },
      {
        name: 'Ergodox EZ',
        description: {
          en: 'Split mechanical keyboard for ergonomics',
          es: 'Teclado mecánico dividido para ergonomía',
          cat: 'Teclat mecànic dividit per a ergonomia',
        },
        url: 'https://ergodox-ez.com',
      },
    ],
  },
];
