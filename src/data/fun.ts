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
  },
  {
    id: 'excuse',
    icon: '🤷',
    path: '/fun/excuse',
    color: '#f59e0b'
  },
  {
    id: 'trivia',
    icon: '❓',
    path: '/fun/trivia',
    color: '#3b82f6'
  }
];

export const devExcuses = {
  en: [
    "It works on my machine!",
    "That's not a bug, it's a feature.",
    "The specs weren't clear.",
    "It must be a caching issue.",
    "Someone must have changed my code.",
    "It worked yesterday.",
    "That's a known issue. It's on the backlog.",
    "Have you tried clearing your cache?",
    "It's probably a DNS issue.",
    "The database was being weird.",
    "QA didn't test that scenario.",
    "It's a third-party library issue.",
    "The requirements changed last minute.",
    "It's working as designed.",
    "I didn't have time to write tests.",
    "That was like that when I got here.",
    "It passed code review.",
    "The staging environment is different.",
    "My internet was slow.",
    "The deployment pipeline is broken.",
    "I was waiting on design specs.",
    "It's a race condition. Very hard to reproduce.",
    "The user is holding it wrong.",
    "I thought someone else was handling that.",
    "Mercury is in retrograde.",
    "It's probably cosmic rays.",
    "The PM approved it.",
    "I can't reproduce it locally.",
    "The documentation is outdated.",
    "It's a legacy system issue."
  ],
  es: [
    "¡Funciona en mi máquina!",
    "Eso no es un bug, es una característica.",
    "Las especificaciones no estaban claras.",
    "Debe ser un problema de caché.",
    "Alguien debe haber cambiado mi código.",
    "Ayer funcionaba.",
    "Es un problema conocido. Está en el backlog.",
    "¿Has probado a limpiar la caché?",
    "Probablemente es un problema de DNS.",
    "La base de datos estaba rara.",
    "QA no probó ese escenario.",
    "Es un problema de una librería externa.",
    "Los requisitos cambiaron a última hora.",
    "Funciona según el diseño.",
    "No tuve tiempo de escribir tests.",
    "Ya estaba así cuando llegué.",
    "Pasó el code review.",
    "El entorno de staging es diferente.",
    "Mi internet estaba lento.",
    "El pipeline de despliegue está roto.",
    "Estaba esperando las specs de diseño.",
    "Es una condición de carrera. Muy difícil de reproducir.",
    "El usuario lo está usando mal.",
    "Pensé que otra persona se encargaba de eso.",
    "Mercurio está retrógrado.",
    "Probablemente son rayos cósmicos.",
    "El PM lo aprobó.",
    "No puedo reproducirlo localmente.",
    "La documentación está desactualizada.",
    "Es un problema del sistema legacy."
  ],
  cat: [
    "Funciona a la meva màquina!",
    "Això no és un bug, és una característica.",
    "Les especificacions no eren clares.",
    "Deu ser un problema de caché.",
    "Algú deu haver canviat el meu codi.",
    "Ahir funcionava.",
    "És un problema conegut. Està al backlog.",
    "Has provat de netejar la caché?",
    "Probablement és un problema de DNS.",
    "La base de dades estava estranya.",
    "QA no va provar aquest escenari.",
    "És un problema d'una llibreria externa.",
    "Els requisits van canviar a última hora.",
    "Funciona segons el disseny.",
    "No vaig tenir temps d'escriure tests.",
    "Ja estava així quan vaig arribar.",
    "Va passar el code review.",
    "L'entorn de staging és diferent.",
    "El meu internet estava lent.",
    "El pipeline de desplegament està trencat.",
    "Estava esperant les specs de disseny.",
    "És una condició de carrera. Molt difícil de reproduir.",
    "L'usuari ho està fent servir malament.",
    "Pensava que una altra persona s'encarregava d'això.",
    "Mercuri està retrògrad.",
    "Probablement són raigs còsmics.",
    "El PM ho va aprovar.",
    "No puc reproduir-ho localment.",
    "La documentació està desactualitzada.",
    "És un problema del sistema legacy."
  ]
};

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

export const triviaQuestions = {
  en: [
    {
      question: "What year was JavaScript created?",
      answers: ["1990", "1995", "2000", "2005"],
      correct: 1
    },
    {
      question: "Who is the creator of Linux?",
      answers: ["Bill Gates", "Steve Jobs", "Linus Torvalds", "Dennis Ritchie"],
      correct: 2
    },
    {
      question: "What does HTML stand for?",
      answers: ["Hyper Text Markup Language", "High Tech Modern Language", "Home Tool Markup Language", "Hyperlinks Text Mark Language"],
      correct: 0
    },
    {
      question: "Which company developed TypeScript?",
      answers: ["Google", "Facebook", "Microsoft", "Apple"],
      correct: 2
    },
    {
      question: "What is the time complexity of binary search?",
      answers: ["O(n)", "O(log n)", "O(n²)", "O(1)"],
      correct: 1
    },
    {
      question: "Which of these is NOT a JavaScript framework?",
      answers: ["React", "Angular", "Django", "Vue"],
      correct: 2
    },
    {
      question: "What port does HTTPS typically use?",
      answers: ["80", "443", "8080", "3000"],
      correct: 1
    },
    {
      question: "What does API stand for?",
      answers: ["Application Programming Interface", "Advanced Program Integration", "Automated Process Interface", "Application Process Integration"],
      correct: 0
    },
    {
      question: "Which language was Go (Golang) created by?",
      answers: ["Facebook", "Amazon", "Google", "Microsoft"],
      correct: 2
    },
    {
      question: "What is the maximum value of a 32-bit signed integer?",
      answers: ["2,147,483,647", "4,294,967,295", "1,073,741,824", "32,767"],
      correct: 0
    }
  ],
  es: [
    {
      question: "¿En qué año se creó JavaScript?",
      answers: ["1990", "1995", "2000", "2005"],
      correct: 1
    },
    {
      question: "¿Quién es el creador de Linux?",
      answers: ["Bill Gates", "Steve Jobs", "Linus Torvalds", "Dennis Ritchie"],
      correct: 2
    },
    {
      question: "¿Qué significa HTML?",
      answers: ["Hyper Text Markup Language", "High Tech Modern Language", "Home Tool Markup Language", "Hyperlinks Text Mark Language"],
      correct: 0
    },
    {
      question: "¿Qué empresa desarrolló TypeScript?",
      answers: ["Google", "Facebook", "Microsoft", "Apple"],
      correct: 2
    },
    {
      question: "¿Cuál es la complejidad temporal de la búsqueda binaria?",
      answers: ["O(n)", "O(log n)", "O(n²)", "O(1)"],
      correct: 1
    },
    {
      question: "¿Cuál de estos NO es un framework de JavaScript?",
      answers: ["React", "Angular", "Django", "Vue"],
      correct: 2
    },
    {
      question: "¿Qué puerto usa típicamente HTTPS?",
      answers: ["80", "443", "8080", "3000"],
      correct: 1
    },
    {
      question: "¿Qué significa API?",
      answers: ["Application Programming Interface", "Advanced Program Integration", "Automated Process Interface", "Application Process Integration"],
      correct: 0
    },
    {
      question: "¿Qué empresa creó Go (Golang)?",
      answers: ["Facebook", "Amazon", "Google", "Microsoft"],
      correct: 2
    },
    {
      question: "¿Cuál es el valor máximo de un entero de 32 bits con signo?",
      answers: ["2,147,483,647", "4,294,967,295", "1,073,741,824", "32,767"],
      correct: 0
    }
  ],
  cat: [
    {
      question: "En quin any es va crear JavaScript?",
      answers: ["1990", "1995", "2000", "2005"],
      correct: 1
    },
    {
      question: "Qui és el creador de Linux?",
      answers: ["Bill Gates", "Steve Jobs", "Linus Torvalds", "Dennis Ritchie"],
      correct: 2
    },
    {
      question: "Què significa HTML?",
      answers: ["Hyper Text Markup Language", "High Tech Modern Language", "Home Tool Markup Language", "Hyperlinks Text Mark Language"],
      correct: 0
    },
    {
      question: "Quina empresa va desenvolupar TypeScript?",
      answers: ["Google", "Facebook", "Microsoft", "Apple"],
      correct: 2
    },
    {
      question: "Quina és la complexitat temporal de la cerca binària?",
      answers: ["O(n)", "O(log n)", "O(n²)", "O(1)"],
      correct: 1
    },
    {
      question: "Quin d'aquests NO és un framework de JavaScript?",
      answers: ["React", "Angular", "Django", "Vue"],
      correct: 2
    },
    {
      question: "Quin port utilitza típicament HTTPS?",
      answers: ["80", "443", "8080", "3000"],
      correct: 1
    },
    {
      question: "Què significa API?",
      answers: ["Application Programming Interface", "Advanced Program Integration", "Automated Process Interface", "Application Process Integration"],
      correct: 0
    },
    {
      question: "Quina empresa va crear Go (Golang)?",
      answers: ["Facebook", "Amazon", "Google", "Microsoft"],
      correct: 2
    },
    {
      question: "Quin és el valor màxim d'un enter de 32 bits amb signe?",
      answers: ["2,147,483,647", "4,294,967,295", "1,073,741,824", "32,767"],
      correct: 0
    }
  ]
};
