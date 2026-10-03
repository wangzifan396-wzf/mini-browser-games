// A GUI application may outlive the terminal or launcher that created it.
// Console pipes are optional diagnostics, never a reason to abort an IPC call.
export function createSafeConsole(stdout, stderr) {
  const unavailable = new WeakSet();
  for (const stream of [stdout, stderr]) {
    if (stream?.on) stream.on("error", () => unavailable.add(stream));
  }
  return (level, message) => {
    const stream = level === "error" || level === "warn" ? stderr : stdout;
    if (!stream || unavailable.has(stream) || stream.destroyed || stream.writable === false) return false;
    try {
      stream.write(`${message}\n`, error => { if (error) unavailable.add(stream); });
      return true;
    } catch {
      unavailable.add(stream);
      return false;
    }
  };
}
