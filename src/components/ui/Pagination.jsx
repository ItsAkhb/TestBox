import Button from "./Button";

export default function Pagination({ currentPage, totalPages, onPageChange, labels }) {
  if (totalPages <= 1) return null;

  return (
    <div className="exam-pagination">
      <Button
        variant="secondary"
        disabled={currentPage === 1}
        onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
      >
        {labels?.previous || "← Previous"}
      </Button>
      <span>
        {labels?.page || "Page"} {currentPage} {labels?.of || "of"} {totalPages}
      </span>
      <Button
        variant="secondary"
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
      >
        {labels?.next || "Next →"}
      </Button>
    </div>
  );
}
