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

function showResult(title, message) {
  result.replaceChildren();
  result.hidden = false;
  const heading = document.createElement("strong");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  result.append(heading, paragraph);
}

function addMessage(message, className = "result-message") {
  const paragraph = document.createElement("p");
  paragraph.className = className;
  paragraph.textContent = message;
  result.append(paragraph);
  return paragraph;
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

async function callApi(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "The service could not process this link. Please try again.");
  }
  return data;
}

function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds))) return "";
  const value = Math.max(0, Math.floor(Number(seconds)));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
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

  showResult("Checking video…", "Connecting to the free backend. The first request after inactivity may take about a minute.");
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Checking…";

  try {
    const data = await callApi("/api/info", { url: url.href });
    result.replaceChildren();
    result.hidden = false;

    const heading = document.createElement("strong");
    heading.textContent = "Video found";
    const title = document.createElement("p");
    title.className = "video-title";
    title.textContent = data.title || "Facebook video";
    result.append(heading, title);

    if (data.duration) {
      addMessage(`Duration: ${formatDuration(data.duration)}`, "video-meta");
    }

    const qualityNote = document.createElement("p");
    qualityNote.className = "video-meta";
    qualityNote.textContent = "Quality: Best available (original source quality)";
    result.append(qualityNote);

    const downloadButton = document.createElement("button");
    downloadButton.className = "primary-button download-button";
    downloadButton.type = "button";
    downloadButton.textContent = "Download Video";
    result.append(downloadButton);

    const status = document.createElement("p");
    status.className = "download-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    result.append(status);

    downloadButton.addEventListener("click", async () => {
      downloadButton.disabled = true;
      downloadButton.textContent = "Preparing download…";
      status.textContent = "Preparing the best available quality. Keep this page open; larger videos may take a while.";
      status.classList.remove("error-text", "success-text");
      try {
        const response = await fetch(`${API_BASE}/api/download`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.href, quality: "best" })
        });
        const contentType = response.headers.get("content-type") || "";
        if (!response.ok || contentType.includes("application/json")) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "The video could not be downloaded.");
        }
        const blob = await response.blob();
        if (!blob.size) throw new Error("The server returned an empty file. Please try again.");
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = "facebook-video.mp4";
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        status.textContent = "Download started! Check your browser's Downloads folder.";
        status.classList.add("success-text");
      } catch (error) {
        status.textContent = error.message || "Download failed. Try another public video.";
        status.classList.add("error-text");
      } finally {
        downloadButton.disabled = false;
          downloadButton.textContent = "Download Video";
      }
    });
  } catch (error) {
    showResult("Could not process this video", error.message || "This link may be private, unavailable, or unsupported. Please try a public video you are authorized to download.");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Check Link <span aria-hidden="true">→</span>';
  }
});
