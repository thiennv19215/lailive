import path from 'node:path';

import { compareScreenshotFiles } from './lib/screenshot-compare.mjs';

function printUsage() {
  console.error(
    'Usage: pnpm compare:ui -- <reference.png> <rebuild.png> <output-directory> [--threshold=0.1]',
  );
}

function parseArguments(arguments_) {
  const positional = [];
  let threshold = 0.1;

  for (const argument of arguments_) {
    if (argument === '--') {
      continue;
    }

    if (argument.startsWith('--threshold=')) {
      threshold = Number(argument.slice('--threshold='.length));
    } else {
      positional.push(argument);
    }
  }

  if (positional.length !== 3) {
    printUsage();
    process.exitCode = 1;
    return undefined;
  }

  return {
    referencePath: path.resolve(positional[0]),
    rebuildPath: path.resolve(positional[1]),
    outputDirectory: path.resolve(positional[2]),
    threshold,
  };
}

const options = parseArguments(process.argv.slice(2));

if (options) {
  try {
    const { report, outputPaths } = await compareScreenshotFiles(options);
    console.log(
      `Compared ${report.width}x${report.height}: ${report.mismatchedPixels}/${report.totalPixels} ` +
        `pixels differ (${report.mismatchPercentage.toFixed(4)}%).`,
    );
    console.log(`Report: ${outputPaths.report}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
