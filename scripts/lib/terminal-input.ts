import { emitKeypressEvents, createInterface } from "node:readline";
import type { ReadStream, WriteStream } from "node:tty";

export class SetupCancelled extends Error {}
export class SetupInputError extends Error {}

export function requireInteractiveTerminal(input: ReadStream, output: WriteStream) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") {
    throw new SetupInputError(
      "Run setup in an interactive terminal. Piped credentials are not accepted.",
    );
  }
}

export function readUsername(input: ReadStream, output: WriteStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input, output, terminal: true, historySize: 0 });
    let answered = false;
    rl.once("close", () => {
      if (!answered) reject(new SetupCancelled());
    });
    rl.once("SIGINT", () => rl.close());
    rl.question("Organiser username: ", (value) => {
      answered = true;
      rl.close();
      resolve(value);
    });
  });
}

export function readHidden(
  label: string,
  input: ReadStream,
  output: WriteStream,
): Promise<string> {
  requireInteractiveTerminal(input, output);
  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = input.isRaw;

    const cleanup = () => {
      input.off("keypress", onKey);
      input.off("end", onEnd);
      input.off("error", onError);
      input.setRawMode(wasRaw);
      input.pause();
      output.write("\n");
    };
    const onEnd = () => {
      cleanup();
      reject(new SetupCancelled());
    };
    const onError = () => {
      cleanup();
      reject(new SetupInputError("Unable to read terminal input."));
    };
    const onKey = (
      text: string | undefined,
      key: { name?: string; ctrl?: boolean; meta?: boolean },
    ) => {
      if (key.ctrl && (key.name === "c" || key.name === "d")) {
        value = "";
        cleanup();
        reject(new SetupCancelled());
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        const result = value;
        value = "";
        cleanup();
        resolve(result);
        return;
      }
      if (key.name === "backspace") {
        value = Array.from(value).slice(0, -1).join("");
        return;
      }
      if (key.ctrl || key.meta || !text || /[\u0000-\u001f\u007f]/u.test(text)) return;
      if (Array.from(value + text).length > 15) {
        value = "";
        cleanup();
        reject(new SetupInputError("Password exceeds 15 characters. Run setup again."));
        return;
      }
      value += text;
      // Deliberately no echo, masks, history or logging of password input.
    };
    emitKeypressEvents(input);
    output.write(label);
    input.setRawMode(true);
    input.on("keypress", onKey);
    input.once("end", onEnd);
    input.once("error", onError);
    input.resume();
  });
}
