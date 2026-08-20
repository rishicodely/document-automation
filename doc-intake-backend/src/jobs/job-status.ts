export enum JobStatus {
  RECEIVED = 'received',
  PROCESSING = 'processing',
  NEEDS_REVIEW = 'needs_review',
  DONE = 'done',
  DEAD_LETTER = 'dead_letter',
}

/**
 * Legal transitions — a job only ever moves forward.
 * Nothing reaches in and sets a status directly; everything
 * goes through JobsService.transition(), which checks this map.
 *
 * Day 2 addition: received → dead_letter, for intake-time
 * validation failures (e.g. the file the caller pointed at
 * doesn't exist). We shouldn't pretend to "process" a job
 * we know we can't work on.
 */
const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JobStatus.RECEIVED]: [
    JobStatus.PROCESSING,
    JobStatus.DEAD_LETTER, // intake validation failed
  ],
  [JobStatus.PROCESSING]: [
    JobStatus.NEEDS_REVIEW, // extraction flagged something
    JobStatus.DONE, // clean pass, no review needed
    JobStatus.DEAD_LETTER, // unrecoverable failure
  ],
  [JobStatus.NEEDS_REVIEW]: [
    JobStatus.DONE, // reviewer approved / corrected
    JobStatus.DEAD_LETTER, // reviewer rejected or max attempts
  ],
  [JobStatus.DONE]: [], // terminal
  [JobStatus.DEAD_LETTER]: [], // terminal
};

export function isLegalTransition(
  from: JobStatus,
  to: JobStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
