import { PassThrough } from "node:stream";
import type { ReadStream, WriteStream } from "node:tty";
import { describe, expect, it, vi } from "vitest";
import {
  readHidden,
  requireInteractiveTerminal,
  SetupCancelled,
} from "../../scripts/lib/terminal-input";

function terminal() {
  const input = new PassThrough() as unknown as ReadStream;
  const output = new PassThrough() as unknown as WriteStream;
  Object.assign(input, { isTTY: true, isRaw: false, setRawMode: vi.fn() });
  Object.assign(output, { isTTY: true });
  let displayed = "";
  output.on("data", (chunk) => {
    displayed += String(chunk);
  });
  return { input, output, displayed: () => displayed };
}

describe("private terminal input", () => {
  it("does not echo passwords and restores terminal mode after Enter", async () => {
    const io = terminal();
    const answer = readHidden("Password: ", io.input, io.output);
    io.input.emit("keypress", "Test@Pass#123", {});
    io.input.emit("keypress", "\r", { name: "return" });
    expect(await answer).toBe("Test@Pass#123");
    expect(io.displayed()).toBe("Password: \n");
    expect(io.input.setRawMode).toHaveBeenLastCalledWith(false);
    expect(io.input.listenerCount("keypress")).toBe(0);
  });

  it("handles backspace without printing characters", async () => {
    const io = terminal();
    const answer = readHidden("Password: ", io.input, io.output);
    io.input.emit("keypress", "testX", {});
    io.input.emit("keypress", undefined, { name: "backspace" });
    io.input.emit("keypress", "\r", { name: "return" });
    expect(await answer).toBe("test");
    expect(io.displayed()).not.toContain("test");
  });

  it("cancels on Ctrl+C and cleans up the terminal", async () => {
    const io = terminal();
    const answer = readHidden("Password: ", io.input, io.output);
    const rejected = expect(answer).rejects.toBeInstanceOf(SetupCancelled);
    io.input.emit("keypress", "private", {});
    io.input.emit("keypress", "\u0003", { name: "c", ctrl: true });
    await rejected;
    expect(io.displayed()).not.toContain("private");
    expect(io.input.setRawMode).toHaveBeenLastCalledWith(false);
    expect(io.input.listenerCount("keypress")).toBe(0);
  });

  it("rejects piped input before requesting credentials", () => {
    const io = terminal();
    Object.assign(io.input, { isTTY: false });
    expect(() => requireInteractiveTerminal(io.input, io.output)).toThrow(
      "interactive terminal",
    );
    expect(io.displayed()).toBe("");
  });
});
