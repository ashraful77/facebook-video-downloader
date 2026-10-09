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

function friendlyErrorMessage(error, stage = "check") {
  const message = String(error?.message || error || "").trim();
  const lower = message.toLowerCase();

  if (/failed to fetch|networkerror|network request failed|load failed/.test(lower)) {
    return "The free server may be waking up or temporarily unavailable. Wait 30–60 seconds, then try again.";
  }
  if (/private|restricted|age-restricted|login|required|unavailable|unsupported|not found/.test(lower)) {
    return "This video may be private, restricted, removed, or unsupported. Try a public Facebook video link you have permission to download.";
  }
  if (/250\s?mb|larger than/.test(lower)) {
    return "This video is over the 250 MB limit. Please try a smaller video.";
  }
  if (/timed out|timeout|socket/.test(lower)) {
    return "The request took too long. Try again in a moment, or use a shorter video.";
  }
  if (stage === "download") {
    return message && !/^download failed:/i.test(message)
      ? message
      : "The video could not be downloaded right now. Please try again in a moment.";
  }
  return message || "Could not check this video. Please try a public Facebook video link.";
}

async function callApi(path, body) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new Error(friendlyErrorMessage(error, "check"));
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(friendlyErrorMessage(data.error || "The service could not process this link.", "check"));
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
        status.textContent = friendlyErrorMessage(error, "download");
        status.classList.add("error-text");
      } finally {
        downloadButton.disabled = false;
          downloadButton.textContent = "Download Video";
      }
    });
  } catch (error) {
    showResult("Could not process this video", friendlyErrorMessage(error, "check"));
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Check Link <span aria-hidden="true">→</span>';
  }
});


const shareButton = document.querySelector("#share-button");
const shareStatus = document.querySelector("#share-status");

shareButton.addEventListener("click", async () => {
  const shareData = {
    title: "Facebook Video Downloader",
    text: "Download publicly accessible Facebook videos with this free tool.",
    url: window.location.href
  };

  shareStatus.hidden = false;
  shareStatus.textContent = "";

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      shareStatus.textContent = "Thanks for sharing!";
    } catch (error) {
      if (error && error.name !== "AbortError") {
        shareStatus.textContent = "Sharing isn't available here. You can copy the website address from your browser.";
      } else {
        shareStatus.hidden = true;
      }
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(window.location.href);
    shareStatus.textContent = "Website link copied. You can now share it with friends.";
  } catch {
    shareStatus.textContent = "Copy this website address from your browser to share it with friends.";
  }
});
