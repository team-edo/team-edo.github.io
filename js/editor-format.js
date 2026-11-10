(() => {
  "use strict";

  const composer = document.querySelector("[data-post-composer]");
  if (!composer) return;

  const form = composer.closest("form");
  const { title, markdown: source } = form.elements;
  const preview = composer.querySelector("#post-preview");
  const previewTitle = preview.querySelector(".post-preview-title");
  const previewBody = preview.querySelector("[data-preview-body]");
  const note = form.querySelector("[data-composer-status]");
  const viewButtons = composer.querySelectorAll("[data-view]");
  const disclosures = composer.querySelectorAll("[data-disclosure]");
  const colorMenu = composer.querySelector("#post-color-menu");
  const colorInput = colorMenu.querySelector("#post-color-value");
  const picker = colorMenu.querySelector("#post-color-picker");
  const colorHint = colorMenu.querySelector("#post-color-hint");
  const colorApply = colorMenu.querySelector("[data-color-apply]");
  const md = window.markdownit?.({ html: false, typographer: true });
  const colorDestination = /^#edo-color-([0-9a-f]{6})$/;
  const colorSpan = /\[((?:\\.|[^\]\\\n])+)\]\(#edo-color-[0-9a-f]{6}\)/g;
  const backtick = String.fromCharCode(96);
  const marks = { bold: "**", italic: "*", strike: "~~", code: backtick };
  const prefixes = { heading: "## ", quote: "> ", list: "- ", task: "- [ ] ", ordered: "1. " };
  let renderTimer;
  const bar = composer.querySelector(".post-composer-bar");
  new ResizeObserver(() => {
    composer.style.setProperty("--post-toolbar-height", bar.offsetHeight + 2 + "px");
  }).observe(bar);

  if (md) md.validateLink = (url) => /^(?:https?:|mailto:)/i.test(url) || !/^[^/?#]*:/.test(url);

  function postURL() {
    const target = document.querySelector("[data-editor-back]")?.href;
    const url = new URL(target || "/", location.origin);
    return url.origin === location.origin ? url : new URL("/", location.origin);
  }

  function render() {
    clearTimeout(renderTimer);
    if (preview.hidden || form.hidden) return;
    previewTitle.textContent = title.value.trim() || "제목 없음";
    if (!md || !source.value.trim()) {
      previewBody.textContent = md ? "본문을 입력하면 여기에 표시됩니다." : "미리보기를 불러오지 못했습니다.";
      return;
    }

    // Markdown is parsed with HTML disabled. Only the color fragment has custom output.
    const content = document.createElement("template");
    content.innerHTML = md.render(source.value);
    const base = postURL();
    for (const link of content.content.querySelectorAll("a")) {
      const color = colorDestination.exec(link.getAttribute("href"))?.[1];
      if (color) {
        const span = document.createElement("span");
        span.style.color = "#" + color;
        span.append(...link.childNodes);
        link.replaceWith(span);
      } else {
        try {
          const url = new URL(link.getAttribute("href"), base);
          if (!["https:", "http:", "mailto:"].includes(url.protocol)) throw new Error();
          link.href = url.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        } catch {
          link.removeAttribute("href");
        }
      }
    }
    for (const image of content.content.querySelectorAll("img")) {
      try {
        const url = new URL(image.getAttribute("src"), base);
        if (!["https:", "http:"].includes(url.protocol)) throw new Error();
        image.referrerPolicy = "no-referrer";
        image.loading = "lazy";
        image.src = url.href;
      } catch {
        image.replaceWith(document.createTextNode(image.alt));
      }
    }
    for (const item of content.content.querySelectorAll("li")) {
      const first = item.firstChild;
      const text = first?.nodeType === Node.TEXT_NODE ? first : first?.firstChild;
      const marker = text?.nodeType === Node.TEXT_NODE && /^\[([ xX])\]\s+/.exec(text.data);
      if (!marker) continue;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.disabled = true;
      checkbox.checked = marker[1].toLowerCase() === "x";
      checkbox.setAttribute("aria-label", checkbox.checked ? "완료" : "미완료");
      text.data = text.data.slice(marker[0].length);
      text.before(checkbox);
    }
    previewBody.replaceChildren(content.content);
  }

  function scheduleRender() {
    if (preview.hidden) return;
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 100);
  }

  function setView(view) {
    const showPreview = view === "preview";
    preview.hidden = !showPreview;
    composer.classList.toggle("post-composer-live", showPreview);
    for (const button of viewButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.view === view));
    }
    if (showPreview) render();
  }

  for (const button of viewButtons) {
    button.addEventListener("click", () => setView(button.dataset.view));
  }
  title.addEventListener("input", scheduleRender);
  source.addEventListener("input", scheduleRender);
  form.addEventListener("post-editor:loaded", render);
  form.addEventListener("reset", () => {
    setView("source");
    closeMenus();
    previewBody.replaceChildren();
    previewTitle.textContent = "";
    note.textContent = "";
  });

  function closeMenus() {
    for (const button of disclosures) {
      document.getElementById(button.getAttribute("aria-controls")).hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
  }

  for (const button of disclosures) {
    const menu = document.getElementById(button.getAttribute("aria-controls"));
    button.addEventListener("click", () => {
      const open = menu.hidden;
      closeMenus();
      if (open) {
        menu.hidden = false;
        button.setAttribute("aria-expanded", "true");
        menu.querySelector("button").focus({ preventScroll: true });
      }
    });
  }
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("[data-disclosure], .post-composer-menu")) closeMenus();
  });
  composer.addEventListener("keydown", (event) => {
    const open = [...disclosures].find((button) => button.getAttribute("aria-expanded") === "true");
    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeMenus();
      open.focus();
    }
  });

  function replaceSelection(start, end, replacement, message, selection) {
    source.setRangeText(replacement, start, end, "select");
    if (selection) source.setSelectionRange(start + selection[0], start + selection[1]);
    closeMenus();
    source.focus();
    note.textContent = message;
    scheduleRender();
  }

  function applyFormat(format) {
    let start = source.selectionStart;
    let end = source.selectionEnd;
    let selected = source.value.slice(start, end);
    let replacement;
    let selection;
    if (Object.hasOwn(marks, format)) {
      const mark = marks[format];
      if (selected.startsWith(mark) && selected.endsWith(mark) && selected.length > mark.length * 2) {
        replacement = selected.slice(mark.length, -mark.length);
      } else {
        replacement = mark + (selected || "문구") + mark;
        if (!selected) selection = [mark.length, replacement.length - mark.length];
      }
    } else if (Object.hasOwn(prefixes, format)) {
      start = start > 0 ? source.value.lastIndexOf("\n", start - 1) + 1 : 0;
      const nextBreak = source.value.indexOf("\n", end);
      end = nextBreak < 0 ? source.value.length : nextBreak;
      selected = source.value.slice(start, end);
      replacement = selected.split("\n").map((line, index) => {
        const prefix = format === "ordered" ? String(index + 1) + ". " : prefixes[format];
        return prefix + (line || "항목");
      }).join("\n");
    } else if (format === "link" || format === "image") {
      const label = selected || (format === "image" ? "이미지 설명" : "링크 문구");
      const prefix = (format === "image" ? "![" : "[") + escapeLabel(label) + "](";
      replacement = prefix + "https://)";
      selection = [prefix.length, replacement.length - 1];
    } else {
      const fence = backtick.repeat(3);
      const blocks = {
        fence: fence + "\n" + (selected || "코드를 입력하세요") + "\n" + fence,
        table: "| 항목 | 설명 |\n| --- | --- |\n| 내용 | 내용 |",
        rule: "---",
      };
      replacement = "\n\n" + blocks[format] + "\n\n";
    }
    replaceSelection(start, end, replacement, "서식을 적용했습니다.", selection);
  }

  function escapeLabel(text) {
    return text.replace(/(?<!\\)(?:\\\\)*[\[\]]/g, (match) => match.slice(0, -1) + "\\" + match.slice(-1));
  }

  function applyColor(color) {
    let start = source.selectionStart;
    let end = source.selectionEnd;
    let selected = source.value.slice(start, end);
    if (!selected.trim() || selected.includes("\n")) {
      note.textContent = "글자 색을 적용할 한 줄 안의 문구를 선택하세요.";
      source.focus();
      return;
    }

    const existing = [...source.value.matchAll(colorSpan)].find((match) =>
      start >= match.index && end <= match.index + match[0].length);
    if (existing) {
      start = existing.index;
      end = start + existing[0].length;
      selected = existing[1];
    }
    if (color === "default" && !existing) {
      note.textContent = "선택한 문구에는 지정된 색이 없습니다.";
      return;
    }
    if (color === "default") {
      replaceSelection(start, end, selected, "기본 글자색으로 되돌렸습니다.");
    } else {
      replaceSelection(start, end, "[" + escapeLabel(selected) + "](#edo-color-" + color + ")", "글자 색을 적용했습니다.");
    }
  }

  function parseColor(value) {
    const input = value.trim();
    const hex = /^#?([0-9a-f]{6})$/i.exec(input);
    if (hex) return hex[1].toLowerCase();
    const rgb = /^(?:rgb\(([^()]*)\)|([^()]*))$/i.exec(input);
    const channels = (rgb?.[1] ?? rgb?.[2] ?? "").split(",").map((channel) => channel.trim());
    if (channels.length !== 3 || channels.some((channel) => !/^\d{1,3}$/.test(channel) || Number(channel) > 255)) return null;
    return channels.map((channel) => Number(channel).toString(16).padStart(2, "0")).join("");
  }

  function updateColorHint(color) {
    colorInput.setAttribute("aria-invalid", String(!color));
    if (!color) {
      colorHint.textContent = "HEX 6자리 또는 0~255 사이의 RGB 값 3개를 입력하세요.";
      return;
    }
    const [r, g, b] = color.match(/../g).map((part) => {
      const level = parseInt(part, 16) / 255;
      return level <= 0.04045 ? level / 12.92 : ((level + 0.055) / 1.055) ** 2.4;
    });
    const contrast = 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
    colorHint.textContent = contrast < 4.5 ? "흰 배경에서 글자가 흐리게 보일 수 있습니다." : "RGB 예시 123, 63, 161";
  }

  colorInput.addEventListener("input", () => {
    const color = parseColor(colorInput.value);
    if (color) picker.value = "#" + color;
    updateColorHint(color);
  });
  picker.addEventListener("input", () => {
    colorInput.value = picker.value.toUpperCase();
    updateColorHint(picker.value.slice(1));
  });
  colorApply.addEventListener("click", () => {
    const color = parseColor(colorInput.value);
    updateColorHint(color);
    if (color) applyColor(color);
    else colorInput.focus();
  });
  colorInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    colorApply.click();
  });

  for (const button of composer.querySelectorAll("[data-format]")) {
    button.addEventListener("click", () => applyFormat(button.dataset.format));
  }
  for (const button of composer.querySelectorAll("[data-color]")) {
    button.addEventListener("click", () => applyColor(button.dataset.color));
  }
})();
