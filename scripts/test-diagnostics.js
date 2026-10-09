'use strict';
// Display bounded failure details; keep the complete output in the existing log.
const MAX_FAILURES = 3, MAX_LINES = 36, MAX_WIDTH = 220;
function failureSummary(output) {
  const source = output.split(/\r?\n/), result = [];
  const shorten = line => line.length > MAX_WIDTH ? line.slice(0, MAX_WIDTH - 1) + '…' : line;
  const add = line => {if (result.length < MAX_LINES) result.push(shorten(line));};
  let failures = 0;
  for (let index = 0; index < source.length && failures < MAX_FAILURES; index++) {
    const match = /^(\s*)not ok\b/.exec(source[index]);
    if (!match) continue;
    failures++;
    add('Log line ' + (index + 1) + ': ' + source[index].trim());
    const indentation = match[1].length + 2;
    // Only direct diagnostic fields; never dump expected/actual objects or diffs.
    for (let next = index + 1; next < source.length; next++) {
      const line = source[next];
      if (/^\s*(?:not )?ok\b/.test(line) || line.trim() === '...') break;
      const field = /^(\s*)(location|failureType|error|code|stack):\s*(.*)$/.exec(line);
      if (!field || field[1].length !== indentation) continue;
      const [, , name, value] = field;
      if (!/^[|>]/.test(value)) {
        add(name + ': ' + value);
        continue;
      }
      add(name + ':');
      let displayed = 0;
      for (let detail = next + 1; detail < source.length; detail++) {
        const text = source[detail];
        if (text.trim() && /^\s*/.exec(text)[0].length <= indentation) break;
        if (text.trim() && displayed++ < 4) add('  ' + text.trim());
      }
    }
  }
  if (!failures) {
    // Syntax/process/static failures may have no TAP diagnostics at all.
    const meaningful = source.filter(line => line.trim());
    const error = meaningful.findIndex(line => /\b(?:\w*Error|EACCES|ENOENT|EVIDENCE_[A-Z_]+)\b/.test(line));
    const excerpt = error >= 0 ? meaningful.slice(error, error + 12) : meaningful.slice(-12);
    for (const line of excerpt) add(line);
    if (!result.length) add('No diagnostic output; inspect the runner status and raw log.');
  }
  if (source.filter(line => /^\s*not ok\b/.test(line)).length > MAX_FAILURES) add('More failures omitted; inspect the raw log.');
  return result;
}
module.exports = {failureSummary};
