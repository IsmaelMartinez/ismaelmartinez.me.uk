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
      es: 'Un agente de salud de portafolio que se ejecuta de forma programada, analiza tus repositorios de GitHub, genera paneles de salud y propone mejoras como incidencias, y monitoriza este mismo sitio.',
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
      es: 'Un analizador de seguridad de WiFi y redes con múltiples perfiles, con escaneo por CLI, puntuación de cumplimiento contra los marcos CIS, NIST, IEEE y OWASP, y reconocimiento externo.',
      cat: 'Un analitzador de seguretat de xarxa i WiFi amb múltiples perfils, amb escaneig CLI, puntuació de compliment contra els marcs CIS, NIST, IEEE i OWASP, i reconeixement extern.'
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
      cat: 'Una prova d\'oïda basada en el navegador que construeix un audiograma estàndard a partir de tons purs, amb emparellament de tinnitus i eines de parla en soroll — s\'executa completament fora de línia com a PWA sense que les dades surtin del dispositiu.'
    },
    url: 'https://github.com/IsmaelMartinez/yourear',
    github: 'https://github.com/IsmaelMartinez/yourear',
    tags: ['Accessibility', 'PWA', 'TypeScript'],
    featured: true
  },
  {
    name: 'generator-atlassian-compass-event-catalog',
    description: {
      en: 'An EventCatalog generator that pulls services and their event relationships out of Atlassian Compass, so an event-driven estate documents itself.',
      es: 'Un generador de EventCatalog que extrae los servicios y sus relaciones de eventos de Atlassian Compass, para que una arquitectura orientada a eventos se documente sola.',
      cat: "Un generador d'EventCatalog que extreu els serveis i les seves relacions d'esdeveniments d'Atlassian Compass, perquè una arquitectura orientada a esdeveniments es documenti sola."
    },
    url: 'https://github.com/IsmaelMartinez/generator-atlassian-compass-event-catalog',
    github: 'https://github.com/IsmaelMartinez/generator-atlassian-compass-event-catalog',
    tags: ['EventCatalog', 'TypeScript', 'Event-Driven'],
    featured: true
  },
  {
    name: 'ai-model-advisor',
    description: {
      en: 'A model-selection advisor that recommends the right model for a task from benchmarks, cost, and constraints — because not every problem needs a frontier model.',
      es: 'Un asesor de selección de modelos que recomienda el modelo adecuado para cada tarea a partir de benchmarks, coste y restricciones, porque no todos los problemas necesitan un modelo de frontera.',
      cat: 'Un assessor de selecció de models que recomana el model adequat per a cada tasca a partir de benchmarks, cost i restriccions, perquè no tots els problemes necessiten un model de frontera.'
    },
    url: 'https://github.com/IsmaelMartinez/ai-model-advisor',
    github: 'https://github.com/IsmaelMartinez/ai-model-advisor',
    tags: ['AI', 'JavaScript', 'Tooling'],
    featured: true
  },
  {
    name: 'github-issue-triage-bot',
    description: {
      en: 'A standalone Go service that triages GitHub issues using vector search and LLM analysis.',
      es: 'Un servicio independiente en Go que clasifica incidencias de GitHub mediante búsqueda vectorial y análisis con LLM.',
      cat: 'Un servei independent en Go que classifica incidències de GitHub mitjançant cerca vectorial i anàlisi amb LLM.'
    },
    url: 'https://github.com/IsmaelMartinez/github-issue-triage-bot',
    github: 'https://github.com/IsmaelMartinez/github-issue-triage-bot',
    tags: ['Go', 'AI Agent', 'Automation'],
    featured: true
  }
];

/** Upstream projects I have landed changes in. Each link is my pull requests there. */
export interface ExternalContribution {
  repo: string;
  url: string;
}

export const externalContributions: ExternalContribution[] = [
  { repo: 'aws/aws-cdk', url: 'https://github.com/aws/aws-cdk/pulls?q=is%3Apr+author%3AIsmaelMartinez' },
  { repo: 'electron/electron', url: 'https://github.com/electron/electron/pulls?q=is%3Apr+author%3AIsmaelMartinez' },
  { repo: 'asyncapi/spec', url: 'https://github.com/asyncapi/spec/pulls?q=is%3Apr+author%3AIsmaelMartinez' },
  { repo: 'snyk/user-docs', url: 'https://github.com/snyk/user-docs/pulls?q=is%3Apr+author%3AIsmaelMartinez' },
  { repo: 'vercel-labs/skills', url: 'https://github.com/vercel-labs/skills/pulls?q=is%3Apr+author%3AIsmaelMartinez' },
  { repo: 'event-catalog/generator-eventbridge', url: 'https://github.com/event-catalog/generator-eventbridge/pulls?q=is%3Apr+author%3AIsmaelMartinez' },
  { repo: 'The-PR-Agent/pr-agent', url: 'https://github.com/The-PR-Agent/pr-agent/pulls?q=is%3Apr+author%3AIsmaelMartinez' }
];

export function getFeaturedProjects(): Project[] {
  return projects.filter(p => p.featured);
}
