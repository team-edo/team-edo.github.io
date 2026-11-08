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
  // 모든 글을 같은 칸에 겹쳐 두고 보이기만 바꿔서, 글 길이가 달라도 버튼·이미지 위치가 그대로입니다.
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

  // 직무를 고르면 제목과 글 수를 갱신하고 해당 분야의 글만 보여 줍니다.
  document.querySelectorAll("[data-journal]").forEach((journal) => {
    const group = journal.querySelector("[data-filter-group]");
    if (!group) return;
    const buttons = Array.from(group.querySelectorAll("[data-value]"));
    const posts = Array.from(journal.querySelectorAll("[data-post]"));
    const empty = journal.querySelector("[data-empty]");
    const title = journal.querySelector("#all-title");
    const defaultTitle = title.textContent;
    const countLabel = journal.querySelector("[data-filter-result]");
    const all = group.querySelector('[data-value="all"]');
    const select = (button) => {
      buttons.forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
      let count = 0;
      posts.forEach((post) => {
        const visible = button === all || post.dataset.category.split(" ").includes(button.dataset.value);
        post.hidden = !visible;
        if (visible) count += 1;
      });
      empty.hidden = count > 0;
      title.textContent = button === all ? defaultTitle : button.textContent.trim();
      countLabel.textContent = `${count}편`;
    };
    buttons.forEach((button) => button.addEventListener("click", () => select(button)));
    journal.querySelector("[data-reset-filter]").addEventListener("click", () => {
      select(all);
      all.focus();
    });
    group.hidden = false;
  });
})();
