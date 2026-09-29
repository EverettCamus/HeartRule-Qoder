import { chromium } from 'playwright';
import { setTimeout } from 'timers/promises';

const SCRIPT_EDITOR_URL = 'http://localhost:8081';
const API_URL = 'http://localhost:3000';
const SESSION_ID = '55a5274f-725f-44a1-9cc5-25264c2e13ed';

async function main() {
  console.log('Starting Playwright debug test...\n');

  // Check server-side state first
  console.log('=== Server-side State ===');
  const sessionInfo = await fetch(
    `${API_URL}/api/sessions?projectId=4af2a65e-5e2a-40a1-92cd-fc824ceb8b62`
  ).then(r => r.json());
  const session = sessionInfo.data?.[0];
  console.log('Session:', JSON.stringify(session, null, 2));

  // Get debug entries to understand timeline state
  const debugEntries = await fetch(
    `${API_URL}/api/sessions/${SESSION_ID}/debug-entries`
  ).then(r => r.json());
  console.log('Debug entries count:', debugEntries.data?.length);
  if (debugEntries.data) {
    const runs = [...new Set(debugEntries.data.map(e => e.runId))];
    console.log('Available runIds:', runs);
    debugEntries.data.slice(0, 5).forEach(e => {
      console.log(`  runId=${e.runId?.substring(0,8)}... actionId=${e.actionId} round=${e.round}`);
    });
  }

  const browser = await chromium.launch({
    headless: false,
    executablePath: '/home/leo/.cache/ms-playwright/chromium-1224/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // Collect ALL console logs for analysis
  const allLogs = [];
  page.on('console', msg => {
    allLogs.push({ type: msg.type(), text: msg.text() });
    console.log(`  [BROWSER ${msg.type()}]`, msg.text().substring(0, 200));
  });

  try {
    // Navigate to script editor
    console.log('\n=== Navigating to script editor ===');
    await page.goto(SCRIPT_EDITOR_URL, { waitUntil: 'networkidle' });
    await setTimeout(3000);

    console.log('Page title:', await page.title());
    await page.screenshot({ path: '/tmp/debug-01-initial.png' });

    // Get full page snapshot for accessibility tree
    console.log('\n=== Page snapshot (accessibility) ===');
    const snapshot = await page.accessibility.snapshot();
    console.log('Root role:', snapshot?.role, 'children:', snapshot?.children?.length);

    // Find all text content
    const allText = await page.$$eval('*', els =>
      els.filter(e => e.children.length === 0 && e.textContent?.trim())
        .map(e => e.textContent.trim())
        .filter(t => t.length > 2 && t.length < 60)
    );
    console.log('Visible text snippets:', allText.slice(0, 40));

    // Look for Ant Design Select components specifically
    console.log('\n=== Looking for timeline/version selectors ===');

    // Check for elements containing "V0" or "V1"
    const versionElements = await page.$$eval('*', els =>
      els.filter(e => {
        const t = e.textContent || '';
        return /V\d|快照|snapshot|timeline|回退|rollback/i.test(t);
      }).map(e => ({
        tag: e.tagName,
        class: e.className?.substring(0, 80),
        text: (e.textContent || '').substring(0, 120),
        visible: e.offsetParent !== null,
      }))
    );
    console.log('Version/timeline elements:', JSON.stringify(versionElements, null, 2));

    // Look for clickable items
    const clickables = await page.$$eval('button, a, [role="button"], [role="option"], .ant-select-item', els =>
      els.slice(0, 30).map(e => ({
        tag: e.tagName,
        class: e.className?.substring(0, 60),
        text: (e.textContent || '').substring(0, 60),
        rect: e.getBoundingClientRect(),
      })).filter(e => e.rect.width > 0 && e.rect.height > 0)
    );
    console.log('Clickable elements:', JSON.stringify(clickables, null, 2));

    // Check for the navigation tree (left panel)
    console.log('\n=== Navigation tree ===');
    const treeNodes = await page.$$eval('.ant-tree-node-content-wrapper, [class*="tree"]', els =>
      els.slice(0, 20).map(e => ({
        text: e.textContent?.substring(0, 80),
        class: e.className?.substring(0, 60),
      }))
    );
    console.log('Tree nodes:', JSON.stringify(treeNodes, null, 2));

    // Try clicking on the session to open debug panel
    console.log('\n=== Attempting to interact ===');

    // Look for the session name or a way to open debug panel
    // Try to find elements that might open the debug panel
    const debugPanelTrigger = await page.$('[class*="debug"], [class*="Debug"]');
    console.log('Debug panel trigger found:', !!debugPanelTrigger);

    // Check for tabs
    const tabs = await page.$$eval('.ant-tabs-tab', els =>
      els.map(e => ({ text: e.textContent, visible: e.offsetParent !== null }))
    );
    console.log('Tabs:', JSON.stringify(tabs));

    // Take a full screenshot for visual analysis
    await page.screenshot({ path: '/tmp/debug-02-full.png', fullPage: true });

    // Now let's try to extract diagnostic logs
    console.log('\n=== Diagnostic logs from browser ===');
    const diagnosticLogs = allLogs.filter(l =>
      l.text.includes('[DIAGNOSTIC]') ||
      l.text.includes('[DebugChat]') ||
      l.text.includes('Snapshot') ||
      l.text.includes('runId') ||
      l.text.includes('viewingSnapshotId') ||
      l.text.includes('restoreToActionId')
    );
    console.log(`Found ${diagnosticLogs.length} relevant diagnostic logs out of ${allLogs.length} total`);
    diagnosticLogs.forEach(l => console.log('  ', l.text.substring(0, 300)));

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    await page.screenshot({ path: '/tmp/debug-error.png', fullPage: true });
  } finally {
    await setTimeout(3000);
    await browser.close();
    console.log('\nDone.');
  }
}

main().catch(console.error);
