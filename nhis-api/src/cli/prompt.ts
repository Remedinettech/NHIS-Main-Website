import readline from 'node:readline';

/** Prompts on stderr-free stdout; with `hidden` the typed characters are not echoed. Requires an interactive terminal. */
export function prompt(question: string, hidden = false): Promise<string> {
  if (!process.stdin.isTTY) {
    return Promise.reject(new Error(`Cannot prompt for "${question.trim()}" without an interactive terminal; supply it through the environment.`));
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const rlAny = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
      rlAny._writeToOutput = (s: string) => {
        // Only the prompt text is written; typed characters are swallowed.
        if (s.includes(question)) rlAny.output.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}
