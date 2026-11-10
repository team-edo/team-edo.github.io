(() => {
  "use strict";

  const editor = document.querySelector("[data-blog-editor]");
  if (!editor) return;

  const api = new URL(editor.dataset.blogEditor.replace(/\/?$/, "/"));
  const canEdit = editor.dataset.editorWrites === "true";
  const login = document.querySelector("[data-editor-login]");
  const logout = document.querySelector("[data-editor-logout]");
  const form = document.querySelector("[data-editor-form]");
  const save = form?.querySelector('button[type="submit"]');
  const remove = form?.querySelector("[data-editor-delete]");
  const status = document.querySelector("[data-editor-status]");
  const back = document.querySelector("[data-editor-back]");
  const blogHome = back?.href;
  const review = editor.querySelector("[data-batch-review]");
  const launch = editor.querySelector("[data-batch-open]");
  const count = editor.querySelector("[data-batch-count]");
  const close = editor.querySelector("[data-batch-close]");
  const apply = editor.querySelector("[data-batch-apply]");
  const list = editor.querySelector("[data-batch-items]");
  const summary = editor.querySelector("[data-batch-summary]");
  const alert = editor.querySelector("[data-batch-error]");
  const notice = editor.querySelector("[data-batch-notice]");
  const query = new URLSearchParams(location.search);
  const oauthKey = "team-edo-post-editor";
  const sessionKey = "team-edo-editor-session";
  const loginMessage = "작성자 확인을 위해 GitHub로 로그인해 주세요.";
  const expiredMessage = "편집 로그인 시간이 지났습니다. GitHub로 다시 로그인해 주세요.";
  let post = form ? query.get("post") : null;
  let returnPath = query.get("return");
  let credential;
  let expiresTimer;
  let noticeTimer;
  let entry;
  let queue = { items: [], revision: null };
  let busy = false;
  let queueRequest = 0;
  const focusPage = () => (back ?? document.getElementById("page-top"))?.focus({ preventScroll: true });

  const encode = (bytes) => btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
  const setStatus = (message) => { if (status) status.textContent = message; };

  function setBackLink(path) {
    if (path?.startsWith("/posts/")) {
      const url = new URL(path, location.origin);
      if (url.origin === location.origin && url.pathname.startsWith("/posts/")) {
        back.href = url.href;
        back.textContent = "← 글로 돌아가기";
      }
    }
  }

  function configurePage() {
    if (post) document.getElementById("editor-title").textContent = "글 수정";
    setBackLink(returnPath);
  }

  function setAlert(message) {
    if (!alert) return;
    alert.hidden = !message;
    alert.textContent = message;
  }

  function showNotice(message) {
    if (!notice) return;
    clearTimeout(noticeTimer);
    notice.hidden = false;
    notice.textContent = message;
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 7000);
  }

  function clearSession(message) {
    clearTimeout(expiresTimer);
    credential = undefined;
    try { sessionStorage.removeItem(sessionKey); } catch {}
    if (review?.open) review.close();
    setQueue({ items: [], revision: null });
    entry = undefined;
    if (form) {
      form.reset();
      form.hidden = true;
    }
    if (logout) logout.hidden = true;
    if (login) login.hidden = false;
    setStatus(message);
  }

  function startSession(value) {
    credential = value;
    clearTimeout(expiresTimer);
    expiresTimer = setTimeout(() => clearSession(expiredMessage), Math.max(0, value.expiresAt - Date.now()));
    if (login) login.hidden = true;
    if (logout) logout.hidden = false;
  }

  async function call(path, method = "GET", body, session) {
    const headers = {};
    if (body) headers["Content-Type"] = "application/json";
    if (session) headers.Authorization = "Bearer " + session.token;
    let response;
    try {
      response = await fetch(new URL(path, api), {
        method, headers, body: body ? JSON.stringify(body) : undefined,
        credentials: "omit", redirect: "error", cache: "no-store",
      });
    } catch {
      throw new Error("편집 서버에 연결할 수 없습니다. 다시 시도해 주세요.");
    }
    const result = await response.json().catch(() => ({}));
    if (session && credential !== session) throw new Error(expiredMessage);
    if (!response.ok) {
      if (session && response.status === 401) clearSession(expiredMessage);
      const message = response.status === 429 ? "요청이 많습니다. 잠시 후 다시 시도해 주세요."
        : result.error || "요청을 처리할 수 없습니다.";
      throw Object.assign(new Error(message), {
        status: response.status, post: result.post,
      });
    }
    return result;
  }

  function batch(method, body, target) {
    const params = new URLSearchParams({ mode: "batch" });
    if (target) params.set("post", target);
    return call("post?" + params, method, body, credential);
  }

  function setBusy(value) {
    busy = value;
    if (save) {
      save.disabled = value || entry?.deletePending || isStale();
      remove.disabled = save.disabled;
    }
    if (logout) logout.disabled = value;
    if (apply) {
      apply.disabled = value;
      close.disabled = value;
      list.querySelectorAll("button").forEach((button) => { button.disabled = value; });
    }
  }

  function setQueue(result) {
    queueRequest++;
    queue = result;
    if (!launch) return;
    launch.hidden = !credential || !queue.items.length;
    count.textContent = queue.items.length;
    if (!review.open) return;
    const deleted = queue.items.filter(({ kind }) => kind === "delete").length;
    summary.textContent = `수정 ${queue.items.length - deleted}건 · 삭제 ${deleted}건`;
    list.replaceChildren(...queue.items.map((item) => {
      const row = document.createElement("li");
      const kind = document.createElement("span");
      kind.className = "blog-batch-kind";
      kind.dataset.kind = item.kind;
      kind.textContent = item.kind === "delete" ? "삭제" : "수정";
      const title = document.createElement("strong");
      title.textContent = item.title;
      const undo = document.createElement("button");
      undo.className = "blog-batch-quiet";
      undo.type = "button";
      undo.textContent = "취소";
      undo.disabled = busy;
      undo.setAttribute("aria-label", `${item.title} ${kind.textContent} 대기 취소`);
      undo.addEventListener("click", () => void changeQueue(item));
      row.append(kind, title, undo);
      return row;
    }));
  }

  async function refreshQueue() {
    if (!credential || busy) return;
    const id = ++queueRequest;
    try {
      const result = await batch("GET");
      if (id === queueRequest && !busy) {
        setQueue(result);
        if (review.open && !result.items.length) {
          review.close();
          focusPage();
        }
      }
    } catch (error) {
      if (credential) {
        if (review.open) setAlert(error.message);
        else if (status && !post) setStatus(error.message);
      }
    }
  }

  const isStale = () => Boolean(entry?.draft && entry.draft.version !== entry.version);
  const queuedPost = () => queue.items.find((item) => item.post === post);

  async function loadPost({ preserveInputs = false, focus = false } = {}) {
    if (!post || !credential) return;
    const unsaved = preserveInputs && !form.hidden
      && (form.elements.title.value !== (entry.draft ?? entry).title
        || form.elements.markdown.value !== (entry.draft ?? entry).markdown);
    const next = await batch("GET", undefined, post);
    entry = next;
    setQueue(next.queue);
    if (!unsaved) {
      const content = entry.draft ?? entry;
      form.elements.title.value = content.title;
      form.elements.markdown.value = content.markdown;
    }
    form.hidden = false;
    form.dispatchEvent(new Event("post-editor:loaded"));
    setBusy(busy);
    setStatus(entry.deletePending ? "삭제 대기에 추가했습니다. 공개 글은 반영 전까지 유지됩니다."
      : isStale() ? "공개 글이 바뀌었습니다. 임시 저장본을 복사하고 대기에서 취소한 뒤 최신 글을 확인해 주세요."
      : "임시 저장한 내용은 일괄 반영할 때 공개됩니다.");
    if (focus) form.elements.title.focus();
  }

  async function stage(deleting) {
    if (!credential || busy || !entry) return;
    setBusy(true);
    setStatus(deleting ? "삭제 대기에 추가하고 있습니다." : "임시 저장하고 있습니다.");
    try {
      const body = { post, version: entry.version, item: entry.item };
      if (!deleting) {
        body.title = form.elements.title.value;
        body.markdown = form.elements.markdown.value;
      }
      setQueue(await batch(deleting ? "DELETE" : "PUT", body));
      entry.item = queuedPost()?.item ?? null;
      entry.deletePending = deleting;
      if (!deleting) {
        entry.draft = entry.item ? { title: body.title.trim(), markdown: body.markdown, version: entry.version } : null;
      }
      setStatus(deleting ? "삭제 대기에 추가했습니다. 공개 글은 반영 전까지 유지됩니다."
        : entry.item ? "임시 저장했습니다. 반영 대기에서 확인할 수 있습니다." : "공개 글과 같은 내용입니다.");
      if (deleting) launch.focus();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeQueue(item) {
    if (!credential || busy) return;
    const current = queuedPost();
    setAlert("");
    setBusy(true);
    let changed = false;
    let refresh = false;
    if (!item) apply.textContent = "반영 요청 중…";
    try {
      const result = await batch("POST", item
        ? { action: "undo", post: item.post, item: item.item }
        : { action: "apply", revision: queue.revision });
      setQueue(result);
      changed = true;
      if (!item || !queue.items.length) review.close();
      if (!item) {
        showNotice("반영을 요청했습니다. 자동 배포가 끝나면 공개 블로그에 적용됩니다.");
        if (current?.kind === "delete" && !queuedPost()) {
          form.hidden = true;
          entry = undefined;
          back.href = blogHome;
          back.textContent = "← 블로그로 돌아가기";
          setStatus("삭제를 요청했습니다. 자동 배포가 끝나면 공개 목록에서 사라집니다.");
          back.focus();
        } else if (current) {
          await loadPost({ preserveInputs: true });
        }
      } else if (item.post === post) {
        await loadPost();
      }
    } catch (error) {
      const conflict = queue.items.find(({ post }) => post === error.post);
      const message = conflict ? `${conflict.title} · ${error.message}` : error.message;
      if (review.open) setAlert(message);
      else if (credential) setStatus(message);
      refresh = error.status === 409 && !error.post;
    } finally {
      apply.textContent = "한 번에 반영 요청";
      setBusy(false);
      if (changed && review.open) close.focus();
      else if (changed && launch.hidden) focusPage();
      if (refresh) void refreshQueue();
    }
  }

  login?.addEventListener("click", async () => {
    login.disabled = true;
    try {
      const config = await call("config");
      if (canEdit && config.canBatch !== true) throw new Error("일괄 반영을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.");
      const authorize = new URL(config.authorize);
      if (authorize.href !== "https://github.com/login/oauth/authorize" ||
          config.redirectUri !== location.origin + location.pathname) {
        throw new Error("편집 로그인 설정을 확인해 주세요.");
      }
      const state = random();
      const verifier = random();
      const challenge = encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
      sessionStorage.setItem(oauthKey, JSON.stringify({ state, verifier, post, returnPath }));
      authorize.search = new URLSearchParams({
        client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code",
        scope: "user:email", state, code_challenge: challenge, code_challenge_method: "S256",
      });
      location.assign(authorize);
    } catch (error) {
      setStatus(error.message);
      login.disabled = false;
    }
  });
  logout?.addEventListener("click", () => {
    clearSession(loginMessage);
    login.focus();
  });
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!save.disabled) void stage(false);
  });
  remove?.addEventListener("click", () => void stage(true));

  launch?.addEventListener("click", () => {
    setAlert("");
    review.showModal();
    setQueue(queue);
  });
  close?.addEventListener("click", () => review.close());
  review?.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
  apply?.addEventListener("click", () => void changeQueue());

  async function openEditor() {
    if (login && (query.has("code") || query.has("error"))) {
      let pending;
      try {
        pending = JSON.parse(sessionStorage.getItem(oauthKey));
        sessionStorage.removeItem(oauthKey);
      } catch {}
      const code = query.get("code");
      const matches = pending?.state && pending.state === query.get("state");
      post = matches && form ? pending.post : null;
      returnPath = matches ? pending.returnPath : null;
      const cleanUrl = new URL(location.pathname, location.origin);
      if (post) cleanUrl.searchParams.set("post", post);
      if (returnPath) cleanUrl.searchParams.set("return", returnPath);
      history.replaceState(null, "", cleanUrl);
      configurePage();
      if (!matches || !code) {
        clearSession("로그인을 완료하지 못했습니다. GitHub로 다시 로그인해 주세요.");
        return;
      }
      setStatus("작성자 계정을 확인하고 있습니다.");
      try {
        const result = await call("session", "POST", { code, verifier: pending.verifier, mode: canEdit ? "batch" : undefined });
        if (!canEdit && result.status === "verified") {
          setStatus("GitHub 작성자 확인이 완료됐습니다. 현재는 계정 확인만 할 수 있습니다.");
          return;
        }
        if (typeof result.session !== "string" || !Number.isSafeInteger(result.expiresIn) || result.expiresIn <= 0) {
          throw new Error("작성자 확인 결과를 확인할 수 없습니다.");
        }
        const value = { token: result.session, expiresAt: Date.now() + result.expiresIn * 1000 };
        try { sessionStorage.setItem(sessionKey, JSON.stringify(value)); } catch {}
        startSession(value);
      } catch (error) {
        clearSession(error.message);
        return;
      }
    } else {
      if (login) configurePage();
      let saved;
      if (canEdit) {
        try { saved = JSON.parse(sessionStorage.getItem(sessionKey)); } catch {}
      }
      if (!saved || typeof saved.token !== "string" || !(saved.expiresAt > Date.now())) {
        clearSession(saved ? expiredMessage : loginMessage);
        return;
      }
      startSession(saved);
    }
    if (!post) {
      void refreshQueue();
      setStatus("편집 로그인 상태입니다. 수정할 글에서 ‘글 수정’을 눌러 주세요.");
      return;
    }
    setStatus("글을 불러오고 있습니다.");
    try {
      await loadPost({ focus: true });
    } catch (error) {
      setStatus(error.message);
      void refreshQueue();
    }
  }

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(sessionKey)); } catch {}
    if (saved?.token !== credential?.token || (saved && saved.expiresAt <= Date.now())) location.reload();
    else void refreshQueue();
  });
  void openEditor();
})();
