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

  // 추천 글: 이전·다음 버튼과 좌우 방향키로 넘깁니다. 자동 재생은 하지 않습니다.
  document.querySelectorAll("[data-spotlight]").forEach((spotlight) => {
    const slides = Array.from(spotlight.querySelectorAll("[data-slide]"));
    const visuals = Array.from(spotlight.querySelectorAll("[data-visual]"));
    const controls = spotlight.querySelector("[data-spot-controls]");
    if (slides.length < 2 || !controls) return;
    const counter = controls.querySelector("[data-spot-counter]");
    const pad = (value) => String(value).padStart(2, "0");
    let current = 0;
    const show = (index) => {
      current = (index + slides.length) % slides.length;
      slides.forEach((slide, position) => { slide.hidden = position !== current; });
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

  // 직무별·작성자별로 읽기: 두 조건을 함께 적용해 맞는 글만 보여 주고 결과 수를 알립니다.
  document.querySelectorAll("[data-journal]").forEach((journal) => {
    const groups = Array.from(journal.querySelectorAll("[data-filter-group]"));
    const posts = Array.from(journal.querySelectorAll("[data-post]"));
    const empty = journal.querySelector("[data-empty]");
    const result = journal.querySelector("[data-filter-result]");
    if (!groups.length) return;
    const selected = Object.fromEntries(groups.map((group) => [group.dataset.filterGroup, "all"]));
    const matches = (post, key) => {
      if (selected[key] === "all") return true;
      // 직무는 여러 개일 수 있어 공백으로 나누고, 작성자는 이름 전체를 비교합니다.
      return key === "category" ? post.dataset.category.split(" ").includes(selected[key]) : post.dataset[key] === selected[key];
    };
    const apply = () => {
      let count = 0;
      posts.forEach((post) => {
        const visible = Object.keys(selected).every((key) => matches(post, key));
        post.hidden = !visible;
        if (visible) count += 1;
      });
      if (empty) empty.hidden = count > 0;
      if (result) {
        const names = groups
          .filter((group) => selected[group.dataset.filterGroup] !== "all")
          .map((group) => group.querySelector('[aria-pressed="true"]').firstChild.textContent.trim());
        result.textContent = `${names.length ? names.join(" · ") : "전체"} 글 ${count}편`;
      }
    };
    groups.forEach((group) => {
      const buttons = Array.from(group.querySelectorAll("[data-value]"));
      buttons.forEach((button) => button.addEventListener("click", () => {
        buttons.forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
        selected[group.dataset.filterGroup] = button.dataset.value;
        apply();
      }));
    });
    const reset = journal.querySelector("[data-reset-filter]");
    if (reset) reset.addEventListener("click", () => {
      groups.forEach((group) => {
        group.querySelectorAll("[data-value]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === "all")));
        selected[group.dataset.filterGroup] = "all";
      });
      apply();
      groups[0].querySelector("[data-value]").focus();
    });
  });
})();
