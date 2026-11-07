# How we used AI

We used OpenAI Codex as a development assistant while building AXIS. It helped write and revise TypeScript/React code, work through Arkiv SDK integration, improve the interface, debug failures, add tests, investigate query performance and draft documentation, including these submission files.

The product direction and requested changes came from the builder. This was an iterative process: run the code, inspect the result, correct the behavior and try again. We are not presenting the code or the wording as entirely unaided human work. The project remains our responsibility.

AI also appears inside the product, for a different purpose. **Ask in English** uses OpenRouter to turn a user's request and selected dataset schemas into a structured filter plan. The server validates that plan and compiles the actual Arkiv predicate. OpenRouter is not asked to fabricate records, calculate the reported totals or populate the charts. Manual query controls remain available.

Development assistance and the runtime query assistant are separate uses. The record counts, wallet owners, entity keys and query timings in our submission are observations from running code against Arkiv, not evidence supplied by a language model. Tests that use controlled data are test fixtures, not claimed live usage.

Third-party libraries, public source datasets and their licenses are also separate from AI-generated work. The main dependencies are listed in [package.json](package.json), and imported reference-source notices are retained in [docs/licenses](docs/licenses).
