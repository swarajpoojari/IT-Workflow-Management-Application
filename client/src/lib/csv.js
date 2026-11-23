/**
 * Builds a CSV string and triggers a browser download for it — the
 * "downloadable" behind every Export button in the app. No server endpoint:
 * the data is already in the browser (fetched for the table on screen), so
 * this just formats and saves what the user is already looking at.
 */
function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // Quote whenever the cell could otherwise be misread: a comma, a quote
  // (doubled per the CSV spec), or a newline inside the value.
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(',');
  const body = rows
    .map((row) => columns.map((c) => escapeCsvCell(c.value(row))).join(','))
    .join('\r\n');
  // A UTF-8 BOM so Excel (still the most common opener) renders accented
  // names and symbols correctly instead of guessing the wrong encoding.
  return `﻿${header}\r\n${body}`;
}

export function downloadCsv(filename, rows, columns) {
  const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
