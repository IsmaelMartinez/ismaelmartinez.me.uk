+++ 
date = 2024-03-21T18:48:04Z
title = "Configuració ràpida"
description = "Configuració ràpida de Hugo per a un blog personal multilingüe"
slug = ""
isCJKLanguage = true
authors = ["Ismael Martinez Ramos"]
tags = ["Hugo", "Blog", "Multilingüe"]
categories = ["Hugo", "Blog", "Configuració"]
externalLink = ""
series = ["Configuració del blog"]
+++

Volia crear un blog per documentar algunes coses que he après al llarg dels anys. Vaig decidir utilitzar Hugo com a generador de llocs estàtics, ja que és ràpid, fàcil d'utilitzar i té molts temes disponibles. Vaig pensar a fer servir Medium, però volia crear un blog multilingüe i, tot i que Medium permet escriure en diversos idiomes, no proporciona una manera de separar el contingut per idioma.

Aquest article és una ràpida passada per l'excel·lent documentació de Hugo. Si ets nou a Hugo, recomano començar amb la [guia d'inici ràpid](https://gohugo.io/getting-started/quick-start/).

Si ja coneixes Hugo, si us plau, salta al següent post.

# Configuració ràpida

## Instal·la Hugo

Per instal·lar Hugo a macOS, pots utilitzar Homebrew executant la següent comanda:

```sh
brew install hugo
```

Un cop instal·lat, pots crear el lloc web executant la següent comanda:

```sh
hugo new site ismaelmartinez.me.uk
```

Entra a la carpeta generada i executa la següent comanda per inicialitzar el repositori git:

```sh
git init
```

## Afegir un tema

Ara és el moment de triar el teu tema. Hi ha una gran quantitat de temes disponibles a [https://themes.gohugo.io/themes/](https://themes.gohugo.io/themes/). Jo he triat el [tema Ananke](https://themes.gohugo.io/themes/gohugo-theme-ananke/).

La majoria dels temes segueixen el mateix patró per afegir, usant un submòdul git.

Pots afegir el tema Ananke com a submòdul executant la següent comanda:

```sh
git submodule add https://github.com/theNewDynamic/gohugo-theme-ananke.git themes/ananke
```

A continuació, configura el tema al fitxer hugo.toml, afegint les següents línies:

```toml
theme = 'ananke'
```

## Inicia el servidor

Ara ja hauries de poder iniciar el teu servidor Hugo executant la comanda: 

```sh
hugo server
```

No obstant això, en aquest punt, no veuràs gaire cosa, ja que no hi ha cap contingut disponible.

## Suport multilingüe

Hugo ofereix un excel·lent suport per a llocs web multilingües, i la seva documentació és una font valuosa per a aquesta funcionalitat. Pots trobar més informació sobre això [aquí](https://gohugo.io/content-management/multilingual/).

En el meu cas, he configurat la meva publicació per a suportar tres idiomes: anglès, castellà i català. Això significa que he creat directoris de contingut separats per a cada idioma i he especificat els codis d'idioma corresponents. Aquí tens un exemple de com es veu la meva configuració:

```toml
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

# Crear contingut

Per crear contingut per al teu lloc web de Hugo, segueix aquests passos:

1. Crea un fitxer de contingut nou executant la següent comanda:

```sh 
hugo new content ca/posts/configurant-hugo-multillenguatge.md
```

2. Hugo generarà un fitxer anomenat `configurant-hugo-multillenguatge.md` a la carpeta `content/ca/posts/`.
3. Obre el fitxer i afegeix el contingut desitjat. En el meu cas, el que estàs llegint és el contingut del fitxer.

Repeteix aquest procés per als altres idiomes.

Cada fitxer de contingut ha de tenir una secció a la part superior, anomenada 'front matter', que té aquest aspecte:

```toml
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

No entraré en detalls sobre aquesta secció, ja que pots trobar més informació al respecte [aquí](https://gohugo.io/content-management/front-matter/).

Per afegir contingut, edita l'arxiu i afegeix-lo sota la secció de 'front matter'.

Un cop estiguis llest, executa la seguent commanda per veure el document en esborrany.

```sh
hugo server --buildDrafts
```

Pots accedir al teu contingut a [http://localhost:1313/ca/posts/configurant-hugo-multillenguatge/](http://localhost:1313/ca/posts/configurant-hugo-multillenguatge/).

# Pujar a GitHub

Abans de finalitzar, puguem pujar el contingut a GitHub.

1. Crea un repositori nou a [GitHub](https://github.com/new).
2. Afegiu tots els fitxers al repositori Git utilitzant la comanda

```sh
git add .
```

3. Fes un commit dels canvis

```sh
git commit -m "Commit inicial"
```

4. Afegeix l'URL del repositori remot utilitzant

```sh
git remote add origin <URL del repositori remot>
```

5. Puja el contingut al repositori amb 

```sh
git push -u origin main
```

I això és tot. Hauries de poder veure el teu contingut a GitHub.

# Conclusió

Aquesta ha estat una configuració ràpida de Hugo per a un blog multilingüe. He trobat que és extremadament senzill de configurar i tinc ganes de contínua documentant el procés de creació d'aquest blog, i d'altre contingut.
