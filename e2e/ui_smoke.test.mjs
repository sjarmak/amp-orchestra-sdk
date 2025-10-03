#!/usr/bin/env node

// Basic Tauri UI smoke test
import { Builder, By, until } from 'selenium-webdriver';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'artifacts';
const TAURI_DRIVER_URL = process.env.TAURI_DRIVER_URL || 'http://127.0.0.1:4444';

async function runSmokeTest() {
  console.log('🚀 Starting Tauri UI smoke test...');
  
  const driver = await new Builder()
    .forBrowser('firefox')
    .usingServer(TAURI_DRIVER_URL)
    .build();

  try {
    console.log('📱 Connected to Tauri app');
    
    // Wait for app to load
    await driver.wait(until.elementLocated(By.tagName('body')), 10000);
    console.log('✅ App loaded successfully');
    
    // Take screenshot
    const screenshot = await driver.takeScreenshot();
    writeFileSync(join(ARTIFACTS_DIR, 'app-loaded.png'), screenshot, 'base64');
    console.log('📸 Screenshot saved: app-loaded.png');
    
    // Get page title
    const title = await driver.getTitle();
    console.log(`📄 Page title: ${title}`);
    
    // Check if main content is present
    const body = await driver.findElement(By.tagName('body'));
    const bodyText = await body.getText();
    console.log(`📝 Body text length: ${bodyText.length} characters`);
    
    if (bodyText.length > 0) {
      console.log('✅ App has content');
    } else {
      console.log('⚠️  App appears to be empty');
    }
    
    // Save test results
    const results = {
      timestamp: new Date().toISOString(),
      title,
      bodyTextLength: bodyText.length,
      screenshots: ['app-loaded.png']
    };
    
    writeFileSync(join(ARTIFACTS_DIR, 'test-results.json'), JSON.stringify(results, null, 2));
    console.log('💾 Test results saved');
    
    console.log('🎉 Smoke test completed successfully');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    // Take error screenshot
    try {
      const errorScreenshot = await driver.takeScreenshot();
      writeFileSync(join(ARTIFACTS_DIR, 'error-screenshot.png'), errorScreenshot, 'base64');
      console.log('📸 Error screenshot saved');
    } catch (screenshotError) {
      console.error('Failed to take error screenshot:', screenshotError);
    }
    
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

runSmokeTest().catch(console.error);
