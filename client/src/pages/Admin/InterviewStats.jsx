import React, { useEffect, useMemo, useState } from "react";
import { axiosInstance } from "../../helpers/axiosInstance";
import "../../resourses/interview-stats.css";

// /statistics-interviews (super admins): everyone who came to the WhatsApp bot for
// interview practice, paid or not, with their numbers as a downloadable Excel file.
// Follow-ups to those who did not pay are sent by the bot (INTERVIEW_FOLLOWUPS=1).

const FILTERS = [
  ["notPaid", "Not paid"],
  ["stuck", "Stuck on paying"],
  ["paid", "Paid"],
  ["all", "Everyone"],
];

const local = (n) => (n.startsWith("263") && n.length === 12 ? `0${n.slice(3)}` : n);
const when = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function InterviewStats() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("notPaid");
  const [query, setQuery] = useState("");
  const [downloading, setDownloading] = useState(false);

  const load = () => {
    setError("");
    axiosInstance
      .get("/api/interview-stats")
      .then((r) => setData(r.data.data))
      .catch((e) => setError(e.response?.data?.message || e.message));
  };
  useEffect(load, []);

  const people = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s/g, "");
    return (data?.people || []).filter((p) => {
      if (filter === "paid" && !p.paid) return false;
      if (filter === "notPaid" && p.paid) return false;
      if (filter === "stuck" && !p.stuckOnPay) return false;
      if (!q) return true;
      return `${p.number}${local(p.number)}${p.name}${p.topic}`.toLowerCase().replace(/\s/g, "").includes(q);
    });
  }, [data, filter, query]);

  const download = async () => {
    setDownloading(true);
    try {
      const r = await axiosInstance.get("/api/interview-stats/export", { responseType: "blob" });
      const name =
        /filename="([^"]+)"/.exec(r.headers["content-disposition"] || "")?.[1] || "interview-users.xlsx";
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError("The Excel file could not be downloaded. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const s = data?.summary;
  const labels = data?.stageLabels || {};
  const count = (id) =>
    id === "all" ? s?.total : id === "paid" ? s?.paid : id === "stuck" ? s?.stuckOnPay : s?.notPaid;

  return (
    <div className="is-page">
      <div className="is-head">
        <div>
          <h1>Interview statistics</h1>
          <p>Everyone who came to the WhatsApp bot for interview practice.</p>
        </div>
        <div className="is-actions">
          <button type="button" className="is-btn is-btn--ghost" onClick={load}>
            Refresh
          </button>
          <button type="button" className="is-btn" onClick={download} disabled={downloading || !data}>
            {downloading ? "Preparing…" : "⬇ Download Excel"}
          </button>
        </div>
      </div>

      {error && <p className="is-error">{error}</p>}
      {!data && !error && <p className="is-muted">Loading…</p>}

      {s && (
        <>
          <div className="is-cards">
            <div className="is-card">
              <span>Came for interviews</span>
              <strong>{s.total}</strong>
            </div>
            <div className="is-card is-card--good">
              <span>Paid</span>
              <strong>{s.paid}</strong>
              <small>{s.conversion}% of all</small>
            </div>
            <div className="is-card is-card--warn">
              <span>Not paid</span>
              <strong>{s.notPaid}</strong>
            </div>
            <div className="is-card is-card--hot">
              <span>Stuck on paying</span>
              <strong>{s.stuckOnPay}</strong>
              <small>saw the price or started paying</small>
            </div>
            <div className="is-card">
              <span>Followed up</span>
              <strong>{s.followedUp}</strong>
              <small>{s.paidAfterFollowup} paid after a follow-up</small>
            </div>
          </div>

          <p className={`is-followups${data.followupsOn ? " is-on" : ""}`}>
            {data.followupsOn
              ? "✅ Follow-ups are on: those who did not pay get up to 2 WhatsApp reminders inside WhatsApp's free 24-hour window."
              : "⏸ Follow-ups are off on this server (set INTERVIEW_FOLLOWUPS=1 in the careers bot's .env to switch them on)."}
            {s.optedOut ? ` ${s.optedOut} asked to stop.` : ""}
          </p>

          <div className="is-stages" aria-label="How far people got">
            {Object.entries(s.byStage).map(([stage, n]) => (
              <div key={stage}>
                <span>{labels[stage] || stage}</span>
                <i style={{ width: `${s.total ? (100 * n) / s.total : 0}%` }} />
                <b>{n}</b>
              </div>
            ))}
          </div>

          <div className="is-tools">
            <div className="is-chips" role="tablist">
              {FILTERS.map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={filter === id}
                  className={filter === id ? "is-active" : ""}
                  onClick={() => setFilter(id)}
                >
                  {name} <em>{count(id)}</em>
                </button>
              ))}
            </div>
            <input
              type="search"
              placeholder="Search number, name or topic"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {people.length === 0 ? (
            <p className="is-muted">Nobody here yet.</p>
          ) : (
            <div className="is-table" role="table">
              <div className="is-row is-row--head" role="row">
                <span>WhatsApp</span>
                <span>Name</span>
                <span>Status</span>
                <span>Topic</span>
                <span>Last message</span>
                <span>Follow-ups</span>
              </div>
              {people.map((p) => (
                <div className="is-row" role="row" key={p.number}>
                  <span data-label="WhatsApp">
                    <a href={`https://wa.me/${p.number}`} target="_blank" rel="noreferrer">
                      {local(p.number)}
                    </a>
                  </span>
                  <span data-label="Name">{p.name || "—"}</span>
                  <span data-label="Status">
                    <b className={`is-tag is-tag--${p.stage}`}>{labels[p.stage] || p.stage}</b>
                  </span>
                  <span data-label="Topic">{p.topic || "—"}</span>
                  <span data-label="Last message">{when(p.lastSeen)}</span>
                  <span data-label="Follow-ups">
                    {p.followups}
                    {p.optedOut ? " · stopped" : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
