import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { Icon, SourceIcon } from "./icons";
import { dateLabel, isStringList, parseFeed, readStored } from "./feed";
import {
  sources,
  kinds,
  type Collection,
  type Entry,
  type Feed,
  type Kind,
  type Source,
  type Theme,
  type View,
} from "./types";
import "./styles.css";

function useStored<T>(
  key: string,
  fallback: T,
  validate: (v: unknown) => boolean,
) {
  const [value, setValue] = useState<T>(() =>
    readStored(key, fallback, validate),
  );
  useEffect(() => {
    try {
      localStorage.setItem(`imd-signal:${key}`, JSON.stringify(value));
    } catch {
      /* The feed still works when storage is unavailable. */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
function App() {
  const [theme, setTheme] = useStored<Theme>("theme", "night", (v) =>
    ["day", "dusk", "night"].includes(String(v)),
  );
  const [view, setView] = useStored<View>("view", "timeline", (v) =>
    ["timeline", "grid", "compact"].includes(String(v)),
  );
  const [saved, setSaved] = useStored<string[]>("saved", [], isStringList);
  const [hidden, setHidden] = useStored<string[]>("hidden", [], isStringList);
  const [collection, setCollection] = useState<Collection>("feed");
  const [selectedSources, setSelectedSources] = useState<Source[]>([
    ...sources,
  ]);
  const [selectedKinds, setSelectedKinds] = useState<Kind[]>([...kinds]);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("all");
  const [sort, setSort] = useState("newest");
  const [feed, setFeed] = useState<Feed | null>(null);
  const [pending, setPending] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [undo, setUndo] = useState<string | null>(null);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [pageSize, setPageSize] = useState(20);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTrigger = useRef<HTMLElement | null>(null);
  const requestActive = useRef(false);
  const hasFeed = useRef(false);
  const load = useCallback(async (initial = false) => {
    if (requestActive.current) return;
    requestActive.current = true;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("./feed.json", {
        cache: "no-cache",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Feed unavailable");
      const next = parseFeed(await response.json());
      if (initial || !hasFeed.current) {
        setFeed(next);
        hasFeed.current = true;
      } else {
        setPending(next);
        setMessage("Feed checked. Your reading position is unchanged.");
      }
    } catch {
      setError(
        "Couldn’t refresh the feed. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
      requestActive.current = false;
    }
  }, []);
  useEffect(() => {
    void load(true);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 300000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    setPageSize(20);
  }, [query, selectedSources, selectedKinds, period, collection]);
  useEffect(() => {
    if (pending && feed && pending.generatedAt === feed.generatedAt) {
      setPending(null);
    }
  }, [pending, feed]);
  const entries = feed?.entries || [];
  const referenceDate =
    feed?.mode === "demo" ? Date.parse(feed.generatedAt) : Date.now();
  const visible = useMemo(
    () =>
      entries
        .filter((e) => {
          if (
            collection === "hidden"
              ? !hidden.includes(e.id)
              : hidden.includes(e.id)
          )
            return false;
          if (collection === "saved" && !saved.includes(e.id)) return false;
          if (
            !selectedSources.includes(e.source) ||
            !selectedKinds.includes(e.kind)
          )
            return false;
          if (
            query &&
            !`${e.title || ""} ${e.text} ${e.author} ${e.source}`
              .toLowerCase()
              .includes(query.toLowerCase().trim())
          )
            return false;
          if (
            period !== "all" &&
            referenceDate - Date.parse(e.publishedAt) >
              Number(period) * 86400000
          )
            return false;
          return true;
        })
        .sort(
          (a, b) =>
            (sort === "newest" ? 1 : -1) *
            (Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
        ),
    [
      entries,
      collection,
      hidden,
      saved,
      selectedSources,
      selectedKinds,
      query,
      period,
      referenceDate,
      sort,
    ],
  );
  const resetFilters = () => {
    setSelectedSources([...sources]);
    setSelectedKinds([...kinds]);
    setQuery("");
    setPeriod("all");
  };
  const openAbout = (event: React.MouseEvent<HTMLElement>) => {
    dialogTrigger.current = event.currentTarget;
    dialog.current?.showModal();
  };
  const toggleSave = (id: string) => {
    setSaved((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
    setMessage(
      saved.includes(id)
        ? "Removed from saved signals."
        : "Signal saved for later.",
    );
    setUndo(null);
  };
  const toggleHide = (id: string) => {
    const wasHidden = hidden.includes(id);
    setHidden((v) => (wasHidden ? v.filter((x) => x !== id) : [...v, id]));
    setMessage(
      wasHidden
        ? "Signal restored to your feed."
        : "Signal hidden from your feed.",
    );
    setUndo(wasHidden ? null : id);
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(".toast button")?.focus(),
    );
  };
  const filterCount =
    sources.length -
    selectedSources.length +
    kinds.length -
    selectedKinds.length +
    (period === "all" ? 0 : 1);
  const navigate = (next: Collection) => {
    setCollection(next);
    setMessage("");
    setUndo(null);
    resetFilters();
  };
  const pendingCount =
    pending?.entries.filter((e) => !entries.some((old) => old.id === e.id))
      .length || 0;
  const feedTitle =
    collection === "saved"
      ? "Saved signals"
      : collection === "hidden"
        ? "Hidden signals"
        : "Latest signals";
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to feed
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a
            href="#"
            className="brand"
            aria-label="Signal home"
            onClick={() => navigate("feed")}
          >
            <img src="./assets/mark.svg" alt="" width="34" height="34" />
            <span>
              IMD<span className="brand-divider">/</span>
              <strong>signal</strong>
            </span>
          </a>
          <nav aria-label="Feed collections" className="main-nav">
            {(
              [
                ["feed", "feed", "Feed"],
                ["saved", "bookmark", "Saved"],
                ["hidden", "hide", "Hidden"],
              ] as const
            ).map(([value, icon, label]) => (
              <button
                key={value}
                onClick={() => navigate(value)}
                className={collection === value ? "active" : ""}
                aria-current={collection === value ? "page" : undefined}
              >
                <Icon name={icon} size={16} />
                {label}
                {value !== "feed" && (
                  <span className="nav-count">
                    {value === "saved" ? saved.length : hidden.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="header-end">
            <a
              className="back-link"
              href="https://imd.fun"
              target="_blank"
              rel="noreferrer"
            >
              The IMD universe <Icon name="arrow" size={14} />
            </a>
            <div className="theme-switch" role="group" aria-label="Color theme">
              {(["day", "dusk", "night"] as const).map((t, i) => (
                <button
                  key={t}
                  aria-label={`${t[0].toUpperCase() + t.slice(1)} mode`}
                  title={`${t[0].toUpperCase() + t.slice(1)} mode`}
                  aria-pressed={theme === t}
                  onClick={() => setTheme(t)}
                >
                  <Icon name={["sun", "dusk", "moon"][i]} size={17} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>
      <div className="page-shell">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <div className="eyebrow">
              <span className="tiny-diamond" /> The Identity-MD feed
            </div>
            <h1 id="page-title">
              Keep up with <span>the swarm.</span>
            </h1>
            <p>Big ideas. Small updates. Every corner of the IMD universe.</p>
          </div>
          <div className="intro-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <div className="orbit-core" />
            <span className="art-caption">Many voices. One signal.</span>
          </div>
        </section>
        <div className="edition-bar">
          <div>
            <span
              className={`status-dot ${feed?.mode === "live" ? "live" : ""}`}
            />
            <span>
              {feed?.mode === "live" ? "Live edition" : "Preview edition"}
            </span>
            <span className="edition-divider">/</span>
            <span className="edition-detail">
              {feed?.mode === "live"
                ? `Updated ${new Date(feed.generatedAt).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`
                : "Sample entries · Explore how your feed works"}
            </span>
          </div>
          <button onClick={openAbout}>
            {feed?.mode === "live" ? "About this feed" : "About live sources"}
            <Icon name="arrow" size={14} />
          </button>
        </div>
        <div className={`workspace view-${view}`}>
          <aside
            className={`filter-rail ${mobileFilters ? "mobile-open" : ""}`}
            aria-label="Feed filters"
            id="feed-filters"
          >
            <div className="rail-heading">
              <h2>
                <Icon name="filter" size={16} /> Filters{" "}
                {filterCount > 0 && (
                  <span className="count">{filterCount}</span>
                )}
              </h2>
              <button className="text-button" onClick={resetFilters}>
                Reset
              </button>
            </div>
            <fieldset>
              <legend>Sources</legend>
              {sources.map((source) => (
                <label className="source-option" key={source}>
                  <input
                    type="checkbox"
                    checked={selectedSources.includes(source)}
                    onChange={() =>
                      setSelectedSources((v) =>
                        v.includes(source)
                          ? v.filter((x) => x !== source)
                          : [...v, source],
                      )
                    }
                  />
                  <SourceIcon source={source} />
                  <span>
                    {source === "X"
                      ? "X / Twitter"
                      : source === "Web"
                        ? "Web & blogs"
                        : source}
                  </span>
                  <span className="source-count">
                    {entries.filter((e) => e.source === source).length}
                  </span>
                </label>
              ))}
            </fieldset>
            <fieldset className="types-fieldset">
              <legend>Content type</legend>
              <div className="type-options">
                {kinds.map((kind) => (
                  <button
                    key={kind}
                    aria-pressed={selectedKinds.includes(kind)}
                    onClick={() =>
                      setSelectedKinds((v) =>
                        v.includes(kind)
                          ? v.filter((x) => x !== kind)
                          : [...v, kind],
                      )
                    }
                  >
                    <Icon
                      name={
                        kind === "Story"
                          ? "spark"
                          : kind === "Video"
                            ? "play"
                            : kind.toLowerCase()
                      }
                      size={14}
                    />
                    {kind === "Image"
                      ? "Images & memes"
                      : kind === "Story"
                        ? "Stories"
                        : `${kind}s`}
                    {selectedKinds.includes(kind) && (
                      <Icon name="check" size={12} />
                    )}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="time-filter">
              <label htmlFor="time-range">Time range</label>
              <select
                id="time-range"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="all">All time</option>
                <option value="1">Past 24 hours</option>
                <option value="7">Past 7 days</option>
                <option value="30">Past 30 days</option>
              </select>
            </div>
            <div className="quality-note">
              <Icon name="shield" size={20} />
              <h3>A little less noise.</h3>
              <p>
                Original ideas make it through. Spam, replies, and repeat posts
                don’t. Memes welcome.
              </p>
              <button onClick={openAbout}>
                How we curate <Icon name="arrow" size={13} />
              </button>
            </div>
            <button
              className="button mobile-done"
              onClick={() => {
                setMobileFilters(false);
                document.getElementById("filter-toggle")?.focus();
              }}
            >
              Show {visible.length} signals <Icon name="check" size={15} />
            </button>
          </aside>
          <main id="main" tabIndex={-1}>
            <div className="feed-heading">
              <div>
                <h2>{feedTitle}</h2>
                <span className="count">{visible.length}</span>
              </div>
              <div
                className="view-switch"
                role="group"
                aria-label="Feed layout"
              >
                {(["timeline", "grid", "compact"] as const).map((v, i) => (
                  <button
                    key={v}
                    aria-label={`${v[0].toUpperCase() + v.slice(1)} view`}
                    title={`${v[0].toUpperCase() + v.slice(1)} view`}
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                  >
                    <Icon name={["feed", "grid", "compact"][i]} size={16} />
                  </button>
                ))}
              </div>
            </div>
            <div className="feed-tools">
              <label className="search-field">
                <Icon name="search" size={16} />
                <span className="sr-only">Search the feed</span>
                <input
                  type="search"
                  value={query}
                  placeholder="Search the signal…"
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    className="clear-search"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                  >
                    <Icon name="close" size={14} />
                  </button>
                )}
              </label>
              <label className="sort-field">
                <span className="sr-only">Sort signals</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </label>
              <button
                className="icon-button refresh-button"
                disabled={loading}
                onClick={() => void load()}
                aria-label="Refresh feed"
                title="Refresh feed"
              >
                <Icon name="refresh" size={16} />
              </button>
            </div>
            <button
              id="filter-toggle"
              className="button mobile-filter-toggle"
              aria-expanded={mobileFilters}
              aria-controls="feed-filters"
              onClick={() => {
                setMobileFilters((v) => !v);
                if (!mobileFilters)
                  requestAnimationFrame(() => {
                    document
                      .getElementById("feed-filters")
                      ?.scrollIntoView({ block: "start" });
                    document
                      .querySelector<HTMLButtonElement>(
                        ".filter-rail .text-button",
                      )
                      ?.focus();
                  });
              }}
            >
              <Icon name="filter" size={16} />
              {mobileFilters ? "Close filters" : "Filter signals"}
              {filterCount > 0 && <span className="count">{filterCount}</span>}
            </button>
            {collection === "hidden" && (
              <div className="collection-note">
                Hidden only on this device. Restore a signal to put it back in
                your feed.
              </div>
            )}
            {collection === "saved" && (
              <div className="collection-note">
                Your reading list, saved on this device.
              </div>
            )}
            {error && (
              <div role="alert" className="error-state">
                <Icon name="info" />
                {error}
                <button onClick={() => void load()}>Try again</button>
              </div>
            )}
            {feed?.mode === "live" &&
              feed.sources.some((s) => s.status === "error") && (
                <div className="collection-note">
                  Some sources are unavailable. Showing their last collected
                  entries.
                </div>
              )}
            {pending && (
              <button
                className="new-signals"
                onClick={() => {
                  setFeed(pending);
                  setPending(null);
                  setMessage("Your feed is up to date.");
                }}
              >
                <Icon name="refresh" size={15} />
                {pendingCount
                  ? `Show ${pendingCount} new signal${pendingCount === 1 ? "" : "s"}`
                  : "Apply latest feed check"}
              </button>
            )}
            <div className="date-row">
              <span>
                {feed?.mode === "demo"
                  ? "Preview entries · Times in UTC"
                  : feed
                    ? "In chronological order"
                    : "Loading the feed"}
              </span>
              <span>
                <span className="small-dot" />
                {feed?.mode === "demo" ? "Sample feed" : "Original sources"}
              </span>
            </div>
            <div className="sr-only" role="status">
              {!loading
                ? `${visible.length} signals shown.`
                : "Checking the feed."}
            </div>
            {loading && !feed ? (
              <div className="loading-state">
                <Icon name="refresh" size={24} />
                <p>Gathering the signals…</p>
              </div>
            ) : (
              <div className="entries">
                {visible.slice(0, pageSize).map((entry) => (
                  <FeedCard
                    key={entry.id}
                    entry={entry}
                    saved={saved.includes(entry.id)}
                    hidden={hidden.includes(entry.id)}
                    onSave={() => toggleSave(entry.id)}
                    onHide={() => toggleHide(entry.id)}
                  />
                ))}
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div className="empty-state">
                <Icon
                  name={
                    collection === "saved"
                      ? "bookmark"
                      : collection === "hidden"
                        ? "hide"
                        : "search"
                  }
                  size={30}
                />
                <h3>
                  {query
                    ? `No signals for “${query}”`
                    : collection === "saved"
                      ? "A place for your next good read."
                      : collection === "hidden"
                        ? "Nothing hidden here."
                        : "No signals match these filters."}
                </h3>
                <p>
                  {collection === "saved"
                    ? "Save an entry using its bookmark button, then find it here."
                    : collection === "hidden"
                      ? "Entries you hide will appear here, ready to restore."
                      : "Try another search or reset your filters to see more."}
                </p>
                <button
                  className="button primary"
                  onClick={() => {
                    resetFilters();
                    if (collection !== "feed") navigate("feed");
                  }}
                >
                  {collection === "feed" ? "Reset filters" : "Explore the feed"}
                  <Icon name="arrow" size={14} />
                </button>
              </div>
            )}
            {visible.length > pageSize && (
              <button
                className="button load-more"
                onClick={() => setPageSize((v) => v + 20)}
              >
                Show more signals <Icon name="down" size={15} />
              </button>
            )}
            {visible.length > 0 && visible.length <= pageSize && (
              <div className="caught-up">
                <span className="end-line" />
                <Icon name="check" size={16} />
                <span>You’re all caught up.</span>
                <span className="end-line" />
              </div>
            )}
          </main>
          <aside className="context-rail" aria-label="About the feed">
            <section className="project-card">
              <div className="project-mark">
                <img src="./assets/mark.svg" alt="" width="40" height="40" />
                <span className="mono">The bigger picture</span>
              </div>
              <h2>
                One community.
                <br />A world of ideas.
              </h2>
              <p>
                Follow what’s being built, shared, and talked about around
                Identity-MD.
              </p>
              <a href="https://imd.fun" target="_blank" rel="noreferrer">
                Explore Identity-MD
                <Icon name="arrow" size={15} />
              </a>
              <div className="project-card-pattern" aria-hidden="true">
                ◇ ◇ ◇ ◇ ◇ ◇ ◇
              </div>
            </section>
            <section className="pace-card">
              <div className="section-eyebrow">
                <Icon name="clock" size={15} /> A considered pace
              </div>
              <h3>Fresh, without the frenzy.</h3>
              <p>
                {feed?.mode === "live"
                  ? "Sources are checked every 15 minutes."
                  : "Live collection checks sources every 15 minutes."}{" "}
                New signals wait for you, so your reading never jumps.
              </p>
              <div className="cadence-chart" aria-hidden="true">
                {[
                  25, 39, 32, 55, 44, 70, 53, 87, 61, 100, 72, 82, 56, 72, 42,
                  59, 35, 46, 29, 38, 21, 32, 24, 18,
                ].map((h, i) => (
                  <i key={i} style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="cadence-labels">
                <span>Less noise</span>
                <span>More signal</span>
              </div>
              <div className="pace-footer">
                <span className="small-dot" />
                <span>
                  {feed?.mode === "demo"
                    ? "Live cadence available on setup"
                    : "Checks every 15 minutes"}
                </span>
              </div>
            </section>
            <section className="links-card">
              <h3>Around the ecosystem</h3>
              <a href="https://imd.fun/docs/" target="_blank" rel="noreferrer">
                <span>
                  <Icon name="article" size={16} />
                  The documentation
                </span>
                <Icon name="arrow" size={14} />
              </a>
              <a
                href="https://explorer.imd.fun"
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  <Icon name="globe" size={16} />
                  The contributor explorer
                </span>
                <Icon name="arrow" size={14} />
              </a>
              <a href="https://imd.fun/token/" target="_blank" rel="noreferrer">
                <span>
                  <span className="token-symbol">$</span>About $IMD
                </span>
                <Icon name="arrow" size={14} />
              </a>
            </section>
            <div className="rail-footer">
              <span>Made for the curious.</span>
              <span>Built around the swarm.</span>
              <button onClick={openAbout}>
                About Signal <Icon name="arrow" size={12} />
              </button>
            </div>
          </aside>
        </div>
        <footer className="site-footer">
          <span>
            <span className="tiny-diamond" /> Signal / Identity-MD
          </span>
          <span>Many voices. A clearer picture.</span>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "instant" })}
          >
            Back to top ↑
          </button>
        </footer>
      </div>
      <div className="toast" hidden={!message}>
        <span role="status">{message}</span>
        {undo ? (
          <button
            onClick={() => {
              setHidden((v) => v.filter((id) => id !== undo));
              setUndo(null);
              setMessage("Signal restored to your feed.");
            }}
          >
            Undo
          </button>
        ) : null}
        <button
          aria-label="Dismiss notification"
          onClick={() => {
            setMessage("");
            setUndo(null);
          }}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <dialog
        ref={dialog}
        className="about-dialog"
        aria-labelledby="about-title"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls =
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button, a[href], input, select",
            );
          const first = controls[0],
            last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onClose={() => dialogTrigger.current?.focus()}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close();
        }}
      >
        <div className="dialog-content">
          <div className="dialog-top">
            <span className="eyebrow">
              <span className="tiny-diamond" /> Behind the signal
            </span>
            <button
              className="icon-button"
              aria-label="Close about this feed"
              onClick={() => dialog.current?.close()}
            >
              <Icon name="close" />
            </button>
          </div>
          <h2 id="about-title">A clearer view of the swarm.</h2>
          <p>
            Signal brings Identity-MD and $IMD coverage into one chronological
            feed. Expand entries to read more, save a good find, or hide what
            you’ve already seen.
          </p>
          <section>
            <h3>
              <Icon name="globe" /> Where entries come from
            </h3>
            <p>
              {feed?.mode === "demo"
                ? "You’re viewing sample entries, written to demonstrate the feed. They are not real posts or current project announcements. Sample links lead to the official site or a platform search."
                : "You’re viewing a collected feed snapshot. Each entry links to its original source."}
            </p>
            <p>
              The included collector supports RSS, Atom, JSON feeds, Bluesky,
              and authorized X access. A publisher must configure and schedule
              it to enable ongoing live coverage.
            </p>
          </section>
          <section>
            <h3>
              <Icon name="shield" /> Substance over repetition
            </h3>
            <p>
              Project relevance comes first. Replies, reposts, ticker-only text,
              obvious spam, and near-duplicate copy are filtered out. Original
              images and memes are welcome. Automated checks are fallible;
              original links keep context close.
            </p>
          </section>
          <section>
            <h3>
              <Icon name="clock" /> Fresh at a sensible pace
            </h3>
            <p>
              The collector is designed to run every 15 minutes, with
              conditional requests and backoff for unavailable sources. This
              page checks its snapshot every 5 minutes while visible. New
              entries wait for you to show them.
            </p>
          </section>
          <p className="dialog-footnote">
            Saved and hidden entries stay in this browser. No account or wallet
            needed.
          </p>
          <button
            className="button primary"
            onClick={() => dialog.current?.close()}
          >
            Back to the feed <Icon name="arrow" size={15} />
          </button>
        </div>
      </dialog>
    </>
  );
}
function FeedCard({
  entry,
  saved,
  hidden,
  onSave,
  onHide,
}: {
  entry: Entry;
  saved: boolean;
  hidden: boolean;
  onSave: () => void;
  onHide: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const paragraphs = entry.text.split("\n").filter(Boolean);
  const preview = paragraphs.slice(0, entry.title ? 1 : 2).join("\n\n");
  const time = new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(entry.publishedAt));
  const initial = entry.author
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
  return (
    <article
      className={`feed-card ${entry.image && !imageFailed ? "has-media" : ""} ${expanded ? "expanded" : ""}`}
      data-entry-id={entry.id}
    >
      <div className="card-header">
        <div
          className={`avatar avatar-${entry.source.toLowerCase()}`}
          aria-hidden="true"
        >
          {entry.source === "X" ? (
            <span className="avatar-diamond">◇</span>
          ) : (
            initial
          )}
        </div>
        <div className="author-info">
          <div className="author-name">
            {entry.author}
            {entry.sample && <span className="sample-label">Sample</span>}
          </div>
          <div className="entry-meta">
            <SourceIcon source={entry.source} />
            <span>{entry.source === "Web" ? "Web & blogs" : entry.source}</span>
            <span>·</span>
            <time
              dateTime={entry.publishedAt}
              title={`${dateLabel(entry.publishedAt)}, ${time} UTC`}
            >
              {dateLabel(entry.publishedAt)} · {time}
            </time>
          </div>
        </div>
        <span className="kind-badge">
          <Icon
            name={
              entry.kind === "Video"
                ? "play"
                : entry.kind === "Story"
                  ? "spark"
                  : entry.kind.toLowerCase()
            }
            size={12}
          />
          {entry.kind}
        </span>
        <button
          className="icon-button hide-button"
          aria-label={`${hidden ? "Restore" : "Hide"} entry by ${entry.author}`}
          title={hidden ? "Restore entry" : "Hide entry"}
          onClick={onHide}
        >
          <Icon name={hidden ? "refresh" : "hide"} size={16} />
        </button>
      </div>
      <div className="card-body">
        <div className="entry-copy">
          {entry.title && <h3>{entry.title}</h3>}
          <div
            id={`body-${entry.id}`}
            className={`entry-text ${expanded ? "" : "clamped"}`}
          >
            {(expanded ? entry.text : preview).split("\n\n").map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
        {entry.image && !imageFailed && (
          <div className="media-frame">
            <img
              src={entry.image}
              alt={
                entry.imageAlt ||
                `${entry.author} — ${entry.title || entry.kind}`
              }
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
            {entry.kind === "Video" && (
              <span className="media-label">
                <Icon name="play" size={12} />
                {entry.sample ? "Video preview" : "Video"}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="card-footer">
        <div>
          <button
            className="read-more"
            aria-expanded={expanded}
            aria-controls={`body-${entry.id}`}
            aria-label={`${expanded ? "Read less" : "Read more"} from ${entry.author}`}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Read less" : "Read more"}
            <Icon
              name="down"
              size={13}
              style={expanded ? { transform: "rotate(180deg)" } : undefined}
            />
          </button>
          {entry.tag && (
            <span className="tag">
              #{entry.tag.toLowerCase().replaceAll(" ", "")}
            </span>
          )}
        </div>
        <div className="entry-actions">
          <a
            href={entry.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`${entry.sample ? "Explore source" : "Open original"} for ${entry.title || entry.author}`}
          >
            {entry.sample ? "Explore source" : "Original"}
            <Icon name="arrow" size={13} />
          </a>
          <button
            className={`icon-button save-button ${saved ? "is-saved" : ""}`}
            onClick={onSave}
            aria-label={`${saved ? "Unsave" : "Save"} entry by ${entry.author}`}
            aria-pressed={saved}
            title={saved ? "Remove from saved" : "Save for later"}
          >
            <Icon name="bookmark" size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
