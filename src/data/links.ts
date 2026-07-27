export interface SocialLink {
  name: string;
  url: string;
  icon: string;
  /** Which group the Connect page files this under: somewhere to read, or somewhere to reach me. */
  group: 'read' | 'connect';
  description: {
    en: string;
    es: string;
    cat: string;
  };
}

// The feed lives outside socialLinks on purpose: that list feeds the schema.org
// sameAs array, which is for profiles that are me, not for a feed URL. The url
// is per-locale, so the page supplies it.
export const feedLink: Omit<SocialLink, 'url'> = {
  name: 'RSS',
  icon: '📡',
  group: 'read',
  description: {
    en: 'Subscribe to new articles in your feed reader',
    es: 'Suscríbete a los artículos nuevos en tu lector de feeds',
    cat: 'Subscriu-te als articles nous al teu lector de feeds'
  }
};

export const socialLinks: SocialLink[] = [
  {
    name: 'GitHub',
    url: 'https://github.com/IsmaelMartinez',
    icon: '💻',
    group: 'connect',
    description: {
      en: 'Check out my open source projects and contributions',
      es: 'Mira mis proyectos de código abierto y contribuciones',
      cat: 'Mira els meus projectes de codi obert i contribucions'
    }
  },
  {
    name: 'LinkedIn',
    url: 'https://www.linkedin.com/in/ismaelmartinezramos',
    icon: '💼',
    group: 'connect',
    description: {
      en: 'Connect with me professionally',
      es: 'Conecta conmigo profesionalmente',
      cat: 'Connecta amb mi professionalment'
    }
  },
  {
    name: 'Medium',
    url: 'https://medium.com/@ismaelmartinez',
    icon: '✍️',
    group: 'read',
    description: {
      en: 'Read my articles on software development',
      es: 'Lee mis artículos sobre desarrollo de software',
      cat: 'Llegeix els meus articles sobre desenvolupament de software'
    }
  },
  {
    name: 'Dev.to',
    url: 'https://dev.to/ismaelmartinez',
    icon: '👩‍💻',
    group: 'read',
    description: {
      en: 'Technical articles and community discussions',
      es: 'Artículos técnicos y discusiones de la comunidad',
      cat: 'Articles tècnics i discussions de la comunitat'
    }
  }
];
