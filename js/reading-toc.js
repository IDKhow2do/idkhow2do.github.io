(function () {
  function onReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  onReady(function () {
    var tocStatic = document.getElementById('toc-static');
    var tocAuto = document.getElementById('toc-auto');
    var page = document.querySelector('.page.single');
    var tocCore = document.getElementById('TableOfContents');

    if (!tocStatic || !tocCore || !page) return;

    if (!tocCore.querySelector('a')) {
      tocStatic.classList.add('reading-toc-empty');
      if (tocAuto) tocAuto.classList.add('reading-toc-empty');
      return;
    }

    var media = window.matchMedia('(max-width: 960px)');
    var button = document.createElement('button');
    var backdrop = document.createElement('div');
    var lastOpenedAt = 0;

    button.type = 'button';
    button.className = 'reading-toc-toggle';
    button.setAttribute('aria-controls', 'toc-static');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', '打开目录');

    backdrop.className = 'reading-toc-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');

    document.body.appendChild(button);
    document.body.appendChild(backdrop);

    function isMobileToc() {
      return media.matches;
    }

    function setOpen(open) {
      document.body.classList.toggle('reading-toc-open', open);
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      button.setAttribute('aria-label', open ? '关闭目录' : '打开目录');
      if (open) lastOpenedAt = Date.now();
    }

    function positionDesktopToc() {
      if (!tocAuto || isMobileToc()) return;

      var rect = page.getBoundingClientRect();
      var gap = 24;
      var available = rect.left - gap * 2;
      var width = Math.max(168, Math.min(280, available));

      if (available < 168) return;

      tocAuto.classList.add('reading-toc-left');
      tocAuto.style.left = Math.max(16, rect.left - gap - width) + 'px';
      tocAuto.style.maxWidth = width + 'px';
      tocAuto.style.width = width + 'px';
    }

    function closeIfMobile() {
      if (isMobileToc()) setOpen(false);
    }

    function shouldKeepOpen(event) {
      return tocStatic.contains(event.target) || button.contains(event.target);
    }

    function getLinkTarget(link) {
      var hash = link.getAttribute('href');
      var id;

      if (!hash || hash.charAt(0) !== '#') return null;

      id = hash.slice(1);

      try {
        id = decodeURIComponent(id);
      } catch (error) {
        id = hash.slice(1);
      }

      return document.getElementById(id);
    }

    function jumpToTarget(link, target) {
      var root = document.documentElement;
      var previousScrollBehavior = root.style.scrollBehavior;
      var header = document.getElementById('header-mobile') || document.getElementById('header-desktop');
      var headerOffset = header ? header.getBoundingClientRect().height : 64;
      var targetTop = target.getBoundingClientRect().top + window.scrollY - headerOffset - 24;

      root.style.scrollBehavior = 'auto';
      window.scrollTo(0, Math.max(0, targetTop));

      if (window.history && window.history.pushState) {
        window.history.pushState(null, '', link.getAttribute('href'));
      } else {
        window.location.hash = link.getAttribute('href');
      }

      window.requestAnimationFrame(function () {
        root.style.scrollBehavior = previousScrollBehavior;
      });
    }

    button.addEventListener('click', function () {
      setOpen(!document.body.classList.contains('reading-toc-open'));
    });

    backdrop.addEventListener('click', closeIfMobile);

    tocStatic.addEventListener('click', function (event) {
      var link = event.target.closest('a');
      var target;

      if (!link) return;

      if (isMobileToc()) {
        target = getLinkTarget(link);
        if (target) {
          event.preventDefault();
          closeIfMobile();
          jumpToTarget(link, target);
          return;
        }
      }

      closeIfMobile();
    });

    document.addEventListener('pointerdown', function (event) {
      if (
        document.body.classList.contains('reading-toc-open') &&
        isMobileToc() &&
        !shouldKeepOpen(event)
      ) {
        closeIfMobile();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeIfMobile();
    });

    window.addEventListener('scroll', function () {
      if (
        document.body.classList.contains('reading-toc-open') &&
        Date.now() - lastOpenedAt > 160
      ) {
        closeIfMobile();
      }
    }, { passive: true });

    window.addEventListener('wheel', function (event) {
      if (
        document.body.classList.contains('reading-toc-open') &&
        Date.now() - lastOpenedAt > 160 &&
        !shouldKeepOpen(event)
      ) {
        closeIfMobile();
      }
    }, { passive: true });

    window.addEventListener('touchmove', function (event) {
      if (
        document.body.classList.contains('reading-toc-open') &&
        Date.now() - lastOpenedAt > 160 &&
        !shouldKeepOpen(event)
      ) {
        closeIfMobile();
      }
    }, { passive: true });

    window.addEventListener('resize', function () {
      if (!isMobileToc()) setOpen(false);
      positionDesktopToc();
    });

    positionDesktopToc();
    window.addEventListener('load', positionDesktopToc, { once: true });
    window.setTimeout(positionDesktopToc, 250);
    window.setTimeout(positionDesktopToc, 1000);
  });
})();
