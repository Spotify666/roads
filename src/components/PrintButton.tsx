"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print rounded-md bg-sign px-4 py-2.5 font-medium text-white transition-transform duration-150 active:scale-[0.97]"
    >
      Print or save as PDF
    </button>
  );
}
