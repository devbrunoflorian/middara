# PNPM install prompt artifacts

These files were generated when starting the Payload server through the installed PNPM 11 runtime. The interrupted dependency bootstrap added placeholder `allowBuilds` entries (`set this to true or false`) to `pnpm-workspace.yaml` and generated a lockfile; the install then failed because build scripts had not been approved.

The repository's active root package uses npm workspaces and has no committed PNPM lockfile. These generated artifacts are preserved here for audit, but were removed from the active root so they cannot imply a reviewed dependency/build-script policy. `pnpm-workspace.yaml` was restored to its prior tracked content. `npm run build -w apps/web` subsequently passed; the Payload dev server was launched via npm.

No application source or translation data was moved. Installed `node_modules` were left in place so the already installed dependencies remain available locally.
