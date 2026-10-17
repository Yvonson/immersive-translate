const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({ testDir: './tests/browser', timeout: 30000, workers: 1, fullyParallel: false, reporter: 'list', outputDir: '.local/browser-results' });
