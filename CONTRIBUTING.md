# Contributing

Thank you for your interest in contributing!

## Running the Project Locally

To run this Hugo blog locally, follow these steps:

1. **Install Hugo**  
   On macOS, you can use Homebrew:
   ```sh
   brew install hugo
   ```

2. **Clone the Repository**
   ```sh
   git clone https://github.com/ismaelmartinez/ismaelmartinez.me.uk.git
   cd ismaelmartinez.me.uk
   ```

3. **Install Theme Submodules**  
   If the theme is a git submodule, initialize and update it:
   ```sh
   git submodule update --init --recursive
   ```

4. **Start the Hugo Server**
   ```sh
   hugo server
   ```
   Or, to include draft posts:
   ```sh
   hugo server --buildDrafts
   ```

5. **View the Site**  
   Open [http://localhost:1313/](http://localhost:1313/) in your browser.

## Adding Content

- Create new posts using:
  ```sh
  hugo new <language>/posts/<your-post>.md
  ```
  For example:
  ```sh
  hugo new en/posts/my-new-post.md
  ```

- Edit the generated file and add your content below the front matter.

For more details on the project structure and multi-language setup, see the [blog post](./content/en/posts/configuring-multilanguage-hugo.md).

## Building the Site

To build the site for production, run:
```sh
hugo
```

This will generate the static files in the `public` directory.


---
Thank you for helping improve this blog!