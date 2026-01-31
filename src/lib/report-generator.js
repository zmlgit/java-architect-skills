/**
 * Enhanced Report Generator
 * Supports Markdown, JSON, and HTML output formats
 */

import fs from "fs";
import path from "path";

/**
 * Generate report in specified format
 */
export function generateReport(data, options = {}) {
  const {
    format = "markdown",
    includeSnippets = true,
    severityFilter = "all"
  } = options;

  // Filter by severity if needed
  let filteredData = data;
  if (severityFilter !== "all") {
    filteredData = filterBySeverity(data, severityFilter);
  }

  switch (format) {
    case "json":
      return generateJSON(filteredData);
    case "html":
      return generateHTML(filteredData, { includeSnippets });
    case "markdown":
    default:
      return generateMarkdown(filteredData);
  }
}

/**
 * Filter data by severity
 */
function filterBySeverity(data, severity) {
  if (Array.isArray(data)) {
    return data.filter(item => item.severity === severity);
  }
  if (data.opportunities && Array.isArray(data.opportunities)) {
    return {
      ...data,
      opportunities: data.opportunities.filter(item => item.severity === severity)
    };
  }
  return data;
}

/**
 * Generate JSON report
 */
function generateJSON(data) {
  return JSON.stringify(data, null, 2);
}

/**
 * Generate Markdown report
 */
function generateMarkdown(data) {
  const lines = [];

  // Header
  lines.push(`# ${data.title || "Analysis Report"}\n`);
  lines.push(`**Target**: ${data.targetPath || "N/A"}`);
  lines.push(`**Generated**: ${new Date().toISOString()}\n`);

  // Summary
  if (data.summary) {
    lines.push("## Summary\n");
    for (const [key, value] of Object.entries(data.summary)) {
      lines.push(`- **${key}**: ${value}`);
    }
    lines.push("");
  }

  // Issues/Opportunities
  const items = data.opportunities || data.issues || [];
  if (items.length > 0) {
    const grouped = groupBySeverity(items);

    for (const [severity, items] of Object.entries(grouped)) {
      if (items.length > 0) {
        const emoji = getSeverityEmoji(severity);
        lines.push(`## ${emoji} ${severity.toUpperCase()} Priority (${items.length})\n`);
        for (const item of items) {
          lines.push(`### ${item.type || item.code || "Issue"}\n`);
          lines.push(`**Location**: ${item.location}${item.line ? `:${item.line}` : ""}\n`);
          lines.push(`**Issue**: ${item.description || item.message}\n`);
          if (item.suggestion) {
            lines.push(`**Suggestion**: ${item.suggestion}\n`);
          }
          if (item.snippet) {
            lines.push(`\n\`\`\`java\n${item.snippet}\n\`\`\`\n`);
          }
        }
      }
    }
  }

  // SOLID Scores
  if (data.solidScores) {
    lines.push("## SOLID Principles\n");
    for (const [principle, score] of Object.entries(data.solidScores)) {
      const bar = "█".repeat(Math.round(parseFloat(score)));
      lines.push(`**${principle}**: ${score}/5 ${bar}\n`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate HTML report
 */
function generateHTML(data, options = {}) {
  const { includeSnippets = true } = options;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.title || "Java Architect Report"}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f5f7fa;
      color: #2c3e50;
      line-height: 1.6;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 30px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .header h1 { font-size: 28px; margin-bottom: 10px; }
    .header .meta { opacity: 0.9; font-size: 14px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .summary-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      text-align: center;
    }
    .summary-card .value {
      font-size: 32px;
      font-weight: bold;
      color: #667eea;
    }
    .summary-card .label {
      color: #7f8c8d;
      font-size: 14px;
      margin-top: 5px;
    }
    .section {
      background: white;
      border-radius: 8px;
      padding: 25px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .section h2 {
      color: #2c3e50;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #ecf0f1;
    }
    .issue {
      border-left: 4px solid #ddd;
      padding: 15px;
      margin-bottom: 15px;
      border-radius: 4px;
      background: #f8f9fa;
    }
    .issue.high { border-left-color: #e74c3c; background: #fee; }
    .issue.medium { border-left-color: #f39c12; background: #fef5e7; }
    .issue.low { border-left-color: #27ae60; background: #e8f8f5; }
    .issue h3 {
      font-size: 16px;
      margin-bottom: 8px;
      color: #2c3e50;
    }
    .issue .location {
      font-size: 13px;
      color: #7f8c8d;
      margin-bottom: 8px;
    }
    .issue .description {
      margin-bottom: 10px;
    }
    .issue .suggestion {
      background: white;
      padding: 10px;
      border-radius: 4px;
      font-size: 14px;
      border-left: 3px solid #3498db;
    }
    .snippet {
      background: #2c3e50;
      color: #ecf0f1;
      padding: 15px;
      border-radius: 4px;
      overflow-x: auto;
      margin-top: 10px;
      font-family: "Monaco", "Menlo", monospace;
      font-size: 13px;
    }
    .solid-scores {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 15px;
    }
    .score-card {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 6px;
    }
    .score-card .name {
      font-weight: 600;
      margin-bottom: 8px;
    }
    .score-card .bar-container {
      background: #ecf0f1;
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
    }
    .score-card .bar {
      height: 100%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      transition: width 0.3s;
    }
    .score-card .score {
      margin-top: 5px;
      font-size: 12px;
      color: #7f8c8d;
    }
    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      margin-left: 8px;
    }
    .badge.high { background: #e74c3c; color: white; }
    .badge.medium { background: #f39c12; color: white; }
    .badge.low { background: #27ae60; color: white; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${data.title || "Java Architect Analysis Report"}</h1>
      <div class="meta">
        <div>Target: <strong>${escapeHtml(data.targetPath || "N/A")}</strong></div>
        <div>Generated: <strong>${new Date().toLocaleString()}</strong></div>
      </div>
    </div>

    ${generateSummaryHTML(data)}

    ${generateIssuesHTML(data, { includeSnippets })}

    ${generateSolidScoresHTML(data)}
  </div>
</body>
</html>
  `.trim();

  return html;
}

/**
 * Generate summary section HTML
 */
function generateSummaryHTML(data) {
  if (!data.summary) return "";

  const cards = Object.entries(data.summary).map(([key, value]) => `
    <div class="summary-card">
      <div class="value">${value}</div>
      <div class="label">${formatLabel(key)}</div>
    </div>
  `).join("");

  return `
    <div class="summary">
      ${cards}
    </div>
  `;
}

/**
 * Generate issues section HTML
 */
function generateIssuesHTML(data, options = {}) {
  const items = data.opportunities || data.issues || [];
  if (items.length === 0) return "";

  const grouped = groupBySeverity(items);
  const sections = [];

  for (const [severity, items] of Object.entries(grouped)) {
    if (items.length === 0) continue;

    const issueCards = items.map(item => `
      <div class="issue ${severity}">
        <h3>${escapeHtml(item.type || item.code || "Issue")} <span class="badge ${severity}">${severity}</span></h3>
        <div class="location">📍 ${escapeHtml(item.location)}${item.line ? `:${item.line}` : ""}</div>
        <div class="description">${escapeHtml(item.description || item.message)}</div>
        ${item.suggestion ? `<div class="suggestion">💡 ${escapeHtml(item.suggestion)}</div>` : ""}
        ${options.includeSnippets && item.snippet ? `<div class="snippet">${escapeHtml(item.snippet)}</div>` : ""}
      </div>
    `).join("");

    sections.push(`
      <div class="section">
        <h2>${getSeverityEmoji(severity)} ${severity.toUpperCase()} Priority (${items.length})</h2>
        ${issueCards}
      </div>
    `);
  }

  return sections.join("");
}

/**
 * Generate SOLID scores section HTML
 */
function generateSolidScoresHTML(data) {
  if (!data.solidScores) return "";

  const scoreCards = Object.entries(data.solidScores).map(([principle, score]) => `
    <div class="score-card">
      <div class="name">${principle}</div>
      <div class="bar-container">
        <div class="bar" style="width: ${parseFloat(score) * 20}%"></div>
      </div>
      <div class="score">${score}/5</div>
    </div>
  `).join("");

  return `
    <div class="section">
      <h2>SOLID Principles Assessment</h2>
      <div class="solid-scores">
        ${scoreCards}
      </div>
    </div>
  `;
}

/**
 * Helper functions
 */
function groupBySeverity(items) {
  return items.reduce((acc, item) => {
    const severity = item.severity || "medium";
    if (!acc[severity]) acc[severity] = [];
    acc[severity].push(item);
    return acc;
  }, { high: [], medium: [], low: [] });
}

function getSeverityEmoji(severity) {
  const emojis = { high: "🔴", medium: "🟡", low: "🟢" };
  return emojis[severity] || "⚪️";
}

function formatLabel(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase());
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Save report to file
 */
export function saveReport(content, filename, format = "markdown") {
  const extension = format === "html" ? "html" : format === "json" ? "json" : "md";
  const filepath = filename.endsWith(`.${extension}`)
    ? filename
    : `${filename}.${extension}`;

  fs.writeFileSync(filepath, content);
  return filepath;
}

/**
 * Generate report filename with timestamp
 */
export function generateReportName(type, format = "markdown") {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const extension = format === "html" ? "html" : format === "json" ? "json" : "md";
  return `java-architect-${type}-${timestamp}.${extension}`;
}
