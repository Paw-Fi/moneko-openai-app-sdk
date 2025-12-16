/**
 * Build HTML files with inlined JavaScript and CSS (no TS runtime required).
 *
 * This script generates production-ready HTML files for each widget
 * with all JavaScript and CSS inlined to meet OpenAI Apps SDK requirements.
 *
 * Per guidelines:
 * - Include CSP meta tag
 * - Inline all scripts and styles
 * - Be self-contained with no external dependencies
 */
import fs from "node:fs";
import path from "node:path";

const DIST_DIR = path.resolve("dist");
const PUBLIC_DIR = path.resolve("public");
const OUTPUT_DIR = DIST_DIR;

const widgets = [
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

function buildWidget(widget) {
  console.log(`Building ${widget.name}...`);

  const jsPath = path.join(DIST_DIR, widget.jsFile);
  if (!fs.existsSync(jsPath)) {
    throw new Error(`JavaScript file not found: ${jsPath}`);
  }
  const jsContent = fs.readFileSync(jsPath, "utf-8");

  let cssContent = "";
  const cssPath = path.join(DIST_DIR, widget.cssFile);
  if (fs.existsSync(cssPath)) {
    cssContent = fs.readFileSync(cssPath, "utf-8");
  } else {
    const cssFiles = fs.readdirSync(DIST_DIR).filter((f) => f.endsWith(".css"));
    if (cssFiles.length > 0) {
      console.log(`  Using shared CSS file: ${cssFiles[0]}`);
      cssContent = fs.readFileSync(path.join(DIST_DIR, cssFiles[0]), "utf-8");
    } else {
      console.warn(`  Warning: No CSS file found, continuing without styles`);
    }
  }

  if (!fs.existsSync(widget.htmlTemplate)) {
    throw new Error(`HTML template not found: ${widget.htmlTemplate}`);
  }
  let html = fs.readFileSync(widget.htmlTemplate, "utf-8");

  html = html.replace(
    /<script[^>]+src="[^"]+"[^>]*><\/script>/g,
    `<script type="module">${jsContent}</script>`
  );
  html = html.replace(
    /<link[^>]+rel="stylesheet"[^>]+>/g,
    `<style>${cssContent}</style>`
  );

  const outputPath = path.join(OUTPUT_DIR, widget.outputHtml);
  fs.writeFileSync(outputPath, html, "utf-8");
  console.log(`✓ Created ${outputPath}`);
}

function main() {
  console.log("Building widget HTML files...\n");

  if (!fs.existsSync(DIST_DIR)) {
    throw new Error(`Distribution directory not found: ${DIST_DIR}`);
  }

  for (const widget of widgets) {
    buildWidget(widget);
  }

  console.log("\n✓ All widgets built successfully!");
}

main();
