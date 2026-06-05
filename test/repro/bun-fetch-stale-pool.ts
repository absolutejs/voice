// Repro for oven-sh/bun#31894 — see UPSTREAM_ISSUES.md (bun-fetch-stale-keepalive).
// Re-run after a Bun bump: if "B half-open" reconnects fast, the bug is fixed and
// the hardenFetch workaround can be reverted.
//
// Bun reuses a pooled keep-alive socket WITHOUT a liveness check, then has no
// fast reconnect — so reusing a half-open connection (peer silently gone, no
// FIN/RST: exactly what a NAT/LB idle-reap looks like to the client) hangs the
// request until Bun's hardcoded 5-min fetch ceiling instead of reconnecting.
//
// Two raw HTTP/1.1 servers isolate it:
//   A (control)  — graceful FIN after responding  => Bun reconnects, fine.
//   B (the bug)  — stays SILENT on the reused conn => Bun hangs on the dead socket.
//
// Run:  bun run bun_fetch_stale_pool_repro.ts        (Bun 1.3.14+0d9b296af, linux x64)

const listen = (port: number, onReuse: (s: any) => void) =>
  Bun.listen({
    hostname: "127.0.0.1",
    port,
    socket: {
      data(socket: any) {
        socket.n = (socket.n ?? 0) + 1;
        if (socket.n === 1) {
          socket.write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: keep-alive\r\n\r\nok");
        } else {
          onReuse(socket); // behaviour on the REUSED connection
        }
      },
    },
  });

// A: peer closes the idle connection gracefully (FIN) after a beat.
listen(38130, (s) => s.end());
// B: peer is silently gone — never answers the reused request, never FINs.
listen(38131, () => {});

const probe = async (label: string, port: number) => {
  const url = `http://127.0.0.1:${port}/`;
  await (await fetch(url)).text();   // open + pool the connection
  await Bun.sleep(200);              // connection now idle in the pool
  const t = performance.now();
  try {
    await fetch(url, { signal: AbortSignal.timeout(10_000) });
    console.log(`${label}: reconnected/responded in ${(performance.now() - t).toFixed(0)}ms  ✅`);
  } catch {
    console.log(`${label}: HUNG ${((performance.now() - t) / 1000).toFixed(0)}s+ on the reused pooled socket  ❌`);
  }
};

await probe("A graceful-FIN ", 38130);
await probe("B half-open    ", 38131);
process.exit(0);
