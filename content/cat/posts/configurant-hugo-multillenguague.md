+++
title       = "Configurant un blog Hugo multillenguatge"
date        = 2024-03-21T18:48:04Z
description = "Com posar en marxa un blog Hugo multillenguatge en pocs minuts"
authors     = ["Ismael Martinez Ramos"]
tags        = ["Hugo", "Blog", "Multillenguatge", "Configuració"]
categories  = ["Hugo", "Blog"]
series      = ["Configuració del Blog"]
draft       = false
+++

Al llarg dels anys, he après molt, així que he decidit documentar els meus descobriments i opinions en un blog fet amb Hugo.

Vaig considerar utilitzar Medium, però no separa el contingut per idioma. Hugo, en canvi, és un generador de llocs estàtics ràpid i fàcil d'utilitzar que admet llocs multillenguatge de manera nativa — i em va donar l'oportunitat de tornar a jugar amb Go.

Aquesta entrada és un resum concís de l'excel·lent documentació de Hugo. Si ets nou amb Hugo, consulta la [guia ràpida](https://gohugo.io/getting-started/quick-start/).

Pots saltar directament a la següent secció si ja coneixes Hugo.

# Configuració ràpida

## Instal·lant Hugo

Primer, instal·la Hugo al teu ordinador.

A macOS:

```sh
brew install hugo
```

A altres plataformes, segueix les instruccions a la [documentació d'instal·lació de Hugo](https://gohugo.io/getting-started/installing/).

## Creant el teu lloc

Després d'instal·lar Hugo, crea el teu lloc i inicialitza el control de versions:

```sh
hugo new site ismaelmartinez.me.uk
cd ismaelmartinez.me.uk
git init
```

Després, inicialitza el teu repositori com a Mòdul Hugo:

```sh
hugo mod init github.com/ismaelmartinez/ismaelmartinez.me.uk
```

Això configura els Mòduls Hugo per a la gestió de temes i dependències.

## Afegint un tema

Escollir un tema defineix l'aspecte i la sensació del teu lloc. Hi ha centenars de temes a [themes.gohugo.io](https://themes.gohugo.io). Jo vaig escollir el tema [Ananke](https://themes.gohugo.io/themes/gohugo-theme-ananke/).

Vaig seguir les instruccions de [https://github.com/davidsneighbour/gohugo-theme-ananke-template-mod](https://github.com/davidsneighbour/gohugo-theme-ananke-template-mod)

## Iniciant el servidor

Executar el servidor et proporciona una previsualització en viu del teu lloc. Inicia'l amb:

```sh
hugo server
```

Visita <http://localhost:1313/> per veure el teu lloc en acció (en aquest punt estarà buit).

## Suport multillenguatge

El suport multillenguatge amplia l'abast de la teva audiència. La documentació de Hugo sobre llocs [multillenguatge és excel·lent](https://gohugo.io/content-management/multilingual/).

En la meva configuració, vaig configurar anglès, castellà i català. Edita el teu `hugo.toml` així:

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

# Creant contingut

Creem la teva primera entrada. Executa:

```sh
hugo new content/en/posts/configuring-multilanguage-hugo.md
```

Obre `content/en/posts/configuring-multilanguage-hugo.md` i afegeix el front matter i el contingut:

```toml
+++
title       = "Configurant un blog Hugo multillenguatge"
date        = 2024-03-21T18:48:04Z
description = "Com posar en marxa un blog Hugo multillenguatge en pocs minuts"
authors     = ["Ismael Martinez Ramos"]
tags        = ["Hugo", "Blog", "Multillenguatge", "Configuració"]
categories  = ["Hugo", "Blog"]
series      = ["Configuració del Blog"]
draft       = true
+++
```

A sota del [front matter](https://gohugo.io/content-management/front-matter/), escriu la teva entrada en Markdown.

Un cop hagis afegit el contingut, previsualitza els esborranys amb:

```sh
hugo server --buildDrafts
```

Pots accedir al teu contingut a [http://localhost:1313/cat/posts/configurant-hugo-multillenguague/](http://localhost:1313/cat/posts/configurant-hugo-multillenguague/).

Després de revisar l'esborrany, canvia el camp `draft` a `false` i torna a executar el servidor.

# Pujant a GitHub

Abans d'acabar, pugem el contingut a GitHub.

1. Crea un nou repositori a [GitHub](https://github.com/new).
2. Al teu directori local, executa:

```sh
git add .
git commit -m "Primera pujada"
git remote add origin <URL del repositori remot>
git push -u origin main
```

El codi i el contingut del teu lloc ara estan allotjats a GitHub.

# Conclusions

Aquesta ha estat una configuració ràpida d'un blog Hugo multillenguatge. El següent pas: configurar GitHub Pages, utilitzar un domini personalitzat i afegir analítiques amb [Umami](https://umami.is/).
