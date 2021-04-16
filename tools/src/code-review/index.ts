import { PullsCreateReviewResponseData, PullsListReviewsResponseData } from '@octokit/types';
import chalk from 'chalk';

import Git from '../Git';
import {
  createPullRequestReviewAsync,
  getPullRequestAsync,
  listPullRequestReviewsAsync,
  updatePullRequestReviewAsync,
  PullRequestEvent,
  getAuthenticatedUserAsync,
  listPullRequestReviewCommentsAsync,
  deletePullRequestReviewCommentAsync,
} from '../GitHubActions';
import logger from '../Logger';
import checkMissingChangelogs from './reviewers/checkMissingChangelogs';
import { ReviewComment, ReviewInput, ReviewOutput, ReviewStatus } from './types';

/**
 * An array with functions whose purpose is to check and review the diff.
 */
const REVIEWERS = [checkMissingChangelogs];

/**
 * Goes through the changes included in given pull request and checks if they meet basic requirements.
 */
export async function reviewPullRequestAsync(prNumber: number) {
  const pr = await getPullRequestAsync(prNumber);
  const user = await getAuthenticatedUserAsync();

  logger.info('👾 Fetching base commit:', chalk.yellow.bold(pr.base.sha));
  await Git.fetchAsync({
    remote: 'origin',
    ref: pr.base.sha,
  });

  logger.info('👾 Fetching head commit:', chalk.yellow.bold(pr.head.sha));
  await Git.fetchAsync({
    remote: 'origin',
    ref: pr.head.sha,
  });

  // Find the common ancestor of the base and PR's head.
  const mergeBaseSha = await Git.mergeBaseAsync(pr.base.sha, pr.head.sha);
  logger.info('👀 Found common ancestor:', chalk.yellow.bold(mergeBaseSha));

  // Gets the diff of the pull request.
  const diff = await Git.getDiffAsync(mergeBaseSha, pr.head.sha);

  const input: ReviewInput = {
    pullRequest: pr,
    mergeBaseSha,
    diff,
  };

  // Run all the checks asynchronously and collects their outputs.
  logger.info('🕵️‍♀️  Reviewing changes');
  const outputs = (await Promise.all(REVIEWERS.map((reviewer) => reviewer(input)))).filter(Boolean);

  // No outputs means that everything passed, so return early.
  if (outputs.length === 0) {
    logger.success('🥳 There is nothing to nitpick!');
    return;
  }

  // Get a list of my past reviews. We'll invalidate them once the new one is submitted.
  const pastReviews = (await listPullRequestReviewsAsync(pr.number)).filter(
    (review) => review.user.login === user.login
  );

  // Generate review body and decide whether the review needs to request for changes or not.
  const body = generateReviewBodyFromOutputs(outputs, pr.head.sha);
  const event = getReviewEventFromOutputs(outputs);
  const comments = getReviewCommentsFromOutputs(outputs);

  console.dir({ body, event, comments }, { depth: null });
  return;

  // Create a new pull request review.
  const review = await createPullRequestReviewAsync(pr.number, {
    body,
    event,
    comments,
  });
  logger.info('📝 Created new pull request review with ID:', chalk.magenta('' + review.id));

  await invalidatePastReviewsAsync(pr.number, pastReviews, review);

  logger.success('🥳 Successfully submitted the review:', chalk.blue(review.html_url));
}

/**
 * Marks past reviews as outdated by changing its body and linking to the latest one.
 * Probably no need to keep the old body for history as GitHub shows previous revisions of edited comments.
 */
async function invalidatePastReviewsAsync(
  prNumber: number,
  pastReviews: PullsListReviewsResponseData,
  newReview: PullsCreateReviewResponseData
): Promise<void> {
  for (const pastReview of pastReviews) {
    logger.info('💥 Invalidating past review with ID:', chalk.magenta('' + pastReview.id));
    await updatePullRequestReviewAsync(
      prNumber,
      pastReview.id,
      `*The review previously left here is no longer valid, jump to the latest one 👉 ${newReview.html_url}*`
    );
  }

  // In order not to exceed rate limits, it should be enough to remove comments only from the last review.
  const lastReview = pastReviews[pastReviews.length - 1];
  if (lastReview) {
    const comments = await listPullRequestReviewCommentsAsync(prNumber, lastReview.id);
    for (const comment of comments) {
      await deletePullRequestReviewCommentAsync(comment.id);
    }
  }
}

/**
 * If any of the check failed, we want the review to request for changes.
 * Otherwise, it's just a comment (and so fixes are not obligatory).
 * There is no case where we approve the PR — we still want someone else to review these changes :)
 */
function getReviewEventFromOutputs(outputs: ReviewOutput[]): PullRequestEvent {
  return outputs.some((output) => output.status >= ReviewStatus.ERROR)
    ? 'REQUEST_CHANGES'
    : 'COMMENT';
}

/**
 * Concats comments from all review outputs.
 */
function getReviewCommentsFromOutputs(outputs: ReviewOutput[]) {
  return ([] as ReviewComment[]).concat(...outputs.map((output) => output.comments ?? []));
}

/**
 * Generates the review comment based on given outputs and the commit the checks were run against.
 */
function generateReviewBodyFromOutputs(outputs: ReviewOutput[], commitSha: string): string {
  const sections = outputs
    .filter((output) => output.title && output.body)
    .map(
      (output) => `<details>
  <summary><strong>${prefixForStatus(output.status)}</strong>: ${output.title}</summary>

\\
${output.body}
</details>`
    );

  return `Hi there! 👋 I've found some issues in your pull request that should be addressed 👇

${sections.join('\n')}

*Generated by ExpoBot 🤖 against ${commitSha}*
`;
}

/**
 * Returns title prefix depending on the status.
 */
function prefixForStatus(status: ReviewStatus): string {
  switch (status) {
    case ReviewStatus.SUCCESS:
      return '✅ Success';
    case ReviewStatus.WARN:
      return '⚠️ Warning';
    case ReviewStatus.ERROR:
      return '❌ Error';
  }
}
