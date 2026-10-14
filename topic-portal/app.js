/**
 * 选题 · 视觉合并入口 — 只读静态预览
 * 数据来自 portal/data/*.json（handoff 复制）；不写回、不请求凭据。
 */
(() => {
  "use strict";

  const DATA = {
    topics: "data/news_topics.json",
    feedback: "data/news_feedback.json",
    visuals: "data/visual_items.json",
    manifest: "data/manifest.json",
  };

  const CATEGORIES = ["全部", "AI", "半导体", "科技产品", "社会生活", "其他"];

  const state = {
    tab: "topics",
    topics: [],
    feedback: {},
    visuals: null,
    manifest: null,
    category: "全部",
    likedOnly: false,
    query: "",
    visualOverrides: {}, // ephemeral UI-only toggles
    topicOverrides: {},
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  async function loadJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`加载失败 ${url}: ${res.status}`);
    return res.json();
  }

  function mergeFeedback(topics, feedbackMap) {
    return topics.map((t) => {
      const fb = feedbackMap[t.url] || {};
      return {
        ...t,
        liked: !!fb.liked,
        saved: !!fb.saved,
        notInterested: !!fb.notInterested,
      };
    });
  }

  function formatShanghai(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      // Asia/Shanghai display
      const parts = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(d);
      const get = (t) => parts.find((p) => p.type === t)?.value || "";
      return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} CST`;
    } catch {
      return iso;
    }
  }

  const CAT_MARK = {
    AI: "智",
    半导体: "芯",
    科技产品: "品",
    社会生活: "生",
    其他: "·",
    video: "视",
    image: "图",
    motion: "动",
    frontend: "端",
    "3d": "3",
    industrial: "工",
  };

  const VISUAL_CAT_LABEL = {
    video: "视频",
    image: "图片",
    motion: "动态",
    frontend: "前端",
    "3d": "3D",
    industrial: "工业",
  };

  function categoryMark(category) {
    const c = category || "其他";
    return CAT_MARK[c] || (c.charAt(0) || "·");
  }

  function visualCategoryLabel(category) {
    const c = category || "未分类";
    return VISUAL_CAT_LABEL[c] || c;
  }

  /** List cards: no loud status chip. Drawer: chip only for exceptional absence of caveat. */
  function cardEvidenceHint(topic) {
    // Demoted: almost every topic has caveat — do not chip the grid.
    return null;
  }

  function drawerEvidenceBadge(topic) {
    const hasCaveat = !!(topic.caveat && String(topic.caveat).trim());
    // Special/exceptional: missing boundary note is rarer signal than "has caveat"
    if (!hasCaveat) {
      return { text: "边界待补", cls: "badge-warn" };
    }
    return null;
  }

  function hashHue(str) {
    let h = 0;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 360;
  }

  function makeCategoryPlaceholder(category, opts = {}) {
    const el = document.createElement("div");
    el.className = "card-preview-placeholder" + (opts.mutedLabel ? " is-muted-label" : "");
    el.dataset.cat = category || "其他";
    if (opts.seed) {
      const hue = hashHue(opts.seed);
      el.style.setProperty("--tint", `hsla(${hue}, 28%, 42%, 0.12)`);
      el.style.setProperty("--tint2", `hsla(${(hue + 48) % 360}, 22%, 50%, 0.06)`);
    }
    if (opts.mutedLabel) {
      el.textContent = opts.mutedLabel;
    } else if (opts.mark) {
      el.textContent = opts.mark;
      el.setAttribute("aria-hidden", "true");
    } else {
      el.textContent = categoryMark(category);
      el.setAttribute("aria-hidden", "true");
    }
    return el;
  }

  function visualMark(item) {
    const title = displayVisualTitle(item);
    const m = title.match(/@[\w]+/);
    if (m) return m[0].slice(1, 2).toUpperCase();
    const c = (item.category || "").trim();
    if (c === "video" || c === "视频") return "视";
    return categoryMark(c || "其他");
  }

  function displayVisualTitle(item) {
    const raw = (item.title || "").trim();
    // Strip trailing long numeric status IDs if any remain
    let cleaned = raw.replace(/\s*[·•]\s*\d{8,}\s*$/u, "").trim();
    // Drop legacy placeholder titles like「待核实 · @handle」
    if (/^待核实/.test(cleaned)) cleaned = "";
    if (cleaned) return cleaned;
    const desc = (item.description || "").trim().split(/\n/)[0];
    if (desc && desc.length > 8 && !desc.includes("暂未取得") && !desc.includes("待核实")) {
      return desc.length > 72 ? desc.slice(0, 70) + "…" : desc;
    }
    const handle = (item.attribution || "").match(/@[\w]+/);
    if (handle) return handle[0];
    return "未命名素材";
  }
  function effectiveTopicFb(topic) {
    const o = state.topicOverrides[topic.url];
    if (!o) return { liked: topic.liked, saved: topic.saved };
    return {
      liked: o.liked ?? topic.liked,
      saved: o.saved ?? topic.saved,
    };
  }

  function effectiveVisualFb(item) {
    const key = item.source || item.title;
    const base = item.userFeedback || {};
    const o = state.visualOverrides[key] || {};
    return {
      liked: o.liked ?? !!base.liked,
      favorite: o.favorite ?? !!base.favorite,
    };
  }

  /* —— Tabs —— */
  function setupTabs() {
    $$(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        state.tab = tab;
        $$(".tab").forEach((b) => {
          const on = b.dataset.tab === tab;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
        });
        $$(".panel").forEach((p) => {
          const on = p.id === `panel-${tab}`;
          p.classList.toggle("is-active", on);
          p.hidden = !on;
        });
      });
    });
  }

  /* —— Topics —— */
  function renderCategoryChips() {
    const host = $("#categoryChips");
    host.innerHTML = "";
    CATEGORIES.forEach((cat) => {
      const count =
        cat === "全部"
          ? state.topics.length
          : state.topics.filter((t) => t.category === cat).length;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (state.category === cat ? " is-active" : "");
      btn.textContent = cat === "全部" ? `全部 ${count}` : `${cat} ${count}`;
      btn.addEventListener("click", () => {
        state.category = cat;
        renderCategoryChips();
        renderTopics();
      });
      host.appendChild(btn);
    });
  }

  function filteredTopics() {
    const q = state.query.trim().toLowerCase();
    return state.topics.filter((t) => {
      if (state.category !== "全部" && t.category !== state.category) return false;
      const fb = effectiveTopicFb(t);
      if (state.likedOnly && !fb.liked) return false;
      if (!q) return true;
      const hay = `${t.title || ""} ${t.description || ""} ${t.source || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function renderTopics() {
    const grid = $("#topicsGrid");
    const empty = $("#topicsEmpty");
    const hint = $("#topicsHint");
    const list = filteredTopics();

    $("#topicsCount").textContent = String(state.topics.length);
    hint.textContent =
      list.length === state.topics.length
        ? `共 ${list.length} 条选题`
        : `显示 ${list.length} / ${state.topics.length} 条`;

    grid.innerHTML = "";
    if (!list.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    const frag = document.createDocumentFragment();
    list.forEach((topic) => {
      frag.appendChild(buildTopicCard(topic));
    });
    grid.appendChild(frag);
  }

  function buildTopicCard(topic) {
    const fb = effectiveTopicFb(topic);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card";
    btn.setAttribute("aria-label", topic.title);

    const preview = document.createElement("div");
    preview.className = "card-preview";
    const catName = topic.category || "其他";
    if (topic.imageUrl) {
      const img = document.createElement("img");
      img.src = topic.imageUrl;
      img.alt = topic.imageAlt || "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        preview.innerHTML = "";
        preview.appendChild(makeCategoryPlaceholder(catName));
      });
      preview.appendChild(img);
    } else {
      preview.appendChild(makeCategoryPlaceholder(catName));
    }

    const body = document.createElement("div");
    body.className = "card-body";
    body.innerHTML = `
      <h3 class="card-title"></h3>
      <div class="card-meta">
        <span class="badge"></span>
        <div class="indicators"></div>
      </div>
    `;
    body.querySelector(".card-title").textContent = topic.title;
    const meta = body.querySelector(".card-meta");
    const oldBadge = body.querySelector(".badge");
    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.gap = "8px";
    left.style.flexWrap = "wrap";
    left.style.alignItems = "center";
    const cat = document.createElement("span");
    cat.className = "badge";
    cat.textContent = catName;
    left.appendChild(cat);
    oldBadge.replaceWith(left);

    const inds = body.querySelector(".indicators");
    inds.appendChild(makeInd("♥", "like", fb.liked, (e) => {
      e.stopPropagation();
      toggleTopic(topic.url, "liked");
    }));
    inds.appendChild(makeInd("★", "fav", fb.saved, (e) => {
      e.stopPropagation();
      toggleTopic(topic.url, "saved");
    }));

    btn.appendChild(preview);
    btn.appendChild(body);
    btn.addEventListener("click", () => openTopicDrawer(topic));
    return btn;
  }

  function makeInd(symbol, kind, on, onClick) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `ind interactive ${kind}` + (on ? " is-on" : "");
    el.textContent = symbol;
    el.title = kind === "like" ? "赞（只读演示）" : "收藏（只读演示）";
    el.addEventListener("click", onClick);
    return el;
  }

  function toggleTopic(url, field) {
    const base = state.topics.find((t) => t.url === url);
    const cur = state.topicOverrides[url] || {
      liked: base?.liked,
      saved: base?.saved,
    };
    const next = { ...cur, [field]: !cur[field] };
    state.topicOverrides[url] = next;
    renderTopics();
    // refresh drawer if open for this topic
    const drawer = $("#drawer");
    if (drawer.classList.contains("is-open") && drawer.dataset.key === url) {
      openTopicDrawer(base);
    }
  }

  function openTopicDrawer(topic) {
    const fb = effectiveTopicFb(topic);
    const drawer = $("#drawer");
    const backdrop = $("#drawerBackdrop");
    drawer.dataset.key = topic.url;
    drawer.dataset.kind = "topic";

    const media = $("#drawerMedia");
    media.innerHTML = "";
    if (topic.imageUrl) {
      const img = document.createElement("img");
      img.src = topic.imageUrl;
      img.alt = topic.imageAlt || "";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        media.innerHTML = "";
        media.appendChild(makeCategoryPlaceholder(topic.category || "其他"));
      });
      media.appendChild(img);
    } else {
      media.innerHTML = "";
      const ph = makeCategoryPlaceholder(topic.category || "其他");
      ph.style.height = "100%";
      media.appendChild(ph);
    }

    $("#drawerCategory").textContent = topic.category || "其他";
    $("#drawerTitle").textContent = topic.title || "";
    const status = $("#drawerStatus");
    status.innerHTML = "";
    const special = drawerEvidenceBadge(topic);
    if (special) {
      const b1 = document.createElement("span");
      b1.className = `badge ${special.cls}`.trim();
      b1.textContent = special.text;
      status.appendChild(b1);
    }
    if (topic.source) {
      const b2 = document.createElement("span");
      b2.className = "badge";
      b2.textContent = topic.source;
      status.appendChild(b2);
    }

    $("#drawerDesc").textContent = topic.description || "暂无说明。";
    const caveat = (topic.caveat || "").trim();
    $("#drawerCaveatWrap").hidden = !caveat;
    $("#drawerCaveat").textContent = caveat;
    $("#drawerAttrWrap").hidden = true;

    const link = $("#drawerLink");
    link.href = topic.url || "#";
    link.textContent = "打开原文";
    link.style.display = topic.url ? "" : "none";

    const fbHost = $("#drawerFeedback");
    fbHost.innerHTML = "";
    fbHost.appendChild(makeInd("♥", "like", fb.liked, (e) => {
      e.stopPropagation();
      toggleTopic(topic.url, "liked");
    }));
    fbHost.appendChild(makeInd("★", "fav", fb.saved, (e) => {
      e.stopPropagation();
      toggleTopic(topic.url, "saved");
    }));

    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    backdrop.hidden = false;
  }

  /* —— Visuals —— */
  function renderVisuals() {
    const data = state.visuals;
    const grid = $("#visualsGrid");
    const empty = $("#visualsEmpty");
    const banner = $("#visualGapBanner");

    if (!data) {
      $("#visualsCount").textContent = "0";
      empty.classList.remove("hidden");
      banner.hidden = true;
      grid.innerHTML = "";
      return;
    }

    const siteTotal = data.siteTotalVerified ?? 113;
    const exported = data.exportedCount ?? (data.items || []).length;
    $("#visualSiteTotal").textContent = String(siteTotal);
    $("#visualExported").textContent = String(exported);
    $("#visualsCount").textContent = `${exported}/${siteTotal}`;

    const incomplete = data.exportStatus === "partial" || exported < siteTotal;
    banner.hidden = !incomplete;
    banner.style.display = incomplete ? "" : "none";

    const items = data.items || [];
    grid.innerHTML = "";

    if (!items.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    // Always show structure: real cards + ghost placeholders for gap
    const frag = document.createDocumentFragment();
    items.forEach((item) => frag.appendChild(buildVisualCard(item, false)));

    if (incomplete) {
      const ghost = document.createElement("div");
      ghost.className = "card is-ghost";
      const gPrev = document.createElement("div");
      gPrev.className = "card-preview";
      gPrev.appendChild(makeCategoryPlaceholder("其他", { mutedLabel: `其余 ${siteTotal - exported} 条未导出` }));
      const gBody = document.createElement("div");
      gBody.className = "card-body";
      gBody.innerHTML = `
        <h3 class="card-title">等待完整视觉库</h3>
        <div class="card-meta"><span class="badge badge-quiet">导出后刷新</span></div>
      `;
      ghost.appendChild(gPrev);
      ghost.appendChild(gBody);
      frag.appendChild(ghost);
    }

    grid.appendChild(frag);
  }

  function buildVisualCard(item, isGhost) {
    const fb = effectiveVisualFb(item);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card" + (isGhost ? " is-ghost" : "");

    const preview = document.createElement("div");
    preview.className = "card-preview";
    const vCat = item.category || "其他";
    const seed = displayVisualTitle(item) + (item.source || "");
    const phOpts = { seed, mark: visualMark(item) };
    if (item.previewUrl) {
      const img = document.createElement("img");
      img.src = item.previewUrl;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        preview.innerHTML = "";
        preview.appendChild(makeCategoryPlaceholder(vCat, phOpts));
      });
      preview.appendChild(img);
    } else {
      preview.appendChild(makeCategoryPlaceholder(vCat, phOpts));
    }

    const body = document.createElement("div");
    body.className = "card-body";
    const title = document.createElement("h3");
    title.className = "card-title";
    title.textContent = displayVisualTitle(item);
    body.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "card-meta";
    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.gap = "6px";
    left.style.flexWrap = "wrap";
    const cat = document.createElement("span");
    cat.className = "badge";
    cat.textContent = visualCategoryLabel(item.category);
    left.appendChild(cat);
    meta.appendChild(left);

    const inds = document.createElement("div");
    inds.className = "indicators";
    const key = item.source || item.title;
    inds.appendChild(makeInd("♥", "like", fb.liked, (e) => {
      e.stopPropagation();
      toggleVisual(key, "liked");
    }));
    inds.appendChild(makeInd("★", "fav", fb.favorite, (e) => {
      e.stopPropagation();
      toggleVisual(key, "favorite");
    }));
    meta.appendChild(inds);
    body.appendChild(meta);

    btn.appendChild(preview);
    btn.appendChild(body);
    btn.addEventListener("click", () => openVisualDrawer(item));
    return btn;
  }

  function toggleVisual(key, field) {
    const item = (state.visuals?.items || []).find(
      (i) => (i.source || i.title) === key
    );
    const base = effectiveVisualFb(item || {});
    state.visualOverrides[key] = {
      ...base,
      [field]: !base[field],
    };
    renderVisuals();
    const drawer = $("#drawer");
    if (drawer.classList.contains("is-open") && drawer.dataset.key === key) {
      openVisualDrawer(item);
    }
  }

  function openVisualDrawer(item) {
    const fb = effectiveVisualFb(item);
    const drawer = $("#drawer");
    const backdrop = $("#drawerBackdrop");
    const key = item.source || item.title;
    drawer.dataset.key = key;
    drawer.dataset.kind = "visual";

    const media = $("#drawerMedia");
    media.innerHTML = "";
    if (item.previewUrl) {
      const img = document.createElement("img");
      img.src = item.previewUrl;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        media.innerHTML = `<div class="ph">预览不可用</div>`;
      });
      media.appendChild(img);
    } else {
      media.innerHTML = "";
      media.appendChild(makeCategoryPlaceholder(item.category || "其他"));
    }

    $("#drawerCategory").textContent = visualCategoryLabel(item.category);
    $("#drawerTitle").textContent = displayVisualTitle(item);
    const status = $("#drawerStatus");
    status.innerHTML = "";
    const lic = document.createElement("span");
    lic.className = "badge badge-warn";
    lic.textContent = "许可待核";
    status.appendChild(lic);

    $("#drawerDesc").textContent = item.description || "暂无说明。";
    $("#drawerCaveatWrap").hidden = !(item.provenanceNote || "").trim();
    $("#drawerCaveat").textContent = item.provenanceNote || "";

    $("#drawerAttrWrap").hidden = false;
    $("#drawerAttr").textContent =
      item.attribution || "来源署名待核实。本预览不提供下载。";

    const link = $("#drawerLink");
    if (item.source) {
      link.href = item.source;
      link.textContent = "查看来源";
      link.style.display = "";
    } else {
      link.style.display = "none";
    }

    // Explicitly NO download button

    const fbHost = $("#drawerFeedback");
    fbHost.innerHTML = "";
    fbHost.appendChild(makeInd("♥", "like", fb.liked, (e) => {
      e.stopPropagation();
      toggleVisual(key, "liked");
    }));
    fbHost.appendChild(makeInd("★", "fav", fb.favorite, (e) => {
      e.stopPropagation();
      toggleVisual(key, "favorite");
    }));

    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    backdrop.hidden = false;
  }

  function closeDrawer() {
    const drawer = $("#drawer");
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    $("#drawerBackdrop").hidden = true;
  }

  function setupDrawer() {
    $("#drawerClose").addEventListener("click", closeDrawer);
    $("#drawerBackdrop").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDrawer();
    });
  }

  function setupFilters() {
    $("#topicSearch").addEventListener("input", (e) => {
      state.query = e.target.value;
      renderTopics();
    });
    $("#likedOnly").addEventListener("click", () => {
      state.likedOnly = !state.likedOnly;
      $("#likedOnly").classList.toggle("is-active", state.likedOnly);
      $("#likedOnly").setAttribute("aria-pressed", state.likedOnly ? "true" : "false");
      renderTopics();
    });
  }

  function renderMeta() {
    const m = state.manifest;
    if (!m) {
      $("#snapshotMeta").textContent = "快照未加载";
      return;
    }
    const created = formatShanghai(m.createdAtUTC);
    const liked = m.sites?.news?.feedbackCounts?.liked ?? 0;
    $("#snapshotMeta").textContent = `${created} · ${m.sites?.news?.count ?? "—"} 条选题 · ${liked} 赞`;
  }

  async function init() {
    setupTabs();
    setupDrawer();
    setupFilters();

    try {
      const [topicsPack, feedbackPack, visuals, manifest] = await Promise.all([
        loadJSON(DATA.topics),
        loadJSON(DATA.feedback),
        loadJSON(DATA.visuals),
        loadJSON(DATA.manifest),
      ]);

      state.feedback = feedbackPack.feedback || {};
      state.topics = mergeFeedback(topicsPack.topics || [], state.feedback);
      state.visuals = visuals;
      state.manifest = manifest;

      renderMeta();
      renderCategoryChips();
      renderTopics();
      renderVisuals();
      if (location.hash === "#visuals") $("#tab-visuals")?.click();
    } catch (err) {
      console.error(err);
      $("#snapshotMeta").textContent = "数据加载失败";
      $("#topicsEmpty").classList.remove("hidden");
      $("#topicsEmpty").querySelector("h2").textContent = "无法加载快照数据";
      $("#topicsEmpty").querySelector("p").textContent =
        "请用本地 HTTP 服务打开本页（见 README），并确认 data/ 下 JSON 存在。";
    }
  }

  init();
})();
