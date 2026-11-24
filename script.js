
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;

  /* MOBILE NAVIGATION */
  const menuToggle =
    document.querySelector("#menu") ||
    document.querySelector(".menu-toggle") ||
    document.querySelector(".menu");

  const navLinks =
    document.querySelector("#nav") ||
    document.querySelector(".nav-links") ||
    document.querySelector(".topbar nav");

  function closeMenu() {
    if (!menuToggle || !navLinks) return;

    navLinks.classList.remove("open");
    menuToggle.textContent = "☰";
    menuToggle.setAttribute("aria-expanded", "false");
  }

  if (menuToggle && navLinks) {
    menuToggle.setAttribute("aria-expanded", "false");

    menuToggle.addEventListener("click", event => {
      event.stopPropagation();

      const isOpen = navLinks.classList.toggle("open");

      menuToggle.textContent = isOpen ? "✕" : "☰";
      menuToggle.setAttribute("aria-expanded", String(isOpen));
    });

    navLinks.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("click", event => {
      if (
        !navLinks.contains(event.target) &&
        !menuToggle.contains(event.target)
      ) {
        closeMenu();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 760) closeMenu();
    });
  }

  /* SMOOTH SECTION NAVIGATION */
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener("click", event => {
      const selector = link.getAttribute("href");

      if (!selector || selector === "#") return;

      const target = document.querySelector(selector);

      if (target) {
        event.preventDefault();

        target.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }
    });
  });

  /* SCROLL REVEAL */
  const revealElements = document.querySelectorAll(
    ".reveal, .service-card, .feature-item, .section-heading"
  );

  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12,
        rootMargin: "0px 0px -35px 0px"
      }
    );

    revealElements.forEach(element => {
      element.classList.add("reveal-ready");
      revealObserver.observe(element);
    });
  } else {
    revealElements.forEach(element => {
      element.classList.add("visible");
    });
  }

  /* SCROLL PROGRESS */
  const progressBar =
    document.querySelector(".scroll-progress") ||
    document.querySelector(".page-progress");

  let scrollTicking = false;

  function updateProgress() {
    const scrollableHeight =
      document.documentElement.scrollHeight - window.innerHeight;

    const progress = scrollableHeight > 0
      ? (window.scrollY / scrollableHeight) * 100
      : 0;

    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }

    scrollTicking = false;
  }

  window.addEventListener("scroll", () => {
    if (!scrollTicking) {
      window.requestAnimationFrame(updateProgress);
      scrollTicking = true;
    }
  }, { passive: true });

  updateProgress();

  /* CURSOR GLOW */
  const cursorGlow = document.querySelector(".cursor-glow");

  if (
    cursorGlow &&
    window.matchMedia("(pointer: fine)").matches
  ) {
    let cursorFrame = null;

    window.addEventListener("mousemove", event => {
      if (cursorFrame) {
        cancelAnimationFrame(cursorFrame);
      }

      cursorFrame = requestAnimationFrame(() => {
        cursorGlow.style.left = `${event.clientX}px`;
        cursorGlow.style.top = `${event.clientY}px`;
        cursorFrame = null;
      });
    }, { passive: true });
  }

  /* DYNAMIC FOOTER YEAR */
  const currentYear = new Date().getFullYear();

  document.querySelectorAll(".year, #year").forEach(element => {
    element.textContent = currentYear;
  });

  /* 3D CARD TILT */
  if (window.matchMedia("(pointer: fine)").matches) {
    const cards = document.querySelectorAll(
      ".service-card, .feature-card, .feature-item"
    );

    cards.forEach(card => {
      card.addEventListener("mousemove", event => {
        const rect = card.getBoundingClientRect();

        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;

        const rotateY = (x - 0.5) * 4;
        const rotateX = (0.5 - y) * 4;

        card.style.transform =
          `perspective(900px) translateY(-5px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      });

      card.addEventListener("mouseleave", () => {
        card.style.transform = "";
      });
    });
  }

  /* BUTTON PRESS FEEDBACK */
  document.querySelectorAll(
    ".button, .btn, .nav-cta"
  ).forEach(button => {
    button.addEventListener("pointerdown", () => {
      button.classList.add("button-pressed");
    });

    ["pointerup", "pointerleave", "pointercancel"].forEach(eventName => {
      button.addEventListener(eventName, () => {
        button.classList.remove("button-pressed");
      });
    });
  });

  /* PAGE READY */
  body.classList.add("website-ready");

  console.log("ASTRIX CLOUD website initialized.");
});
