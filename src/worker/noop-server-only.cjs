// No-op stub for "server-only" when running the worker in plain Node.
// The worker is a legitimate server-side Node process (not a client bundle),
// so the "server-only" guard does not apply here. See src/worker/run.cjs.
module.exports = {};