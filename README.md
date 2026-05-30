# Outfit Studio 👕✨

A small web app for cataloguing the clothes you own and visually combining them
into outfits. Everything lives in your browser — no account, no server, no data
leaves your device.

## Features

- **Wardrobe** — add each item with a photo (auto-resized to keep storage small),
  a name, a category (Headwear, Outerwear, Tops, Bottoms, Footwear, Accessories)
  and a color. Filter and delete items.
- **Builder** — pick one item per category and see them composed together on an
  outfit board, layered top-to-bottom. Name and save looks you like.
- **Outfits** — browse, review and delete the outfits you've saved.
- **Persistence** — items and outfits are stored in `localStorage`, so they
  survive page reloads on the same browser.

## Tech

Built with [Svelte](https://svelte.dev) and bundled with
[Rollup](https://rollupjs.org). No backend required.

## Get started

```bash
npm install
npm run dev
```

Then open [localhost:8080](http://localhost:8080).

## Production build

```bash
npm run build   # outputs to public/build
npm run start   # serves the public/ folder
```

The contents of `public/` are fully static and can be deployed to any static
host (Vercel, Netlify, GitHub Pages, surge, …).

## Project structure

```
src/
  main.js              app entry point
  App.svelte           shell + tab navigation
  lib/
    storage.js         localStorage-backed stores, categories, image resizing
    Wardrobe.svelte    add / list / delete clothing items
    Builder.svelte     compose and save outfits
    Outfits.svelte     view saved outfits
```

## Notes & ideas for later

- Images are stored as resized JPEG data URLs inside `localStorage` (≈5MB
  budget). For a large wardrobe you may eventually want IndexedDB or a backend.
- Possible next steps: drag-to-reorder layers, background removal for cleaner
  cut-outs, tags/seasons, and outfit sharing.
