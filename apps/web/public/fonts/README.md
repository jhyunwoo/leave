# Web fonts

- `pretendard-ui-v1.3.9.woff2` is a WOFF2 variable-font subset of Pretendard
  1.3.9. It contains basic Latin plus the static string literals used by
  `apps/web`, `packages/client`, and `packages/shared`. The upstream dynamic
  subset definitions are bundled in the application CSS as the fallback for
  arbitrary user and API content, so missing glyphs retain the existing
  Pretendard rendering and fetch only their matching upstream subset.
- `inter-latin-v5.2.8.woff2` is the exact Inter Latin variable font previously
  delivered by Cloudflare's Google Fonts optimization for this site. Its local
  `@font-face` declarations retain the previous 400/600/900 face descriptors,
  including the browser's existing nearest-weight selection for other weights.

Both files are versioned in their names so deployments can cache them safely.
Their SIL Open Font License texts are stored alongside the assets.

## Reproduction and provenance

Run `pnpm --filter @leave/web fonts:generate` from the repository root. The
script downloads and verifies the exact upstream Pretendard 1.3.9 and
`@fontsource-variable/inter` 5.2.8 files, collects string/template/JSX text
nodes from `apps/web/src`, `packages/client/src`, and `packages/shared/src`,
adds printable basic Latin, and invokes ephemeral
`fonttools[woff]==4.63.0` through `uv`. No font tooling is added to the project
dependency graph.

Current SHA-256 digests:

- Pretendard upstream:
  `9599f12fd42fc0bce1cd50b47a0c022e108d7aa64dd0d1bb0ed44f3282d900b4`
- Pretendard UI subset:
  `8b96ca15c0cec3781793fdb91898e49a630d3faf3d04f2d97edcc06017a09112`
- Inter upstream and local copy:
  `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62`
