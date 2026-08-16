# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Git — exceção deste repositório

O `~/.claude/CLAUDE.md` global exige autorização direta e explícita antes de
qualquer push ou merge em `main`, a cada vez.

**Neste repositório essa exigência está dispensada.** Bryan autorizou em
15/08/2026, de forma explícita, empurrar direto para `main` sem pedir.

A dispensa vale **somente aqui**. Em qualquer outro projeto — em especial os
de trabalho, com acesso a produção — a regra global continua valendo
integralmente.

O que **não** muda:
- Commits atômicos: um commit = uma mudança lógica e autocontida.
- Validar antes de commitar (`tsc --noEmit`, `vitest run`, `npm run build`).
- Commit e push ao fim de cada bloco terminado, não acumulado no fim.
- A mensagem carrega o **porquê**, não só o quê.
- Auditar segredo antes do push: `.env` fora do histórico e varredura por
  credencial no conteúdo versionado.

## Project context — read these first, every session

- **[docs/PROGRESSO.md](docs/PROGRESSO.md)** — onde estamos, onde queremos chegar, log do que foi feito. Leia no início de cada sessão e atualize ao final.
- **[docs/APRENDIZADOS.md](docs/APRENDIZADOS.md)** — decisões tomadas (com o porquê) e aprendizados acumulados. Leia antes de decidir qualquer coisa de arquitetura, domínio ou UX. Adicione toda vez que aprender algo novo.
