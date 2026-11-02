// The toolbar button focuses the open downloader tab or opens a new one.
// runtime.getContexts sees the extension's own pages without the "tabs" permission.
chrome.action.onClicked.addListener(() => {
  void (async () => {
    const url = chrome.runtime.getURL("index.html");
    const [open] = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.TAB],
      documentUrls: [url],
    });
    if (open) {
      await chrome.tabs.update(open.tabId, { active: true });
      await chrome.windows.update(open.windowId, { focused: true });
    } else await chrome.tabs.create({ url });
  })();
});
