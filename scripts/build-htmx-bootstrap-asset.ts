const outputPath = new URL(
  "../src/generated/htmxBootstrapBundle.ts",
  import.meta.url,
);

const build = await Bun.build({
  entrypoints: [
    new URL("../src/client/htmxBootstrap.ts", import.meta.url).pathname,
  ],
  format: "esm",
  minify: true,
  target: "browser",
});

if (!build.success || build.outputs.length === 0) {
  const log = build.logs.map((entry) => entry.message).join("\n");
  throw new Error(
    `Failed to build the voice HTMX bootstrap bundle.${log ? `\n${log}` : ""}`,
  );
}

const text = await build.outputs[0]!.text();

await Bun.write(
  outputPath,
  `export const HTMX_BOOTSTRAP_BUNDLE = ${JSON.stringify(text)};\n`,
);
