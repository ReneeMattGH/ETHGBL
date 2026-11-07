# AXIS visual direction

Reference: [Figma design analysis](https://getdesign.md/figma/design-md), retrieved through the getdesign MCP. The unmodified reference is cached locally in `.axis/design-references/figma.md`.

## Scope

The approved landing page is frozen. The internal workspace has its own compact design system, defined below. Preserve functionality. The user selected an expressive Figma-inspired light landing page and a clean, efficient analytics workspace.

## Typography and composition

- Use the existing Geist and Geist Mono fonts, not Figma's proprietary fonts.
- Landing only: heavy display headings (weight 800), 18-22px body and a 16px minimum for necessary labels. Remove decorative micro-copy.
- Paragraphs and supporting text are pure black. White is reserved for controls on black or cobalt backgrounds.
- White canvas and black text frame large cobalt, orange, lilac and yellow surfaces.
- Color carries the composition. Use flat fills, crisp borders and intentional overlaps.
- Primary actions are black pills. Secondary links are visibly underlined or arrow-marked.
- Alternate the composition between the hero, interactive pipeline, provenance story and final invitation. Avoid repeated feature-card grids.

## Landing tokens

- Ink: `#000000`; paper: `#ffffff`; soft paper: `#faf9f6`.
- Cobalt: `#1743ff`; orange: `#ff5a1f`; yellow: `#ffe500`; violet: `#9c59ff`; cyan: `#00d9f2`; lime: `#61ed00`.
- Hairline: `#deddd8`. Use white text only on cobalt or black; use black text on the other fills.
- Desktop content maximum: 1440px; gutters 48-64px, reducing to 20px on phones.
- Section spacing: 96px desktop, 64px mobile. Controls have at least 44px touch targets.

## Content and interaction

- Lead with the full name: Arkiv eXploration and Intelligence System.
- The left hero leads directly with "Your Dune / Analytics / alternative." Use bold sans-serif, aligned lines, cobalt on the final line and a short staggered mask-reveal animation. No serif, offset alignment, horizontal rule or extra giant AXIS wordmark. Below it, show "Built on Arkiv" and the full AXIS expansion at readable sizes. Reduced motion renders the complete static layout. Restore the original right-side collage: tilted live preview, yellow spark/query card, orange ring and offset black shadow. Dune references describe independent positioning, not affiliation.
- Position AXIS around its multichain onchain analytics vision and Dune-alternative direction, with Arkiv storage, native queries and wallet-owned dashboards at the center.
- Keep actual adapter availability and dataset coverage factual. The local implementation currently handles Polygon USDC; broader chain/data adapters are planned. Describe this in the capability FAQ and dataset provenance, not as the entire product identity. Arbitrary SQL execution is not implemented.
- Any displayed metrics must come from the real Arkiv query API. Loading, empty, expired and unavailable data get explicit states; never substitute sample numbers.
- Show the verified block range and query time. Refreshing does not imply the worker is caught up to Polygon.
- Browsing is public. Wallet signing is required for publishing definitions.
- Use purposeful transitions, support reduced motion, maintain keyboard focus and prevent horizontal overflow at 320px.
- The workspace overview lives at `/overview`. Dashboard catalogs contain user-published definitions only; do not seed examples. The former prebuilt URL redirects to `/dashboards`. The landing preview queries real public datasets directly.

## Internal workspace

- Use Geist throughout the internal interface, including forms and chart labels. This matches the primary font in [Dune's official Brand Hub](https://dune.com/brand). Use Geist Mono for queries, hashes and technical values.
- The Data Explorer follows the reference catalog structure: a searchable rail with Curated, Chains and Protocols tabs, expandable chain/protocol tables, and a detail panel with Overview, Tables, Schema and Provenance views. Preserve selection in the URL and provide a collapsible catalog browser on small screens.
- Curated contains the agreed ten collections. Chains contains Polygon. Protocols contains QuickSwap, Uniswap v3, Aave v3 and Polymarket. Catalog entries describe discovery metadata; they do not imply an importer exists. Unsupported tables explicitly show Not indexed, without substitute metrics or rows.
- Table previews query trusted-writer Arkiv entities directly, constrain dataset-backed tables to verified coverage, and show their executed native query. Token metadata and decoded transfers currently cover Polygon native USDC only. Polygon blocks are imported source headers, not a complete chain index.
- The user's latest instruction replaces the oversized internal typography: use 16px body, 15px controls and 14-15px metadata/table labels, 28px page titles, 15-16px panel headings and 28-32px metric values.
- All internal styling is scoped to `.axis-layout` and `axis-*` components. Do not change landing files, markup, colors, typography or layout.
- Use a 224px collapsible sidebar, 60px topbar, 24px desktop gutters and a consistent 16-20px spacing rhythm. Keep mobile navigation accessible.
- The internal workspace uses the refined visual system in `src/app/workspace-theme.css`: white navigation and panels, a cool-gray canvas, cobalt selected navigation and primary actions, 11-13px panel/card radii, subtle shadows, and pale blue, violet and lime icon surfaces. The overview has a cobalt welcome panel with real published-dashboard and widget totals, action tiles and a two-column public/personal library. Use pure black supporting text on light surfaces; white labels belong on cobalt actions and the cobalt overview panel. The header uses a network chip and a single segmented wallet control with an icon disconnect action. Keep the 224px collapsible navigation and accessible mobile overlay.
- Remove repeated page introductions, widget subtitles and permanent explanatory paragraphs. Keep short field constraints and errors. Put source coverage, calculation definitions and operational reference behind clearly labelled details.
- Favor toolbars, compact tables, a query editor with a saved-query rail, a builder inspector next to its canvas, and a responsive dashboard widget grid.
- Preserve real Arkiv data, complete-scope calculations, signature authorization, source provenance, retention controls, error handling, queries, filters, exports and independent widget refreshes.
- Use the shared analytical system in query results, catalog insights, builder previews, published widgets and the live landing preview. Prefer stacked-area composition, percentage areas, allocation treemaps, activity matrices, composition rings, concentration analysis and volume/activity overlays. Do not offer standalone line or simple bar charts. Render legacy saved kinds through equivalent analytical presentations while preserving their query and exact measures. Keep the light theme, black text, readable legends with totals and shares, and consistent series colors. Composition categories must come from real transfer-size bands, protocols, action types or other observed fields; never copy asset categories or manufacture historical observations from a visual reference.
- Persist visualization kind, measure, grouping and optional UTC interval with each widget. Legends filter visible series; percentage views normalize the visible categories. Tooltips and CSV preserve exact base-unit-derived values while chart coordinates are approximate. Address breakdowns retain an Other group to reconcile the full scope. Heatmap compression sums adjacent groups and discloses it.
- Keep the complete query scope visible, with an expanded dialog, exact-data tables and SVG/PNG export. CSV exports every chart group, including hidden series. Use the query's supported wallet, time and predicate filters to change its scope. Do not add example dashboards to demonstrate charts.
- Analytical marks use saturated cobalt, violet, orange, cyan, magenta and green. Avoid translucent pastel allocation tiles. Use solid treemap fills with contrast-aware labels and visible shares; use strong fills in stacked areas and activity matrices. Reference collections use real two-field relationship flows and cross-category matrices (token precision, ABI provenance, protocol roles, registry coverage and scoring models), rather than repeating count-only treemaps. Preserve exact record totals on both sides of each flow, including combined overflow categories. Sparse records show their actual composition; never invent a time series.
- Use the intense shared chart palette from `chart-data.ts`: electric blue, ultraviolet, vermilion, bright cyan, hot pink and lime. Stacked areas, composition rings, flow ribbons and live-preview marks render at full opacity by default. Heatmap intensities remain quantitative, with vivid nonzero cells and contrasting black or white value labels. Preserve interaction dimming for focus and series isolation.
- Workspace boxes share `--axis-box-border: #00000029`: panels, cards, metrics, form fields, table frames, chart containers, dialogs and disclosure boxes use a subtle 1px outline. Keep internal row dividers lighter, preserve colored focus and semantic states, and use `--axis-border` for the sidebar/header dividers. These internal refinements do not affect the landing page.
- Query Studio has persistent Manual query and Ask in English modes with a light sky-blue selected control. Dataset selectors and result actions are shared. English requests use server-only OpenRouter structured outputs. Execute query generates, validates and runs in one step, revealing a Run query panel with execution status, the actual executed predicate and the result table. Generate query remains a preview-only alternative with a separate Run query action. Keep Edit manually available, preserve drafts when switching modes, cancel stale generations, and show clarification or unavailable states explicitly. Results belong to the exact request and must not show old rows during another execution. Do not turn the page into a chat feed or invent query results.
