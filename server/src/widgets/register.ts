import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Widget metadata
 */
export interface WidgetMetadata {
  uri: string;
  name: string;
  description: string;
  html: string;
}

/**
 * Widget URIs for tool registration
 */
export interface WidgetUris {
  budget: string;
  categoryBreakdown: string;
  expenseTable: string;
}

/**
 * Read widget HTML file from web/public directory
 */
function readWidgetHtml(componentName: string, webDir: string): string {
  const directPath = path.join(webDir, `${componentName}.html`);

  if (fs.existsSync(directPath)) {
    return fs.readFileSync(directPath, 'utf8');
  }

  // Try to find with hash suffix (e.g., component-abc123.html)
  const files = fs.readdirSync(webDir);
  const candidates = files
    .filter((file) => file.startsWith(`${componentName}-`) && file.endsWith('.html'))
    .sort();

  const fallback = candidates[candidates.length - 1];
  if (fallback) {
    return fs.readFileSync(path.join(webDir, fallback), 'utf8');
  }

  throw new Error(
    `Widget HTML for "${componentName}" not found in ${webDir}. ` +
    `Expected ${componentName}.html or ${componentName}-*.html. ` +
    `Run "pnpm run build" in the web directory to generate the assets.`
  );
}

/**
 * Register all widget resources and return their URIs
 */
export function registerWidgets(): { widgets: WidgetMetadata[]; uris: WidgetUris } {
  // Find the web/public directory
  // Server is at moneko-openai-app-sdk/server
  // Web is at moneko-openai-app-sdk/web
  const serverRoot = path.resolve(__dirname, '..', '..');
  const projectRoot = path.resolve(serverRoot, '..');
  const webDir = path.join(projectRoot, 'web', 'public');

  if (!fs.existsSync(webDir)) {
    throw new Error(
      `Widget assets not found. Expected directory ${webDir}. ` +
      `Run "pnpm run build" in the web directory before starting the server.`
    );
  }

  logger.info({ webDir }, 'Loading widget HTML from directory');

  const widgets: WidgetMetadata[] = [
    {
      uri: 'ui://widget/budget-status-card.html',
      name: 'Budget Status Card',
      description: 'Budget pacing and remaining balance widget',
      html: readWidgetHtml('budget-status-card', webDir),
    },
    {
      uri: 'ui://widget/category-breakdown.html',
      name: 'Category Breakdown Chart',
      description: 'Expense breakdown by category widget',
      html: readWidgetHtml('category-breakdown', webDir),
    },
    {
      uri: 'ui://widget/expense-table.html',
      name: 'Expense Table',
      description: 'Transaction list widget with edit/delete capabilities',
      html: readWidgetHtml('expense-table', webDir),
    },
  ];

  logger.info({ count: widgets.length }, 'Loaded widget HTML files');

  const uris: WidgetUris = {
    budget: 'ui://widget/budget-status-card.html',
    categoryBreakdown: 'ui://widget/category-breakdown.html',
    expenseTable: 'ui://widget/expense-table.html',
  };

  return { widgets, uris };
}
