+++
title = "Github Pages With Custom Domain"
date = 2025-05-20T15:09:09+01:00
draft = true
description = "Configuring Github Pages and assigning a custom domain"
slug = ""
isCJKLanguage = true
authors = ["Ismael Martinez Ramos"]
tags = ["Hugo", "Blog", "Multilingüe", "GitHub Pages", "Custom Domain"]
categories = ["Hugo", "Blog", "Setup"]
externalLink = ""
series = ["Blog Setup"]
+++

# Configuring Github Pages with a custom domain

## Introduction

In this post, I will cover the steps to configure GitHub Pages, and assign a custom domain to your GitHub Pages site.

Similar to the previous post, this is a quick overview of the steps to configure GitHub Pages and assign a custom domain, as the GitHub documentation provides a detailed guide on how to do this.

## Steps to configure GitHub Pages

You can get a detailed guide on how to configure GitHub Pages [here](https://docs.github.com/en/pages/getting-started-with-github-pages), but I am just going to cover the steps I followed to configure my GitHub Pages site.

1. **Main Branch**: Make sure your main branch is set to `main`. Just run `git config --global init.defaultBranch main`

1. **Create a workflow file**: Create a new file in the `.github/workflows` directory of your repository. You can name it `gh-pages.yml` (that seems to be the standard name). This file will contain the configuration for GitHub Actions to build and deploy your Hugo site to GitHub Pages.
1. **Configure the workflow file**: Add the following content to the `gh-pages.yml` file:
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
            - name: Set up Hugo
              uses: peaceiris/actions-hugo@v3
              with:
                  hugo-version: 'latest'

            - name: Build the site
              run: hugo --minify

            - name: Deploy to GitHub Pages
              uses: peaceiris/actions-gh-pages@v4
              with:
                  github_token: ${{ secrets.GITHUB_TOKEN }}
                  publish_dir: ./public
```
1. **Commit and push the changes**: Commit the changes to your repository and push them to the `main` branch. This will trigger the GitHub Actions workflow, which will build your Hugo site and deploy it to GitHub Pages. In my case, this creates a page in `https://ismaelmartinez.me.uk.github.io/`.

References: [https://github.com/peaceiris/actions-gh-pages], [https://github.com/peaceiris/actions-hugo] and [https://docs.github.com/en/actions]

IMPORTANT: You will need to change the **Workflow permissions** under `Settings > Actions > General > Workflow permissions` to `Read and write permissions` to allow the workflow to deploy the site.

// Assign a custom domain

//maybe do also analytics with umami
