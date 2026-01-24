export interface SocialLink {
  name: string;
  url: string;
  icon: string;
  description: {
    en: string;
    es: string;
    cat: string;
  };
}

export const socialLinks: SocialLink[] = [
  {
    name: 'GitHub',
    url: 'https://github.com/ismaelmartinez',
    icon: '💻',
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
    description: {
      en: 'Technical articles and community discussions',
      es: 'Artículos técnicos y discusiones de la comunidad',
      cat: 'Articles tècnics i discussions de la comunitat'
    }
  }
];
