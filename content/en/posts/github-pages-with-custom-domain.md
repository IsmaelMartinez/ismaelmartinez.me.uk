+++
title         = "Github Pages With Custom Domain"
date          = 2025-05-20T15:09:09+01:00
draft         = true
description   = "Configuring Github Pages and assigning a custom domain"
isCJKLanguage = true
authors       = ["Ismael Martinez Ramos"]
tags          = ["Hugo", "Blog", "Multilingüe", "GitHub Pages", "Custom Domain"]
categories    = ["Hugo", "Blog", "Setup"]
series        = ["Blog Setup"]
+++

# Configuring Github Pages with a custom domain

## Introduction

In this post, I will cover the steps to configure GitHub Pages, and assign a custom domain to your GitHub Pages site.

Similar to the previous post, this is a quick overview of the steps to configure GitHub Pages and assign a custom domain, as the GitHub documentation provides a detailed guide on how to do this.

## Steps to configure GitHub Pages

You can get a detailed guide on how to configure GitHub Pages [here](https://docs.github.com/en/pages/getting-started-with-github-pages), but I am just going to cover the steps I followed to configure my GitHub Pages site.

1. **Add Read and write permissions to the workflows**: To allow the workflow to dpeloy the site, you need to change the **Workflow permissions** under `Settings > Actions > General > Workflow permissions` to `Read and write permissions`.
2. **Setup the baseUrl**: In the `hugo.toml` file, set the `baseURL` to your github domain. In my case this is `baseURL = '<https://ismaelmartinez.github.io/ismaelmartinez.me.uk/>'`
3. **Create a workflow file**: Create a new file in the `.github/workflows` directory of your repository. You can name it `gh-pages.yml` (that seems to be the standard name). This file will contain the configuration for GitHub Actions to build and deploy your Hugo site to GitHub Pages.
4. **Configure the workflow file**: Add the following content to the `gh-pages.yml` file:

```yaml
name: Deploy Hugo site to GitHub Pages
on:
  push:
    branches:
      - main
jobs:
    build-deploy:
        runs-on: ubuntu-latest
        steps:
            - name: Checkout code
              uses: actions/checkout@v4
              with:
                submodules: true
            - name: Set up Hugo
              uses: peaceiris/actions-hugo@v3
              with:
                hugo-version: 'latest'
                extended: true

            - name: Download Hugo Modules
              run: hugo mod get

            - name: Build the site
              run: hugo --minify

            - name: Deploy to GitHub Pages
              uses: peaceiris/actions-gh-pages@v4
              with:
                github_token: ${{ secrets.GITHUB_TOKEN }}
                publish_dir: ./public
```

5. **Commit and push the changes**: Commit the changes to your repository and push them to the `main` branch. This will trigger the GitHub Actions workflow, which will build your Hugo site and deploy it to GitHub Pages. In my case, this creates a page in [https://ismaelmartinez.github.io/ismaelmartinez.me.uk].
6. **Assign the gh-pages branch**: Go to `Settings > Pages` and select the `gh-pages` branch as the source for your GitHub Pages site.

With these steps, you should have a GitHub Pages site up and running. Now lets move to the next step, which is assigning a custom domain.

## Assign a custom domain

Using a github pages site is great, but if you are paying for a domain, you probably want to use it. In my case, I got `ismaelmartinez.me.uk` that I bought a few years ago but never used it for much.

To assign a custom domain to your GitHub Pages site, follow these steps:
1. **Go to your domain registrar**: Log in to the website where you purchased your domain. In my case this is AWS.
2. **Add a CNAME record**: In the DNS settings of your domain, add a CNAME record that points to your GitHub Pages site. For example, if your GitHub Pages site is `ismaelmartinez.github.io/ismaelmartinez.me.uk`, you would add a CNAME record with the name `ismaelmartinez.me.uk` and the value `ismaelmartinez.github.io`.
3. **Create a CNAME file in your repository**: In the root of your GitHub Pages repository, create a file named `CNAME` (no file extension) and add your custom domain to it. For example, the content of the `CNAME` file should be:
```
ismaelmartinez.me.uk
```


// Assign a custom domain

//maybe do also analytics with umami
