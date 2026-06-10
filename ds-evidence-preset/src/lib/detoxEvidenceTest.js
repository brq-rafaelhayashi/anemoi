/* global by, device, element, waitFor */

const fs = require('fs');
const path = require('path');

const {hostRequire} = require('./hostRequire');

const sharp = hostRequire('sharp');

function loadRegistry() {
  const registryPath =
    process.env.DS_EVIDENCE_REGISTRY_PATH ||
    path.resolve(process.cwd(), 'detox/ds-evidence/registry.json');

  return require(path.resolve(registryPath));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, {recursive: true});
}

function normalizeFlow(item, index) {
  const flowId = item.flowId || item.scenarioId;
  return {
    ...item,
    flowId,
    scenarioId: flowId,
    targetTestID: item.targetTestID || `ds-evidence-flow-${flowId || index}`,
  };
}

function flowList(registry, component, flowFilter) {
  if (!component) {
    throw new Error('DS_EVIDENCE_COMPONENT is required.');
  }

  const entry = registry[component];
  if (!entry) {
    throw new Error(`No DS evidence registry entry for ${component}.`);
  }

  const allFlows = (entry.flows || entry.harness || []).map(normalizeFlow);
  if (!flowFilter) {
    return allFlows;
  }

  const allowed = new Set(
    flowFilter
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
  );

  return allFlows.filter(item => allowed.has(item.flowId));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getAttribute(node, name) {
  const match = node.match(new RegExp(`(?:^|\\s)${name}="([^"]+)"`));
  return match ? match[1] : undefined;
}

function findFrame(xml, testID) {
  const node = xml.split('\n').find(line => line.includes(`id="${testID}"`));

  if (!node) {
    return undefined;
  }

  return {
    height: Number(getAttribute(node, 'height')),
    width: Number(getAttribute(node, 'width')),
    x: Number(getAttribute(node, 'x')),
    y: Number(getAttribute(node, 'y')),
  };
}

async function cropScreenshot(fullImagePath, outputPath, xml, targetTestID) {
  const screenFrame = findFrame(xml, 'ds-evidence-screen');
  const targetFrame = findFrame(xml, targetTestID);
  const frames = [
    {id: 'ds-evidence-screen', frame: screenFrame},
    {id: targetTestID, frame: targetFrame},
  ];

  const invalid = frames.filter(
    ({frame}) =>
      !frame ||
      !Number.isFinite(frame.height) ||
      !Number.isFinite(frame.width) ||
      !Number.isFinite(frame.x) ||
      !Number.isFinite(frame.y),
  );

  if (invalid.length > 0) {
    fs.copyFileSync(fullImagePath, outputPath);
    return {
      cropped: false,
      reason: `frame not found in view hierarchy: ${invalid
        .map(({id}) => id)
        .join(', ')}`,
    };
  }

  const metadata = await sharp(fullImagePath).metadata();
  const scaleX = metadata.width / screenFrame.width;
  const scaleY = metadata.height / screenFrame.height;
  const padding = 8;

  const left = Math.max(0, Math.round((targetFrame.x - padding) * scaleX));
  const top = Math.max(0, Math.round((targetFrame.y - padding) * scaleY));
  const right = Math.min(
    metadata.width,
    Math.round((targetFrame.x + targetFrame.width + padding) * scaleX),
  );
  const bottom = Math.min(
    metadata.height,
    Math.round((targetFrame.y + targetFrame.height + padding) * scaleY),
  );

  await sharp(fullImagePath)
    .extract({
      left,
      top,
      width: right - left,
      height: bottom - top,
    })
    .toFile(outputPath);

  return {cropped: true, reason: null};
}

function registerDetoxEvidenceTests() {
  const registry = loadRegistry();
  const component = process.env.DS_EVIDENCE_COMPONENT;
  const flowFilter =
    process.env.DS_EVIDENCE_FLOWS || process.env.DS_EVIDENCE_SCENARIOS;
  const outputDir = process.env.DS_EVIDENCE_OUTPUT_DIR;
  const phase = process.env.DS_EVIDENCE_PHASE || 'unknown';
  const platformName = process.env.DS_EVIDENCE_PLATFORM || device.getPlatform();

  describe('DS Evidence', () => {
    beforeAll(async () => {
      if (!outputDir) {
        throw new Error('DS_EVIDENCE_OUTPUT_DIR is required.');
      }
    });

    for (const flow of flowList(registry, component, flowFilter)) {
      it(`${component} ${flow.flowId}`, async () => {
        const scenarioDir = path.join(outputDir, phase, platformName);
        const baseName = `${component}-${flow.flowId}`;
        const scheme = process.env.DS_EVIDENCE_SCHEME || 'gol://';
        const route = `${scheme.replace(
          /\/$/,
          '',
        )}/automation/ds/${component}?flows=${encodeURIComponent(flow.flowId)}`;

        ensureDir(scenarioDir);

        // On Android with singleTask activity, openURL after launch goes via
        // onNewIntent which may not reach React Navigation before it is mounted.
        // Passing the URL directly to launchApp ensures it is the initial intent
        // so React Navigation picks it up via getInitialURL instead.
        if (device.getPlatform() === 'android') {
          await device.launchApp({
            newInstance: true,
            url: route,
            permissions: {
              notifications: 'NO',
              location: 'never',
            },
          });
          await device.disableSynchronization();
          await sleep(20000);
        } else {
          await device.launchApp({
            newInstance: true,
            permissions: {
              notifications: 'NO',
              location: 'never',
            },
          });
          await device.disableSynchronization();
          await sleep(20000);
          await device.openURL({url: route});
        }

        // Overlay flows (Modal/Dialog-based, e.g. Drawer) render the component in a
        // separate window. On Android the underlying activity window — which holds
        // ds-evidence-screen, -component and -flow — is not matchable by Detox while
        // the Dialog is up. So for overlay flows wait only for the target inside the
        // overlay: it is the meaningful content and the only node reliably matchable
        // on both platforms. The target often overflows its viewport
        // (scrollable/clipped), so gate on >=1% visible rather than the 75% default.
        // Overlay flows also skip the crop (full screenshot), so the screen frame is
        // not needed here.
        if (flow.overlay) {
          await waitFor(element(by.id(flow.targetTestID)))
            .toBeVisible(1)
            .withTimeout(60000);
        } else {
          await waitFor(element(by.id('ds-evidence-screen')))
            .toBeVisible()
            .withTimeout(60000);
          await waitFor(element(by.id(flow.targetTestID)))
            .toBeVisible()
            .withTimeout(60000);

          await expect(element(by.id('ds-evidence-component'))).toHaveText(
            component,
          );
          await expect(element(by.id('ds-evidence-flow'))).toHaveText(
            flow.flowId,
          );
        }

        const imagePath = await device.takeScreenshot(`${baseName}-screen`);
        const xml = await device.generateViewHierarchyXml(true);

        const screenshotPath = path.join(scenarioDir, `${baseName}.png`);
        const fullScreenshotPath = path.join(
          scenarioDir,
          `${baseName}-screen.png`,
        );
        const hierarchyPath = path.join(scenarioDir, `${baseName}.xml`);
        const metadataPath = path.join(scenarioDir, `${baseName}.json`);

        fs.copyFileSync(imagePath, fullScreenshotPath);
        // Overlay flows render the component and its chrome (e.g. the Drawer close
        // button) inside a Modal, as siblings outside targetTestID's subtree.
        // Cropping to the target would drop that chrome, which is often the main
        // visible before/after delta. Keep the full screenshot so the overlay shows
        // in context above the backdrop.
        let crop = {cropped: false, reason: null};
        if (flow.overlay) {
          fs.copyFileSync(imagePath, screenshotPath);
          crop = {cropped: false, reason: 'overlay flow — full screenshot kept by design'};
        } else {
          crop = await cropScreenshot(
            imagePath,
            screenshotPath,
            xml,
            flow.targetTestID,
          );
          if (!crop.cropped) {
            console.warn(
              `[ds-evidence] ${baseName}: crop fallback to full screenshot (${crop.reason})`,
            );
          }
        }
        fs.writeFileSync(hierarchyPath, xml);
        writeJson(metadataPath, {
          phase,
          platform: platformName,
          component,
          flowId: flow.flowId,
          scenarioId: flow.flowId,
          route,
          targetTestID: flow.targetTestID,
          description: flow.description,
          cropped: crop.cropped,
          cropReason: crop.reason,
          screenshot: screenshotPath,
          fullScreenshot: fullScreenshotPath,
          hierarchy: hierarchyPath,
        });
      });
    }
  });
}

module.exports = {
  registerDetoxEvidenceTests,
};
