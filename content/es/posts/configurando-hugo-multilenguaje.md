+++
title       = "Configurando un blog Hugo multilingüe"
date        = 2024-03-21T18:48:04Z
description = "Cómo poner en marcha un blog Hugo multilingüe en pocos minutos"
authors     = ["Ismael Martinez Ramos"]
tags        = ["Hugo", "Blog", "Multilingüe", "Configuración"]
categories  = ["Hugo", "Blog"]
series      = ["Configuración del Blog"]
draft       = false
+++

A lo largo de los años, he aprendido mucho, así que decidí documentar mis descubrimientos y opiniones en un blog hecho amb Hugo.

Consideré usar Medium, pero no separa el contenido por idioma. Hugo, en cambio, es un generador de sitios estáticos rápido y fácil de usar que admite sitios multilingües de forma nativa, y me dio la oportunidad de volver a jugar con Go.

Esta entrada es un resumen conciso de la excelente documentación de Hugo. Si eres nuevo con Hugo, consulta la [guía rápida](https://gohugo.io/getting-started/quick-start/).

Puedes saltar directamente a la siguiente sección si ya conoces Hugo.

# Configuración rápida

## Instalando Hugo

Primero, instala Hugo en tu ordenador.

En macOS:

```sh
brew install hugo
```

En otras plataformas, sigue las instrucciones en la [documentación de instalación de Hugo](https://gohugo.io/getting-started/installing/).

## Creando tu sitio

Después de instalar Hugo, crea tu sitio e inicializa el control de versiones:

```sh
hugo new site ismaelmartinez.me.uk
cd ismaelmartinez.me.uk
git init
```

Luego, inicializa tu repositorio como un Módulo Hugo:

```sh
hugo mod init github.com/ismaelmartinez/ismaelmartinez.me.uk
```

Esto configura los Módulos Hugo para la gestión de temas y dependencias.

## Añadiendo un tema

Elegir un tema define el aspecto y la sensación de tu sitio. Hay cientos de temas en [themes.gohugo.io](https://themes.gohugo.io). Yo elegí el tema [Ananke](https://themes.gohugo.io/themes/gohugo-theme-ananke/).

Seguí las instrucciones de [https://github.com/davidsneighbour/gohugo-theme-ananke-template-mod](https://github.com/davidsneighbour/gohugo-theme-ananke-template-mod)

## Iniciando el servidor

Ejecutar el servidor te proporciona una vista previa en vivo de tu sitio. Inícialo con:

```sh
hugo server
```

Visita <http://localhost:1313/> para ver tu sitio en acción (en este punto estará vacío).

## Soporte multilingüe

El soporte multilingüe amplía el alcance de tu audiencia. La documentación de Hugo sobre sitios multilingües es excelente [aquí](https://gohugo.io/content-management/multilingual/).

En mi configuración, configuré inglés, castellano y catalán. Edita tu `hugo.toml` así:

```toml
languageDirection = 'ltr'
defaultContentLanguage = 'en'
defaultContentLanguageInSubdir = true

[languages.en]
    contentDir = 'content/en'
    languageCode = 'en-gb'
    languageName = 'English'
    weight = 1    
    [languages.en.params]
        subtitle = 'Blog and Me'
[languages.es]
    contentDir = 'content/es'
    languageCode = 'es'
    languageName = 'Castellano'
    weight = 2
    [languages.es.params]
        subtitle = 'Blog y Yo'
[languages.cat]
    contentDir = 'content/cat'
    languageCode = 'ca'
    languageName = 'Catala'
    weight = 3
    [languages.cat.params]
        subtitle = 'Blog i Jo'
```

# Creando contenido

Crea tu primera entrada. Ejecuta:

```sh
hugo new content/en/posts/configuring-multilanguage-hugo.md
```

Abre `content/en/posts/configuring-multilanguage-hugo.md` y añade el front matter y el contenido:

```toml
+++
title       = "Configurando un blog Hugo multilingüe"
date        = 2024-03-21T18:48:04Z
description = "Cómo poner en marcha un blog Hugo multilingüe en pocos minutos"
authors     = ["Ismael Martinez Ramos"]
tags        = ["Hugo", "Blog", "Multilingüe", "Configuración"]
categories  = ["Hugo", "Blog"]
series      = ["Configuración del Blog"]
draft       = true
+++
```

Debajo del [front matter](https://gohugo.io/content-management/front-matter/), escribe tu entrada en Markdown.

Una vez hayas añadido el contenido, previsualiza los borradores con:

```sh
hugo server --buildDrafts
```

Puedes acceder a tu contenido en [http://localhost:1313/es/posts/configurando-hugo-multilenguaje/](http://localhost:1313/es/posts/configurando-hugo-multilenguaje/).

Después de revisar el borrador, cambia el campo `draft` a `false` y vuelve a ejecutar el servidor.

# Subiendo a GitHub

Antes de terminar, subimos el contenido a GitHub.

1. Crea un nuevo repositorio en [GitHub](https://github.com/new).
2. En tu directorio local, ejecuta:

```sh
git add .
git commit -m "Primer commit"
git remote add origin <URL del repositorio remoto>
git push -u origin main
```

El código y el contenido de tu sitio ahora están alojados en GitHub.

# Conclusiones

Esta ha sido una configuración rápida de un blog Hugo multilingüe. El siguiente paso: configurar GitHub Pages, usar un dominio personalizado y añadir analíticas con [Umami](https://umami.is/).
