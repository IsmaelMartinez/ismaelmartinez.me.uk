+++
title       = "Configuring a multi-language Hugo blog"
date        = 2024-03-21T18:48:04Z
description = "How to get a Hugo multi-language blog up and running in minutes"
authors     = ["Ismael Martinez Ramos"]
tags        = ["Hugo", "Blog", "Multi-language", "Setup"]
categories  = ["Hugo", "Blog"]
series      = ["Blog Setup"]
draft       = false
+++

Over the years, I’ve learned a lot, so I decided to document my discoveries and opinions in a Hugo‑powered blog.

I considered using Medium, but it does not separate content by language. Hugo, on the other hand, is a fast, easy‑to‑use static site generator that supports multilingual sites out of the box—and it gave me a chance to play with Go again.

This post is a concise run‑through of Hugo’s excellent documentation. If you’re new to Hugo, consult the [quick start guide](https://gohugo.io/getting-started/quick-start/).

Feel free to skip ahead if you’re already familiar with Hugo.

# Quick setup

## Installing Hugo

First, install Hugo on your machine.

On macOS:

```sh
brew install hugo
```

On other platforms, follow the instructions in the [Hugo install docs](https://gohugo.io/getting-started/installing/).

## Creating your site

After installing Hugo, create your site and initialise version control:

```sh
hugo new site ismaelmartinez.me.uk
cd ismaelmartinez.me.uk
git init
```

Then initialise your repository as a Hugo Module:

```sh
hugo mod init github.com/ismaelmartinez/ismaelmartinez.me.uk
```

This sets up Hugo Modules for theme and dependency management.

## Adding a theme

Choosing a theme defines your site’s look and feel. There are hundreds of themes at [themes.gohugo.io](themes.gohugo.io). I chose the [Ananke theme](https://themes.gohugo.io/themes/gohugo-theme-ananke/).

I followed the instructions at [https://github.com/davidsneighbour/gohugo-theme-ananke-template-mod](https://github.com/davidsneighbour/gohugo-theme-ananke-template-mod)

## Starting the server

Running the server provides a live preview of your site. Start it with:

```sh
hugo server
```

Visit <http://localhost:1313/> to see your site in action (it will be empty at this stage).

## Multi-language support

Multi‑language support broadens your audience reach. Hugo’s documentation on multilingual sites is excellent [here](https://gohugo.io/content-management/multilingual/).

In my setup, I configured English, Spanish and Catalan. Edit your `hugo.toml` as follows:

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

# Creating content

Let’s create your first post. Run:

```sh
hugo new content/en/posts/configuring-multilanguage-hugo.md
```

Open `content/en/posts/configuring-multilanguage-hugo.md` and add your front matter and content:

```toml
+++
title       = "Configuring a multi-language Hugo blog"
date        = 2024-03-21T18:48:04Z
description = "How to get a Hugo multi-language blog up and running in minutes"
authors     = ["Ismael Martinez Ramos"]
tags        = ["Hugo", "Blog", "Multi-language", "Setup"]
categories  = ["Hugo", "Blog"]
series      = ["Blog Setup"]
draft       = true
+++
```

Below the [front matter](https://gohugo.io/content-management/front-matter/), write your post in Markdown.

Once you’ve added your content, preview drafts with:

```sh
hugo server --buildDrafts
```

You can access your content at [http://localhost:1313/en/posts/configuring-multilanguage-hugo/](http://localhost:1313/en/posts/configuring-multilanguage-hugo/).

After reviewing your draft, change the `draft` field to `false` and run the server again.

# Pushing to GitHub

Before we finish, let us push the content to GitHub.

1. Create a new repository on [GitHub](https://github.com/new).
2. In your local directory, run:

```sh
git add .
git commit -m "Initial commit"
git remote add origin <remote repository URL>
git push -u origin main
```

Your site’s code and content are now hosted on GitHub.

# Conclusion

This was a quick Hugo setup for a multi-language blog. Next up: configuring GitHub Pages, using a custom domain, and adding analytics with Umami (<https://umami.is/>).
