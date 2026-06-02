(function () {
  const photoItems = document.querySelectorAll('.photowall-room .photo-item');

  if (!photoItems.length) {
    return;
  }

  const reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (reducedMotionMedia.matches) {
    return;
  }

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const maxTilt = 12;

  const reduceMotionToggle = () => {
    if (reducedMotionMedia.matches) {
      photoItems.forEach((photo) => {
        const frame = photo.querySelector('.frame');
        if (frame) {
          frame.style.removeProperty('transform');
          frame.style.removeProperty('will-change');
        }
      });
    }
  };

  photoItems.forEach((photo) => {
    const frame = photo.querySelector('.frame');
    if (!frame) {
      return;
    }

    let scheduled = false;
    let lastX = 0;
    let lastY = 0;

    const applyTilt = () => {
      const rect = photo.getBoundingClientRect();
      const x = clamp((lastX - rect.left) / rect.width - 0.5, -0.5, 0.5);
      const y = clamp((lastY - rect.top) / rect.height - 0.5, -0.5, 0.5);
      const rotateY = (x * maxTilt).toFixed(2);
      const rotateX = (-y * maxTilt).toFixed(2);
      frame.style.willChange = 'transform';
      frame.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.01)`;
      scheduled = false;
    };

    const onMove = (event) => {
      lastX = event.clientX;
      lastY = event.clientY;

      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(applyTilt);
      }
    };

    const onLeave = () => {
      frame.style.transform = 'none';
      frame.style.willChange = 'auto';
    };

    photo.addEventListener('pointermove', onMove, { passive: true });
    photo.addEventListener('pointerleave', onLeave);
    photo.addEventListener('focusin', () => {
      frame.style.transform = 'rotateX(1.8deg) rotateY(-1.8deg) scale(1.01)';
      frame.style.willChange = 'transform';
    });
    photo.addEventListener('focusout', onLeave);
  });

  if (reducedMotionMedia.addEventListener) {
    reducedMotionMedia.addEventListener('change', reduceMotionToggle);
  } else if (reducedMotionMedia.addListener) {
    reducedMotionMedia.addListener(reduceMotionToggle);
  }
})();
