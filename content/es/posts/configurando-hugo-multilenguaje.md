+++ 
date = 2024-03-21T18:48:04Z
title = "Configuració rápida"
description = "Configuración rápida de Hugo para un blog multilingüe"
slug = ""
isCJKLanguage = true
authors = ["Ismael Martínez Ramos"]
tags = ["Hugo", "Blog", "Multilingüe"]
categories = ["Hugo", "Blog", "Configuración"]
externalLink = ""
series = ["Configuración del blog"]
+++

Quería crear un blog para documentar algunas cosas que he aprendido a lo largo de los años. Decidí utilizar Hugo como mi generador de sitios estáticos, ya que es rápido, fácil de usar y tiene una gran cantidad de temas disponibles. Pensé en usar Medium, pero quería crear un blog multilingüe y, aunque Medium te permite escribir en varios idiomas, no proporciona una forma de separar el contenido por idioma.

Este artículo es una rápida introducción a la excelente documentación de Hugo. Si eres nuevo en Hugo, te recomiendo comenzar con la [guía de inicio rápido](https://gohugo.io/getting-started/quick-start/).

Si ya estás familiarizado con Hugo, siéntete libre de saltar al siguiente post.

# Configuración rápida

## Instalar Hugo

Para instalar Hugo en macOS, puedes utilizar Homebrew ejecutando el siguiente comando:

`brew install hugo`

Una vez instalado, puedes crear el sitio ejecutando el siguiente comando:

`hugo new site ismaelmartinez.me.uk`

Ingresa a la carpeta generada y ejecuta `git init` para inicializar el repositorio git vacío.

## Agregar un tema

Ahora es el momento de elegir tu tema. Hay una gran cantidad de temas disponibles en [https://themes.gohugo.io/themes/](https://themes.gohugo.io/themes/). Yo elegí el tema [Ananke](https://themes.gohugo.io/themes/gohugo-theme-ananke/).

La mayoría de los temas siguen el mismo patrón para agregar un submódulo de git. Puedes agregar el tema Ananke como un submódulo ejecutando el siguiente comando:

`git submodule add https://github.com/theNewDynamic/gohugo-theme-ananke.git themes/ananke`

Luego, agrega el tema al archivo hugo.toml, añadiendo las siguientes líneas:

## Soporte multiidioma

Hugo ofrece un excelente soporte para sitios web multilingües, y su documentación es un recurso valioso para esta característica. Puedes encontrar más información al respecto [aquí](https://gohugo.io/content-management/multilingual/).

En mi caso, he configurado mi publicación para admitir tres idiomas: inglés, español y catalán. Esto significa que he creado directorios de contenido separados para cada idioma y he especificado los códigos de idioma correspondientes. Aquí tienes un ejemplo de cómo se ve mi configuración:

```
languageDirection = 'ltr'
defaultContentLanguage = 'en'
defaultContentLanguageInSubdir = true

[languages]
    [languages.en]
        contentDir = 'content/en'
        languageCode = 'en-gb'
        languageName = 'English'
        weight = 1    
        [languages.en.params]
            subtitle = 'Blogs and Me'
    [languages.es]
        contentDir = 'content/es'
        languageCode = 'es'
        languageName = 'Castellano'
        weight = 2
        [languages.es.params]
            subtitle = 'Blogs and Me'
    [languages.cat]
        contentDir = 'content/cat'
        languageCode = 'ca'
        languageName = 'Catala'
        weight = 3
        [languages.cat.params]
            subtitle = 'Blogs and Me'
```


# Crear contenido

Para crear contenido para tu sitio web de Hugo, sigue estos pasos:

1. Ejecuta el comando `hugo new content es/posts/configurando-hugo-multilenguaje.md` para crear un nuevo archivo de contenido.
2. Hugo generará un archivo llamado `configurando-hugo-multilenguaje.md` en el directorio `content/es/posts/`.
3. Abre el archivo y agrega tu contenido deseado. En mi caso, lo que estás leyendo es el contenido del archivo.

Repite este proceso para los otros idiomas.

Cada archivo de contenido debe tener una sección en la parte superior, llamada 'front matter', que se ve así:

```
+++ 
draft = true
date = 2024-03-21T18:48:04Z
title = ""
description = ""
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++
```

No voy a entrar en detalles sobre esta sección, ya que puedes encontrar más información al respecto [aquí](https://gohugo.io/content-management/front-matter/).

Para agregar contenido, edita el archivo y añádelo debajo de la sección de 'front matter'.

Una vez que estés listo, ejecuta `hugo server --buildDrafts` para ver el documento en borrador.

Puedes acceder a tu contenido en `http://localhost:1313/es/posts/configurando-hugo-multilenguaje/`.

# Subir a GitHub

Antes de terminar, vamos a subir el contenido a GitHub.

1. Crea un nuevo repositorio en [GitHub](https://github.com/new).
2. Añade todos los archivos al repositorio Git usando el comando `git add .`.
3. Haz un commit de los cambios usando el comando `git commit -m "Commit inicial"`.
4. Añade la URL del repositorio remoto usando el comando `git remote add origin <URL del repositorio remoto>`.
5. Sube el contenido al repositorio remoto usando el comando `git push -u origin main`.

Y eso es todo. Deberías poder ver tu contenido en GitHub.

# Conclusión

Esta fue una configuración rápida de Hugo para un blog multilingüe. Encontré que fue extremadamente fácil de configurar y estoy deseando documentar el proceso de creación de este blog y añadir contenido a él.
