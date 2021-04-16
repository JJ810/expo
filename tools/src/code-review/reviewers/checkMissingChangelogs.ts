import fs from 'fs-extra';
import path from 'path';

import { EXPO_DIR } from '../../Constants';
import { getListOfPackagesAsync, Package } from '../../Packages';
import { filterAsync } from '../../Utils';
import { ReviewInput, ReviewOutput, ReviewStatus } from '../types';

export default async function ({ diff }: ReviewInput): Promise<ReviewOutput> {
  const allPackages = await getListOfPackagesAsync();
  const modifiedPackages = allPackages.filter((pkg) => {
    return diff.some((fileDiff) => !path.relative(pkg.path, fileDiff.path).startsWith('../'));
  });

  const pkgsWithoutChangelogChanges = await filterAsync(modifiedPackages, async (pkg) => {
    const pkgHasChangelog = await fs.pathExists(pkg.changelogPath);
    return pkgHasChangelog && diff.every((fileDiff) => fileDiff.path !== pkg.changelogPath);
  });

  return {
    status: ReviewStatus.WARN,
    title: 'Missing changelog entries',
    body: `If you made some API or behavioural changes, please add appropriate entry to the following changelogs:
${pkgsWithoutChangelogChanges.map((pkg) => `- ${relativeChangelogPath(pkg)}`).join('\n')}`,
  };
}

function relativeChangelogPath(pkg: Package): string {
  const relativePath = path.relative(EXPO_DIR, pkg.changelogPath);
  return `[${relativePath}](https://github.com/expo/expo/blob/@tsapeta/test-ci-code-reviewer/${relativePath})`;
}
