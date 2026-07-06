# Product

## Register

product

## Users

madoc serves small teams, families, and self-hosting users who want a private collaborative document and whiteboard workspace without operating a large cloud stack. Users are usually creating, opening, editing, and organizing workspace documents in a browser on a privately managed deployment.

## Product Purpose

madoc is an open-source, self-hosted collaborative workspace based on AFFiNE concepts, rebuilt around a lightweight Go and SQLite single-binary deployment. Success means users can set up the app quickly, create workspaces and documents, collaborate through BlockSuite/Yjs, and keep their data private with low operational cost.

## Brand Personality

Quiet, capable, trustworthy. The interface should feel familiar to users of AFFiNE, Notion, Linear, and other modern productivity tools, while staying simpler and more utilitarian for self-hosted daily work.

## Anti-references

Avoid cloud-first upgrade flows, AI-heavy surfaces, payment prompts, decorative marketing layouts, and local-vs-cloud workspace switching. The product should not look like a consumer landing page, a subscription SaaS upsell flow, or a feature-bloated admin console.

## Design Principles

- Keep the workspace task-first: document creation, navigation, and editing should be immediately reachable.
- Preserve AFFiNE familiarity where it helps users transfer expectations, especially in the workspace shell, sidebar, and editor frame.
- Prefer self-hosted clarity over cloud complexity by removing unsupported AI, payment, OAuth, telemetry, and local workspace concepts from primary UI.
- Use restrained product styling so the editor content and workspace documents remain the focus.
- Make loading, empty, and error states explicit so early MVP behavior is diagnosable during development.

## Accessibility & Inclusion

Target WCAG 2.1 AA fundamentals for contrast, focus visibility, keyboard reachability, and reduced-motion-friendly transitions. Avoid relying on color alone for state, and keep controls legible at common desktop and mobile viewport sizes.
