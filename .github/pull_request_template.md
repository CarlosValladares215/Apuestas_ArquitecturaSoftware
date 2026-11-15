## Resumen

Describe brevemente qué implementa este Pull Request y a qué spec corresponde.

- Spec: `specs/NNN-nombre/`
- Rama: `feature/spec-X` → `develop`

## Checklist de Constitución y Calidad

- [ ] Cumple `.specify/memory/constitution.md` (principios I–VII).
- [ ] No hay secretos ni archivos `.env` en el diff.
- [ ] Pruebas unitarias / integración / E2E incluidas (y escritas primero en dominios críticos).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pasan en verde.
- [ ] Si toca `apps/reports`: `ruff check .` y `pytest` pasan en verde.
- [ ] Si toca UI: revisado desde 360 px y accesible (WCAG 2.1 AA).
