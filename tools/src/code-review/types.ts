import { PullsGetResponseData } from '@octokit/types';

import { GitFileDiff } from '../Git';

export enum ReviewStatus {
  SUCCESS = 1,
  WARN = 2,
  ERROR = 3,
}

export type ReviewComment = {
  path: string;
  position: number;
  body: string;
};

export type ReviewOutput = {
  status: ReviewStatus;
  title?: string;
  body?: string;
  comments?: ReviewComment[];
};

export type ReviewInput = {
  pullRequest: PullsGetResponseData;
  mergeBaseSha: string;
  diff: GitFileDiff[];
};
