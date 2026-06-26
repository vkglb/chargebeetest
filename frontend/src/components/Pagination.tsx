interface Props {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

// Simple Prev / Next pager with a "showing X–Y of N" summary. Renders nothing
// when everything fits on one page.
export default function Pagination({ page, pageCount, total, pageSize, onChange }: Props) {
  if (pageCount <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="pagination">
      <span className="page-info">
        {from}–{to} of {total}
      </span>
      <div className="page-controls">
        <button className="btn-ghost page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          ← Prev
        </button>
        <span className="page-cur">
          Page {page} / {pageCount}
        </span>
        <button
          className="btn-ghost page-btn"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
