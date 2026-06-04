(function () {
  const frames = Array.from(document.querySelectorAll('.photowall-room .frame[data-photo-src]'));

  if (!frames.length || typeof HTMLDialogElement === 'undefined') {
    return;
  }

  const photos = frames.map((frame, index) => ({
    index,
    src: frame.dataset.photoSrc || frame.href,
    title: frame.dataset.photoTitle || frame.querySelector('img')?.alt || '照片',
    place: frame.dataset.photoPlace || '生活记录',
    camera: frame.dataset.photoCamera || '照片墙记录',
    note: frame.dataset.photoNote || '某个值得被留下来的瞬间。',
    trigger: frame,
  }));

  const dialog = document.createElement('dialog');
  dialog.className = 'photo-viewer';
  dialog.setAttribute('aria-label', '照片详情');
  dialog.innerHTML = `
    <div class="photo-viewer-shell">
      <figure class="photo-viewer-figure">
        <img class="photo-viewer-image" alt="">
      </figure>
      <div class="photo-viewer-copy">
        <p class="photo-viewer-place"></p>
        <h3 class="photo-viewer-title"></h3>
        <p class="photo-viewer-camera"></p>
        <p class="photo-viewer-note"></p>
      </div>
      <button class="photo-viewer-close" type="button" aria-label="关闭照片详情">×</button>
      <button class="photo-viewer-nav photo-viewer-prev" type="button" aria-label="上一张">‹</button>
      <button class="photo-viewer-nav photo-viewer-next" type="button" aria-label="下一张">›</button>
    </div>
  `;
  document.body.appendChild(dialog);

  const image = dialog.querySelector('.photo-viewer-image');
  const place = dialog.querySelector('.photo-viewer-place');
  const title = dialog.querySelector('.photo-viewer-title');
  const camera = dialog.querySelector('.photo-viewer-camera');
  const note = dialog.querySelector('.photo-viewer-note');
  const closeButton = dialog.querySelector('.photo-viewer-close');
  const prevButton = dialog.querySelector('.photo-viewer-prev');
  const nextButton = dialog.querySelector('.photo-viewer-next');
  let currentIndex = 0;
  let activeTrigger = null;

  image.addEventListener('load', () => {
    dialog.classList.toggle('is-portrait-photo', image.naturalHeight > image.naturalWidth);
  });

  const setPhoto = (index) => {
    const photo = photos[(index + photos.length) % photos.length];
    currentIndex = photo.index;
    dialog.classList.remove('is-portrait-photo');
    image.src = photo.src;
    image.alt = photo.title;
    place.textContent = photo.place;
    title.textContent = photo.title;
    camera.textContent = photo.camera;
    note.textContent = photo.note;
  };

  const openPhoto = (index, trigger) => {
    activeTrigger = trigger;
    setPhoto(index);
    document.body.classList.add('photo-viewer-open');
    dialog.showModal();
    closeButton.focus();
  };

  const closePhoto = () => {
    dialog.close();
  };

  const showPrevious = () => {
    setPhoto(currentIndex - 1);
  };

  const showNext = () => {
    setPhoto(currentIndex + 1);
  };

  frames.forEach((frame, index) => {
    frame.addEventListener('click', (event) => {
      event.preventDefault();
      openPhoto(index, frame);
    });
  });

  closeButton.addEventListener('click', closePhoto);
  prevButton.addEventListener('click', showPrevious);
  nextButton.addEventListener('click', showNext);

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      closePhoto();
    }
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      showPrevious();
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      showNext();
    }
  });

  dialog.addEventListener('close', () => {
    document.body.classList.remove('photo-viewer-open');
    dialog.classList.remove('is-portrait-photo');
    image.removeAttribute('src');

    if (activeTrigger) {
      activeTrigger.focus();
    }
  });
})();
