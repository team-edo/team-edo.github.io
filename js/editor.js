(() => {
  "use strict";

  const editor = document.querySelector("[data-editor-api]");
  if (!editor) return;
  const api = new URL(editor.dataset.editorApi.replace(/\/?$/, "/"));
  const canEdit = editor.dataset.editorWrites === "true";
  const login = editor.querySelector("[data-editor-login]");
  const form = editor.querySelector("[data-editor-form]");
  const save = form?.querySelector('button[type="submit"]');
  const status = editor.querySelector("[data-editor-status]");
  const back = document.querySelector("[data-editor-back]");
  const query = new URLSearchParams(location.search);
  const storageKey = "team-edo-post-editor";
  let post = canEdit ? query.get("post") : null;
  let returnPath = query.get("return");
  let session;
  let version;

  const encode = (bytes) => btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
  const setStatus = (message) => { status.textContent = message; };

  function setBackLink(path) {
    if (typeof path === "string" && path.startsWith("/posts/")) {
      const url = new URL(path, location.origin);
      if (url.origin === location.origin && url.pathname.startsWith("/posts/")) {
        back.href = url.href;
        back.textContent = "← 글로 돌아가기";
      }
    }
  }

  async function call(path, method = "GET", body, token) {
    const headers = {};
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = "Bearer " + token;
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
    if (!response.ok) throw new Error(result.error || "요청을 처리할 수 없습니다.");
    return result;
  }

  login.addEventListener("click", async () => {
    login.disabled = true;
    try {
      const config = await call("config");
      const authorize = new URL(config.authorize);
      if (authorize.href !== "https://github.com/login/oauth/authorize" ||
          config.redirectUri !== location.origin + location.pathname) {
        throw new Error("편집 로그인 설정을 확인해 주세요.");
      }
      const state = random();
      const verifier = random();
      const challenge = encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
      sessionStorage.setItem(storageKey, JSON.stringify({state, verifier, post, returnPath}));
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

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!session || save.disabled) return;
    save.disabled = true;
    setStatus("저장 중입니다.");
    try {
      const {status: result} = await call("post", "PUT", {
        title: form.elements.title.value, markdown: form.elements.markdown.value, version,
      }, session);
      if (result !== "saved" && result !== "unchanged") throw new Error("저장 결과를 확인할 수 없습니다.");
      session = undefined;
      form.hidden = true;
      setStatus(result === "saved" ? "저장했습니다. 자동 배포가 끝나면 공개 글에 반영됩니다." : "변경된 내용이 없습니다.");
      back.focus();
    } catch (error) {
      setStatus(error.message);
    } finally {
      save.disabled = false;
    }
  });

  async function openEditor() {
    if (query.has("code") || query.has("error")) {
      let pending;
      try {
        pending = JSON.parse(sessionStorage.getItem(storageKey));
        sessionStorage.removeItem(storageKey);
      } catch {
        pending = null;
      }
      const callbackMatches = pending && pending.state === query.get("state");
      post = callbackMatches && canEdit ? pending.post : null;
      returnPath = callbackMatches ? pending.returnPath : null;
      const cleanUrl = new URL(location.pathname, location.origin);
      if (post) cleanUrl.searchParams.set("post", post);
      if (returnPath) cleanUrl.searchParams.set("return", returnPath);
      history.replaceState(null, "", cleanUrl);
      if (post) document.getElementById("editor-title").textContent = "글 수정";
      setBackLink(returnPath);
      if (!callbackMatches || !query.get("code")) {
        setStatus("로그인을 완료하지 못했습니다. GitHub로 다시 로그인해 주세요.");
        login.hidden = false;
        return;
      }
      setStatus("작성자 계정을 확인하고 있습니다.");
      try {
        const result = await call("session", "POST", {post, code: query.get("code"), verifier: pending.verifier});
        if (result.status === "verified") {
          setStatus(canEdit && !post
            ? "GitHub 작성자 확인이 완료됐습니다. 수정할 글에서 글 수정 버튼을 눌러 주세요."
            : "GitHub 작성자 확인이 완료됐습니다. 현재는 계정 확인만 할 수 있습니다.");
          return;
        }
        if (!form || !result.session) throw new Error("작성자 확인 결과를 확인할 수 없습니다.");
        session = result.session;
        version = result.version;
        form.elements.title.value = result.title;
        form.elements.markdown.value = result.markdown;
        form.hidden = false;
        setStatus("제목과 본문을 수정할 수 있습니다.");
        form.elements.title.focus();
      } catch (error) {
        setStatus(error.message);
        login.hidden = false;
      }
      return;
    }
    if (post) document.getElementById("editor-title").textContent = "글 수정";
    setBackLink(returnPath);
    login.hidden = false;
  }

  void openEditor();
})();
