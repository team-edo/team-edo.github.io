(() => {
  "use strict";

  document.querySelectorAll("[data-carousel]").forEach((carousel) => {
    const slides = Array.from(carousel.querySelectorAll("[data-slide]"));
    const controls = carousel.querySelector("[data-carousel-controls]");
    if (slides.length < 2 || !controls) return;
    const previous = controls.querySelector("[data-carousel-prev]");
    const next = controls.querySelector("[data-carousel-next]");
    const count = controls.querySelector("[data-carousel-count]");
    let current = 0;
    const show = (index) => {
      const restoreFocus = slides[current].contains(document.activeElement);
      current = (index + slides.length) % slides.length;
      slides.forEach((slide, position) => { slide.hidden = position !== current; });
      count.textContent = `${current + 1} / ${slides.length}`;
      if (restoreFocus) slides[current].querySelector("a").focus({ preventScroll: true });
    };
    previous.addEventListener("click", () => show(current - 1));
    next.addEventListener("click", () => show(current + 1));
    controls.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        show(current + (event.key === "ArrowRight" ? 1 : -1));
      }
    });
    controls.hidden = false;
  });

  document.querySelectorAll("[data-blog]").forEach((blog) => {
    const tools = blog.querySelector("[data-post-tools]");
    if (!tools) return;
    const input = tools.querySelector("[data-post-search]");
    const category = tools.querySelector("[data-category-filter]");
    const cards = Array.from(blog.querySelectorAll("[data-post-list] [data-post-card]"));
    const count = blog.querySelector("[data-post-count]");
    const result = blog.querySelector("[data-filter-result]");
    const empty = blog.querySelector("[data-no-results]");
    const normalize = (text) => text.normalize("NFKC").toLocaleLowerCase("ko");
    const entries = cards.map((card) => ({ card, text: normalize(card.dataset.search), categories: normalize(card.dataset.categories) }));
    const update = () => {
      const words = normalize(input.value.trim()).split(/\s+/).filter(Boolean);
      const selected = normalize(category.value);
      let visible = 0;
      entries.forEach(({ card, text, categories }) => {
        const matches = (!selected || categories.includes(`|${selected}|`)) && words.every((word) => text.includes(word));
        card.hidden = !matches;
        if (matches) visible += 1;
      });
      count.textContent = String(visible);
      const filtered = words.length > 0 || selected !== "";
      result.hidden = !filtered;
      result.textContent = filtered ? `${visible}편의 글을 찾았어요.` : "";
      empty.hidden = visible !== 0;
    };
    input.addEventListener("input", update);
    category.addEventListener("change", update);
    blog.querySelector("[data-reset-filters]").addEventListener("click", () => {
      input.value = "";
      category.value = "";
      update();
      input.focus();
    });
    tools.hidden = false;
  });
})();
