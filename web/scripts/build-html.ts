/**
 * Build HTML files with inlined JavaScript and CSS
 *
 * This script generates production-ready HTML files for each widget
 * with all JavaScript and CSS inlined to meet OpenAI Apps SDK requirements.
 *
 * Per Section C.3, each HTML file must:
 * - Include CSP meta tag
 * - Inline all scripts and styles
 * - Be self-contained with no external dependencies
 */

import fs from "node:fs";
import path from "node:path";

const DIST_DIR = path.resolve("dist");
const PUBLIC_DIR = path.resolve("public");
const OUTPUT_DIR = DIST_DIR;

interface Widget {
  name: string;
  jsFile: string;
  cssFile: string;
  htmlTemplate: string;
  outputHtml: string;
}

const widgets: Widget[] = [
  {
    name: "Budget Status Card",
    jsFile: "budget-status.js",
    cssFile: "budget-status.css",
    htmlTemplate: path.join(PUBLIC_DIR, "budget-status-card.html"),
    outputHtml: "budget-status-card.html",
  },
  {
    name: "Category Breakdown Chart",
    jsFile: "category-breakdown.js",
    cssFile: "category-breakdown.css",
    htmlTemplate: path.join(PUBLIC_DIR, "category-breakdown.html"),
    outputHtml: "category-breakdown.html",
  },
  {
    name: "Expense Table",
    jsFile: "expense-table.js",
    cssFile: "expense-table.css",
    htmlTemplate: path.join(PUBLIC_DIR, "expense-table.html"),
    outputHtml: "expense-table.html",
  },
];

function buildWidget(widget: Widget): void {
  console.log(`Building ${widget.name}...`);

  // Read JavaScript bundle
  const jsPath = path.join(DIST_DIR, widget.jsFile);
  if (!fs.existsSync(jsPath)) {
    throw new Error(`JavaScript file not found: ${jsPath}`);
  }
  const jsContent = fs.readFileSync(jsPath, "utf-8");

  // Read CSS bundle
  const cssPath = path.join(DIST_DIR, widget.cssFile);
  if (!fs.existsSync(cssPath)) {
    throw new Error(`CSS file not found: ${cssPath}`);
  }
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  // Read HTML template
  if (!fs.existsSync(widget.htmlTemplate)) {
    throw new Error(`HTML template not found: ${widget.htmlTemplate}`);
  }
  let html = fs.readFileSync(widget.htmlTemplate, "utf-8");

  // Replace script and link tags with inlined content
  html = html.replace(
    /<script[^>]+src="[^"]+"[^>]*><\/script>/g,
    `<script type="module">${jsContent}</script>`
  );
  html = html.replace(
    /<link[^>]+rel="stylesheet"[^>]+>/g,
    `<style>${cssContent}</style>`
  );

  // Write output HTML
  const outputPath = path.join(OUTPUT_DIR, widget.outputHtml);
  fs.writeFileSync(outputPath, html, "utf-8");
  console.log(`✓ Created ${outputPath}`);
}

function main(): void {
  console.log("Building widget HTML files...\n");

  if (!fs.existsSync(DIST_DIR)) {
    throw new Error(`Distribution directory not found: ${DIST_DIR}`);
  }

  for (const widget of widgets) {
    try {
      buildWidget(widget);
    } catch (err) {
      console.error(`✗ Failed to build ${widget.name}:`, err);
      process.exit(1);
    }
  }

  console.log("\n✓ All widgets built successfully!");
}

main();
