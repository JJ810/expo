import { Command } from '@expo/commander';
import parseDiff from 'parse-diff';
import path from 'path';

import { EXPO_DIR } from '../Constants';
import Git from '../Git';
import { getPullRequestAsync } from '../GitHubActions';
import { getListOfPackagesAsync } from '../Packages';

async function action(options: object) {
  const pr = await getPullRequestAsync(options.pr);

  console.log(`Fetching base commit: ${pr.base.sha}`);
  await Git.fetchAsync({
    remote: 'origin',
    ref: pr.base.sha,
  });

  console.log(`Fetching head commit: ${pr.head.sha}`);
  await Git.fetchAsync({
    remote: 'origin',
    ref: pr.head.sha,
  });

  const diff = parseDiff(
    (await Git.runAsync(['diff', `${pr.base.sha}..${pr.head.sha}`])).output.join('')
  );
  console.log(diff);

  // const changedFiles = await Git.logFilesAsync({ fromCommit: pr.base.sha, toCommit: pr.head.sha });
  // console.log(changedFiles);

  // // const diff = await Git.runAsync(['diff', `${pr.base.sha}..${pr.head.sha}`]);
  // // console.log(diff.output);

  const allPackages = await getListOfPackagesAsync();
  const modifiedPackages = allPackages.filter((pkg) => {
    const pkgPath = pkg.path.replace(/([^/])$/, '$1/');
    return diff.some(({ to: relativePath }) =>
      path.join(EXPO_DIR, relativePath).startsWith(pkgPath)
    );
  });

  console.log(modifiedPackages);
}

export default (program: Command) => {
  program
    .command('code-reviewer')
    .alias('code-review', 'review')
    .description('Reviews the pull request.')
    .option('-p, --pr <string>', 'ID of the pull request to review.')
    .asyncAction(action);
};
