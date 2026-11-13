// The toolbar button focuses the open downloader tab or opens a new one.
// runtime.getContexts sees the extension's own pages without the "tabs" permission;
// the page URL is compared without its fragment (the skip link adds one).
async function openPage(): Promise<void> {
  const url = chrome.runtime.getURL("index.html");
  const open = (
    await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.TAB],
    })
  ).find((context) => context.documentUrl?.split("#")[0] === url);
  if (open) {
    await chrome.tabs.update(open.tabId, { active: true });
    await chrome.windows.update(open.windowId, { focused: true });
  } else await chrome.tabs.create({ url });
}
chrome.action.onClicked.addListener(() => void openPage());
// The browser test calls it directly: Playwright cannot click the toolbar icon.
Object.assign(globalThis, { openPage });
