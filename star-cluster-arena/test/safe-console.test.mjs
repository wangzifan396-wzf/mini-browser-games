import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createSafeConsole } from "../desktop/safe-console.mjs";

function stream(write) { return Object.assign(new EventEmitter(), { write }); }

test("desktop logging writes expected diagnostics to the proper pipe", () => {
  const output = [], errors = [];
  const write = createSafeConsole(stream(text => output.push(text)), stream(text => errors.push(text)));
  assert.equal(write("info", "DESKTOP_SMOKE_OK {}"), true);
  write("warn", "warning"); write("error", "failure");
  assert.deepEqual(output, ["DESKTOP_SMOKE_OK {}\n"]);
  assert.deepEqual(errors, ["warning\n", "failure\n"]);
});

test("closing a launcher pipe cannot throw into fullscreen or gameplay IPC", () => {
  const pipe = stream(() => { throw Object.assign(new Error("closed pipe"), { code: "EPIPE" }); });
  const write = createSafeConsole(pipe, stream(() => {}));
  assert.equal(write("info", "fullscreen=true"), false);
  assert.doesNotThrow(() => write("info", "later log"));
});

test("asynchronous pipe failure stops further writes without an uncaught error", () => {
  let count = 0;
  const pipe = stream((_text, callback) => { count++; callback(Object.assign(new Error("closed"), { code: "EPIPE" })); });
  const write = createSafeConsole(pipe, stream(() => {}));
  write("info", "first");
  assert.doesNotThrow(() => pipe.emit("error", new Error("closed")));
  assert.equal(write("info", "second"), false);
  assert.equal(count, 1);
});
