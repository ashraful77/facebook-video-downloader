const form = document.querySelector("#link-form");
const input = document.querySelector("#video-url");
const result = document.querySelector("#result");
const pasteButton = document.querySelector("#paste-button");

const API_BASE = "https://facebook-video-downloader-api-amxr.onrender.com";
const facebookHosts = new Set([
  "facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com",
  "fb.watch", "www.fb.watch"
]);

function isFacebookHost(hostname) {
  const host = hostname.toLowerCase();
  return facebookHosts.has(host) || host.endsWith(".facebook.com") || host === "fb.watch" || host.endsWith(".fb.watch");
}

function showResult(title, message, link) {
  result.replaceChildren();
  result.hidden = false;
  const heading = document.createElement("strong");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  result.append(heading, paragraph);
  if (link) {
    const anchor = document.createElement("a");
    anchor.className = "action-link";
    anchor.href = link.href;
    anchor.textContent = link.text;
    if (link.external) {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
    result.append(anchor);
  }
}

pasteButton.addEventListener("click", async () => {
  try {
    const pasted = await navigator.clipboard.readText();
    if (pasted) {
      input.value = pasted.trim();
      input.focus();
    } else {
      showResult("Clipboard is empty", "Copy a Facebook video link first, then tap Paste again.");
    }
  } catch {
    input.focus();
    showResult("Paste your link", "Your browser does not allow clipboard access here. Press and hold the input box, then choose Paste.");
  }
});

async function callApi(path, url) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "The service could not process this link. Please try again.");
  }
  return data;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const raw = input.value.trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    showResult("Enter a valid link", "Paste a complete link beginning with https://.");
    return;
  }
  if (url.protocol !== "https:" || !isFacebookHost(url.hostname)) {
    showResult("Facebook links only", "Please paste a public Facebook video link beginning with https://.");
    return;
  }

  showResult("Checking video…", "Connecting to the free backend. The first request may take a little longer if the service was sleeping.");
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Please wait…";

  try {
    const data = await callApi("/api/info", url.href);
    result.replaceChildren();
    result.hidden = false;
    const heading = document.createElement("strong");
    heading.textContent = "Video found";
    const paragraph = document.createElement("p");
    paragraph.textContent = data.title || "Facebook video";
    result.append(heading, paragraph);

    const downloadButton = document.createElement("button");
    downloadButton.className = "primary-button";
    downloadButton.type = "button";
    downloadButton.textContent = "Download Video";
    downloadButton.addEventListener("click", async () => {
      downloadButton.disabled = true;
      downloadButton.textContent = "Preparing download…";
      const note = document.createElement("p");
      note.textContent = "Please keep this page open while the video is prepared.";
      result.append(note);
      try {
        const response = await fetch(`${API_BASE}/api/download`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.href })
        });
        const contentType = response.headers.get("content-type") || "";
        if (!response.ok || contentType.includes("application/json")) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "The video could not be downloaded.");
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = "facebook-video.mp4";
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        note.textContent = "Download started. Check your browser's Downloads folder.";
      } catch (error) {
        note.textContent = error.message || "Download failed. Try another public video link.";
      } finally {
        downloadButton.disabled = false;
        downloadButton.textContent = "Download Video";
      }
    });
    result.append(downloadButton);
    if (data.duration) {
      const duration = document.createElement("p");
      duration.textContent = `Duration: ${Math.floor(data.duration / 60)}:${String(Math.floor(data.duration % 60)).padStart(2, "0")}`;
      result.append(duration);
    }
  } catch (error) {
    showResult("Could not process this video", error.message || "This link may be private, unavailable, or unsupported. Please try a public video you are authorized to download.");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Check Link <span aria-hidden="true">→</span>';
  }
});
