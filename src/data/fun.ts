export interface FunActivity {
  id: string;
  icon: string;
  path: string;
  color: string;
}

export const funActivities: FunActivity[] = [
  {
    id: 'quiz',
    icon: '🧠',
    path: '/fun/quiz',
    color: '#8b5cf6'
  },
  {
    id: 'snake',
    icon: '🐍',
    path: '/fun/snake',
    color: '#22c55e'
  }
];

export const quizQuestions = {
  en: [
    {
      question: "It's 3 AM. Your code finally works. What do you do?",
      answers: [
        { text: "Write comprehensive tests and documentation", type: "perfectionist" },
        { text: "Ship it immediately before it breaks again", type: "yolo" },
        { text: "Refactor it to be even cleaner", type: "architect" },
        { text: "Go to sleep, future me can deal with this", type: "pragmatist" }
      ]
    },
    {
      question: "Your favorite way to name variables?",
      answers: [
        { text: "descriptiveAndSelfDocumentingVariableName", type: "perfectionist" },
        { text: "x, y, temp, temp2, temp3", type: "yolo" },
        { text: "Following domain-driven design patterns", type: "architect" },
        { text: "Whatever makes sense at the time", type: "pragmatist" }
      ]
    },
    {
      question: "How do you handle a production bug?",
      answers: [
        { text: "Root cause analysis, fix, tests, post-mortem", type: "perfectionist" },
        { text: "Hotfix and pray", type: "yolo" },
        { text: "This wouldn't happen if we had proper architecture", type: "architect" },
        { text: "Fix it, learn from it, move on", type: "pragmatist" }
      ]
    },
    {
      question: "Your ideal tech stack is:",
      answers: [
        { text: "Whatever has the best testing framework", type: "perfectionist" },
        { text: "The newest, shiniest framework", type: "yolo" },
        { text: "Something that scales to millions of users", type: "architect" },
        { text: "Whatever the team knows and works", type: "pragmatist" }
      ]
    },
    {
      question: "Code review feedback says 'this could be cleaner'. You:",
      answers: [
        { text: "Spend 2 days refactoring everything", type: "perfectionist" },
        { text: "Add a TODO comment and approve", type: "yolo" },
        { text: "Propose a new design pattern for the whole codebase", type: "architect" },
        { text: "Make reasonable improvements within scope", type: "pragmatist" }
      ]
    },
    {
      question: "Documentation is:",
      answers: [
        { text: "Essential. I document everything.", type: "perfectionist" },
        { text: "What's documentation?", type: "yolo" },
        { text: "Architecture diagrams and ADRs", type: "architect" },
        { text: "README with setup instructions is enough", type: "pragmatist" }
      ]
    }
  ],
  es: [
    {
      question: "Son las 3 AM. Tu código finalmente funciona. ¿Qué haces?",
      answers: [
        { text: "Escribir tests completos y documentación", type: "perfectionist" },
        { text: "Desplegarlo antes de que se rompa de nuevo", type: "yolo" },
        { text: "Refactorizarlo para que sea más limpio", type: "architect" },
        { text: "Ir a dormir, el yo del futuro se encargará", type: "pragmatist" }
      ]
    },
    {
      question: "¿Tu forma favorita de nombrar variables?",
      answers: [
        { text: "nombreDeVariableDescriptivoYAutoDocumentado", type: "perfectionist" },
        { text: "x, y, temp, temp2, temp3", type: "yolo" },
        { text: "Siguiendo patrones de diseño de dominio", type: "architect" },
        { text: "Lo que tenga sentido en el momento", type: "pragmatist" }
      ]
    },
    {
      question: "¿Cómo manejas un bug en producción?",
      answers: [
        { text: "Análisis de causa raíz, fix, tests, post-mortem", type: "perfectionist" },
        { text: "Hotfix y rezar", type: "yolo" },
        { text: "Esto no pasaría con una arquitectura adecuada", type: "architect" },
        { text: "Arreglarlo, aprender, seguir adelante", type: "pragmatist" }
      ]
    },
    {
      question: "Tu stack tecnológico ideal es:",
      answers: [
        { text: "El que tenga el mejor framework de testing", type: "perfectionist" },
        { text: "El framework más nuevo y brillante", type: "yolo" },
        { text: "Algo que escale a millones de usuarios", type: "architect" },
        { text: "Lo que el equipo conozca y funcione", type: "pragmatist" }
      ]
    },
    {
      question: "El feedback del code review dice 'esto podría ser más limpio'. Tú:",
      answers: [
        { text: "Paso 2 días refactorizando todo", type: "perfectionist" },
        { text: "Añado un comentario TODO y apruebo", type: "yolo" },
        { text: "Propongo un nuevo patrón para todo el código", type: "architect" },
        { text: "Hago mejoras razonables dentro del scope", type: "pragmatist" }
      ]
    },
    {
      question: "La documentación es:",
      answers: [
        { text: "Esencial. Documento todo.", type: "perfectionist" },
        { text: "¿Qué es documentación?", type: "yolo" },
        { text: "Diagramas de arquitectura y ADRs", type: "architect" },
        { text: "Un README con instrucciones es suficiente", type: "pragmatist" }
      ]
    }
  ],
  cat: [
    {
      question: "Són les 3 AM. El teu codi finalment funciona. Què fas?",
      answers: [
        { text: "Escriure tests complets i documentació", type: "perfectionist" },
        { text: "Desplegar-lo abans que es trenqui de nou", type: "yolo" },
        { text: "Refactoritzar-lo per ser més net", type: "architect" },
        { text: "Anar a dormir, el jo del futur s'encarregarà", type: "pragmatist" }
      ]
    },
    {
      question: "La teva forma preferida de nomenar variables?",
      answers: [
        { text: "nomDeVariableDescriptiuIAutoDocumentat", type: "perfectionist" },
        { text: "x, y, temp, temp2, temp3", type: "yolo" },
        { text: "Seguint patrons de disseny de domini", type: "architect" },
        { text: "El que tingui sentit en el moment", type: "pragmatist" }
      ]
    },
    {
      question: "Com gestiones un bug en producció?",
      answers: [
        { text: "Anàlisi de causa arrel, fix, tests, post-mortem", type: "perfectionist" },
        { text: "Hotfix i resar", type: "yolo" },
        { text: "Això no passaria amb una arquitectura adequada", type: "architect" },
        { text: "Arreglar-ho, aprendre, seguir endavant", type: "pragmatist" }
      ]
    },
    {
      question: "El teu stack tecnològic ideal és:",
      answers: [
        { text: "El que tingui el millor framework de testing", type: "perfectionist" },
        { text: "El framework més nou i brillant", type: "yolo" },
        { text: "Alguna cosa que escali a milions d'usuaris", type: "architect" },
        { text: "El que l'equip conegui i funcioni", type: "pragmatist" }
      ]
    },
    {
      question: "El feedback del code review diu 'això podria ser més net'. Tu:",
      answers: [
        { text: "Passo 2 dies refactoritzant tot", type: "perfectionist" },
        { text: "Afegeixo un comentari TODO i aprovo", type: "yolo" },
        { text: "Proposo un nou patró per tot el codi", type: "architect" },
        { text: "Faig millores raonables dins del scope", type: "pragmatist" }
      ]
    },
    {
      question: "La documentació és:",
      answers: [
        { text: "Essencial. Documento tot.", type: "perfectionist" },
        { text: "Què és documentació?", type: "yolo" },
        { text: "Diagrames d'arquitectura i ADRs", type: "architect" },
        { text: "Un README amb instruccions és suficient", type: "pragmatist" }
      ]
    }
  ]
};

export const quizResults = {
  en: {
    perfectionist: {
      title: "The Perfectionist",
      emoji: "✨",
      description: "You believe code should be a work of art. 100% test coverage is just the minimum. Your PRs are legendary for their thoroughness. Your code is beautiful, but shipping dates... well, those are more like suggestions, right?",
      traits: ["Writes tests before tests", "Refactors for fun", "Owns 3 mechanical keyboards"]
    },
    yolo: {
      title: "The YOLO Deployer",
      emoji: "🚀",
      description: "Move fast and break things is your life motto. Production is just the final testing environment. Your code works... most of the time. You've probably pushed directly to main at least once today.",
      traits: ["Deploys on Friday at 5 PM", "git push --force is life", "Comments? What comments?"]
    },
    architect: {
      title: "The System Architect",
      emoji: "🏗️",
      description: "You see the big picture. Every problem needs a scalable, enterprise-grade solution. You've designed systems that could handle 10 million users... for a TODO app with 3 users. But when it scales, you'll be ready!",
      traits: ["Draws diagrams for breakfast", "Kubernetes is the answer to everything", "Has opinions on microservices"]
    },
    pragmatist: {
      title: "The Pragmatist",
      emoji: "⚖️",
      description: "You balance quality with getting things done. Perfect is the enemy of good, and good is what ships. You know when to go deep and when to move on. Your code might not be perfect, but it's always on time.",
      traits: ["Actually ships features", "Technical debt is a feature", "Work-life balance enthusiast"]
    }
  },
  es: {
    perfectionist: {
      title: "El Perfeccionista",
      emoji: "✨",
      description: "Crees que el código debe ser una obra de arte. 100% de cobertura de tests es solo el mínimo. Tus PRs son legendarios por su minuciosidad. Tu código es hermoso, pero las fechas de entrega... bueno, son más como sugerencias, ¿no?",
      traits: ["Escribe tests antes de los tests", "Refactoriza por diversión", "Tiene 3 teclados mecánicos"]
    },
    yolo: {
      title: "El Deployer YOLO",
      emoji: "🚀",
      description: "Muévete rápido y rompe cosas es tu lema. Producción es solo el entorno final de testing. Tu código funciona... la mayoría del tiempo. Probablemente has hecho push directo a main al menos una vez hoy.",
      traits: ["Despliega viernes a las 5 PM", "git push --force es vida", "¿Comentarios? ¿Qué comentarios?"]
    },
    architect: {
      title: "El Arquitecto de Sistemas",
      emoji: "🏗️",
      description: "Ves el panorama completo. Cada problema necesita una solución escalable de nivel empresarial. Has diseñado sistemas para 10 millones de usuarios... para una app de TODOs con 3 usuarios. ¡Pero cuando escale, estarás listo!",
      traits: ["Dibuja diagramas para desayunar", "Kubernetes es la respuesta a todo", "Tiene opiniones sobre microservicios"]
    },
    pragmatist: {
      title: "El Pragmático",
      emoji: "⚖️",
      description: "Equilibras calidad con hacer las cosas. Lo perfecto es enemigo de lo bueno, y lo bueno es lo que se entrega. Sabes cuándo profundizar y cuándo seguir adelante. Tu código puede no ser perfecto, pero siempre está a tiempo.",
      traits: ["Realmente entrega features", "La deuda técnica es una característica", "Entusiasta del work-life balance"]
    }
  },
  cat: {
    perfectionist: {
      title: "El Perfeccionista",
      emoji: "✨",
      description: "Creus que el codi ha de ser una obra d'art. 100% de cobertura de tests és només el mínim. Els teus PRs són llegendaris per la seva minuciositat. El teu codi és bonic, però les dates d'entrega... bé, són més com suggeriments, no?",
      traits: ["Escriu tests abans dels tests", "Refactoritza per diversió", "Té 3 teclats mecànics"]
    },
    yolo: {
      title: "El Deployer YOLO",
      emoji: "🚀",
      description: "Mou-te ràpid i trenca coses és el teu lema. Producció és només l'entorn final de testing. El teu codi funciona... la majoria del temps. Probablement has fet push directe a main almenys un cop avui.",
      traits: ["Desplega divendres a les 5 PM", "git push --force és vida", "Comentaris? Quins comentaris?"]
    },
    architect: {
      title: "L'Arquitecte de Sistemes",
      emoji: "🏗️",
      description: "Veus el panorama complet. Cada problema necessita una solució escalable de nivell empresarial. Has dissenyat sistemes per 10 milions d'usuaris... per una app de TODOs amb 3 usuaris. Però quan escali, estaràs preparat!",
      traits: ["Dibuixa diagrames per esmorzar", "Kubernetes és la resposta a tot", "Té opinions sobre microserveis"]
    },
    pragmatist: {
      title: "El Pragmàtic",
      emoji: "⚖️",
      description: "Equilibres qualitat amb fer les coses. El perfecte és enemic del bo, i el bo és el que s'entrega. Saps quan aprofundir i quan seguir endavant. El teu codi pot no ser perfecte, però sempre està a temps.",
      traits: ["Realment entrega features", "El deute tècnic és una característica", "Entusiasta del work-life balance"]
    }
  }
};
