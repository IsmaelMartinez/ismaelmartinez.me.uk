+++ 
draft = true
date = 2024-03-21T18:48:04Z
title = ""
description = ""
slug = ""
isCJKLanguage = true
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

I wanted to create a blog to document a few things I have learned over the years. I decided to use Hugo as my static site generator, as it is fast, easy to use, and has a lot of themes available. I thought about using Medium, but I wanted to create a multi-language blog and, while Medium allows you to write in multiple languages, it doesn't provide a way to separate the content by language.

This article is a quick go-throw of the excellent Hugo documentation. If you're new to Hugo, I recommend starting with the [quick start guide](https://gohugo.io/getting-started/quick-start/).

Feel free to skip to the next post if you're already familiar with Hugo.

# Quick setup

## Install Hugo

To install Hugo on macOS, you can use Homebrew by running the following command:

`brew install hugo`

Once installed, you can create the site by running the following command:

`hugo new site ismaelmartinez.me.uk`

Go into the folder generated and run `git init` to initialise the empty git repository.

## Add a Theme

Now, it's time to choose your theme. There are a ton of themes available at [https://themes.gohugo.io/themes/](https://themes.gohugo.io/themes/). I chose the [Ananke theme](https://themes.gohugo.io/themes/gohugo-theme-ananke/).

Most themes follow the same pattern to add a git submodule. You can add the Ananke theme as a submodule by running the following command:

`git submodule add https://github.com/theNewDynamic/gohugo-theme-ananke.git themes/ananke`

Then add the theme into the hugo.toml file, by adding the next lines:

```
theme = 'ananke'
```

## Start the server

And now you should be able to start your Hugo server by running the command `hugo server`. However, at this point, there is no content available.

## Multi-language support

Hugo provides excellent support for multi-language websites, and their documentation is a valuable resource for this feature. You can find more information about it [here](https://gohugo.io/content-management/multilingual/).

In my case, I have configured my post to support three languages: English, Spanish, and Catalan. This means that I have created separate content directories for each language and specified the language codes accordingly. Here is an example of how my configuration looks like:

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


# Create content

To create content for your Hugo website, follow these steps:

1. Run the command `hugo new content en/posts/configuring-multilanguage-hugo.md` to create a new content file. 
1. Hugo will generate a file named `configuring-multilanguage-hugo.md` under the `content/en/posts/` directory.
1. Open the file and add your desired content. In my case, what you are reading is the content of the file.

Repeat this process for the other languages.

Each content file should have a section at the top, called front matter, that looks like this:

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
```

I am not going to go into detail about this section, as you can find more information about it [here](https://gohugo.io/content-management/front-matter/).

To add content, edit the file and add it below the front matter section. 

Once you are ready, run `hugo server --buildDrafts` to see the draft document.

You can access your content at `http://localhost:1313/en/posts/configuring-multilanguage-hugo/`.

# Push to GitHub

Before we finish, let's push the content to GitHub.

1. Create a new repository in [GitHub](https://github.com/new).
1. Add all the files to the Git repository using the command `git add .`.
1. Commit the changes using the command `git commit -m "Initial commit"`.
1. Add the remote repository URL using the command `git remote add origin <remote repository URL>`.
1. Push the content to the remote repository using the command `git push -u origin main`.

And that's it. You should be able to see your content in GitHub.

# Conclusion

This was a quick Hugo setup for a multi language blog. I did find it extremely easy to set up and I'm looking forward to document the process of creating this blog, and adding content to it. 
