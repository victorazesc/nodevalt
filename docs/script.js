const header = document.querySelector("[data-header]");
const copyButton = document.querySelector("[data-copy]");

const updateHeader = () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 12);
};

copyButton?.addEventListener("click", async () => {
  const text = copyButton.getAttribute("data-copy") ?? "";

  try {
    await navigator.clipboard.writeText(text);
    copyButton.textContent = "Copiado";
    window.setTimeout(() => {
      copyButton.textContent = "Copiar";
    }, 1500);
  } catch {
    copyButton.textContent = "Falhou";
    window.setTimeout(() => {
      copyButton.textContent = "Copiar";
    }, 1500);
  }
});

window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();
