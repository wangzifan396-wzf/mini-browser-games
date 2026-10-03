process.env.SCA_DESKTOP_SMOKE_RELEASE = "1";
process.env.SCA_PERF_MODE = "battle";
process.env.SCA_PERF_DURATION = "8";
await import("./desktop-performance-smoke.mjs");
