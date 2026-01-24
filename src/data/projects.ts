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
    url: 'https://github.com/nicepkg/teams-for-linux',
    github: 'https://github.com/nicepkg/teams-for-linux',
    tags: ['Electron', 'TypeScript', 'Linux'],
    featured: true
  },
  {
    name: 'sound3fy',
    description: {
      en: 'A Spotify-like music streaming application. Explore, play, and manage your music library.',
      es: 'Una aplicación de streaming de música similar a Spotify. Explora, reproduce y gestiona tu biblioteca musical.',
      cat: 'Una aplicació de streaming de música similar a Spotify. Explora, reprodueix i gestiona la teva biblioteca musical.'
    },
    url: 'https://github.com/ismaelmartinez/sound3fy',
    github: 'https://github.com/ismaelmartinez/sound3fy',
    tags: ['Music', 'Streaming', 'Open Source'],
    featured: true
  },
  {
    name: 'ai-model-advisor',
    description: {
      en: 'An intelligent tool to help you choose the right AI model for your use case.',
      es: 'Una herramienta inteligente para ayudarte a elegir el modelo de IA adecuado para tu caso de uso.',
      cat: 'Una eina intel·ligent per ajudar-te a triar el model d\'IA adequat per al teu cas d\'ús.'
    },
    url: 'https://github.com/ismaelmartinez/ai-model-advisor',
    github: 'https://github.com/ismaelmartinez/ai-model-advisor',
    tags: ['AI', 'Machine Learning', 'Tool'],
    featured: true
  },
  {
    name: 'local-brain',
    description: {
      en: 'Run AI models locally on your machine. Privacy-first approach to AI assistance.',
      es: 'Ejecuta modelos de IA localmente en tu máquina. Un enfoque de privacidad primero para la asistencia de IA.',
      cat: 'Executa models d\'IA localment a la teva màquina. Un enfocament de privacitat primer per a l\'assistència d\'IA.'
    },
    url: 'https://github.com/ismaelmartinez/local-brain',
    github: 'https://github.com/ismaelmartinez/local-brain',
    tags: ['AI', 'Privacy', 'Local'],
    featured: true
  },
  {
    name: 'bonnie-wee-plot',
    description: {
      en: 'A charming little plotting library for creating beautiful data visualizations.',
      es: 'Una encantadora pequeña biblioteca de gráficos para crear hermosas visualizaciones de datos.',
      cat: 'Una encantadora petita biblioteca de gràfics per crear belles visualitzacions de dades.'
    },
    url: 'https://github.com/ismaelmartinez/bonnie-wee-plot',
    github: 'https://github.com/ismaelmartinez/bonnie-wee-plot',
    tags: ['Data Visualization', 'Charts', 'JavaScript'],
    featured: true
  }
];

export function getFeaturedProjects(): Project[] {
  return projects.filter(p => p.featured);
}
