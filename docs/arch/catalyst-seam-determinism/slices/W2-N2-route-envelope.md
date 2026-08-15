# Slice W2-N2: n9-route-envelope

## Goal

Every Notes9 route that talks to Catalyst goes through the seam client instead of its own
`fetch`, and surfaces the server's declared `outcome` instead of inferring one. When this is
done there is exactly one code path from Notes9 to Catalyst, and no route manufactures an
answer type.

## Owns (you may write ONLY these)

- `app/api/agent/**`
- `app/api/data-analysis/**`

You do **not** own `lib/seam/**` — W2-N1 built the client and you consume it. Touching it is
a bug: if the client does not behave as documented below, **stop and report it** rather than
working around it in a route. A workaround in a route is how the seam grew four different
error shapes in the first place.

## Context

Each of these routes currently hand-rolls its own call to Catalyst. That is the root of the
divergence this feature exists to close: four error shapes, four cap interpretations, and a
client that manufactures the `outcome` the server failed to declare.

This slice is a **migration, not a redesign**. The behaviour users see should change in
exactly two ways: an over-cap request now returns our own message instead of a raw upstream
422, and a `refused` or `clarify` answer is surfaced as an answer rather than an error.
Everything else must be byte-identical.

This is the trust boundary where Notes9 hands user input to Catalyst, which is why this slice
is reviewed by a security reviewer rather than a language reviewer. Validation that used to
happen incidentally inside a hand-rolled fetch must not simply disappear when the fetch does.

## Interfaces you must honor

### Consume: the seam client (from W2-N1)

```ts
import { seamRequest, seamStream } from '@/lib/seam'
```

The client owns: envelope construction, pre-flight size rejection against `limits.json`,
per-thread turn serialisation, SSE parsing, and outcome→status mapping. Your routes own
none of that. If you find yourself re-implementing one of them, you are in the wrong slice.

### Consume: the response envelope (I2)

```jsonc
{ "contract_version": "1",
  "outcome": "ok" | "refused" | "clarify" | "bad-request"
           | "unauthorized" | "unavailable" | "contract-mismatch",
  "payload": { ... },   // iff ok
  "reason": string,     // iff not ok
  "facts": Fact[] }
```

Read `outcome`. Never manufacture it, never infer it from status or payload shape.

`refused` and `clarify` arrive as **200 and are answers**. A route that renders them as
errors is a regression, not a tidy-up.

### Produce: nothing new

No new public route shape. This slice changes how routes talk to Catalyst, not what they
expose to the browser.

## Depends on

- **W2-N1** — the seam client, and through it the contracts package from W1-N2.

## Done when

- [ ] No route under `app/api/agent/**` or `app/api/data-analysis/**` calls `fetch` to
      Catalyst directly — `grep` proves it
- [ ] Every route reads `outcome` from the response
- [ ] `refused` and `clarify` render as answers, not errors
- [ ] Over-cap requests return our own message, never a raw upstream 422
- [ ] Existing successful request/response shapes toward the browser are unchanged
- [ ] `pnpm typecheck` clean
- [ ] Tests pass with runner output pasted. "Should pass" fails the gate.
- [ ] Docs updated

## Edge cases to test

1. **No hand-rolled fetch survives.** Assert mechanically, by grep over the owned
   directories, not by inspection. This is the slice's entire premise and the one thing that
   silently half-lands.
2. **Existing success responses are byte-identical.** Capture a successful response before
   and after for at least one route on each of `agent` and `data-analysis`. A migration that
   changes success output has broken the client it was supposed to protect.
3. **`refused` renders as an answer.** 200, surfaced to the user as a reply. Assert it is not
   thrown, not logged as an error, and not converted to a 4xx.
4. **`clarify` renders as an answer.** Same, separately — the two travel different code paths
   today.
5. **Over-cap returns our message.** Assert the body is Notes9-authored and the status is
   400, and that no raw upstream 422 reaches the browser. This is the user-visible point of
   the whole feature.
6. **`unauthorized` stays 401 and leaks nothing.** Assert the `reason` carries no row data,
   no internal identifier, and no upstream stack. This is the trust boundary; an error
   message is an exfiltration path if you let it be.
7. **`facts` passes through untouched.** Including `facts: []`. Routes do not filter, reorder
   or drop facts — W4-N1 depends on them arriving intact.
8. **Streaming routes still stream.** SSE routes keep streaming through the client, and a
   `text_reset` mid-stream still reaches the browser. A migration that buffers a stream into
   one response passes most tests and ruins the product.

## Out of scope

- Any change to `lib/seam/**`. W2-N1 owns it. Report defects instead of patching around them.
- The fact ledger and token substitution. W4-N1 owns those; you pass `facts` through.
- New routes or changes to what routes expose to the browser. Migration only.
- Thread identity wiring. W4-N2 owns `thread.id` / `turn` population; until it lands, pass
  through whatever the client already constructs.
