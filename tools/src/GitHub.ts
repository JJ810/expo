import { request as octokitRequest } from '@octokit/request';
import {
  Endpoints,
  IssuesListCommentsResponseData,
  OctokitResponse,
  PullsCreateReviewResponseData,
  PullsListCommentsForReviewResponseData,
  PullsListReviewsResponseData,
  PullsSubmitReviewResponseData,
  PullsUpdateReviewResponseData,
  RequestParameters,
  Route,
  UsersGetAuthenticatedResponseData,
} from '@octokit/types';

export type PullRequestEvent = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES';

const expoRequest = octokitRequest.defaults({
  owner: 'expo',
  repo: 'expo',
  headers: {
    authorization: `token ${process.env.GITHUB_TOKEN}`,
  },
});

/**
 * Octokit's request wrapper that automatically includes the token and some endpoint params.
 */
export function request<R extends Route>(
  route: keyof Endpoints | R,
  options?: R extends keyof Endpoints
    ? Omit<Endpoints[R]['parameters'] & RequestParameters, 'owner' | 'repo'>
    : RequestParameters
): R extends keyof Endpoints ? Promise<Endpoints[R]['response']> : Promise<OctokitResponse<any>> {
  return expoRequest(route, options);
}

export async function listPullRequestReviewsAsync(
  pullRequestId: number
): Promise<PullsListReviewsResponseData> {
  const response = await request('GET /repos/:owner/:repo/pulls/:pull_number/reviews', {
    pull_number: pullRequestId,
  });
  return response.data;
}

export async function createPullRequestReviewAsync<T>(
  pullRequestId: number,
  otherParams?: T
): Promise<PullsCreateReviewResponseData> {
  const response = await request('POST /repos/:owner/:repo/pulls/:pull_number/reviews', {
    pull_number: pullRequestId,
    ...otherParams,
  });
  return response.data;
}

export async function updatePullRequestReviewAsync(
  pullRequestId: number,
  reviewId: number,
  body: string
): Promise<PullsUpdateReviewResponseData> {
  const response = await request('PUT /repos/:owner/:repo/pulls/:pull_number/reviews/:review_id', {
    pull_number: pullRequestId,
    review_id: reviewId,
    body,
  });
  return response.data;
}

export async function deletePendingPullRequestReviewAsync(
  pullRequestId: number,
  reviewId: number
): Promise<void> {
  await request(
    'DELETE /repos/:owner/:repo/pulls/:pull_number/reviews/:review_id',
    makeExpoOptions({
      pull_number: pullRequestId,
      review_id: reviewId,
    })
  );
}

export async function submitPullRequestReviewAsync(
  pullRequestId: number,
  reviewId: number,
  body: string,
  event: PullRequestEvent = 'COMMENT'
): Promise<PullsSubmitReviewResponseData> {
  const response = await request(
    'POST /repos/:owner/:repo/pulls/:pull_number/reviews/:review_id/events',
    makeExpoOptions({
      pull_number: pullRequestId,
      review_id: reviewId,
      body,
      event,
    })
  );
  return response.data;
}

export async function dismissPullRequestReviewAsync(pullRequestId: number, reviewId: number) {
  await request(
    'PUT /repos/:owner/:repo/pulls/:pull_number/reviews/:review_id/dismissals',
    makeExpoOptions({
      pull_number: pullRequestId,
      review_id: reviewId,
      message: 'Dismissing my own review',
    })
  );
}

export async function listPullRequestReviewCommentsAsync(
  pullRequestId: number,
  reviewId: number
): Promise<PullsListCommentsForReviewResponseData> {
  const response = await request(
    'GET /repos/:owner/:repo/pulls/:pull_number/reviews/:review_id/comments',
    makeExpoOptions({
      pull_number: pullRequestId,
      review_id: reviewId,
    })
  );
  return response.data;
}

export async function deletePullRequestReviewCommentAsync(commentId: number): Promise<void> {
  await request(
    'DELETE /repos/:owner/:repo/pulls/comments/:comment_id',
    makeExpoOptions({ comment_id: commentId })
  );
}

export async function listPullRequestCommentsAsync(
  pullRequestId: number
): Promise<IssuesListCommentsResponseData> {
  const response = await request('GET /repos/:owner/:repo/issues/:issue_number/comments', {
    issue_number: pullRequestId,
  });
  return response.data;
}

/**
 * Returns public informations about the currently authenticated (by GitHub API token) user.
 */
export async function getAuthenticatedUserAsync(): Promise<UsersGetAuthenticatedResponseData> {
  const response = await request('GET /user');
  return response.data;
}

/**
 * Copies given object with params specific for `expo/expo` repository and with authorization token.
 */
function makeExpoOptions<ReturnType>(options: ReturnType & { headers?: object }): ReturnType {
  const { headers, ...otherOptions } = options;
  return {
    headers: {
      authorization: `token ${process.env.GITHUB_TOKEN}`,
      ...headers,
    },
    owner: 'expo',
    repo: 'expo',
    ...otherOptions,
  };
}
