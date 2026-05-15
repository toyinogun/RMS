# ADR 0010 — Deploy app-of-apps in the same monorepo

**Status:** Accepted (2026-05-12)

## Context

GitOps purity argues for code in one repo and manifests in another. For a
single-product, single-team SaaS in Phase 0, that two-repo dance slows every
change. ArgoCD's app-of-apps pattern supports manifests living anywhere,
including the application repo.

## Decision

Manifests live in **`deploy/`** inside the application monorepo. A single
manually-applied `Application` (`deploy/argocd/root-app.yaml`) points at
`deploy/argocd/apps/`. Child Applications target Kustomize bases under
`deploy/k8s/`. ArgoCD Image Updater watches `repo.toyintest.org/solutio-web`
and commits resolved digests into `deploy/k8s/web/kustomization.yaml`.

## Consequences

- Code change + manifest change ship in one PR — atomic review.
- Trade-off: Image Updater needs write access to the repo. **GitHub deploy
  keys cannot be path-scoped** — the key has write access to the entire repo,
  not just `deploy/k8s/`. **Acceptable for Phase 0** (single committer, single
  product). **Migration path:** when team size or compliance demands
  path-scoped access, replace the deploy key with a GitHub App installed only
  on this repo, with `contents: write` permission and a fine-grained access
  policy restricting writes to `deploy/k8s/`.
- Sync waves order the deploy: CNPG (-10) → secrets (-5) → web (0).
