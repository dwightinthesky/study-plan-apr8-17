# study-plan-apr8-17

Static study plan site deployed to Cloudflare Pages.

## Local structure

- `public/index.html`: the page you edit
- `scripts/auto-publish.mjs`: watches for local changes, then commits, pushes, and deploys

## Commands

- `npm install`
- `npm run deploy`
- `npm run autopublish`

## Auto publish

This project also runs a local launchd agent on macOS that watches the repo and automatically commits, pushes, and deploys changes to Cloudflare Pages.
