
document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;

  // Mobile navigation - supports both Home and inner pages
  const menuToggle =
    document.querySelector(".menu-toggle") ||
    document.querySelector(".menu");

  const navLinks =
    document.querySelector(".nav-links") ||
    document.querySelector(".topbar nav");

  if (menuToggle && navLinks) {
    menuToggle.setAttribute("aria-expanded", "false");

    menuToggle.addEventListener("click", () => {
      const isOpen = navLinks.classList.toggle("open");

      menuToggle.textContent = isOpen ? "✕" : "☰";
      menuToggle.setAttribute("aria-expanded", String(isOpen));
    });

    navLinks.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("open");
        menuToggle.textContent = "☰";
        menuToggle.setAttribute("aria-expanded", "false");
      });
    });

    document.addEventListener("click", event => {
      if (
        !navLinks.contains(event.target) &&
        !menuToggle.contains(event.target)
      ) {
        navLinks.classList.remove("open");
        menuToggle.textContent = "☰";
        menuToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Scroll reveal animations
  const revealElements = document.querySelectorAll(".reveal");

  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: "0px 0px -35px 0px"
    });

    revealElements.forEach(element => {
      revealObserver.observe(element);
    });
  } else {
    revealElements.forEach(element => {
      element.classList.add("visible");
    });
  }

  // Scroll progress - supports both class names
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

  // Cursor glow
  const cursorGlow = document.querySelector(".cursor-glow");

  if (cursorGlow && window.matchMedia("(pointer: fine)").matches) {
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

  // Dynamic footer year - supports both page layouts
  const currentYear = new Date().getFullYear();

  document.querySelectorAll(".year, #year").forEach(element => {
    element.textContent = currentYear;
  });

  // Smooth section navigation
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

  // Subtle 3D card tilt on desktop
  const cards = document.querySelectorAll(
    ".service-card, .feature-card"
  );

  if (window.matchMedia("(pointer: fine)").matches) {
    cards.forEach(card => {
      card.addEventListener("mousemove", event => {
        const rect = card.getBoundingClientRect();

        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;

        const rotateY = (x - 0.5) * 5;
        const rotateX = (0.5 - y) * 5;

        card.style.transform =
          `perspective(900px) translateY(-6px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      });

      card.addEventListener("mouseleave", () => {
        card.style.transform = "";
      });
    });
  }

  // Button click feedback
  document.querySelectorAll(
    ".button, .btn-primary, .nav-cta"
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

  // Animate elements when the page loads
  body.classList.add("website-ready");

  console.log("ASTRIX CLOUD upgraded successfully 🚀");
});
