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
    button.textContent = '目录';
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

    button.addEventListener('click', function () {
      setOpen(!document.body.classList.contains('reading-toc-open'));
    });

    backdrop.addEventListener('click', closeIfMobile);

    tocStatic.addEventListener('click', function (event) {
      if (event.target.closest('a')) closeIfMobile();
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

    window.addEventListener('wheel', function () {
      if (
        document.body.classList.contains('reading-toc-open') &&
        Date.now() - lastOpenedAt > 160
      ) {
        closeIfMobile();
      }
    }, { passive: true });

    window.addEventListener('touchmove', function () {
      if (
        document.body.classList.contains('reading-toc-open') &&
        Date.now() - lastOpenedAt > 160
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
