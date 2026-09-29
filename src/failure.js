// A failure the interface can explain: which step broke, so the teacher is
// told "the recognizer could not be downloaded" rather than watching the file
// disappear. `stage` names the step, `where` is the already-worded place in
// the file (a PDF page), `detail` is for the console.

export class StageError extends Error {
  constructor(stage, detail, cause) {
    super(`${stage}: ${detail}`, { cause });
    this.name = 'StageError';
    this.stage = stage;
    this.detail = detail;
    this.where = '';
  }
}

// the step a failure belongs to, or 'other' for anything unforeseen
export function stageOf(e) {
  return (e && e.stage) || 'other';
}

// run step, and blame it by name if it throws
export async function during(stage, detail, work) {
  try {
    return await work();
  } catch (e) {
    throw e instanceof StageError ? e : new StageError(stage, detail, e);
  }
}
