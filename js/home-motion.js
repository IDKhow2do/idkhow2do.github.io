(function () {
  var root = document.querySelector(".page.home");

  if (!root || !window.gsap) {
    return;
  }

  var mm = window.gsap.matchMedia();

  mm.add(
    {
      motion: "(prefers-reduced-motion: no-preference)",
      reduced: "(prefers-reduced-motion: reduce)"
    },
    function (context) {
      if (context.conditions.reduced) {
        window.gsap.set(root.querySelectorAll(".home-profile, .home-journey, .home-section-head, .summary"), {
          clearProps: "all"
        });
        return;
      }

      window.gsap.from(".home-profile > *, .home-journey, .home-section-head, .summary", {
        autoAlpha: 0,
        y: 14,
        duration: 0.52,
        ease: "power2.out",
        stagger: 0.055,
        clearProps: "transform,opacity,visibility"
      });
    }
  );
})();
