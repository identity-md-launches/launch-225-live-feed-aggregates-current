# Signal design system

## Overview

Signal is a compact reader for the Identity-MD community. The default night palette, outlined controls, green accents, mono metadata, and diamond motif take their direction from imd.fun. A restrained sans-serif reading face makes longer posts easier to scan. The visual hierarchy is identity → edition status → feed controls → entries; source attribution and timestamps remain next to every entry.

The default desktop page has a filter rail, a central chronological feed, and an ecosystem context rail. Grid and compact are user-selected variations. Illustrations belong to example entries, not to dashboard metrics. The cadence graphic is decorative. The preview edition and every sample entry identify their status explicitly.

Source of truth: [`src/styles.css`](src/styles.css), [`src/main.tsx`](src/main.tsx), and [`src/icons.tsx`](src/icons.tsx). Later responsive and readability rules in the stylesheet override earlier component declarations; the values below describe their final effect.

## Colors

All theme switching uses `data-theme` on the root element. Night is the initial default. Hex semantic tokens are defined at `src/styles.css:8`, with dusk at line 44 and day at line 61.

| Token / job                                        | Night     | Dusk      | Day       |
| -------------------------------------------------- | --------- | --------- | --------- |
| `--page` / page and header                         | `#111411` | `#28231f` | `#f4f5f0` |
| `--surface` / cards and fields                     | `#191d19` | `#332d27` | `#ffffff` |
| `--surface-hover` / hover, selected controls       | `#202620` | `#40382e` | `#edf0e6` |
| `--subtle` / edition bar and quieter groups        | `#151915` | `#2d2722` | `#eaede4` |
| `--text` / primary text                            | `#edf0e8` | `#f2e9dc` | `#242c21` |
| `--secondary` / body and secondary labels          | `#b6bcb1` | `#c9bba9` | `#505d49` |
| `--muted` / metadata                               | `#919b8d` | `#b6a38d` | `#5e6a56` |
| `--border` / structural separation                 | `#30382e` | `#4d4338` | `#dce2d4` |
| `--control-border` / stronger outlines             | `#5c6855` | `#88775e` | `#89947c` |
| `--accent` / actions and selected states           | `#b6ee8b` | `#dddfa0` | `#385e22` |
| `--accent-ink` / text on accent fill               | `#182412` | `#292819` | `#ffffff` |
| `--accent-soft` / selected and contextual surfaces | `#263520` | `#44452b` | `#e1ebd6` |
| `--focus` / keyboard outline                       | `#c7f89f` | `#f2ecb9` | `#41672b` |
| `--error` / failed refresh                         | `#ffc5ad` | `#ffc3a7` | `#9c3518` |

Source brands have small identifying colors, not interaction-state meanings. The blue mark is `#79b5f2` in dark themes and `#2673b7` in day; the Reddit mark is `#e89a7e` in dark themes and `#a64528` in day. Their names remain visible alongside them. The local editorial artwork has its own fixed palette.

Measured rendered entry body text/surface contrast: night **8.79:1**, dusk **7.22:1**, day **6.99:1**. The lowest of the 15 measured text pairs in each theme was **5.91:1**, **5.24:1**, and **4.83:1**, respectively. Exact selectors, foregrounds, and backgrounds are in `artifacts/browser-results.json`. These numbers do not certify every possible background, image, focus state, or external asset.

## Typography

The reading stack is `"Helvetica Neue", Arial, sans-serif`, using the visitor’s system fonts. CSS requests weights 400–650 for hierarchy; available physical weights depend on the platform. IBM Plex Mono regular, weight 400, is a local Latin WOFF2 in `src/assets/plex-mono.woff2`, with `font-display: swap` and `ui-monospace, monospace` fallbacks. It is used for metadata, overlines, counts, and tags. The font license is in `public/assets/FONT-LICENSE.txt`.

| Role                 | Final size / treatment                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Page heading         | 40px, weight 600, line-height 1.2, tracking −1.7px; 32px at ≤760px; 34px / 1.15 at ≤480px    |
| Feed heading         | 19px, weight 550, tracking −0.4px; 18px on narrow mobile                                     |
| Entry title          | 17px, weight 550, line-height 1.4; 18px on narrow mobile; 14px compact / 15px compact mobile |
| Collapsed entry text | 14px, line-height 1.7 desktop / 1.65 mobile; compact 13px                                    |
| Expanded text        | 15px, line-height 1.7, maximum measure 72ch                                                  |
| Authors              | 13px, weight 550; 12px on narrow mobile                                                      |
| Controls / rail text | Mostly 12–13px; search and time-range inputs are 16px on mobile                              |
| Secondary metadata   | 9–11px for dense timestamps, badges, tags, and small counters; not used for reading text     |
| Overlines            | Mono, uppercase via CSS, 10–12px, positive tracking                                          |

Headings use balanced wrapping; descriptions use pretty wrapping. Entry content can break long words. Dates and counters use tabular numerals. Collapsed excerpts have an explicit “Read more” control. Dates are visible on every entry, with UTC identified above the feed and in timestamp titles.

The root declares `--text-small` (.75rem), `--text-label` (.8125rem), `--text-body` (.875rem), and `--text-reading` (1rem) as reference scale values. Current component rules use explicit sizes; changing these reference tokens alone does not resize the interface.

## Layout

The maximum shell width is 1480px with 40px inline padding on desktop. `.workspace` (`src/styles.css:474`) uses `192px minmax(0,1fr) 250px` columns and 28px gaps. At ≥1600px, rails become 210px and 270px with 32px gaps. Grid view hides the context rail and gives the feed two equal columns; entries remain in DOM/chronological row order. Compact view uses smaller rows and hides thumbnails until expanded.

The root reference spacing scale is 4, 8, 12, 16, 24, 32, and 48px (`--space-1` through `--space-7`). Components currently apply explicit spacing, with 8–12px within groups, 24–32px between groups, 12px card gaps, and 18–19px card padding. The shell and rails deliberately use additional values to fit the content.

Responsive rules:

- **≤1180px:** remove the context rail, retain a 180px filter rail, and reduce shell gutters to 28px. The external header link is hidden.
- **≤760px:** one-column feed, 20px gutters, header navigation moves to a second row, and filters become a disclosed inline panel. Opening it scrolls and focuses the panel; “Show signals” closes it and restores focus. Grid falls back to a single column. Controls and mobile form text become larger.
- **≤480px:** 16px gutters, decorative hero artwork disappears, media becomes full width inside cards, nonessential topic tags are hidden, and primary entry actions remain on one line.

The header, rails, and feed stay in normal document flow. The only fixed surface is the undo/notification toast. At most 20 entries render initially, with a “Show more signals” control when needed. Breakpoints and wrappers were tested at 1440, 900, 760, 375, and 320 CSS pixels with no horizontal overflow. A 200% CSS zoom check also passed; native browser zoom and physical devices were not tested.

## Elevation & Depth

The page uses tonal layers and 1px structural borders. Cards do not float or animate into place. The stronger control border distinguishes selected pills and the project card. The dialog and toast use `--shadow: 0 16px 60px #0006` in dark themes and `0 16px 60px #26341b22` in day. The modal backdrop uses `#080d09bb` and 4px backdrop blur. The toast has z-index 20 and the skip link 100. The native dialog occupies the browser’s top layer.

## Shapes

Cards use `--radius: 12px`; compact rows and settings groups use 8px; field and button corners use 7px; selected segments use 5px. The dialog uses 16px and the toast 10px. Avatars use rounded squares; status dots are circular. The diamond is the repeated brand shape and is decorative unless contained in a named link. Thumbnail outlines use translucent neutral white.

## Components

- **`App` / page composition (`src/main.tsx`):** owns collection, filter, search, date-range, and sort state. Theme, layout, saved IDs, and hidden IDs use `useStored`. Malformed/denied storage falls back safely. The feed loader has initial loading, retained-snapshot error, retry, empty, and pending-update states.
- **`FeedCard` (`src/main.tsx:885`):** takes `entry`, `saved`, `hidden`, `onSave`, and `onHide`. It renders the author/source/date, type badge, excerpt, optional media, expand button, original-source link, hide/restore, and bookmark. Expansion uses `aria-expanded` and `aria-controls`. Failed media disappears without hiding entry text. Hide has persistent undo and a separate restorable collection.
- **Filter rail (`src/styles.css:513`):** native labeled source checkboxes, content-type buttons with `aria-pressed`, and a labeled native time-range select. Multiple selections combine with search; zero selections intentionally returns an actionable empty state. Reset selects all sources/types and clears search/time.
- **Theme and view segments:** native buttons in named groups, with `aria-pressed`, names, and visible selected backgrounds. No fake tab-role keyboard behavior. Color switches are immediate, with no whole-page color transition.
- **Fields and buttons:** `.search-field`, `.button`, `.icon-button`, and `.text-button`. Search has a persistent accessible name and a clear action. Links navigate; buttons change local state. The normal feed uses outline/quiet actions; accent fill emphasizes recovery and dialog completion.
- **About dialog (`src/main.tsx:790`, `.about-dialog`):** native modal with a labeled heading, close button, Escape handling, Tab/Shift+Tab containment, inert background from `showModal()`, and focus restoration. Its copy distinguishes samples from live content and explains the feed’s actual limits.
- **Toast (`.toast`):** polite status announcement; actionable undo remains until dismissed or replaced by a subsequent action. It does not time out. Dismiss and undo are named buttons.
- **`Icon` and `SourceIcon` (`src/icons.tsx`):** inline SVGs use a consistent 1.6px stroke and `currentColor`. Icons are decorative when paired with named controls. Source text remains the accessible identity.

All interactive elements have explicit visible focus outlines. Hover styles are gated by pointer capability. Only the 120ms button press scale (.96, cubic-bezier(.2,0,0,1)) animates, under `prefers-reduced-motion: no-preference`. There is no autoplay or entry animation. Forced colors preserves outlines and selected states.

## Do’s and Don’ts

- Reuse semantic theme tokens for surfaces, text, borders, and focus. Check muted text against its actual surface in all three themes.
- Keep attribution, a real date, an expansion cue, and hide/restore reachable in every card view. Use the narrow-screen tag suppression to protect primary actions.
- Add new source formats through the service adapter contract and feed schema; preserve provenance and original URLs. Do not render source HTML or embed arbitrary scripts.
- Keep sample content labeled and collection timestamps truthful. Never turn the decorative cadence bars into a claimed live metric.
- For a related page, start from `.page-shell`, the header and control patterns, then define the main content inside a semantic landmark. Reuse `Icon`, buttons, and the theme tokens, and verify 320px plus desktop before extending the layout.
- Preserve the static-host contract: relative local assets, one page or hash navigation, and no browser credentials.
