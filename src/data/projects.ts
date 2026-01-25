export interface Project {
  name: string;
  description: {
    en: string;
    es: string;
    cat: string;
  };
  url: string;
  github?: string;
  tags: string[];
  featured: boolean;
}

export const projects: Project[] = [
  {
    name: 'teams-for-linux',
    description: {
      en: 'Unofficial Microsoft Teams client for Linux. A community-driven project bringing Teams to Linux users.',
      es: 'Cliente no oficial de Microsoft Teams para Linux. Un proyecto impulsado por la comunidad que lleva Teams a los usuarios de Linux.',
      cat: 'Client no oficial de Microsoft Teams per a Linux. Un projecte impulsat per la comunitat que porta Teams als usuaris de Linux.'
    },
    url: 'https://github.com/ismaelmartinez/teams-for-linux',
    github: 'https://github.com/ismaelmartinez/teams-for-linux',
    tags: ['Electron', 'JavaScript', 'Linux'],
    featured: true
  },
  {
    name: 'sound3fy',
    description: {
      en: 'A library that adds sonification to D3.js visualizations, making charts accessible to blind and low-vision users by mapping data to musical notes.',
      es: 'Una biblioteca que añade sonificación a las visualizaciones de D3.js, haciendo los gráficos accesibles para usuarios ciegos o con baja visión mediante la asignación de datos a notas musicales.',
      cat: 'Una biblioteca que afegeix sonificació a les visualitzacions de D3.js, fent els gràfics accessibles per a usuaris cecs o amb baixa visió mitjançant l\'assignació de dades a notes musicals.'
    },
    url: 'https://github.com/ismaelmartinez/sound3fy',
    github: 'https://github.com/ismaelmartinez/sound3fy',
    tags: ['D3.js', 'Accessibility', 'JavaScript'],
    featured: true
  },
  {
    name: 'ai-model-advisor',
    description: {
      en: 'A browser-based tool to find efficient AI models for your tasks, with recommendations ranked by efficiency and environmental impact estimates.',
      es: 'Una herramienta basada en navegador para encontrar modelos de IA eficientes para tus tareas, con recomendaciones clasificadas por eficiencia e impacto ambiental.',
      cat: 'Una eina basada en navegador per trobar models d\'IA eficients per a les teves tasques, amb recomanacions classificades per eficiència i impacte ambiental.'
    },
    url: 'https://github.com/ismaelmartinez/ai-model-advisor',
    github: 'https://github.com/ismaelmartinez/ai-model-advisor',
    tags: ['Svelte', 'AI', 'PWA'],
    featured: true
  },
  {
    name: 'local-brain',
    description: {
      en: 'A Claude Code plugin marketplace that extends Claude with local capabilities, enabling codebase exploration via locally-running language models.',
      es: 'Un marketplace de plugins para Claude Code que extiende Claude con capacidades locales, permitiendo la exploración de código mediante modelos de lenguaje locales.',
      cat: 'Un marketplace de plugins per a Claude Code que estén Claude amb capacitats locals, permetent l\'exploració de codi mitjançant models de llenguatge locals.'
    },
    url: 'https://github.com/ismaelmartinez/local-brain',
    github: 'https://github.com/ismaelmartinez/local-brain',
    tags: ['Python', 'Claude Code', 'Ollama'],
    featured: true
  },
  {
    name: 'bonnie-wee-plot',
    description: {
      en: 'A Scottish allotment gardening app with plot planning, seed catalogues, compost tracking, and AI-powered gardening advice for Scottish growing conditions.',
      es: 'Una aplicación de huertos escocesa con planificación de parcelas, catálogos de semillas, seguimiento de compost y consejos de jardinería con IA para condiciones de cultivo escocesas.',
      cat: 'Una aplicació d\'horts escocesa amb planificació de parcel·les, catàlegs de llavors, seguiment de compost i consells de jardineria amb IA per a condicions de cultiu escoceses.'
    },
    url: 'https://github.com/ismaelmartinez/bonnie-wee-plot',
    github: 'https://github.com/ismaelmartinez/bonnie-wee-plot',
    tags: ['Next.js', 'React', 'TypeScript'],
    featured: true
  }
];

export function getFeaturedProjects(): Project[] {
  return projects.filter(p => p.featured);
}
