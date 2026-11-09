(() => {
  "use strict";

  // 모바일 메뉴: 버튼으로 열고 닫으며, Esc를 누르면 닫고 버튼으로 초점을 돌려줍니다.
  const menuButton = document.querySelector("[data-menu-button]");
  const nav = menuButton && document.getElementById(menuButton.getAttribute("aria-controls"));
  if (menuButton && nav) {
    const setOpen = (open) => {
      menuButton.setAttribute("aria-expanded", String(open));
      menuButton.setAttribute("aria-label", open ? "메뉴 닫기" : "메뉴 열기");
      nav.classList.toggle("open", open);
    };
    menuButton.addEventListener("click", () => setOpen(menuButton.getAttribute("aria-expanded") !== "true"));
    nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setOpen(false)));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.classList.contains("open")) {
        setOpen(false);
        menuButton.focus();
      }
    });
    document.addEventListener("click", (event) => {
      if (nav.classList.contains("open") && !nav.contains(event.target) && !menuButton.contains(event.target)) setOpen(false);
    });
  }

  const backToTop = document.querySelector("[data-back-to-top]");
  if (backToTop) {
    const top = document.getElementById("page-top");
    new IntersectionObserver(([entry]) => { backToTop.hidden = entry.isIntersecting; }).observe(top);
  }

  const viewedPost = document.querySelector("[data-view-api]");
  if (viewedPost) {
    fetch(viewedPost.dataset.viewApi, {
      method: "POST", body: viewedPost.dataset.viewPath, credentials: "omit", keepalive: true,
    }).catch(() => {});
  }

  // 추천 글: 이전·다음 버튼과 좌우 방향키로 넘깁니다. 자동 재생은 하지 않습니다.
  // 모든 글을 같은 칸에 겹쳐 두고 보이기만 바꿔서, 글 길이가 달라도 버튼·이미지 위치가 그대로입니다.
  document.querySelectorAll("[data-spotlight]").forEach((spotlight) => {
    const slides = Array.from(spotlight.querySelectorAll("[data-slide]"));
    const visuals = Array.from(spotlight.querySelectorAll("[data-visual]"));
    const controls = spotlight.querySelector("[data-spot-controls]");
    let navigated = false;
    const endpoint = spotlight.dataset.weeklyViews;
    if (endpoint && slides.length > 1) {
      fetch(endpoint, { credentials: "omit", signal: AbortSignal.timeout?.(1500) })
        .then((response) => response.ok ? response.json() : null)
        .then((views) => {
          if (!views || navigated || spotlight.contains(document.activeElement)) return;

          const posts = Array.from(document.querySelectorAll("[data-journal] .post-link"));
          const count = (post) => {
            const score = views[post.getAttribute("href")];
            return Number.isSafeInteger(score) && score > 0 ? score : 0;
          };
          // Stable sort keeps the existing latest-first order for ties and unread posts.
          posts.sort((first, second) => count(second) - count(first));
          posts.slice(0, slides.length).forEach((post, index) => {
            const slide = slides[index];
            const visual = visuals[index];
            const link = slide.querySelector("h2 a");
            const href = post.getAttribute("href");
            if (link.getAttribute("href") === href) return;

            link.setAttribute("href", href);
            link.textContent = post.querySelector("h3").textContent;
            slide.querySelector("p").textContent = post.querySelector(".post-copy p").textContent;
            const category = slide.querySelector(".category");
            category.textContent = post.closest("[data-post]").dataset.spotCategory;
            category.hidden = !category.textContent;

            const thumb = post.querySelector(".thumb").cloneNode(true);
            thumb.classList.add("thumb-large");
            const image = thumb.querySelector("img");
            if (image && index === 0) image.loading = "eager";
            visual.setAttribute("href", href);
            visual.replaceChildren(thumb);
          });
        })
        .catch(() => {});
    }

    if (slides.length < 2 || !controls) return;
    const counter = controls.querySelector("[data-spot-counter]");
    const pad = (value) => String(value).padStart(2, "0");
    let current = 0;
    const show = (index) => {
      navigated = true;
      current = (index + slides.length) % slides.length;
      slides.forEach((slide, position) => {
        const off = position !== current;
        slide.classList.toggle("is-hidden", off);
        slide.inert = off;
        if (off) slide.setAttribute("aria-hidden", "true"); else slide.removeAttribute("aria-hidden");
      });
      visuals.forEach((visual, position) => { visual.hidden = position !== current; });
      counter.textContent = `${pad(current + 1)} / ${pad(slides.length)}`;
    };
    controls.querySelector("[data-spot-prev]").addEventListener("click", () => show(current - 1));
    controls.querySelector("[data-spot-next]").addEventListener("click", () => show(current + 1));
    controls.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        show(current + (event.key === "ArrowRight" ? 1 : -1));
      }
    });
    controls.hidden = false;
  });

  // 제목·태그와 분야에 맞는 결과만 페이지로 나눕니다.
  document.querySelectorAll("[data-journal]").forEach((journal) => {
    const controls = journal.querySelector("[data-journal-controls]");
    if (!controls) return;
    const group = controls.querySelector("[data-filter-group]");
    const buttons = Array.from(group.querySelectorAll("[data-value]"));
    const search = journal.querySelector("[data-post-search]");
    const input = search.querySelector("input");
    const pageSize = journal.querySelector("[data-page-size]");
    const pagination = journal.querySelector("[data-pagination]");
    const previous = pagination.querySelector("[data-page-prev]");
    const next = pagination.querySelector("[data-page-next]");
    const pageNumbers = pagination.querySelector("[data-page-numbers]");
    const pageJump = pagination.querySelector("[data-page-jump]");
    const jumpControl = pageJump.closest("label");
    const pageStatus = pagination.querySelector("[data-page-status]");
    const normalize = (text) => text.normalize("NFC").toLowerCase();
    const posts = Array.from(journal.querySelectorAll("[data-post]"), (post) => ({
      post, categories: post.dataset.category.split(" "), keywords: normalize(post.dataset.search),
    }));
    const empty = journal.querySelector("[data-empty]");
    const emptyMessage = empty.querySelector("[data-empty-message]");
    const title = journal.querySelector("#all-title");
    const defaultTitle = title.textContent;
    const countLabel = journal.querySelector("[data-filter-result]");
    const all = group.querySelector('[data-value="all"]');
    let selected = all;
    let page = 1;
    const renderPageNumbers = (pages) => {
      pageJump.replaceChildren(...Array.from({ length: pages }, (_, index) => {
        const number = index + 1;
        const label = number === page ? `${page} / ${pages}` : `${number} 페이지`;
        return new Option(label, number);
      }));
      pageJump.value = String(page);

      // 양끝과 현재 페이지 주변 세 페이지를 번호로 표시합니다.
      const start = Math.max(1, Math.min(page - 1, pages - 2));
      const items = [];
      let lastNumber = 0;
      for (let number = 1; number <= pages; number += 1) {
        if (number !== 1 && number !== pages && (number < start || number > start + 2)) continue;
        if (number - lastNumber > 1) {
          const gap = document.createElement("span");
          gap.className = "journal-page-gap";
          gap.setAttribute("aria-hidden", "true");
          gap.textContent = "…";
          items.push(gap);
        }
        if (number === page) {
          items.push(jumpControl);
        } else {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = String(number);
          button.classList.toggle("journal-page-neighbor", Math.abs(number - page) === 1);
          button.setAttribute("aria-label", `${number} 페이지`);
          button.addEventListener("click", () => goToPage(number));
          items.push(button);
        }
        lastNumber = number;
      }
      pageNumbers.replaceChildren(...items);
    };
    const showResults = () => {
      const terms = normalize(input.value.trim()).split(/\s+/).filter(Boolean);
      const size = pageSize.value === "all" ? posts.length : Number(pageSize.value);
      const start = (page - 1) * size;
      let count = 0;
      posts.forEach(({post, categories, keywords}) => {
        const inCategory = selected === all || categories.includes(selected.dataset.value);
        const matches = inCategory && terms.every((term) => keywords.includes(term));
        post.hidden = !matches || count < start || count >= start + size;
        if (matches) count += 1;
      });
      empty.hidden = count > 0;
      emptyMessage.textContent = terms.length ? "검색 조건에 맞는 글이 없어요." : "이 분야의 글을 준비하고 있어요.";
      const label = `${count}편`;
      if (countLabel.textContent !== label) countLabel.textContent = label;
      const pages = Math.ceil(count / size);
      pagination.hidden = pages <= 1;
      previous.disabled = page === 1;
      next.disabled = page >= pages;
      const status = pages > 1 ? `${page} / ${pages} 페이지` : "";
      if (pageStatus.textContent !== status) {
        if (pages > 1) renderPageNumbers(pages);
        pageStatus.textContent = status;
      }
    };
    const resetPage = () => {
      page = 1;
      showResults();
    };
    const goToPage = (number) => {
      page = number;
      showResults();
      title.focus({ preventScroll: true });
      title.closest(".article-header").scrollIntoView({ behavior: "instant", block: "start" });
    };
    const select = (button) => {
      selected = button;
      buttons.forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
      title.textContent = button === all ? defaultTitle : button.textContent.trim();
      resetPage();
    };
    search.addEventListener("submit", (event) => {
      event.preventDefault();
      resetPage();
    });
    input.addEventListener("input", (event) => {
      if (!event.isComposing) resetPage();
    });
    input.addEventListener("compositionend", resetPage);
    pageSize.addEventListener("change", resetPage);
    previous.addEventListener("click", () => goToPage(page - 1));
    next.addEventListener("click", () => goToPage(page + 1));
    pageJump.addEventListener("change", () => goToPage(Number(pageJump.value)));
    buttons.forEach((button) => button.addEventListener("click", () => select(button)));
    journal.querySelector("[data-reset-filter]").addEventListener("click", () => {
      input.value = "";
      select(all);
      all.focus();
    });
    controls.hidden = false;
    search.hidden = false;
    showResults();
  });
})();
