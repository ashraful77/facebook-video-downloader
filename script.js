const form = document.querySelector("#link-form");
const input = document.querySelector("#video-url");
const result = document.querySelector("#result");
const pasteButton = document.querySelector("#paste-button");

const facebookHosts = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "web.facebook.com",
  "fb.watch",
  "www.fb.watch",
  "fbcdn.net",
  "scontent.xx.fbcdn.net"
]);

function isFacebookHost(hostname) {
  const host = hostname.toLowerCase();
  return facebookHosts.has(host) || host.endsWith(".facebook.com") || host.endsWith(".fbcdn.net");
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

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const raw = input.value.trim();

  let url;
  try {
    url = new URL(raw);
  } catch {
    showResult("Enter a valid link", "Paste a complete link beginning with https://.");
    return;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    showResult("Unsupported link", "Please use a normal web link beginning with http:// or https://.");
    return;
  }

  if (!isFacebookHost(url.hostname)) {
    showResult("Facebook links only", "Please paste a link hosted on Facebook or its video CDN.");
    return;
  }

  const looksLikeDirectVideo = /\.mp4(?:$|[?#])/i.test(url.pathname + url.search);

  if (looksLikeDirectVideo) {
    showResult(
      "Direct video link detected",
      "Your browser will try to open the video file. Depending on the source server, it may play in a new tab instead of downloading.",
      { href: url.href, text: "Open video file", external: true }
    );
    return;
  }

  showResult(
    "This Facebook page link cannot be extracted here",
    "This website has no backend, so it cannot turn a regular Facebook video page into a downloadable file. If Facebook provides a direct video-file link that you are allowed to download, paste that link instead.",
    { href: url.href, text: "Open link on Facebook", external: true }
  );
});