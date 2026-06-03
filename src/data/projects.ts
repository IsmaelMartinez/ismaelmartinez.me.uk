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
    url: 'https://github.com/IsmaelMartinez/teams-for-linux',
    github: 'https://github.com/IsmaelMartinez/teams-for-linux',
    tags: ['Electron', 'JavaScript', 'Linux'],
    featured: true
  },
  {
    name: 'repo-butler',
    description: {
      en: 'A portfolio-health agent that runs on a schedule, analyses your GitHub repositories, generates health dashboards, and proposes improvements as issues — and it monitors this very site.',
      es: 'Un agente de salud de portafolio que se ejecuta programadamente, analiza tus repositorios de GitHub, genera paneles de salud y propone mejoras como incidencias, y monitoriza este mismo sitio.',
      cat: 'Un agent de salut de cartera que s\'executa en horari programat, analitza els repositoris de GitHub, genera taulers de salut i proposa millores com a incidències — i monitoritza aquest mateix lloc.'
    },
    url: 'https://github.com/IsmaelMartinez/repo-butler',
    github: 'https://github.com/IsmaelMartinez/repo-butler',
    tags: ['AI Agent', 'Automation', 'GitHub Actions'],
    featured: true
  },
  {
    name: 'sound3fy',
    description: {
      en: 'A library that adds sonification to D3.js visualizations, making charts accessible to blind and low-vision users by mapping data to musical notes.',
      es: 'Una biblioteca que añade sonificación a las visualizaciones de D3.js, haciendo los gráficos accesibles para usuarios ciegos o con baja visión mediante la asignación de datos a notas musicales.',
      cat: 'Una biblioteca que afegeix sonificació a les visualitzacions de D3.js, fent els gràfics accessibles per a usuaris cecs o amb baixa visió mitjançant l\'assignació de dades a notes musicals.'
    },
    url: 'https://github.com/IsmaelMartinez/sound3fy',
    github: 'https://github.com/IsmaelMartinez/sound3fy',
    tags: ['D3.js', 'Accessibility', 'JavaScript'],
    featured: true
  },
  {
    name: 'delegate-local',
    description: {
      en: 'A Claude Code skill that routes summarisation, triage, and bulk-text tasks to locally-installed models, keeping content on-device and preserving the agent\'s context window.',
      es: 'Una habilidad de Claude Code que enruta tareas de resumen, triaje y texto masivo a modelos instalados localmente, manteniendo el contenido en el dispositivo y preservando la ventana de contexto del agente.',
      cat: 'Una habilitat de Claude Code que encamina tasques de resum, triatge i text massiu a models instal·lats localment, mantenint el contingut al dispositiu i preservant la finestra de context de l\'agent.'
    },
    url: 'https://github.com/IsmaelMartinez/delegate-local',
    github: 'https://github.com/IsmaelMartinez/delegate-local',
    tags: ['Claude Code', 'Local LLM', 'Shell'],
    featured: true
  },
  {
    name: 'wifisentinel',
    description: {
      en: 'A multi-persona WiFi and network security analyser with CLI scanning, compliance scoring against CIS, NIST, IEEE and OWASP frameworks, and external reconnaissance.',
      es: 'Un analizador de seguridad de WiFi y redes con múltiples personalidades, con escaneo por CLI, puntuación de cumplimiento contra los marcos CIS, NIST, IEEE y OWASP, y reconocimiento externo.',
      cat: 'Un analitzador de seguretat de xarxa i WiFi multipersona amb escaneig CLI, puntuació de compliment contra els marcs CIS, NIST, IEEE i OWASP, i reconeixement extern.'
    },
    url: 'https://github.com/IsmaelMartinez/wifisentinel',
    github: 'https://github.com/IsmaelMartinez/wifisentinel',
    tags: ['Security', 'TypeScript', 'CLI'],
    featured: true
  },
  {
    name: 'yourear',
    description: {
      en: 'A browser-based hearing test that builds a standard audiogram from pure tones, with tinnitus matching and speech-in-noise tools — running fully offline as a PWA with no data leaving your device.',
      es: 'Una prueba auditiva basada en el navegador que construye un audiograma estándar a partir de tonos puros, con emparejamiento de tinnitus y herramientas de habla en ruido, ejecutándose completamente sin conexión como PWA sin que los datos salgan de tu dispositivo.',
      cat: 'Una prova d\'oïda basada al navegador que construeix un audiograma estàndard a partir de tons purs, amb emparellament de tinnitus i eines de parla en soroll — s\'executa completament fora de línia com a PWA sense que les dades surtin del dispositiu.'
    },
    url: 'https://github.com/IsmaelMartinez/yourear',
    github: 'https://github.com/IsmaelMartinez/yourear',
    tags: ['Accessibility', 'PWA', 'TypeScript'],
    featured: true
  },
  {
    name: 'votescot',
    description: {
      en: 'An open-source vote compass for the 2026 Scottish Parliament election, built with Astro and React islands, helping voters match parties to their views.',
      es: 'Una brújula electoral de código abierto para las elecciones al Parlamento Escocés de 2026, construida con Astro y React islands, que ayuda a los votantes a emparejar partidos con sus opiniones.',
      cat: 'Una brúixola electoral de codi obert per a les eleccions al Parlament Escocès de 2026, construïda amb Astro i React islands, ajudant els votants a emparellar partits amb les seves opinions.'
    },
    url: 'https://github.com/IsmaelMartinez/votescot',
    github: 'https://github.com/IsmaelMartinez/votescot',
    tags: ['Astro', 'React', 'Civic Tech'],
    featured: true
  }
];

export function getFeaturedProjects(): Project[] {
  return projects.filter(p => p.featured);
}
