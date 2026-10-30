#!/usr/bin/env node
// Render Mermaid text to a self-contained SVG with Pele.
// Usage: node scripts/render-diagram.mjs [input.mmd|-] [output.svg]
// Without an output path the SVG goes to stdout; without an input it reads stdin.
import { readFileSync, writeFileSync } from 'node:fs';
import { render } from 'pele';

// Light tokens from packages/ui/src/styles.css (:root), as hex. An SVG loaded
// through <img> cannot read page CSS, so the colors are inlined and the
// background is solid: the image reads the same on GitHub's light and dark themes.
const theme = {
  bg: '#ffffff', // --background
  fg: '#0a0a0a', // --foreground
  muted: '#737373', // --muted-foreground
  line: '#404040',
  surface: '#f5f5f5', // --muted
  'surface-alt': '#e5e5e5', // --border
  border: '#a1a1a1', // --ring
  accent: '#171717', // --primary
  font: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif',
};

const [input = '-', output] = process.argv.slice(2);
const source = readFileSync(input === '-' ? 0 : input, 'utf8');
const { svg, width, height } = render(source);

const PAD = 16;
const inlined = svg.replace(/var\(--pele-([a-z0-9-]+),([^()]*(?:\([^()]*\))?[^()]*)\)/g, (_, name, fallback) =>
  theme[name] ?? fallback.trim(),
);
// Wrap in an outer SVG with padding and an opaque background rect.
const out =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width + PAD * 2}" height="${height + PAD * 2}" ` +
  `viewBox="0 0 ${width + PAD * 2} ${height + PAD * 2}">` +
  `<rect width="100%" height="100%" rx="6" fill="${theme.bg}"/>` +
  `<g transform="translate(${PAD} ${PAD})">${inlined.replace(/ style="max-width:100%;height:auto;/, ' style="')}</g></svg>\n`;

if (output) writeFileSync(output, out);
else process.stdout.write(out);
