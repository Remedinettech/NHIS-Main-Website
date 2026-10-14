# Continue with Claude

Work in this TN-NHIS repository. Preserve the three-app architecture: nhis-client and nhis-admin use React + Vite + TypeScript; nhis-api uses Next.js Route Handlers. Do not switch to NestJS merely because the original Usha example used it.

Read README.md and docs/implementation-plan.md first. Use reference/nhis-handoff only as content evidence. Begin with database-backed hospital drafts, admin authentication, authorization and publishing. Keep all original EN/TA source fields. Do not enable write routes or forms before permission checks are implemented. Make the draft/publication separation explicit. Report tests performed and remaining scaffolds. Do not claim the entire NHIS application is finished.
