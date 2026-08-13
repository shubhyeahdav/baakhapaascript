// Save an axios blob response to the user's disk.
//
// Anchor-click is still the only way to name a downloaded file from the
// browser, so the dance below (create URL, create anchor, click, clean up) is
// unavoidable — but it only needs writing once. Revoking the object URL
// matters: without it every export leaks its blob for the life of the tab.
export function downloadBlob(data, filename) {
  const url = window.URL.createObjectURL(new Blob([data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// Strip characters that browsers and file systems handle badly, so a project
// title can be used as a filename. Falls back when nothing usable remains.
export function safeFilename(title, fallback = "script") {
  return (title || "").replace(/[^\w\- ]+/g, "").trim() || fallback;
}
