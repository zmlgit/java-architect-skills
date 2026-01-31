/**
 * HTTP downloader with multi-mirror fallback support.
 */

import fs from "fs";
import https from "https";

/**
 * Download a file from a URL with redirect following.
 * @param {string} url - URL to download from
 * @param {string} dest - Destination file path
 * @returns {Promise<boolean>} True if successful
 */
async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    https.get(url, (response) => {
      // Follow redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close(() => resolve(true));
      });
    }).on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

/**
 * Download a file from multiple mirror URLs with fallback.
 * @param {string[]} urls - Array of mirror URLs to try
 * @param {string} dest - Destination file path
 * @param {Function} onProgress - Optional callback(url) called before each attempt
 * @returns {Promise<boolean>} True if any mirror succeeded
 */
export async function downloadWithFallback(urls, dest, onProgress) {
  for (const url of urls) {
    if (onProgress) {
      onProgress(url);
    }
    try {
      await downloadFile(url, dest);
      return true;
    } catch (e) {
      // Try next mirror
      continue;
    }
  }
  return false;
}
